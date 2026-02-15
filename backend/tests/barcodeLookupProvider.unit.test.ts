// Unit tests for backend/src/services/barcodeLookupProvider.ts
import {
  clearLookupCache,
  getLookupCacheStats,
} from "../src/services/barcodeLookupProvider";

describe("clearLookupCache", () => {
  it("clears the cache without error", () => {
    expect(() => clearLookupCache()).not.toThrow();
  });

  it("results in zero cache size", () => {
    clearLookupCache();
    const stats = getLookupCacheStats();
    expect(stats.size).toBe(0);
  });
});

describe("getLookupCacheStats", () => {
  beforeEach(() => {
    clearLookupCache();
  });

  it("returns stats object with size, maxSize, ttlMs", () => {
    const stats = getLookupCacheStats();
    expect(stats).toHaveProperty("size");
    expect(stats).toHaveProperty("maxSize");
    expect(stats).toHaveProperty("ttlMs");
  });

  it("has maxSize of 10000", () => {
    const stats = getLookupCacheStats();
    expect(stats.maxSize).toBe(10000);
  });

  it("has ttlMs of 24 hours", () => {
    const stats = getLookupCacheStats();
    expect(stats.ttlMs).toBe(24 * 60 * 60 * 1000);
  });

  it("starts with zero size after clear", () => {
    const stats = getLookupCacheStats();
    expect(stats.size).toBe(0);
  });
});
