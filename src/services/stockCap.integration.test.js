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

const stockCache = new Map();
const stockListeners = new Set();
let stockVersion = 0;
const normalizeStock = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
};
const resetStockCache = () => {
  stockCache.clear();
};
const notifyStockUpdated = () => {
  stockVersion += 1;
  for (const listener of stockListeners) {
    listener();
  }
};
const stockServiceMock = {
  upsertStockEntries: (entries) => {
    for (const entry of entries) {
      const key = typeof entry.key === "string" ? entry.key.trim() : "";
      const normalized = normalizeStock(entry.stock);
      if (!key || normalized === null) continue;
      stockCache.set(key, normalized);
    }
    if (entries.length) {
      notifyStockUpdated();
    }
  },
  upsertStockFromProducts: (products) => {
    for (const product of products) {
      const stock = normalizeStock(product.stock);
      if (stock === null) continue;
      const idKey = typeof product.id === "string" ? product.id.trim() : "";
      const barcodeKey =
        typeof product.barcode === "string" ? product.barcode.trim() : "";
      if (idKey) stockCache.set(idKey, stock);
      if (barcodeKey) stockCache.set(barcodeKey, stock);
    }
    if (products.length) {
      notifyStockUpdated();
    }
  },
  resolveStockForCartItem: ({ id, barcode }) => {
    const barcodeKey = typeof barcode === "string" ? barcode.trim() : "";
    if (barcodeKey && stockCache.has(barcodeKey)) {
      return stockCache.get(barcodeKey);
    }
    const idKey = typeof id === "string" ? id.trim() : "";
    if (idKey && stockCache.has(idKey)) {
      return stockCache.get(idKey);
    }
    return null;
  },
  resolveStockForSku: ({ productId, barcode }) => {
    const productKey = typeof productId === "string" ? productId.trim() : "";
    if (productKey && stockCache.has(productKey)) {
      return stockCache.get(productKey);
    }
    const barcodeKey = typeof barcode === "string" ? barcode.trim() : "";
    if (barcodeKey && stockCache.has(barcodeKey)) {
      return stockCache.get(barcodeKey);
    }
    return null;
  },
  refreshStockSnapshot: async () => false,
  subscribeStockUpdates: (listener) => {
    stockListeners.add(listener);
    return () => {
      stockListeners.delete(listener);
    };
  },
  getStockVersion: () => stockVersion
};

let mockScanStock = 1;
let mockScanPriceMinor = 100;
let mockScanName = "Test Item";

