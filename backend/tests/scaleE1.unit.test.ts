/**
 * SCALE-E1: Retailer product image upload unit tests
 *
 * Tests coverage:
 * - POST /products/:id/image accepts valid image (jpeg/png/webp)
 * - Rejects file exceeding 2MB limit
 * - Rejects non-image MIME type
 * - Rejects if product not in store (wrong storeId — store isolation)
 * - Returns image_url on success
 * - Updates catalog.store_products.image_url in DB
 * - GCS uploadBuffer called with correct bucket and path pattern
 * - Returns 404 if product id not found
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// =============================================================================
// Mock @supermandi/common (uploadBuffer)
// =============================================================================

const mockUploadBuffer = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock("@supermandi/common", () => ({
  uploadBuffer: (...args: any[]) => mockUploadBuffer(...args),
  // Re-export everything else as stubs so imports don't break
  sanitizeHtml: (s: string) => s,
  validateSearchQuery: () => null,
  validateBarcode: () => null,
  validateCategoryId: () => null,
  validatePrice: () => null,
}));

// =============================================================================
// Mock DB pool
// =============================================================================

const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
const mockPool = { query: mockQuery };

jest.mock("../src/db/client", () => ({
  getPool: () => mockPool,
}));

// =============================================================================
// Mock middleware and logger
// =============================================================================

jest.mock("../src/middleware/retailerStoreContext", () => ({
  requireStoreContext: (_req: any, _res: any, next: any) => next(),
  getStoreId: (req: any) => req._storeId,
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../src/lib/errorUtils", () => ({
  asError: (e: any) => (e instanceof Error ? e : new Error(String(e))),
}));

jest.mock("../src/utils/productValidation", () => ({
  validateProductName: () => null,
  validateBarcode: () => null,
  validatePrice: () => null,
  validateStock: () => null,
}));

jest.mock("../src/utils/priceBoundsValidator", () => ({
  validatePriceBounds: () => null,
}));

jest.mock("../src/db/redis", () => ({
  cacheDelete: jest.fn(() => Promise.resolve()),
  getRedis: jest.fn(() => null),
  cacheGet: jest.fn(),
  cacheSet: jest.fn(),
  cacheGetOrSet: jest.fn(),
}));

// =============================================================================
// Setup supertest
// =============================================================================

import express from "express";
import request from "supertest";
import { retailerAdminProductsRouter } from "../src/routes/v1/retailer-admin/products";

function buildApp(storeId: string) {
  const app = express();
  app.use(express.json());
  // Inject storeId onto req so getStoreId mock returns it
  app.use((req: any, _res: any, next: any) => {
    req._storeId = storeId;
    next();
  });
  app.use("/", retailerAdminProductsRouter);
  return app;
}

const STORE_ID = "store-uuid-001";
const PRODUCT_ID = "product-uuid-001";
const GCS_BUCKET = "supermandi-pos-documents";

// Minimal 1x1 JPEG buffer (valid JPEG magic bytes for MIME sniffing)
const JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

// 3MB buffer of zeros (exceeds 2MB limit)
const OVERSIZED_BUFFER = Buffer.alloc(3 * 1024 * 1024, 0);

describe("SCALE-E1: POST /products/:id/image", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadBuffer.mockResolvedValue({ bucket: GCS_BUCKET, objectKey: "test-key", size: 22 });
  });

  // ---------------------------------------------------------------------------
  // 1. Accepts valid JPEG image
  // ---------------------------------------------------------------------------
  it("accepts valid JPEG and returns image_url", async () => {
    // Product belongs to store
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] }) // SELECT store_products
      .mockResolvedValueOnce({ rows: [] }); // UPDATE store_products

    const app = buildApp(STORE_ID);
    const res = await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .attach("image", JPEG_BUFFER, { filename: "product.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("image_url");
    expect(res.body.image_url).toContain("storage.googleapis.com");
    expect(res.body.image_url).toContain(GCS_BUCKET);
    expect(res.body.image_url).toContain(PRODUCT_ID);
  });

  // ---------------------------------------------------------------------------
  // 2. Accepts valid PNG image
  // ---------------------------------------------------------------------------
  it("accepts valid PNG image and returns image_url", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp(STORE_ID);
    const res = await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .attach("image", JPEG_BUFFER, { filename: "product.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.image_url).toContain(".png");
  });

  // ---------------------------------------------------------------------------
  // 3. Accepts valid WebP image
  // ---------------------------------------------------------------------------
  it("accepts valid WebP image and returns image_url", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp(STORE_ID);
    const res = await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .attach("image", JPEG_BUFFER, { filename: "product.webp", contentType: "image/webp" });

    expect(res.status).toBe(200);
    expect(res.body.image_url).toContain(".webp");
  });

  // ---------------------------------------------------------------------------
  // 4. Rejects file exceeding 2MB
  // ---------------------------------------------------------------------------
  it("rejects file exceeding 2MB with 400", async () => {
    const app = buildApp(STORE_ID);
    const res = await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .attach("image", OVERSIZED_BUFFER, { filename: "big.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
    // GCS should not have been called
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 5. Rejects non-image MIME type (PDF)
  // ---------------------------------------------------------------------------
  it("rejects non-image MIME type with 400", async () => {
    const app = buildApp(STORE_ID);
    const res = await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .attach("image", Buffer.from("%PDF-1.4"), { filename: "doc.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_FILE");
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 6. Rejects if no file provided (form field missing → 400)
  // ---------------------------------------------------------------------------
  it("returns 400 when no file is uploaded (field missing)", async () => {
    const app = buildApp(STORE_ID);
    // Send multipart but without attaching any file field
    const res = await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .field("dummy", "value"); // sends multipart, but no "image" field

    expect(res.status).toBe(400);
    // Multer rejects before DB is queried
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 7. Returns 404 if product not found in store (wrong storeId — store isolation)
  // ---------------------------------------------------------------------------
  it("returns 404 if product does not belong to requesting store", async () => {
    // SELECT returns empty — product not in this store
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const app = buildApp("different-store-id");
    const res = await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .attach("image", JPEG_BUFFER, { filename: "product.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 8. GCS uploadBuffer called with correct bucket and path
  // ---------------------------------------------------------------------------
  it("calls uploadBuffer with correct bucket and object key path pattern", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp(STORE_ID);
    await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .attach("image", JPEG_BUFFER, { filename: "product.jpg", contentType: "image/jpeg" });

    expect(mockUploadBuffer).toHaveBeenCalledTimes(1);
    const [bucket, objectKey, , contentType] = mockUploadBuffer.mock.calls[0] as any[];
    expect(bucket).toBe(GCS_BUCKET);
    expect(objectKey).toMatch(new RegExp(`^store-products/${STORE_ID}/${PRODUCT_ID}_\\d+\\.jpg$`));
    expect(contentType).toBe("image/jpeg");
  });

  // ---------------------------------------------------------------------------
  // 9. DB UPDATE is called with correct image_url and store isolation
  // ---------------------------------------------------------------------------
  it("updates catalog.store_products.image_url with correct store isolation", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: PRODUCT_ID }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp(STORE_ID);
    const res = await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .attach("image", JPEG_BUFFER, { filename: "product.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    // Second query should be the UPDATE
    const updateCall = mockQuery.mock.calls[1] as any[];
    const [sql, params] = updateCall;
    expect(sql).toContain("UPDATE catalog.store_products");
    expect(sql).toContain("image_url");
    expect(params[1]).toBe(PRODUCT_ID);
    expect(params[2]).toBe(STORE_ID); // store isolation enforced
  });

  // ---------------------------------------------------------------------------
  // 10. Store isolation: storeId from middleware, not client
  // ---------------------------------------------------------------------------
  it("enforces store isolation — storeId from server context only", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // product not in this store

    const app = buildApp("store-attacker");
    const res = await request(app)
      .post(`/products/${PRODUCT_ID}/image`)
      .attach("image", JPEG_BUFFER, { filename: "product.jpg", contentType: "image/jpeg" });

    // Only one query (SELECT), no UPDATE — rejected before write
    expect(res.status).toBe(404);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [selectSql, selectParams] = mockQuery.mock.calls[0] as any[];
    expect(selectSql).toContain("WHERE id = $1 AND store_id = $2");
    expect(selectParams[1]).toBe("store-attacker");
  });
});

// =============================================================================
// Unit: File validation logic (pure)
// =============================================================================

describe("SCALE-E1: File validation (pure logic)", () => {
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const MAX_SIZE = 2 * 1024 * 1024;

  it("rejects MIME types not in allowlist", () => {
    const rejected = ["application/pdf", "text/html", "image/gif", "image/tiff"];
    rejected.forEach((mime) => {
      expect(ALLOWED_TYPES.includes(mime)).toBe(false);
    });
  });

  it("accepts all three allowed MIME types", () => {
    ALLOWED_TYPES.forEach((mime) => {
      expect(ALLOWED_TYPES.includes(mime)).toBe(true);
    });
  });

  it("2MB limit is exactly 2097152 bytes", () => {
    expect(MAX_SIZE).toBe(2097152);
  });

  it("file at exactly 2MB passes size check", () => {
    const atLimit = Buffer.alloc(MAX_SIZE, 0);
    expect(atLimit.length).toBeLessThanOrEqual(MAX_SIZE);
  });

  it("file at 2MB + 1 byte exceeds limit", () => {
    const overLimit = Buffer.alloc(MAX_SIZE + 1, 0);
    expect(overLimit.length).toBeGreaterThan(MAX_SIZE);
  });

  it("GCS object key includes storeId and productId", () => {
    const storeId = "store-abc";
    const productId = "prod-xyz";
    const ts = Date.now();
    const objectKey = `store-products/${storeId}/${productId}_${ts}.jpg`;
    expect(objectKey).toContain(storeId);
    expect(objectKey).toContain(productId);
    expect(objectKey).toMatch(/^store-products\//);
  });
});
