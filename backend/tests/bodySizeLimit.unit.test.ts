// Unit tests for backend/src/middleware/bodySizeLimit.ts
import { getBodySizeLimits } from "../src/middleware/bodySizeLimit";

// We test the pure functions directly and getBodySizeLimits
// The perEndpointBodyLimit middleware wraps express.json which is hard to unit test

describe("getBodySizeLimits", () => {
  it("returns an array of pattern/limit entries", () => {
    const limits = getBodySizeLimits();
    expect(Array.isArray(limits)).toBe(true);
    expect(limits.length).toBeGreaterThan(0);
  });

  it("includes a default pattern", () => {
    const limits = getBodySizeLimits();
    const defaultEntry = limits.find((l) => l.pattern === "(default)");
    expect(defaultEntry).toBeDefined();
    expect(defaultEntry!.limit).toBe("100kb");
  });

  it("includes document upload endpoint with 10mb limit", () => {
    const limits = getBodySizeLimits();
    const docUpload = limits.find((l) => l.pattern.includes("documents"));
    expect(docUpload).toBeDefined();
    expect(docUpload!.limit).toBe("10mb");
  });

  it("includes voice endpoint with 5mb limit", () => {
    const limits = getBodySizeLimits();
    const voice = limits.find((l) => l.pattern.includes("voice\\/process"));
    expect(voice).toBeDefined();
    expect(voice!.limit).toBe("5mb");
  });

  it("includes auth endpoint with 50kb limit", () => {
    const limits = getBodySizeLimits();
    const auth = limits.find((l) => l.pattern.includes("auth"));
    expect(auth).toBeDefined();
    expect(auth!.limit).toBe("50kb");
  });

  it("includes batch/sync endpoints with 500kb limit", () => {
    const limits = getBodySizeLimits();
    const batch = limits.find((l) => l.pattern.includes("batch") && !l.pattern.includes("stock"));
    expect(batch).toBeDefined();
    expect(batch!.limit).toBe("500kb");
  });

  it("all limits have valid size format", () => {
    const limits = getBodySizeLimits();
    for (const { limit } of limits) {
      expect(limit).toMatch(/^\d+(b|kb|mb|gb)?$/i);
    }
  });
});
