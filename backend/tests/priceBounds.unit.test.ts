// SA-P0-003: Unit tests for price bounds validation
import {
  validatePriceBounds,
  getPriceBounds,
  invalidatePriceBoundsCache,
} from "../src/utils/priceBoundsValidator";

// Mock the DB client
jest.mock("../src/db/client", () => ({
  getPool: jest.fn(),
}));

// Mock the logger
jest.mock("../src/lib/logger", () => ({
  log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import { getPool } from "../src/db/client";

const mockGetPool = getPool as jest.Mock;

describe("priceBoundsValidator", () => {
  beforeEach(() => {
    invalidatePriceBoundsCache();
    jest.clearAllMocks();
  });

  describe("getPriceBounds", () => {
    it("returns fallback bounds when pool is unavailable", async () => {
      mockGetPool.mockReturnValue(null);
      const bounds = await getPriceBounds();
      expect(bounds.min_price_paise).toBe(100);
      expect(bounds.max_price_paise).toBe(10000000);
    });

    it("returns DB bounds when available", async () => {
      const mockQuery = jest.fn().mockResolvedValue({
        rows: [{ min_price_paise: 200, max_price_paise: 5000000, updated_at: "2026-01-01T00:00:00Z" }],
      });
      mockGetPool.mockReturnValue({ query: mockQuery });

      const bounds = await getPriceBounds();
      expect(bounds.min_price_paise).toBe(200);
      expect(bounds.max_price_paise).toBe(5000000);
    });

    it("returns fallback when DB query returns no rows", async () => {
      const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
      mockGetPool.mockReturnValue({ query: mockQuery });

      const bounds = await getPriceBounds();
      expect(bounds.min_price_paise).toBe(100);
      expect(bounds.max_price_paise).toBe(10000000);
    });

    it("returns fallback when DB query throws", async () => {
      const mockQuery = jest.fn().mockRejectedValue(new Error("DB error"));
      mockGetPool.mockReturnValue({ query: mockQuery });

      const bounds = await getPriceBounds();
      expect(bounds.min_price_paise).toBe(100);
      expect(bounds.max_price_paise).toBe(10000000);
    });

    it("caches bounds after first successful fetch", async () => {
      const mockQuery = jest.fn().mockResolvedValue({
        rows: [{ min_price_paise: 300, max_price_paise: 8000000, updated_at: "2026-01-01T00:00:00Z" }],
      });
      mockGetPool.mockReturnValue({ query: mockQuery });

      await getPriceBounds();
      await getPriceBounds();
      // Should only query once (cached)
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("re-fetches after cache invalidation", async () => {
      const mockQuery = jest.fn().mockResolvedValue({
        rows: [{ min_price_paise: 300, max_price_paise: 8000000, updated_at: "2026-01-01T00:00:00Z" }],
      });
      mockGetPool.mockReturnValue({ query: mockQuery });

      await getPriceBounds();
      invalidatePriceBoundsCache();
      await getPriceBounds();
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe("validatePriceBounds", () => {
    beforeEach(() => {
      // Set up mock DB to return custom bounds
      const mockQuery = jest.fn().mockResolvedValue({
        rows: [{ min_price_paise: 100, max_price_paise: 10000000, updated_at: "2026-01-01T00:00:00Z" }],
      });
      mockGetPool.mockReturnValue({ query: mockQuery });
    });

    it("accepts price within bounds", async () => {
      const result = await validatePriceBounds(5000);
      expect(result.valid).toBe(true);
    });

    it("accepts price at exact minimum", async () => {
      const result = await validatePriceBounds(100);
      expect(result.valid).toBe(true);
    });

    it("accepts price at exact maximum", async () => {
      const result = await validatePriceBounds(10000000);
      expect(result.valid).toBe(true);
    });

    it("rejects price below minimum", async () => {
      const result = await validatePriceBounds(50);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("PRICE_OUT_OF_BOUNDS");
      expect(result.min).toBe(100);
      expect(result.max).toBe(10000000);
    });

    it("rejects price above maximum", async () => {
      const result = await validatePriceBounds(20000000);
      expect(result.valid).toBe(false);
      expect(result.code).toBe("PRICE_OUT_OF_BOUNDS");
      expect(result.min).toBe(100);
      expect(result.max).toBe(10000000);
    });

    it("rejects non-finite number", async () => {
      const result = await validatePriceBounds(NaN);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("finite number");
    });

    it("rejects Infinity", async () => {
      const result = await validatePriceBounds(Infinity);
      expect(result.valid).toBe(false);
    });

    it("error message includes paise and rupee amounts", async () => {
      const result = await validatePriceBounds(50);
      expect(result.error).toContain("50 paise");
      expect(result.error).toContain("100 paise");
    });

    it("respects custom bounds from DB", async () => {
      invalidatePriceBoundsCache();
      const mockQuery = jest.fn().mockResolvedValue({
        rows: [{ min_price_paise: 500, max_price_paise: 1000000, updated_at: "2026-01-01T00:00:00Z" }],
      });
      mockGetPool.mockReturnValue({ query: mockQuery });

      const tooLow = await validatePriceBounds(200);
      expect(tooLow.valid).toBe(false);
      expect(tooLow.min).toBe(500);

      const ok = await validatePriceBounds(600);
      expect(ok.valid).toBe(true);

      const tooHigh = await validatePriceBounds(2000000);
      expect(tooHigh.valid).toBe(false);
      expect(tooHigh.max).toBe(1000000);
    });
  });
});
