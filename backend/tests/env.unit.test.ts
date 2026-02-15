// Unit tests for backend/src/lib/env.ts
import { requireEnv } from "../src/lib/env";

describe("requireEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns the value when env var is set", () => {
    process.env.TEST_VAR = "hello";
    expect(requireEnv("TEST_VAR")).toBe("hello");
  });

  it("throws when env var is not set", () => {
    delete process.env.MISSING_VAR;
    expect(() => requireEnv("MISSING_VAR")).toThrow("Missing required env var: MISSING_VAR");
  });

  it("throws when env var is empty string", () => {
    process.env.EMPTY_VAR = "";
    expect(() => requireEnv("EMPTY_VAR")).toThrow("Missing required env var: EMPTY_VAR");
  });

  it("returns value with spaces (not trimmed)", () => {
    process.env.SPACE_VAR = "  spaces  ";
    expect(requireEnv("SPACE_VAR")).toBe("  spaces  ");
  });

  it("returns numeric string as-is", () => {
    process.env.NUM_VAR = "12345";
    expect(requireEnv("NUM_VAR")).toBe("12345");
  });
});
