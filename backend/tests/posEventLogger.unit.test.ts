// Unit tests for backend/src/services/posEventLogger.ts
// Since this module depends heavily on DB (Drizzle + raw pool), we test
// the normalization logic indirectly via logPosEventSafe behavior

jest.mock("../src/db/client", () => ({
  getDb: jest.fn(() => null), // Return null to skip DB operations
  getPool: jest.fn(() => null),
}));

jest.mock("../src/db/ensureSchema", () => ({
  ensurePosEventsTable: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@supermandi/common", () => ({
  handleSchemaError: jest.fn(),
  isSchemaError: jest.fn().mockReturnValue(false),
}));

import { logPosEventSafe, fetchLatestPosEvents } from "../src/services/posEventLogger";

describe("logPosEventSafe", () => {
  it("does not throw for null/undefined body", async () => {
    await expect(logPosEventSafe(null)).resolves.toBeUndefined();
    await expect(logPosEventSafe(undefined)).resolves.toBeUndefined();
  });

  it("does not throw for empty object body", async () => {
    await expect(logPosEventSafe({})).resolves.toBeUndefined();
  });

  it("does not throw for valid event body", async () => {
    await expect(
      logPosEventSafe({
        deviceId: "dev-1",
        storeId: "store-1",
        eventType: "SALE_COMPLETED",
        payload: { amount: 500 },
      })
    ).resolves.toBeUndefined();
  });

  it("does not throw for invalid types in event body", async () => {
    await expect(
      logPosEventSafe({
        deviceId: 123,
        storeId: null,
        eventType: undefined,
        payload: "string-payload",
      })
    ).resolves.toBeUndefined();
  });

  it("handles missing event fields gracefully", async () => {
    await expect(
      logPosEventSafe({ deviceId: "dev-1" })
    ).resolves.toBeUndefined();
  });
});

describe("fetchLatestPosEvents", () => {
  it("returns empty array when db is null", async () => {
    const result = await fetchLatestPosEvents({ limit: 10 });
    expect(result).toEqual([]);
  });

  it("returns empty array when called with filters", async () => {
    const result = await fetchLatestPosEvents({
      limit: 10,
      deviceId: "dev-1",
      storeId: "store-1",
      eventType: "SALE",
    });
    expect(result).toEqual([]);
  });
});
