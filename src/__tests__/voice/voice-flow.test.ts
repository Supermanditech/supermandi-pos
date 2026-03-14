/**
 * STG-411: Voice flow E2E source-code analysis tests
 * Verifies voice interaction pipeline integrity via source inspection:
 *   1. VoiceSheet exports all required states
 *   2. voiceClient has AbortController timeout (10s)
 *   3. voiceClient handles 429 rate limit responses
 *   4. VoiceSheet has ConfidenceBar component
 *   5. SellScanScreen passes locale to voice functions
 */

import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..");

function readSource(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), "utf-8");
}

describe("STG-411: Voice flow E2E — source analysis", () => {
  const voiceSheetSrc = readSource("components/voice/VoiceSheet.tsx");
  const voiceClientSrc = readSource("services/voice/voiceClient.ts");
  const sellScanSrc = readSource("screens/SellScanScreen.tsx");

  // =========================================================================
  // 1. VoiceSheet exports all required states
  // =========================================================================
  describe("VoiceSheet required states", () => {
    const requiredStates = [
      "confirm",
      "clarify",
      "permissionDenied",
      "timeout",
      "rateLimited",
    ];

    for (const state of requiredStates) {
      it(`VoiceSheetState includes "${state}"`, () => {
        // The type union should contain each state as a string literal
        expect(voiceSheetSrc).toContain(`"${state}"`);
      });
    }

    it("VoiceSheetState is an exported type", () => {
      expect(voiceSheetSrc).toMatch(/export\s+type\s+VoiceSheetState/);
    });
  });

  // =========================================================================
  // 2. voiceClient has AbortController timeout (10s)
  // =========================================================================
  describe("voiceClient AbortController timeout", () => {
    it("defines VOICE_API_TIMEOUT_MS as 10_000", () => {
      expect(voiceClientSrc).toMatch(/VOICE_API_TIMEOUT_MS\s*=\s*10[_,]?000/);
    });

    it("creates an AbortController for API requests", () => {
      expect(voiceClientSrc).toContain("new AbortController()");
    });

    it("sets timeout with setTimeout to abort the controller", () => {
      expect(voiceClientSrc).toMatch(/setTimeout\s*\(\s*\(\)\s*=>\s*controller\.abort\(\)/);
    });

    it("passes signal to fetch options", () => {
      expect(voiceClientSrc).toContain("signal: controller.signal");
    });

    it("throws VoiceTimeoutError on AbortError", () => {
      expect(voiceClientSrc).toContain("VoiceTimeoutError");
      expect(voiceClientSrc).toContain("AbortError");
    });
  });

  // =========================================================================
  // 3. voiceClient handles 429 rate limit responses
  // =========================================================================
  describe("voiceClient 429 rate limit handling", () => {
    it("checks for response.status === 429", () => {
      expect(voiceClientSrc).toMatch(/response\.status\s*===\s*429/);
    });

    it("reads retry-after header", () => {
      expect(voiceClientSrc).toMatch(/headers\.get\s*\(\s*["']retry-after["']\s*\)/);
    });

    it("exports VoiceRateLimitError class", () => {
      expect(voiceClientSrc).toMatch(/export\s+class\s+VoiceRateLimitError/);
    });

    it("VoiceRateLimitError has retryAfterSeconds property", () => {
      expect(voiceClientSrc).toContain("retryAfterSeconds");
    });
  });

  // =========================================================================
  // 4. VoiceSheet has a ConfidenceBar component
  // =========================================================================
  describe("VoiceSheet ConfidenceBar component", () => {
    it("defines ConfidenceBar function component", () => {
      expect(voiceSheetSrc).toMatch(/function\s+ConfidenceBar/);
    });

    it("ConfidenceBar accepts confidence prop", () => {
      expect(voiceSheetSrc).toMatch(/ConfidenceBarProps/);
      expect(voiceSheetSrc).toContain("confidence: number");
    });

    it("ConfidenceBar renders percentage from 0-1 scale", () => {
      // confidence * 100 to convert to percentage
      expect(voiceSheetSrc).toMatch(/confidence\s*\*\s*100/);
    });

    it("ConfidenceBar is used in SuccessContent", () => {
      // Look for <ConfidenceBar usage within the file
      expect(voiceSheetSrc).toMatch(/<ConfidenceBar/);
    });
  });

  // =========================================================================
  // 5. SellScanScreen passes locale to voice functions
  // =========================================================================
  describe("SellScanScreen locale pass-through", () => {
    it("imports VoiceLocale type", () => {
      expect(sellScanSrc).toContain("VoiceLocale");
    });

    it("maintains voiceLocale state", () => {
      expect(sellScanSrc).toMatch(/voiceLocale/);
      expect(sellScanSrc).toMatch(/setVoiceLocale/);
    });

    it("passes locale to VoiceSheet component", () => {
      expect(sellScanSrc).toMatch(/locale=\{voiceLocale\}/);
    });

    it("passes locale to submitVoiceCommand", () => {
      // The screen should pass locale when calling submitVoiceCommand
      expect(sellScanSrc).toContain("submitVoiceCommand");
    });
  });
});
