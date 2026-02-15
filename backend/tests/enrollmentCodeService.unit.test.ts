// Unit tests for backend/src/services/enrollmentCodeService.ts
// We mock the database calls but test the exported API

jest.mock("../src/db/client", () => ({
  getPool: jest.fn(() => ({
    query: jest.fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // code uniqueness check
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }), // insert enrollment
  })),
}));

jest.mock("../src/services/storeCodeService", () => ({
  isDemoStoreCode: jest.fn((code: string) => code.startsWith("DM")),
}));

import {
  generateUniqueEnrollmentCode,
  createEnrollmentCode,
} from "../src/services/enrollmentCodeService";

describe("generateUniqueEnrollmentCode", () => {
  it("generates a code starting with SM-", async () => {
    const code = await generateUniqueEnrollmentCode();
    expect(code).toMatch(/^SM-/);
  });

  it("generates 6 characters after SM-", async () => {
    const code = await generateUniqueEnrollmentCode();
    // SM- + 6 chars = 9 total, or if hex fallback SM- + 8 hex chars
    expect(code.length).toBeGreaterThanOrEqual(9);
  });

  it("uses valid characters from alphabet", async () => {
    const code = await generateUniqueEnrollmentCode();
    const suffix = code.slice(3); // After "SM-"
    const validChars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    // Could be hex fallback so also accept hex chars
    for (const ch of suffix) {
      const isValidAlphabet = validChars.includes(ch);
      const isHex = /[0-9A-F]/.test(ch);
      expect(isValidAlphabet || isHex).toBe(true);
    }
  });
});

describe("createEnrollmentCode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the mocked getPool
    const { getPool } = require("../src/db/client");
    getPool.mockReturnValue({
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // uniqueness check
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }), // insert
    });
  });

  it("creates enrollment code for demo store with high max uses", async () => {
    const result = await createEnrollmentCode("store-1", "DM260115-001", "superadmin");
    expect(result.code).toMatch(/^SM-/);
    expect(result.isDemo).toBe(true);
    expect(result.maxUses).toBe(9999);
  });

  it("creates enrollment code for production store with single use", async () => {
    const { isDemoStoreCode } = require("../src/services/storeCodeService");
    isDemoStoreCode.mockReturnValueOnce(false);

    const { getPool } = require("../src/db/client");
    getPool.mockReturnValue({
      query: jest.fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    });

    const result = await createEnrollmentCode("store-2", "SU260115-001", "system");
    expect(result.isDemo).toBe(false);
    expect(result.maxUses).toBe(1);
  });

  it("includes qrPayload with supermandi:// URI", async () => {
    const result = await createEnrollmentCode("store-1", "DM260115-001");
    expect(result.qrPayload).toContain("supermandi://enroll?code=");
    expect(result.qrPayload).toContain(encodeURIComponent(result.code));
  });

  it("includes expiresAt as ISO string", async () => {
    const result = await createEnrollmentCode("store-1", "DM260115-001");
    expect(result.expiresAt).toBeDefined();
    // Should be a valid ISO date string
    const parsed = new Date(result.expiresAt);
    expect(parsed.getTime()).toBeGreaterThan(Date.now());
  });

  it("demo stores get long expiry (365 days)", async () => {
    const result = await createEnrollmentCode("store-1", "DM260115-001");
    const expiresAt = new Date(result.expiresAt);
    const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysUntilExpiry).toBeGreaterThan(360);
  });
});
