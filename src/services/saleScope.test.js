const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

function loadSaleScope() {
  const filePath = path.join(__dirname, "saleScope.ts");
  const source = fs.readFileSync(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019
    }
  });
  const module = { exports: {} };
  const exports = module.exports;
  const context = {
    module,
    exports,
    require
  };
  vm.runInNewContext(compiled.outputText, context, { filename: "saleScope.ts" });
  return module.exports;
}

function applyStockDeduction(stockBySku, saleItems) {
  const next = { ...stockBySku };
  for (const item of saleItems) {
    const sku = item.sku || item.barcode || item.id;
    const current = typeof next[sku] === "number" ? next[sku] : 0;
    next[sku] = current - item.quantity;
  }
  return next;
}

function testPartialSale({ partitionSaleItems, buildStockDeductionLogs }) {
  const items = [
    { id: "line-1", sku: "sku-apple", barcode: "111", name: "Apple", priceMinor: 100, quantity: 2 },
    { id: "line-2", sku: "sku-banana", barcode: "222", name: "Banana", priceMinor: 150, quantity: 1 },
    { id: "line-3", sku: "sku-carrot", barcode: "333", name: "Carrot", priceMinor: 200, quantity: 3 }
  ];
  const stock = { "sku-apple": 10, "sku-banana": 5, "sku-carrot": 7 };
  const { saleItems, remainingItems, isPartial } = partitionSaleItems(items, ["line-2"]);

  assert.strictEqual(isPartial, true);
  assert.deepStrictEqual(saleItems.map((item) => item.id), ["line-2"]);
  assert.deepStrictEqual(
    remainingItems.map((item) => item.id).sort(),
    ["line-1", "line-3"]
  );

  const updatedStock = applyStockDeduction(stock, saleItems);
  assert.strictEqual(updatedStock["sku-apple"], 10);
  assert.strictEqual(updatedStock["sku-banana"], 4);
  assert.strictEqual(updatedStock["sku-carrot"], 7);

  const logs = buildStockDeductionLogs(saleItems, "sale-001");
  assert.deepStrictEqual(logs, ["stock_deducted:sku-banana:1:saleId=sale-001"]);
}

function testFullSale({ partitionSaleItems }) {
  const items = [
    { id: "line-1", sku: "sku-apple", barcode: "111", name: "Apple", priceMinor: 100, quantity: 2 },
    { id: "line-2", sku: "sku-banana", barcode: "222", name: "Banana", priceMinor: 150, quantity: 1 },
    { id: "line-3", sku: "sku-carrot", barcode: "333", name: "Carrot", priceMinor: 200, quantity: 3 }
  ];
  const stock = { "sku-apple": 10, "sku-banana": 5, "sku-carrot": 7 };
  const { saleItems, remainingItems, isPartial } = partitionSaleItems(items, undefined);

  assert.strictEqual(isPartial, false);
  assert.strictEqual(remainingItems.length, 0);
  assert.strictEqual(saleItems.length, 3);

  const updatedStock = applyStockDeduction(stock, saleItems);
  assert.strictEqual(updatedStock["sku-apple"], 8);
  assert.strictEqual(updatedStock["sku-banana"], 4);
  assert.strictEqual(updatedStock["sku-carrot"], 4);
}

try {
  const scope = loadSaleScope();
  testPartialSale(scope);
  testFullSale(scope);
  console.log("stock deduction tests passed");
} catch (error) {
  console.error("stock deduction tests failed", error);
  process.exit(1);
}
