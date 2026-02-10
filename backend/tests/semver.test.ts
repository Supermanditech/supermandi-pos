// SA-P2-003: Semver comparison unit tests
import { compareSemver } from "../src/utils/semver";

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("2.3.4", "2.3.4")).toBe(0);
  });

  it("returns -1 when a < b", () => {
    expect(compareSemver("1.0.0", "1.0.1")).toBe(-1);
    expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    expect(compareSemver("0.9.9", "1.0.0")).toBe(-1);
  });

  it("returns 1 when a > b", () => {
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    expect(compareSemver("1.1.0", "1.0.0")).toBe(1);
    expect(compareSemver("2.0.0", "1.0.0")).toBe(1);
    expect(compareSemver("1.0.0", "0.9.9")).toBe(1);
  });

  it("handles numeric comparison correctly (not lexicographic)", () => {
    // "1.9.0" < "1.10.0" numerically, but "1.9.0" > "1.10.0" lexicographically
    expect(compareSemver("1.9.0", "1.10.0")).toBe(-1);
    expect(compareSemver("1.10.0", "1.9.0")).toBe(1);
  });

  it("handles different segment counts", () => {
    expect(compareSemver("1.0", "1.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "1.0")).toBe(0);
    expect(compareSemver("1.0", "1.0.1")).toBe(-1);
    expect(compareSemver("1.0.1", "1.0")).toBe(1);
  });

  it("handles single-segment versions", () => {
    expect(compareSemver("1", "1")).toBe(0);
    expect(compareSemver("1", "2")).toBe(-1);
    expect(compareSemver("2", "1")).toBe(1);
  });

  it("handles non-numeric segments as 0", () => {
    // NaN from Number("abc") is falsy, so || 0 kicks in
    expect(compareSemver("abc", "0.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "abc")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(compareSemver("", "")).toBe(0);
    expect(compareSemver("1.0.0", "")).toBe(1);
  });
});
