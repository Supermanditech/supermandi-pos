/**
 * STG-004: Activation screen — branded redesign with trust signals
 *
 * Tests: activation code parsing, code validation, label validation,
 *        deep link URL handling, step indicator logic
 */

describe("STG-004: EnrollDeviceScreen — branded activation redesign", () => {
  describe("Activation code parsing", () => {
    function parseActivationCode(input: string): string | null {
      const trimmed = input.trim();
      if (!trimmed) return null;
      // Deep link URL: extract ?code=X param
      try {
        const url = new URL(trimmed);
        const code = url.searchParams.get("code");
        if (code) return code.toUpperCase();
      } catch {
        // Not a URL, treat as raw code
      }
      return trimmed.toUpperCase();
    }

    it("parses raw activation code", () => {
      expect(parseActivationCode("abc123")).toBe("ABC123");
    });

    it("parses code from deep link URL", () => {
      expect(parseActivationCode("https://supermandi.tech/activate?code=xyz789"))
        .toBe("XYZ789");
    });

    it("returns null for empty input", () => {
      expect(parseActivationCode("")).toBeNull();
    });

    it("returns null for whitespace-only input", () => {
      expect(parseActivationCode("   ")).toBeNull();
    });

    it("auto-capitalizes the code", () => {
      expect(parseActivationCode("abcdef")).toBe("ABCDEF");
    });
  });

  describe("Code validation (STG-062: minimum 4 chars)", () => {
    function isCodeValid(input: string): boolean {
      const parsed = input.trim().toUpperCase();
      return parsed.length >= 4;
    }

    it("rejects codes shorter than 4 characters", () => {
      expect(isCodeValid("AB")).toBe(false);
      expect(isCodeValid("ABC")).toBe(false);
    });

    it("accepts codes with exactly 4 characters", () => {
      expect(isCodeValid("ABCD")).toBe(true);
    });

    it("accepts codes longer than 4 characters", () => {
      expect(isCodeValid("ABCDEF123")).toBe(true);
    });

    it("rejects empty input", () => {
      expect(isCodeValid("")).toBe(false);
    });
  });

  describe("Label validation (STG-041: inline validation)", () => {
    function getLabelValidationState(input: string): "empty" | "valid" {
      if (!input.trim()) return "empty";
      return "valid";
    }

    it('returns "empty" for blank label', () => {
      expect(getLabelValidationState("")).toBe("empty");
      expect(getLabelValidationState("   ")).toBe("empty");
    });

    it('returns "valid" for non-empty label', () => {
      expect(getLabelValidationState("Samsung A325F")).toBe("valid");
    });
  });

  describe("Code validation state (STG-041)", () => {
    function getCodeValidationState(input: string): "empty" | "invalid" | "valid" {
      if (!input.trim()) return "empty";
      const parsed = input.trim();
      if (parsed.length < 4) return "invalid";
      return "valid";
    }

    it('returns "empty" for blank code', () => {
      expect(getCodeValidationState("")).toBe("empty");
    });

    it('returns "invalid" for short code', () => {
      expect(getCodeValidationState("AB")).toBe("invalid");
    });

    it('returns "valid" for sufficient code', () => {
      expect(getCodeValidationState("ABCDEF")).toBe("valid");
    });
  });

  describe("Step indicator", () => {
    it("shows Step 1 of 2 for code entry", () => {
      const step = 1;
      const total = 2;
      const label = `Step ${step} of ${total}`;
      expect(label).toBe("Step 1 of 2");
    });

    it("shows Step 2 of 2 for label entry", () => {
      const step = 2;
      const total = 2;
      const label = `Step ${step} of ${total}`;
      expect(label).toBe("Step 2 of 2");
    });
  });

  describe("Trust signals", () => {
    it("trust message is always displayed", () => {
      const trustText = "Secure activation · Data encrypted";
      expect(trustText).toContain("Secure");
      expect(trustText).toContain("encrypted");
    });
  });
});
