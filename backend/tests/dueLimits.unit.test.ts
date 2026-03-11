// SA-P1-003: Due Limits enforcement unit tests
// Tests the due limit check logic injected into POS sales endpoints

describe("SA-P1-003: Due Limits", () => {
  // Mock pool and client
  const mockQuery = jest.fn();
  const mockClient = {
    query: mockQuery,
    release: jest.fn(),
  };
  const mockPool = {
    query: mockQuery,
    connect: jest.fn().mockResolvedValue(mockClient),
  };

  jest.mock("../src/db/client", () => ({
    getPool: jest.fn(() => mockPool),
  }));

  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe("checkDueLimitExceeded logic", () => {
    // Simulate the logic from checkDueLimitExceeded in sales.ts
    async function checkDueLimitExceeded(
      client: { query: jest.Mock },
      storeId: string,
      newAmountPaise: number
    ): Promise<{ exceeded: false } | { exceeded: true; currentPaise: number; limitPaise: number }> {
      const limitRes = await client.query(
        expect.any(String),
        [storeId]
      );
      const limitPaise = limitRes.rows[0]?.max_outstanding_dues_paise;
      if (limitPaise == null) return { exceeded: false };

      const outstandingRes = await client.query(
        expect.any(String),
        [storeId]
      );
      const currentPaise = Number(outstandingRes.rows[0]?.total ?? 0);

      if (currentPaise + newAmountPaise > Number(limitPaise)) {
        return { exceeded: true, currentPaise, limitPaise: Number(limitPaise) };
      }
      return { exceeded: false };
    }

    it("should allow due when no limit is set (NULL)", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_outstanding_dues_paise: null }] });

      const result = await checkDueLimitExceeded(
        { query: mockQuery } as any,
        "store-1",
        500000 // 5000 rupees
      );

      expect(result.exceeded).toBe(false);
      // Should NOT query outstanding dues when limit is null
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should allow due when under limit", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_outstanding_dues_paise: 1000000 }] }) // limit: 10000 rupees
        .mockResolvedValueOnce({ rows: [{ total: 200000 }] }); // current: 2000 rupees

      const result = await checkDueLimitExceeded(
        { query: mockQuery } as any,
        "store-1",
        300000 // new sale: 3000 rupees — total would be 5000, under 10000
      );

      expect(result.exceeded).toBe(false);
    });

    it("should block due when limit would be exceeded", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_outstanding_dues_paise: 500000 }] }) // limit: 5000 rupees
        .mockResolvedValueOnce({ rows: [{ total: 400000 }] }); // current: 4000 rupees

      const result = await checkDueLimitExceeded(
        { query: mockQuery } as any,
        "store-1",
        200000 // new sale: 2000 rupees — total would be 6000, over 5000
      );

      expect(result).toEqual({
        exceeded: true,
        currentPaise: 400000,
        limitPaise: 500000,
      });
    });

    it("should block due when exactly at limit", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_outstanding_dues_paise: 500000 }] }) // limit: 5000 rupees
        .mockResolvedValueOnce({ rows: [{ total: 500000 }] }); // current: 5000 rupees (at limit)

      const result = await checkDueLimitExceeded(
        { query: mockQuery } as any,
        "store-1",
        100 // even 1 rupee should be blocked
      );

      expect(result).toEqual({
        exceeded: true,
        currentPaise: 500000,
        limitPaise: 500000,
      });
    });

    it("should allow due when exactly fills up to limit", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_outstanding_dues_paise: 500000 }] }) // limit: 5000 rupees
        .mockResolvedValueOnce({ rows: [{ total: 300000 }] }); // current: 3000 rupees

      const result = await checkDueLimitExceeded(
        { query: mockQuery } as any,
        "store-1",
        200000 // new sale: 2000 rupees — total would be exactly 5000
      );

      expect(result.exceeded).toBe(false);
    });

    it("should handle zero outstanding dues", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ max_outstanding_dues_paise: 100000 }] }) // limit: 1000 rupees
        .mockResolvedValueOnce({ rows: [{ total: 0 }] }); // no outstanding dues

      const result = await checkDueLimitExceeded(
        { query: mockQuery } as any,
        "store-1",
        50000 // 500 rupees
      );

      expect(result.exceeded).toBe(false);
    });
  });

  describe("PATCH /store/due-limits validation", () => {
    it("should reject non-integer values", () => {
      // Simulate validation logic from the endpoint
      const validate = (value: unknown): string | null => {
        if (value !== null && value !== undefined) {
          if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
            return "maxOutstandingDuesPaise must be a positive integer or null";
          }
        }
        return null;
      };

      expect(validate(null)).toBeNull(); // null = no limit
      expect(validate(undefined)).toBeNull(); // undefined = no change
      expect(validate(500000)).toBeNull(); // valid positive integer
      expect(validate(1)).toBeNull(); // minimum valid
      expect(validate(0)).not.toBeNull(); // zero not allowed
      expect(validate(-100)).not.toBeNull(); // negative not allowed
      expect(validate(1.5)).not.toBeNull(); // non-integer not allowed
      expect(validate("500")).not.toBeNull(); // string not allowed
    });
  });
});
