const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..", "..", "..");
const moduleCache = new Map();

function resolveModule(fromDir, request) {
  if (request.startsWith(".") || request.startsWith("..")) {
    const base = path.resolve(fromDir, request);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
      path.join(base, "index.js")
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return request;
}

function requireTs(entryPath) {
  const resolved = path.isAbsolute(entryPath) ? entryPath : path.resolve(projectRoot, entryPath);
  if (moduleCache.has(resolved)) {
    return moduleCache.get(resolved).exports;
  }

  const source = fs.readFileSync(resolved, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019
    }
  });

  const module = { exports: {} };
  moduleCache.set(resolved, module);
  const dirname = path.dirname(resolved);

  function localRequire(request) {
    const nextResolved = resolveModule(dirname, request);
    if (typeof nextResolved === "string" && nextResolved.startsWith(projectRoot)) {
      return requireTs(nextResolved);
    }
    return require(nextResolved);
  }

  const context = {
    module,
    exports: module.exports,
    require: localRequire,
    __dirname: dirname,
    __filename: resolved,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate
  };

  vm.runInNewContext(compiled.outputText, context, { filename: resolved });
  return module.exports;
}

function createFakeClient() {
  const storeInventory = new Map();
  const ledger = [];

  const client = {
    storeInventory,
    ledger,
    query: async (text, params = []) => {
      const sql = text.trim();
      if (sql.startsWith("INSERT INTO store_inventory")) {
        const key = `${params[0]}:${params[1]}`;
        if (!storeInventory.has(key)) {
          storeInventory.set(key, Number(params[2] ?? 0));
        }
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes("FROM store_inventory") && sql.includes("global_product_id = ANY")) {
        const storeId = params[0];
        const productIds = Array.isArray(params[1]) ? params[1] : [];
        const rows = productIds
          .map((productId) => {
            const key = `${storeId}:${productId}`;
            if (!storeInventory.has(key)) return null;
            return { global_product_id: productId, available_qty: storeInventory.get(key) };
          })
          .filter(Boolean);
        return { rows, rowCount: rows.length };
      }

      if (sql.includes("FROM store_inventory") && sql.includes("FOR UPDATE")) {
        const key = `${params[0]}:${params[1]}`;
        const qty = storeInventory.get(key) ?? 0;
        return { rows: [{ available_qty: qty }], rowCount: 1 };
      }

      if (sql.startsWith("UPDATE store_inventory")) {
        const key = `${params[0]}:${params[1]}`;
        storeInventory.set(key, Number(params[2] ?? 0));
        return { rows: [], rowCount: 1 };
      }

      if (sql.startsWith("INSERT INTO inventory_ledger")) {
        ledger.push({
          id: params[0],
          store_id: params[1],
          global_product_id: params[2],
          movement_type: params[3],
          quantity: params[4],
          unit_cost_minor: params[5],
          unit_sell_minor: params[6],
          reason: params[7],
          reference_type: params[8],
          reference_id: params[9]
        });
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes("FROM inventory_ledger") && sql.includes("SUM(quantity)")) {
        const storeId = params[0];
        const productId = params[1];
        const total = ledger.reduce((sum, entry) => {
          if (entry.store_id === storeId && entry.global_product_id === productId) {
            return sum + (Number(entry.quantity) || 0);
          }
          return sum;
        }, 0);
        return { rows: [{ stock: total }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }
  };

  return client;
}

async function testLedgerReceiveAndSell() {
  const ledgerModule = requireTs(
    path.join(projectRoot, "backend", "src", "services", "inventoryLedgerService.ts")
  );
  const client = createFakeClient();

  await ledgerModule.applyInventoryMovement({
    client,
    storeId: "store-1",
    globalProductId: "prod-1",
    movementType: "RECEIVE",
    quantity: 5,
    unitCostMinor: 120,
    referenceType: "PURCHASE",
    referenceId: "purchase-1"
  });

  await ledgerModule.applyInventoryMovement({
    client,
    storeId: "store-1",
    globalProductId: "prod-1",
    movementType: "SELL",
    quantity: 2,
    unitSellMinor: 150,
    referenceType: "SALE",
    referenceId: "sale-1"
  });

  const stock = await ledgerModule.fetchLedgerStock({
    client,
    storeId: "store-1",
    globalProductId: "prod-1"
  });

  assert.strictEqual(stock, 3);
  assert.strictEqual(client.storeInventory.get("store-1:prod-1"), 3);
  assert.strictEqual(client.ledger.length, 2);
  assert.strictEqual(client.ledger[0].movement_type, "RECEIVE");
  assert.strictEqual(client.ledger[1].movement_type, "SELL");
}

async function testInsufficientStock() {
  const ledgerModule = requireTs(
    path.join(projectRoot, "backend", "src", "services", "inventoryLedgerService.ts")
  );
  const client = createFakeClient();

  let threw = false;
  try {
    await ledgerModule.applyInventoryMovement({
      client,
      storeId: "store-2",
      globalProductId: "prod-2",
      movementType: "SELL",
      quantity: 1,
      unitSellMinor: 100,
      referenceType: "SALE",
      referenceId: "sale-2"
    });
  } catch (error) {
    threw = error instanceof Error && error.message === "insufficient_stock";
  }

  assert.strictEqual(threw, true);
  assert.strictEqual(client.ledger.length, 0);
}

async function testOversellGuardDetails() {
  const ledgerModule = requireTs(
    path.join(projectRoot, "backend", "src", "services", "inventoryLedgerService.ts")
  );
  const client = createFakeClient();
  client.storeInventory.set("store-3:prod-3", 2);

  let error = null;
  try {
    await ledgerModule.ensureStoreInventoryAvailability({
      client,
      storeId: "store-3",
      items: [
        { variantId: "v-1", quantity: 3, globalProductId: "prod-3", name: "Test Item" }
      ]
    });
  } catch (err) {
    error = err;
  }

  assert.ok(error);
  assert.strictEqual(error.name, "InsufficientStockError");
  assert.strictEqual(error.details.length, 1);
  assert.strictEqual(error.details[0].skuId, "prod-3");
  assert.strictEqual(error.details[0].available, 2);
  assert.strictEqual(error.details[0].message, "Stock changed. Available: 2");
}

async function run() {
  await testLedgerReceiveAndSell();
  await testInsufficientStock();
  await testOversellGuardDetails();
  console.log("inventory ledger tests passed");
}

run().catch((error) => {
  console.error("inventory ledger tests failed", error);
  process.exit(1);
});
