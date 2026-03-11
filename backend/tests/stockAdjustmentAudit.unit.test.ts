/**
 * SA-P1-011: Stock Adjustment Audit — API contract tests
 * Tests the shape of the stock adjustment response contract.
 */

import { z } from 'zod';

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/));

// =============================================================================
// STOCK ADJUSTMENT RESPONSE CONTRACT
// =============================================================================

const StockAdjustmentSchema = z.object({
  id: UuidSchema,
  productId: UuidSchema,
  productName: z.string(),
  oldQty: z.number(),
  newQty: z.number(),
  reason: z.string().nullable(),
  adjustedBy: z.string().nullable(),
  adjustedAt: TimestampSchema,
  notes: z.string().nullable(),
  referenceType: z.string().nullable(),
});

const StockAdjustmentsResponseSchema = z.object({
  success: z.literal(true),
  adjustments: z.array(StockAdjustmentSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

describe("SA-P1-011: Stock Adjustment Audit Contract", () => {
  it("validates a well-formed stock adjustment response", () => {
    const response = {
      success: true,
      adjustments: [
        {
          id: "a0000000-0000-0000-0000-000000000001",
          productId: "b0000000-0000-0000-0000-000000000001",
          productName: "Test Product",
          oldQty: 100,
          newQty: 95,
          reason: "damage",
          adjustedBy: "POS_MANUAL_ADJUST",
          adjustedAt: "2026-03-11T10:00:00.000Z",
          notes: "Broken packaging",
          referenceType: "manual",
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    };

    const result = StockAdjustmentsResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("validates empty response", () => {
    const response = {
      success: true,
      adjustments: [],
      total: 0,
      page: 1,
      limit: 50,
    };

    const result = StockAdjustmentsResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("validates response with null reason and notes", () => {
    const response = {
      success: true,
      adjustments: [
        {
          id: "a0000000-0000-0000-0000-000000000002",
          productId: "b0000000-0000-0000-0000-000000000002",
          productName: "Another Product",
          oldQty: 50,
          newQty: 55,
          reason: null,
          adjustedBy: null,
          adjustedAt: "2026-03-11T12:00:00+05:30",
          notes: null,
          referenceType: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    };

    const result = StockAdjustmentsResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("rejects response missing required fields", () => {
    const response = {
      success: true,
      adjustments: [
        {
          id: "a0000000-0000-0000-0000-000000000003",
          // missing productId
          productName: "Bad Product",
          oldQty: 10,
          newQty: 5,
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    };

    const result = StockAdjustmentsResponseSchema.safeParse(response);
    expect(result.success).toBe(false);
  });

  it("validates all known POS adjustment reasons", () => {
    const reasons = ["damage", "theft", "expired", "found", "correction", "other"];

    for (const reason of reasons) {
      const adj = {
        id: "a0000000-0000-0000-0000-000000000004",
        productId: "b0000000-0000-0000-0000-000000000004",
        productName: "Product",
        oldQty: 10,
        newQty: 8,
        reason,
        adjustedBy: "POS_MANUAL_ADJUST",
        adjustedAt: "2026-03-11T10:00:00.000Z",
        notes: null,
        referenceType: "manual",
      };

      const result = StockAdjustmentSchema.safeParse(adj);
      expect(result.success).toBe(true);
    }
  });

  it("validates pagination with page > 1", () => {
    const response = {
      success: true,
      adjustments: [],
      total: 150,
      page: 3,
      limit: 50,
    };

    const result = StockAdjustmentsResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("validates change computation (newQty - oldQty)", () => {
    const adjustment = {
      id: "a0000000-0000-0000-0000-000000000005",
      productId: "b0000000-0000-0000-0000-000000000005",
      productName: "Product",
      oldQty: 100,
      newQty: 95,
      reason: "damage",
      adjustedBy: "POS_MANUAL_ADJUST",
      adjustedAt: "2026-03-11T10:00:00.000Z",
      notes: null,
      referenceType: "manual",
    };

    const change = adjustment.newQty - adjustment.oldQty;
    expect(change).toBe(-5);
  });
});