moduleMocks.set("react-native", {
  Alert: { alert: () => {} },
  ToastAndroid: { show: () => {} },
  Platform: { OS: "android" }
});
moduleMocks.set("../api/apiClient", { ApiError: class ApiError extends Error {} });
moduleMocks.set("../api/productsApi", {
  lookupStoreProductPreviewByScan: async () => ({
    global_product_id: "global-1",
    global_name: mockScanName,
    store_display_name: mockScanName,
    sell_price: mockScanPriceMinor,
    purchase_price: null,
    unit: null,
    variant: null,
    available_qty: mockScanStock,
    is_first_time_in_store: false
  }),
  lookupStoreProductByScan: async () => ({
    global_product_id: "global-1",
    global_name: mockScanName,
    store_display_name: mockScanName,
    sell_price: mockScanPriceMinor,
    purchase_price: null,
    unit: null,
    variant: null,
    available_qty: mockScanStock,
    is_first_time_in_store: false
  }),
  createStoreProductFromScan: async () => ({
    global_product_id: "global-1",
    global_name: mockScanName,
    store_display_name: mockScanName,
    sell_price: mockScanPriceMinor,
    purchase_price: null,
    unit: null,
    variant: null,
    available_qty: mockScanStock,
    is_first_time_in_store: true
  })
});
moduleMocks.set("../api/scanApi", {
  lookupProductByBarcode: async () => null,
  resolveScan: async () => ({ action: "IGNORED" })
});
moduleMocks.set("../networkStatus", { isOnline: async () => true });
moduleMocks.set("../offline/scan", {
  resolveOfflineScan: async () => ({ action: "IGNORED" }),
  setLocalPrice: async () => {},
  upsertLocalProduct: async () => {}
});
moduleMocks.set("../../stores/purchaseDraftStore", {
  usePurchaseDraftStore: {
    getState: () => ({ addOrUpdate: () => {} })
  }
});
moduleMocks.set("../../utils/uiStatus", {
  POS_MESSAGES: {
    scanStorm: "scan storm",
    storeInactive: "store inactive",
    newItemWarning: "new item"
  }
});
moduleMocks.set("../services/eventLogger", { eventLogger: { log: () => {} } });
moduleMocks.set("../services/cloudEventLogger", { logPosEvent: async () => {} });
moduleMocks.set("../services/storeScope", {
  normalizeStoreScope: (storeId) => (storeId ? String(storeId) : "unassigned"),
  storeScopedStorage: memoryStorage
});
moduleMocks.set("../services/stockService", stockServiceMock);
moduleMocks.set("../stockService", stockServiceMock);
moduleMocks.set("./storeScope", {
  normalizeStoreScope: (storeId) => (storeId ? String(storeId) : "unassigned"),
  storeScopedStorage: memoryStorage
});
moduleMocks.set("./productsStore", {
  useProductsStore: {
    getState: () => ({
      getProductByBarcode: () => undefined
    })
  }
});
moduleMocks.set("zustand/middleware", {
  persist: (config) => config,
  createJSONStorage: () => () => memoryStorage
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

function formatStockMessage(event) {
  if (!event) return "";
  if (event.reason === "out_of_stock") return "Out of stock";
  if (event.reason === "unknown_stock") return "Stock unavailable. Sync required.";
  return `Only ${event.availableStock} in stock`;
}

function resetCart(useCartStore) {
  useCartStore.getState().resetForStore();
  useCartStore.setState({ stockLimitEvent: null });
  resetStockCache();
}

async function testTapLoop(useCartStore) {
  resetCart(useCartStore);
  stockServiceMock.upsertStockEntries([
    { key: "tap-sku", stock: 1 },
    { key: "tap-barcode", stock: 1 }
  ]);
  for (let i = 0; i < 20; i += 1) {
    useCartStore.getState().addItem({
      id: "tap-sku",
      name: "Tap Item",
      priceMinor: 100,
      quantity: 1,
      barcode: "tap-barcode"
    });
  }
  const item = useCartStore.getState().items.find((entry) => entry.id === "tap-sku");
  assert.ok(item);
  assert.strictEqual(item.quantity, 1);
  const event = useCartStore.getState().stockLimitEvent;
  assert.strictEqual(formatStockMessage(event), "Only 1 in stock");
  assert.strictEqual(event.itemId, "tap-sku");
}

async function testScanLoop(useCartStore, scanApi) {
  resetCart(useCartStore);
  mockScanStock = 1;
  mockScanPriceMinor = 100;
  mockScanName = "Scan Item";

  scanApi.setScanRuntime({
    intent: "SELL",
    mode: "SELL",
    storeActive: true,
    scanLookupV2Enabled: true
  });
  scanApi.setScanDuplicateGuardWindowMs(0);

  const originalNow = Date.now;
  let now = 0;
  Date.now = () => now;
  for (let i = 0; i < 20; i += 1) {
    now += 600;
    await scanApi.onBarcodeScanned("scan-barcode");
  }
  Date.now = originalNow;

  const item = useCartStore.getState().items.find((entry) => entry.barcode === "scan-barcode");
  assert.ok(item);
  assert.strictEqual(item.quantity, 1);
  const event = useCartStore.getState().stockLimitEvent;
  assert.strictEqual(formatStockMessage(event), "Only 1 in stock");
  assert.strictEqual(event.itemId, item.id);
}

async function testPlusButton(useCartStore) {
  resetCart(useCartStore);
  stockServiceMock.upsertStockEntries([
    { key: "plus-sku", stock: 2 },
    { key: "plus-barcode", stock: 2 }
  ]);
  useCartStore.getState().addItem({
    id: "plus-sku",
    name: "Plus Item",
    priceMinor: 100,
    quantity: 1,
    barcode: "plus-barcode"
  });

  for (let i = 0; i < 5; i += 1) {
    const item = useCartStore.getState().items.find((entry) => entry.id === "plus-sku");
    useCartStore.getState().updateQuantity("plus-sku", item.quantity + 1);
  }

  const item = useCartStore.getState().items.find((entry) => entry.id === "plus-sku");
  assert.ok(item);
  assert.strictEqual(item.quantity, 2);
  const event = useCartStore.getState().stockLimitEvent;
  assert.strictEqual(formatStockMessage(event), "Only 2 in stock");
  assert.strictEqual(event.itemId, "plus-sku");
}

async function testManualQty(useCartStore) {
  resetCart(useCartStore);
  stockServiceMock.upsertStockEntries([
    { key: "manual-sku", stock: 3 },
    { key: "manual-barcode", stock: 3 }
  ]);
  useCartStore.getState().addItem({
    id: "manual-sku",
    name: "Manual Item",
    priceMinor: 100,
    quantity: 1,
    barcode: "manual-barcode"
  });

  useCartStore.getState().updateQuantity("manual-sku", 99);

  const item = useCartStore.getState().items.find((entry) => entry.id === "manual-sku");
  assert.ok(item);
  assert.strictEqual(item.quantity, 3);
  const event = useCartStore.getState().stockLimitEvent;
  assert.strictEqual(formatStockMessage(event), "Only 3 in stock");
  assert.strictEqual(event.itemId, "manual-sku");
}

async function testNormalizeItemsToStock(useCartStore) {
  resetCart(useCartStore);
  stockServiceMock.upsertStockEntries([
    { key: "bulk-cap", stock: 2 },
    { key: "bulk-zero", stock: 0 }
  ]);
  useCartStore.setState({
    items: [
      {
        id: "bulk-cap",
        name: "Bulk Cap",
        priceMinor: 100,
        quantity: 9,
        barcode: "bulk-cap"
      },
      {
        id: "bulk-zero",
        name: "Bulk Zero",
        priceMinor: 100,
        quantity: 1,
        barcode: "bulk-zero"
      },
      {
        id: "bulk-unknown",
        name: "Bulk Unknown",
        priceMinor: 100,
        quantity: 4,
        barcode: "bulk-unknown"
      }
    ]
  });

  const changed = useCartStore.getState().normalizeItemsToStock();
  assert.strictEqual(changed, true);

  const capped = useCartStore.getState().items.find((entry) => entry.id === "bulk-cap");
  assert.ok(capped);
  assert.strictEqual(capped.quantity, 2);

  const removed = useCartStore.getState().items.find((entry) => entry.id === "bulk-zero");
  assert.ok(!removed);

  const unknown = useCartStore.getState().items.find((entry) => entry.id === "bulk-unknown");
  assert.ok(unknown);
  assert.strictEqual(unknown.quantity, 4);
}

async function testOutOfStock(useCartStore) {
  resetCart(useCartStore);
  stockServiceMock.upsertStockEntries([
    { key: "oos-sku", stock: 0 },
    { key: "oos-barcode", stock: 0 }
  ]);
  useCartStore.getState().addItem({
    id: "oos-sku",
    name: "OOS Item",
    priceMinor: 100,
    quantity: 1,
    barcode: "oos-barcode"
  });

  assert.strictEqual(useCartStore.getState().items.length, 0);
  const event = useCartStore.getState().stockLimitEvent;
  assert.strictEqual(formatStockMessage(event), "Out of stock");
  assert.strictEqual(event.itemId, "oos-sku");
}

async function testUnknownStock(useCartStore) {
  resetCart(useCartStore);
  useCartStore.getState().addItem({
    id: "unknown-sku",
    name: "Unknown Item",
    priceMinor: 100,
    quantity: 1,
    barcode: "unknown-barcode"
  });

  assert.strictEqual(useCartStore.getState().items.length, 0);
  const event = useCartStore.getState().stockLimitEvent;
  assert.strictEqual(formatStockMessage(event), "Stock unavailable. Sync required.");
  assert.strictEqual(event.itemId, "unknown-sku");
}

async function run() {
  const cartStoreModule = requireTs(path.join(projectRoot, "src", "stores", "cartStore.ts"));
  const scanModule = requireTs(path.join(projectRoot, "src", "services", "scan", "handleScan.ts"));
  const useCartStore = cartStoreModule.useCartStore;

  await testTapLoop(useCartStore);
  await testScanLoop(useCartStore, scanModule);
  await testPlusButton(useCartStore);
  await testManualQty(useCartStore);
  await testNormalizeItemsToStock(useCartStore);
  await testOutOfStock(useCartStore);
  await testUnknownStock(useCartStore);

  console.log("stock cap integration tests passed");
}

run().catch((error) => {
  console.error("stock cap integration tests failed", error);
  process.exit(1);
});
