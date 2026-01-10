const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..", "..");
const moduleCache = new Map();
const moduleMocks = new Map();

const memoryStorage = (() => {
  const store = new Map();
  return {
    getItem: async (key) => (store.has(key) ? store.get(key) : null),
    setItem: async (key, value) => {
      store.set(key, value);
    },
    removeItem: async (key) => {
      store.delete(key);
    }
  };
})();

let online = true;
let listProductsResponse = [];

moduleMocks.set("./networkStatus", { isOnline: async () => online });
moduleMocks.set("./api/productsApi", {
  listProducts: async () => listProductsResponse
});
moduleMocks.set("./storeScope", {
  normalizeStoreScope: (storeId) => (storeId ? String(storeId) : "unassigned"),
  storeScopedStorage: memoryStorage
});

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
    if (moduleMocks.has(request)) {
      return moduleMocks.get(request);
    }
    const nextResolved = resolveModule(dirname, request);
    if (moduleMocks.has(nextResolved)) {
      return moduleMocks.get(nextResolved);
    }
    if (nextResolved.endsWith(".ts") || nextResolved.endsWith(".tsx")) {
      return requireTs(nextResolved);
    }
    if (typeof nextResolved === "string" && nextResolved.startsWith(projectRoot)) {
      return requireTs(nextResolved);
    }
    return require(request);
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

async function run() {
  const stockService = requireTs(path.join(projectRoot, "src", "services", "stockService.ts"));

  listProductsResponse = [
    { id: "p1", barcode: "b1", stock: 5 },
    { id: "p2", barcode: null, stock: 2 }
  ];
  online = true;
  const refreshed = await stockService.refreshStockSnapshot();
  assert.strictEqual(refreshed, true);
  assert.strictEqual(
    stockService.resolveStockForSku({ productId: "p1", barcode: "b1" }),
    5
  );
  assert.strictEqual(
    stockService.resolveStockForSku({ productId: "p2", barcode: "b2" }),
    2
  );

  let notified = 0;
  const versionBefore = stockService.getStockVersion();
  const unsubscribe = stockService.subscribeStockUpdates(() => {
    notified += 1;
  });
  stockService.upsertStockEntries([{ key: "custom-barcode", stock: 7 }]);
  unsubscribe();
  assert.strictEqual(notified > 0, true);
  assert.strictEqual(stockService.getStockVersion(), versionBefore + 1);
  assert.strictEqual(
    stockService.resolveStockForCartItem({ id: "custom-id", barcode: "custom-barcode" }),
    7
  );

  online = false;
  const skipped = await stockService.refreshStockSnapshot();
  assert.strictEqual(skipped, false);

  console.log("stock service integration tests passed");
}

run().catch((error) => {
  console.error("stock service integration tests failed", error);
  process.exit(1);
});
