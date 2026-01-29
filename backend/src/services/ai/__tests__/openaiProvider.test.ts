/**
 * OpenAI Provider Tests
 *
 * Tests for:
 * - Configuration validation
 * - Rate limiting
 * - JSON parsing and repair
 * - Error handling
 */

import {
  isOpenAIConfigured,
  parseJSONResponse,
  checkRateLimit,
  OpenAIRateLimitError,
  OpenAIBudgetExceededError,
} from "../openaiProvider";

describe("OpenAI Provider", () => {
  // Save original env
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("isOpenAIConfigured", () => {
    it("should return false when OPENAI_API_KEY is not set", () => {
      delete process.env.OPENAI_API_KEY;
      expect(isOpenAIConfigured()).toBe(false);
    });

    it("should return false when OPENAI_API_KEY is empty", () => {
      process.env.OPENAI_API_KEY = "";
      expect(isOpenAIConfigured()).toBe(false);
    });

    it("should return false when OPENAI_API_KEY is whitespace", () => {
      process.env.OPENAI_API_KEY = "   ";
      expect(isOpenAIConfigured()).toBe(false);
    });

    it("should return true when OPENAI_API_KEY is set", () => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      expect(isOpenAIConfigured()).toBe(true);
    });
  });

  describe("parseJSONResponse", () => {
    interface TestObj {
      actions: Array<{ type: string; name?: string }>;
      confidence: number;
    }

    const validator = (obj: unknown): obj is TestObj => {
      if (!obj || typeof obj !== "object") return false;
      const o = obj as Record<string, unknown>;
      return Array.isArray(o.actions) && typeof o.confidence === "number";
    };

    it("should parse valid JSON directly", () => {
      const input = '{"actions":[{"type":"ADD"}],"confidence":0.9}';
      const result = parseJSONResponse(input, validator);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.actions).toHaveLength(1);
        expect(result.data.confidence).toBe(0.9);
      }
    });

    it("should extract JSON from markdown code blocks", () => {
      const input = '```json\n{"actions":[{"type":"REMOVE"}],"confidence":0.8}\n```';
      const result = parseJSONResponse(input, validator);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.actions[0]?.type).toBe("REMOVE");
      }
    });

    it("should extract JSON from code blocks without language", () => {
      const input = '```\n{"actions":[],"confidence":0.5}\n```';
      const result = parseJSONResponse(input, validator);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidence).toBe(0.5);
      }
    });

    it("should repair JSON with surrounding text", () => {
      const input = 'Here is the result: {"actions":[{"type":"SEARCH"}],"confidence":0.7} hope this helps!';
      const result = parseJSONResponse(input, validator);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.actions[0]?.type).toBe("SEARCH");
      }
    });

    it("should fail for invalid JSON structure", () => {
      const input = '{"not_actions":[],"confidence":"string"}';
      const result = parseJSONResponse(input, validator);

      expect(result.success).toBe(false);
    });

    it("should fail for completely invalid input", () => {
      const input = "This is not JSON at all";
      const result = parseJSONResponse(input, validator);

      expect(result.success).toBe(false);
    });
  });

  describe("Rate Limiting", () => {
    it("should allow requests within rate limit", () => {
      expect(() => {
        checkRateLimit({
          deviceId: "test-device-1",
          storeId: "test-store-1",
          ip: "192.168.1.1",
          estimatedTokens: 100,
        });
      }).not.toThrow();
    });

    it("should throw when device rate limit exceeded", () => {
      const deviceId = "rate-limit-test-device";
      const storeId = "rate-limit-test-store";

      // Make 20 requests (the limit)
      for (let i = 0; i < 20; i++) {
        checkRateLimit({ deviceId, storeId, estimatedTokens: 100 });
      }

      // 21st should throw
      expect(() => {
        checkRateLimit({ deviceId, storeId, estimatedTokens: 100 });
      }).toThrow(OpenAIRateLimitError);
    });

    it("should throw when IP rate limit exceeded", () => {
      const ip = "rate-limit-test-ip";

      // Make 30 requests (the IP limit)
      for (let i = 0; i < 30; i++) {
        checkRateLimit({ ip, estimatedTokens: 100 });
      }

      // 31st should throw
      expect(() => {
        checkRateLimit({ ip, estimatedTokens: 100 });
      }).toThrow(OpenAIRateLimitError);
    });

    it("should throw when token budget exceeded", () => {
      const deviceId = "budget-test-device";
      const storeId = "budget-test-store";

      // Request with tokens exceeding the budget
      expect(() => {
        checkRateLimit({
          deviceId,
          storeId,
          estimatedTokens: 60000, // Exceeds 50k limit
        });
      }).toThrow(OpenAIBudgetExceededError);
    });
  });
});
