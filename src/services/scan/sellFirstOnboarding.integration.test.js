const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const projectRoot = path.resolve(__dirname, "..", "..", "..");
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

let onboardingProduct = null;
let receiveResponse = null;
let receiveError = null;
let lastReceivePayload = null;
let lastOutboxType = null;
let lastOutboxPayload = null;
let online = true;
let scanResolveResponse = { action: "IGNORED" };
let offlineScanResponse = { action: "IGNORED" };

moduleMocks.set("react-native", {
  Alert: { alert: () => {} },
  ToastAndroid: { show: () => {} },
  Platform: { OS: "android" }
});
moduleMocks.set("../api/apiClient", { ApiError: class ApiError extends Error {} });
moduleMocks.set("../api/productsApi", {
  lookupStoreProductByScan: async () => null,
  lookupStoreProductPreviewByScan: async () => onboardingProduct,
  createStoreProductFromScan: async () => onboardingProduct,
  receiveStoreProductFromScan: async (payload) => {
    lastReceivePayload = payload;
    if (receiveError) throw receiveError;
    return receiveResponse;
  }
});
moduleMocks.set("../api/scanApi", {
  lookupProductByBarcode: async () => null,
  resolveScan: async () => scanResolveResponse
});
moduleMocks.set("../networkStatus", { isOnline: async () => online });
moduleMocks.set("../offline/scan", {
  resolveOfflineScan: async () => offlineScanResponse,
  setLocalPrice: async () => {},
  upsertLocalProduct: async () => {}
});
moduleMocks.set("../offline/outbox", {
  enqueueEvent: async (type, payload) => {
    lastOutboxType = type;
    lastOutboxPayload = payload;
    return "event-1";
  }
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

function resetCart(useCartStore) {
  useCartStore.getState().resetForStore();
  useCartStore.setState({ stockLimitEvent: null });
  resetStockCache();
}

function buildStoreProduct(overrides = {}) {
  return {
    global_product_id: "global-1",
    global_name: "Test Item",
    store_display_name: "Test Item",
    sell_price: null,
    purchase_price: null,
    unit: null,
    variant: null,
    available_qty: 0,
    is_first_time_in_store: true,
    ...overrides
  };
}

async function testOnboardingFlow(useCartStore, scanModule, onboardingModule) {
  resetCart(useCartStore);
  online = true;
  scanResolveResponse = { action: "IGNORED" };
  offlineScanResponse = { action: "IGNORED" };
  onboardingProduct = buildStoreProduct({ available_qty: 0, is_first_time_in_store: true });
  receiveResponse = buildStoreProduct({
    sell_price: 1500,
    purchase_price: 1200,
    available_qty: 5,
    is_first_time_in_store: false
  });
  receiveError = null;
  lastReceivePayload = null;
  lastOutboxType = null;
  lastOutboxPayload = null;

  let lastRequest = null;
  scanModule.setScanRuntime({
    intent: "SELL",
    mode: "SELL",
    storeActive: true,
    scanLookupV2Enabled: true,
    onSellFirstOnboarding: (request) => {
      lastRequest = request;
    }
  });
  scanModule.setScanDuplicateGuardWindowMs(0);

  await scanModule.onBarcodeScanned("unknown-barcode");

  assert.ok(lastRequest);
  assert.strictEqual(useCartStore.getState().items.length, 0);

  await onboardingModule.submitSellFirstOnboarding({
    barcode: "unknown-barcode",
    sellPriceMinor: 1500,
    initialStock: 5,
    name: "Test Item"
  });

  const item = useCartStore.getState().items.find((entry) => entry.barcode === "unknown-barcode");
  assert.ok(item);
  assert.strictEqual(item.quantity, 1);
  assert.strictEqual(item.priceMinor, 1500);
  assert.strictEqual(lastReceivePayload.sellPriceMinor, 1500);
  assert.strictEqual(lastReceivePayload.initialStock, 5);
  assert.strictEqual(lastOutboxType, null);
}

async function testOnboardedScanDoesNotOnboard(useCartStore, scanModule) {
  resetCart(useCartStore);
  online = true;
  scanResolveResponse = { action: "IGNORED" };
  offlineScanResponse = { action: "IGNORED" };
  onboardingProduct = buildStoreProduct({
    sell_price: 1200,
    purchase_price: 900,
    available_qty: 10,
    is_first_time_in_store: false
  });

  let lastRequest = null;
  scanModule.setScanRuntime({
    intent: "SELL",
    mode: "SELL",
    storeActive: true,
    scanLookupV2Enabled: true,
    onSellFirstOnboarding: (request) => {
      lastRequest = request;
    }
  });
  scanModule.setScanDuplicateGuardWindowMs(0);

  await scanModule.onBarcodeScanned("known-barcode");

  assert.strictEqual(lastRequest, null);
  const item = useCartStore.getState().items.find((entry) => entry.barcode === "known-barcode");
  assert.ok(item);
  assert.strictEqual(item.priceMinor, 1200);
}

async function testOnboardingFailure(useCartStore, onboardingModule) {
  resetCart(useCartStore);
  online = true;
  scanResolveResponse = { action: "IGNORED" };
  offlineScanResponse = { action: "IGNORED" };
  receiveError = new Error("ledger failed");

  let threw = false;
  try {
    await onboardingModule.submitSellFirstOnboarding({
      barcode: "fail-barcode",
      sellPriceMinor: 1000,
      initialStock: 2,
      name: "Failure Item"
    });
  } catch {
    threw = true;
  }

  assert.strictEqual(threw, true);
  assert.strictEqual(useCartStore.getState().items.length, 0);
  receiveError = null;
}

async function testOnboardingPurchasePrice(useCartStore, onboardingModule) {
  resetCart(useCartStore);
  online = true;
  scanResolveResponse = { action: "IGNORED" };
  offlineScanResponse = { action: "IGNORED" };
  receiveError = null;
  lastReceivePayload = null;
  receiveResponse = buildStoreProduct({
    sell_price: 1800,
    purchase_price: 1200,
    available_qty: 2,
    is_first_time_in_store: false
  });

  await onboardingModule.submitSellFirstOnboarding({
    barcode: "pp-barcode",
    sellPriceMinor: 1800,
    purchasePriceMinor: 1200,
    initialStock: 2,
    name: "Purchase Price Item"
  });

  const item = useCartStore.getState().items.find((entry) => entry.barcode === "pp-barcode");
  assert.ok(item);
  assert.strictEqual(item.priceMinor, 1800);
  assert.strictEqual(lastReceivePayload.purchasePriceMinor, 1200);
}

async function testOfflineOnboarding(useCartStore, onboardingModule) {
  resetCart(useCartStore);
  online = false;
  scanResolveResponse = { action: "IGNORED" };
  offlineScanResponse = { action: "IGNORED" };
  lastOutboxType = null;
  lastOutboxPayload = null;
  lastReceivePayload = null;

  await onboardingModule.submitSellFirstOnboarding({
    barcode: "offline-barcode",
    sellPriceMinor: 900,
    purchasePriceMinor: 700,
    initialStock: 3,
    name: "Offline Item"
  });

  const item = useCartStore.getState().items.find((entry) => entry.barcode === "offline-barcode");
  assert.ok(item);
  assert.strictEqual(item.priceMinor, 900);
  assert.strictEqual(lastReceivePayload, null);
  assert.strictEqual(lastOutboxType, "PURCHASE_SUBMIT");
  assert.strictEqual(lastOutboxPayload.items[0].purchasePriceMinor, 700);
  assert.strictEqual(lastOutboxPayload.items[0].sellingPriceMinor, 900);
  assert.strictEqual(lastOutboxPayload.items[0].quantity, 3);
}

async function testLegacyPromptRouteUsesOnboarding(useCartStore, scanModule) {
  resetCart(useCartStore);
  online = true;
  offlineScanResponse = { action: "IGNORED" };
  onboardingProduct = null;
  scanResolveResponse = {
    action: "PROMPT_PRICE",
    product: {
      id: "legacy-1",
      name: "Legacy Item",
      barcode: "legacy-barcode",
      priceMinor: null,
      currency: "INR"
    },
    product_not_found_for_store: true
  };

  let lastRequest = null;
  scanModule.setScanRuntime({
    intent: "SELL",
    mode: "SELL",
    storeActive: true,
    scanLookupV2Enabled: false,
    onSellFirstOnboarding: (request) => {
      lastRequest = request;
    }
  });
  scanModule.setScanDuplicateGuardWindowMs(0);

  await scanModule.onBarcodeScanned("legacy-barcode");

  assert.ok(lastRequest);
  assert.strictEqual(useCartStore.getState().items.length, 0);
}

async function testLegacyUnpricedUsesOnboarding(useCartStore, scanModule) {
  resetCart(useCartStore);
  online = true;
  offlineScanResponse = { action: "IGNORED" };
  onboardingProduct = null;
  scanResolveResponse = {
    action: "PROMPT_PRICE",
    product: {
      id: "legacy-2",
      name: "Legacy Unpriced",
      barcode: "legacy-unpriced",
      priceMinor: null,
      currency: "INR"
    }
  };

  let lastRequest = null;
  scanModule.setScanRuntime({
    intent: "SELL",
    mode: "SELL",
    storeActive: true,
    scanLookupV2Enabled: false,
    onSellFirstOnboarding: (request) => {
      lastRequest = request;
    }
  });
  scanModule.setScanDuplicateGuardWindowMs(0);

  await scanModule.onBarcodeScanned("legacy-unpriced");

  assert.ok(lastRequest);
  assert.strictEqual(useCartStore.getState().items.length, 0);
}

async function testOfflinePromptRouteUsesOnboarding(useCartStore, scanModule) {
  resetCart(useCartStore);
  online = false;
  scanResolveResponse = { action: "IGNORED" };
  offlineScanResponse = {
    action: "PROMPT_PRICE",
    product: {
      barcode: "offline-unpriced",
      name: "Offline Unpriced",
      category: null,
      currency: "INR",
      priceMinor: null
    }
  };

  let lastRequest = null;
  scanModule.setScanRuntime({
    intent: "SELL",
    mode: "SELL",
    storeActive: true,
    scanLookupV2Enabled: true,
    onSellFirstOnboarding: (request) => {
      lastRequest = request;
    }
  });
  scanModule.setScanDuplicateGuardWindowMs(0);

  await scanModule.onBarcodeScanned("offline-unpriced");

  assert.ok(lastRequest);
  assert.strictEqual(useCartStore.getState().items.length, 0);
}

function testStoreIsolation(scanModule) {
  const storeA = buildStoreProduct({
    sell_price: 1000,
    purchase_price: 900,
    available_qty: 3,
    is_first_time_in_store: false
  });
  const storeB = buildStoreProduct({
    sell_price: 1000,
    purchase_price: null,
    available_qty: 0,
    is_first_time_in_store: false
  });

  assert.strictEqual(scanModule.needsSellFirstOnboarding(storeA), false);
  assert.strictEqual(scanModule.needsSellFirstOnboarding(storeB), true);
}

async function run() {
  const cartStoreModule = requireTs(path.join(projectRoot, "src", "stores", "cartStore.ts"));
  const scanModule = requireTs(path.join(projectRoot, "src", "services", "scan", "handleScan.ts"));
  const onboardingModule = requireTs(
    path.join(projectRoot, "src", "services", "scan", "sellFirstOnboarding.ts")
  );
  const useCartStore = cartStoreModule.useCartStore;

  await testOnboardingFlow(useCartStore, scanModule, onboardingModule);
  await testOnboardedScanDoesNotOnboard(useCartStore, scanModule);
  await testOnboardingFailure(useCartStore, onboardingModule);
  await testOnboardingPurchasePrice(useCartStore, onboardingModule);
  await testOfflineOnboarding(useCartStore, onboardingModule);
  await testLegacyPromptRouteUsesOnboarding(useCartStore, scanModule);
  await testLegacyUnpricedUsesOnboarding(useCartStore, scanModule);
  await testOfflinePromptRouteUsesOnboarding(useCartStore, scanModule);
  testStoreIsolation(scanModule);

  console.log("sell-first onboarding tests passed");
}

run().catch((error) => {
  console.error("sell-first onboarding tests failed", error);
  process.exit(1);
});
