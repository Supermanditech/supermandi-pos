// GCP-STG-0083: Progressive product loading (500-item chunks)
// BEHAVIORAL tests: mock API, verify runtime chunk behavior

import * as fs from "fs";
import * as path from "path";

// --- Structural tests (retained) ---
const productsApiPath = path.resolve(__dirname, "../../services/api/productsApi.ts");
const productsApiCode = fs.readFileSync(productsApiPath, "utf-8");
const productsStorePath = path.resolve(__dirname, "../../stores/productsStore.ts");
const productsStoreCode = fs.readFileSync(productsStorePath, "utf-8");

describe("GCP-STG-0083: Progressive product loading — structural", () => {
  test("exports listProductsProgressive function", () => {
    expect(productsApiCode).toContain("export async function listProductsProgressive(");
  });

  test("uses 500-item page size", () => {
    const matches = productsApiCode.match(/const limit = 500/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test("store uses listProductsProgressive", () => {
    expect(productsStoreCode).toContain("productsApi.listProductsProgressive");
  });

  test("store sets loading: !done for incremental updates", () => {
    expect(productsStoreCode).toContain("loading: !done");
  });

  test("store sets lastSyncedAt only on final chunk", () => {
    expect(productsStoreCode).toContain("...(done ? { lastSyncedAt: new Date().toISOString() } : {})");
  });
});

// --- Behavioral tests: mock apiClient, verify runtime behavior ---

// Helper: build a fake StoreProductsListItem page
function buildFakePage(count: number, offset: number) {
  return Array.from({ length: count }, (_, i) => ({
    productId: `prod-${offset + i}`,
    storeProductId: `sp-${offset + i}`,
    name: `Product ${offset + i}`,
    barcode: `BAR${offset + i}`,
    sellPrice: 10000 + i,
    currentStock: 50,
    category: "Test",
    brand: null,
    imageUrl: null,
    image_url: null,
    unit: "pcs",
    hsnCode: null,
    hsn_code: null,
    gstRate: null,
    gst_rate: null,
    mrp: null,
    netContentValue: null,
    net_content_value: null,
    netContentUnit: null,
    net_content_unit: null,
    supplierId: null,
    supplier_id: null,
    supplierName: null,
    supplier_name: null,
    metadataUpdatedAt: null,
    metadata_updated_at: null,
  }));
}

// We test listProductsProgressive directly by mocking apiClient
jest.mock("../../services/api/apiClient", () => {
  const mockGet = jest.fn();
  return {
    apiClient: { get: mockGet },
    ApiError: class ApiError extends Error {
      status: number;
      constructor(msg: string, status: number) {
        super(msg);
        this.status = status;
      }
    },
  };
});

import { apiClient, ApiError } from "../../services/api/apiClient";
import { listProductsProgressive } from "../../services/api/productsApi";

afterEach(() => {
  jest.clearAllMocks();
});

describe("GCP-STG-0083: listProductsProgressive — behavioral", () => {
  test("calls onPage for each chunk with done=false, then done=true on last chunk", async () => {
    const mockGet = apiClient.get as jest.Mock;
    // Page 1: 500 items (full page → not done)
    // Page 2: 300 items (partial page → done)
    mockGet
      .mockResolvedValueOnce({ success: true, data: buildFakePage(500, 0), total: 800 })
      .mockResolvedValueOnce({ success: true, data: buildFakePage(300, 500), total: 800 });

    const calls: Array<{ count: number; done: boolean }> = [];
    await listProductsProgressive((products, done) => {
      calls.push({ count: products.length, done });
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ count: 500, done: false });
    expect(calls[1]).toEqual({ count: 300, done: true });
  });

  test("handles single page (< 500 items) correctly", async () => {
    const mockGet = apiClient.get as jest.Mock;
    mockGet.mockResolvedValueOnce({ success: true, data: buildFakePage(42, 0), total: 42 });

    const calls: Array<{ count: number; done: boolean }> = [];
    await listProductsProgressive((products, done) => {
      calls.push({ count: products.length, done });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ count: 42, done: true });
  });

  test("3 full pages + partial last page", async () => {
    const mockGet = apiClient.get as jest.Mock;
    mockGet
      .mockResolvedValueOnce({ success: true, data: buildFakePage(500, 0), total: 1700 })
      .mockResolvedValueOnce({ success: true, data: buildFakePage(500, 500), total: 1700 })
      .mockResolvedValueOnce({ success: true, data: buildFakePage(500, 1000), total: 1700 })
      .mockResolvedValueOnce({ success: true, data: buildFakePage(200, 1500), total: 1700 });

    const calls: Array<{ count: number; done: boolean }> = [];
    await listProductsProgressive((products, done) => {
      calls.push({ count: products.length, done });
    });

    expect(calls).toHaveLength(4);
    expect(calls[0]).toEqual({ count: 500, done: false });
    expect(calls[1]).toEqual({ count: 500, done: false });
    expect(calls[2]).toEqual({ count: 500, done: false });
    expect(calls[3]).toEqual({ count: 200, done: true });
  });

  test("error on chunk 2 signals done=true and preserves chunk 1 data", async () => {
    const mockGet = apiClient.get as jest.Mock;
    mockGet
      .mockResolvedValueOnce({ success: true, data: buildFakePage(500, 0), total: 1000 })
      .mockRejectedValueOnce(new (ApiError as any)("network_error", 500));

    const allProducts: any[] = [];
    const calls: Array<{ count: number; done: boolean }> = [];
    await listProductsProgressive((products, done) => {
      allProducts.push(...products);
      calls.push({ count: products.length, done });
    });

    // Chunk 1 delivered 500 products, chunk 2 error signals empty + done
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ count: 500, done: false });
    expect(calls[1]).toEqual({ count: 0, done: true });
    // Chunk 1 products preserved
    expect(allProducts).toHaveLength(500);
    expect(allProducts[0].id).toBe("prod-0");
    expect(allProducts[499].id).toBe("prod-499");
  });

  test("empty store (0 products) signals done immediately", async () => {
    const mockGet = apiClient.get as jest.Mock;
    mockGet.mockResolvedValueOnce({ success: true, data: [], total: 0 });

    const calls: Array<{ count: number; done: boolean }> = [];
    await listProductsProgressive((products, done) => {
      calls.push({ count: products.length, done });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ count: 0, done: true });
  });

  test("maps raw StoreProductsListItem to ApiProduct correctly", async () => {
    const mockGet = apiClient.get as jest.Mock;
    mockGet.mockResolvedValueOnce({
      success: true,
      data: [{
        productId: "p-1",
        storeProductId: "sp-1",
        name: "Maggi Noodles",
        barcode: "12345",
        sellPrice: 2500,
        currentStock: 100,
        category: "Noodles",
        brand: "Nestle",
        unit: "pcs",
      }],
      total: 1,
    });

    let receivedProduct: any = null;
    await listProductsProgressive((products, _done) => {
      if (products.length > 0) receivedProduct = products[0];
    });

    expect(receivedProduct).not.toBeNull();
    expect(receivedProduct.id).toBe("p-1");
    expect(receivedProduct.name).toBe("Maggi Noodles");
    expect(receivedProduct.barcode).toBe("12345");
    expect(receivedProduct.currency).toBe("INR");
    expect(receivedProduct.stock).toBe(100);
    expect(receivedProduct.price).toBe(2500);
  });

  test("incremental accumulation: onPage callback receives each chunk separately", async () => {
    const mockGet = apiClient.get as jest.Mock;
    mockGet
      .mockResolvedValueOnce({ success: true, data: buildFakePage(500, 0), total: 1000 })
      .mockResolvedValueOnce({ success: true, data: buildFakePage(500, 500), total: 1000 });

    // Simulate the store's accumulation pattern
    const accumulated: any[] = [];
    const stateSnapshots: Array<{ productCount: number; loading: boolean; hasSyncedAt: boolean }> = [];

    await listProductsProgressive((products, done) => {
      accumulated.push(...products);
      stateSnapshots.push({
        productCount: accumulated.length,
        loading: !done,
        hasSyncedAt: done,
      });
    });

    // After chunk 1: 500 products, still loading, no syncedAt
    expect(stateSnapshots[0]).toEqual({ productCount: 500, loading: true, hasSyncedAt: false });
    // After chunk 2: 1000 products, not loading, syncedAt set
    expect(stateSnapshots[1]).toEqual({ productCount: 1000, loading: false, hasSyncedAt: true });
  });
});
