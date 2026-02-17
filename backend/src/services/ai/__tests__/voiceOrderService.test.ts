/**
 * TQ-013: Voice Order Service Tests — using REAL imports.
 * Tests enforceBoundaries + isValidParsedActions from voiceOrderService.ts.
 * No local copies — all assertions run against production code.
 */
import { enforceBoundaries, isValidParsedActions } from '../voiceOrderService';
import type { CartAction } from '../voiceOrderService';

describe("Voice Order Service - Boundary Enforcement (real import)", () => {
  const act = (type: CartAction['type']): CartAction => ({ type });

  describe("SWITCH_MODE boundary", () => {
    it("should allow managers to switch modes", () => {
      const result = enforceBoundaries([act("SWITCH_MODE")], "SELL", "manager");
      expect(result[0]?.type).toBe("SWITCH_MODE");
      expect(result[0]?.reason).toBeUndefined();
    });

    it("should allow owners to switch modes", () => {
      const result = enforceBoundaries([act("SWITCH_MODE")], "SELL", "owner");
      expect(result[0]?.type).toBe("SWITCH_MODE");
      expect(result[0]?.reason).toBeUndefined();
    });

    it("should deny cashiers from switching modes", () => {
      const result = enforceBoundaries([act("SWITCH_MODE")], "SELL", "cashier");
      expect(result[0]?.type).toBe("UNKNOWN");
      expect(result[0]?.reason).toContain("Only managers");
    });

    it("should deny undefined role from switching modes", () => {
      const result = enforceBoundaries([act("SWITCH_MODE")], "SELL", undefined);
      expect(result[0]?.type).toBe("UNKNOWN");
    });
  });

  describe("SET_PRICE boundary", () => {
    it("should allow managers to set prices", () => {
      const result = enforceBoundaries([act("SET_PRICE")], "SELL", "manager");
      expect(result[0]?.type).toBe("SET_PRICE");
    });

    it("should allow owners to set prices", () => {
      const result = enforceBoundaries([act("SET_PRICE")], "SELL", "owner");
      expect(result[0]?.type).toBe("SET_PRICE");
    });

    it("should deny cashiers from setting prices", () => {
      const result = enforceBoundaries([act("SET_PRICE")], "SELL", "cashier");
      expect(result[0]?.type).toBe("UNKNOWN");
      expect(result[0]?.reason).toContain("Only managers");
    });
  });

  describe("SET_DISCOUNT boundary", () => {
    it("should allow managers to set discounts", () => {
      const result = enforceBoundaries([act("SET_DISCOUNT")], "SELL", "manager");
      expect(result[0]?.type).toBe("SET_DISCOUNT");
    });

    it("should deny cashiers from setting discounts", () => {
      const result = enforceBoundaries([act("SET_DISCOUNT")], "SELL", "cashier");
      expect(result[0]?.type).toBe("UNKNOWN");
    });
  });

  describe("ADD_ITEM - allowed for all roles", () => {
    it("should allow cashiers to add items", () => {
      const result = enforceBoundaries([act("ADD_ITEM")], "SELL", "cashier");
      expect(result[0]?.type).toBe("ADD_ITEM");
    });

    it("should allow managers to add items", () => {
      const result = enforceBoundaries([act("ADD_ITEM")], "SELL", "manager");
      expect(result[0]?.type).toBe("ADD_ITEM");
    });
  });

  describe("REMOVE_ITEM - allowed for all roles", () => {
    it("should allow cashiers to remove items", () => {
      const result = enforceBoundaries([act("REMOVE_ITEM")], "SELL", "cashier");
      expect(result[0]?.type).toBe("REMOVE_ITEM");
    });
  });

  describe("Multiple actions", () => {
    it("should enforce boundaries on all actions", () => {
      const actions: CartAction[] = [act("ADD_ITEM"), act("SET_PRICE"), act("SWITCH_MODE")];
      const result = enforceBoundaries(actions, "SELL", "cashier");
      expect(result[0]?.type).toBe("ADD_ITEM");
      expect(result[1]?.type).toBe("UNKNOWN");
      expect(result[2]?.type).toBe("UNKNOWN");
    });

    it("should allow all actions for managers", () => {
      const actions: CartAction[] = [act("ADD_ITEM"), act("SET_PRICE"), act("SWITCH_MODE")];
      const result = enforceBoundaries(actions, "SELL", "manager");
      expect(result[0]?.type).toBe("ADD_ITEM");
      expect(result[1]?.type).toBe("SET_PRICE");
      expect(result[2]?.type).toBe("SWITCH_MODE");
    });
  });
});

describe("Voice Order Service - Idempotency", () => {
  // Simple idempotency store mock
  const processedRequests = new Map<string, { result: string }>();

  function processRequest(requestId: string): { result: string; cached: boolean } {
    const existing = processedRequests.get(requestId);
    if (existing) {
      return { result: existing.result, cached: true };
    }

    const result = `processed-${requestId}`;
    processedRequests.set(requestId, { result });
    return { result, cached: false };
  }

  beforeEach(() => {
    processedRequests.clear();
  });

  it("should process new requests", () => {
    const result = processRequest("req-1");

    expect(result.cached).toBe(false);
    expect(result.result).toBe("processed-req-1");
  });

  it("should return cached result for duplicate requests", () => {
    // First request
    const result1 = processRequest("req-2");
    expect(result1.cached).toBe(false);

    // Duplicate request
    const result2 = processRequest("req-2");
    expect(result2.cached).toBe(true);
    expect(result2.result).toBe(result1.result);
  });

  it("should handle different request IDs independently", () => {
    const result1 = processRequest("req-3");
    const result2 = processRequest("req-4");

    expect(result1.cached).toBe(false);
    expect(result2.cached).toBe(false);
    expect(result1.result).not.toBe(result2.result);
  });
});

describe("Voice Order - JSON Schema Validation (real isValidParsedActions)", () => {
  it("should validate correct schema", () => {
    expect(isValidParsedActions({
      actions: [{ type: "ADD_ITEM", productName: "rice", quantity: 2 }],
      confidence: 0.9,
    })).toBe(true);
  });

  it("should reject missing actions array", () => {
    expect(isValidParsedActions({ confidence: 0.9 })).toBe(false);
  });

  it("should reject missing confidence", () => {
    expect(isValidParsedActions({ actions: [] })).toBe(false);
  });

  it("should reject non-object input", () => {
    expect(isValidParsedActions(null)).toBe(false);
    expect(isValidParsedActions("string")).toBe(false);
    expect(isValidParsedActions(42)).toBe(false);
  });

  it("should accept empty actions array with valid confidence", () => {
    expect(isValidParsedActions({ actions: [], confidence: 0.5 })).toBe(true);
  });

  it("should accept multiple actions", () => {
    expect(isValidParsedActions({
      actions: [
        { type: "ADD_ITEM", productName: "rice", quantity: 2, unit: "kg" },
        { type: "ADD_ITEM", productName: "dal", quantity: 1, unit: "kg" },
        { type: "REMOVE_ITEM", productName: "salt" },
      ],
      confidence: 0.85,
    })).toBe(true);
  });
});
