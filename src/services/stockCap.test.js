const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

function loadStockCap() {
  const filePath = path.join(__dirname, "stockCap.ts");
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
  vm.runInNewContext(compiled.outputText, context, { filename: "stockCap.ts" });
  return module.exports;
}

function testAddCaps({ capAddQuantity }) {
  const addOne = capAddQuantity(0, 1, 3);
  assert.strictEqual(addOne.nextQty, 1);
  assert.strictEqual(addOne.capped, false);
  assert.strictEqual(addOne.outOfStock, false);

  const addBeyond = capAddQuantity(2, 2, 3);
  assert.strictEqual(addBeyond.nextQty, 3);
  assert.strictEqual(addBeyond.addedQty, 1);
  assert.strictEqual(addBeyond.capped, true);

  const addWhenFull = capAddQuantity(3, 1, 3);
  assert.strictEqual(addWhenFull.nextQty, 3);
  assert.strictEqual(addWhenFull.addedQty, 0);
  assert.strictEqual(addWhenFull.capped, true);

  const addOutOfStock = capAddQuantity(0, 1, 0);
  assert.strictEqual(addOutOfStock.nextQty, 0);
  assert.strictEqual(addOutOfStock.outOfStock, true);
  assert.strictEqual(addOutOfStock.addedQty, 0);

  const addUnknownStock = capAddQuantity(1, 2, null);
  assert.strictEqual(addUnknownStock.nextQty, 1);
  assert.strictEqual(addUnknownStock.unknownStock, true);
  assert.strictEqual(addUnknownStock.addedQty, 0);

  let loopQty = 0;
  for (let i = 0; i < 20; i += 1) {
    const loopResult = capAddQuantity(loopQty, 1, 1);
    loopQty = loopResult.nextQty;
  }
  assert.strictEqual(loopQty, 1);
}

function testUpdateCaps({ capRequestedQuantity }) {
  const updateWithin = capRequestedQuantity(2, 2, 5);
  assert.strictEqual(updateWithin.nextQty, 2);
  assert.strictEqual(updateWithin.capped, false);

  const updateBeyond = capRequestedQuantity(2, 99, 3);
  assert.strictEqual(updateBeyond.nextQty, 3);
  assert.strictEqual(updateBeyond.capped, true);

  const updateOutOfStock = capRequestedQuantity(1, 1, 0);
  assert.strictEqual(updateOutOfStock.nextQty, 0);
  assert.strictEqual(updateOutOfStock.outOfStock, true);

  const updateUnknownStock = capRequestedQuantity(4, 7, null);
  assert.strictEqual(updateUnknownStock.nextQty, 4);
  assert.strictEqual(updateUnknownStock.unknownStock, true);

  const updateUnknownDecrease = capRequestedQuantity(4, 2, null);
  assert.strictEqual(updateUnknownDecrease.nextQty, 2);
  assert.strictEqual(updateUnknownDecrease.unknownStock, false);
}

try {
  const stockCap = loadStockCap();
  testAddCaps(stockCap);
  testUpdateCaps(stockCap);
  console.log("stock cap tests passed");
} catch (error) {
  console.error("stock cap tests failed", error);
  process.exit(1);
}
