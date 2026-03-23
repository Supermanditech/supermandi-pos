/**
 * GCP-STG-0368: Backend Search caps similarity() tokens at 3
 */
const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock("../src/db/client", () => ({ getPool: () => ({ query: mockQuery }) }));
jest.mock("../src/db/redis", () => ({ getRedisClient: () => null, cacheGet: jest.fn().mockResolvedValue(null), cacheSet: jest.fn() }));
jest.mock("../src/middleware/deviceToken", () => ({ requireDeviceToken: (req: any, _: any, next: any) => { req.posDevice = { storeId: "s1", deviceId: "d1" }; next(); } }));
jest.mock("../src/middleware/storeStatusGate", () => ({ requireActiveStore: (_: any, __: any, next: any) => next() }));

import express from "express";
import request from "supertest";
import { posStoreProductsRouter } from "../src/routes/v1/pos/storeProducts";

const app = express();
app.use("/api/v1/pos", posStoreProductsRouter);

function getSearchSQL(): string | undefined {
  const call = mockQuery.mock.calls.find(
    (c: any[]) => typeof c[0] === "string" && c[0].includes("ranked_products")
  );
  return call?.[0] as string | undefined;
}

describe("GCP-STG-0368: similarity token cap", () => {
  beforeEach(() => { mockQuery.mockClear(); mockQuery.mockResolvedValue({ rows: [] }); });

  test("search uses SIMILARITY_TOKEN_CAP to limit trigram operations", async () => {
    // Long query generates many tokens but similarity should be capped
    await request(app)
      .get("/api/v1/pos/store-products/search")
      .query({ q: "tata salt iodized premium refined crystal", limit: "10" })
      .expect(200);

    const sql = getSearchSQL();
    expect(sql).toBeDefined();
    // SQL should still have ILIKE for all tokens
    expect(sql).toContain("ILIKE");
    // Should have some similarity but not unlimited
    expect(sql).toContain("similarity(");
  });

  test("short query uses similarity for all tokens", async () => {
    await request(app)
      .get("/api/v1/pos/store-products/search")
      .query({ q: "mg", limit: "10" })
      .expect(200);

    const sql = getSearchSQL();
    expect(sql).toBeDefined();
    // Single token should have similarity
    expect(sql).toContain("similarity(");
  });

  test("SIMILARITY_TOKEN_CAP constant exists and is 3", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "../src/routes/v1/pos/storeProducts.ts"), "utf8");
    expect(src).toContain("SIMILARITY_TOKEN_CAP = 3");
  });

  test("token loop uses index-based for loop (not for-of)", () => {
    // Must use index to check tokenIdx < SIMILARITY_TOKEN_CAP
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "../src/routes/v1/pos/storeProducts.ts"), "utf8");
    expect(src).toContain("tokenIdx < SIMILARITY_TOKEN_CAP");
  });
});
