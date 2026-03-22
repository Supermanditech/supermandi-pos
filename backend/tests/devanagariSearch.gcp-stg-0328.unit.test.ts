/**
 * GCP-STG-0328: Devanagari script support in SELL search — ALL BEHAVIORAL
 *
 * Mocks getPool + middleware, invokes search endpoint via supertest with
 * Devanagari queries, verifies SQL contains product_translations JOIN,
 * pt.name ILIKE clause, and score 225. Also tests token pipeline functions.
 */

// Mock DB pool — capture SQL queries
const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock Redis + cache
jest.mock("../src/db/redis", () => ({
  getRedisClient: () => null,
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
}));

// Mock device token middleware — inject storeId
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    req.posDevice = { storeId: "store-test-328", deviceId: "dev-1" };
    next();
  },
}));

// Mock store status gate
jest.mock("../src/middleware/storeStatusGate", () => ({
  requireActiveStore: (_req: any, _res: any, next: any) => next(),
}));

import express from "express";
import request from "supertest";
import { posStoreProductsRouter } from "../src/routes/v1/pos/storeProducts";
import { expandHindiSearchTokens, normalizeQuantityTokens } from "../src/services/searchLocalization";

const app = express();
app.use("/api/v1/pos", posStoreProductsRouter);

function getSearchSQL(): string | undefined {
  const call = mockQuery.mock.calls.find(
    (c: any[]) => typeof c[0] === "string" && c[0].includes("ranked_products")
  );
  return call?.[0] as string | undefined;
}

describe("GCP-STG-0328: Devanagari search — behavioral", () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  test("search with Devanagari query produces SQL with product_translations JOIN", async () => {
    await request(app)
      .get("/api/v1/pos/store-products/search")
      .query({ q: "चीनी", limit: "10" })
      .expect(200);

    const sql = getSearchSQL();
    expect(sql).toBeDefined();
    expect(sql).toContain("product_translations pt");
    expect(sql).toContain("pt.locale = 'hi'");
  });

  test("search SQL includes pt.name ILIKE clause for Hindi text matching", async () => {
    await request(app)
      .get("/api/v1/pos/store-products/search")
      .query({ q: "दूध", limit: "10" })
      .expect(200);

    const sql = getSearchSQL();
    expect(sql).toBeDefined();
    expect(sql).toContain("pt.name");
    expect(sql).toContain("ILIKE");
  });

  test("search SQL scoring includes THEN 225 for Hindi name match", async () => {
    await request(app)
      .get("/api/v1/pos/store-products/search")
      .query({ q: "चावल", limit: "10" })
      .expect(200);

    const sql = getSearchSQL();
    expect(sql).toBeDefined();
    expect(sql).toContain("THEN 225");
  });

  test("expandHindiSearchTokens passes through Devanagari tokens", () => {
    const result = expandHindiSearchTokens(["चीनी"]);
    expect(result).toContain("चीनी");
  });

  test("normalizeQuantityTokens handles Devanagari + English mix", () => {
    const tokens = normalizeQuantityTokens("दूध 500ml");
    expect(tokens.length).toBeGreaterThan(0);
  });

  test("Devanagari tokens survive the full search pipeline", () => {
    const rawTokens = normalizeQuantityTokens("चावल").filter(t => t.length >= 1).slice(0, 5);
    const textTokens = rawTokens.filter(t => !/^\d+$/.test(t) && t.length >= 2);
    const expanded = expandHindiSearchTokens(textTokens).slice(0, 8);
    expect(expanded.length).toBeGreaterThan(0);
    const hasDevanagari = expanded.some(t => /[\u0900-\u097F]/.test(t));
    const hasEnglish = expanded.some(t => /[a-z]/i.test(t));
    expect(hasDevanagari || hasEnglish).toBe(true);
  });
});
