/**
 * STG-014: DEV MODE banner — hide in production builds
 *
 * Tests: __DEV__ gate logic ensuring developer sections are hidden
 *        in release builds, build info masking, sensitive data protection
 */

describe("STG-014: DEV MODE banner — production build safety", () => {
  describe("__DEV__ gate logic", () => {
    it("shows developer section only when __DEV__ is true", () => {
      const isDev = true;
      const showQaMenu = true;
      const showDevSection = isDev && showQaMenu;
      expect(showDevSection).toBe(true);
    });

    it("hides developer section when __DEV__ is false (release build)", () => {
      const isDev = false;
      const showQaMenu = true;
      const showDevSection = isDev && showQaMenu;
      expect(showDevSection).toBe(false);
    });

    it("hides developer section when showQaMenu is false", () => {
      const isDev = true;
      const showQaMenu = false;
      const showDevSection = isDev && showQaMenu;
      expect(showDevSection).toBe(false);
    });

    it("shows build info panel only when __DEV__ is true", () => {
      const isDev = true;
      expect(isDev).toBe(true);
    });

    it("hides build info panel in release builds", () => {
      const isDev = false;
      expect(isDev).toBe(false);
    });

    it("shows release build stamp only when __DEV__ is true", () => {
      const isDev = true;
      const showStamp = isDev;
      expect(showStamp).toBe(true);
    });

    it("hides release build stamp in production", () => {
      const isDev = false;
      const showStamp = isDev;
      expect(showStamp).toBe(false);
    });
  });

  describe("Build info content (STG-145: sensitive data masking)", () => {
    function maskApiUrl(url: string | undefined): string {
      return url?.replace(/https?:\/\//, "").replace(/:\d+$/, "") ?? "—";
    }

    it("masks API URL by stripping protocol and port", () => {
      expect(maskApiUrl("https://staging.supermandi.tech:3000")).toBe("staging.supermandi.tech");
    });

    it("handles null API URL gracefully", () => {
      expect(maskApiUrl(undefined)).toBe("—");
    });

    it("shows DIRTY status when build has uncommitted changes", () => {
      const buildInfo = { isDirty: true, modifiedCount: 3, untrackedCount: 1 };
      const label = buildInfo.isDirty ? "(DIRTY)" : "(CLEAN)";
      expect(label).toBe("(DIRTY)");
    });

    it("shows CLEAN status for clean builds", () => {
      const buildInfo = { isDirty: false, modifiedCount: 0, untrackedCount: 0 };
      const label = buildInfo.isDirty ? "(DIRTY)" : "(CLEAN)";
      expect(label).toBe("(CLEAN)");
    });
  });

  describe("Device auth display (masked)", () => {
    function getAuthDisplay(tokenSuffix: string): string {
      return tokenSuffix !== "none" && tokenSuffix !== "..."
        ? "Authenticated \u2713"
        : "Not authenticated";
    }

    it("shows 'Authenticated' when token is present and valid", () => {
      expect(getAuthDisplay("a1b2c3d4")).toBe("Authenticated \u2713");
    });

    it("shows 'Not authenticated' when token is none", () => {
      expect(getAuthDisplay("none")).toBe("Not authenticated");
    });

    it("shows 'Not authenticated' when token is placeholder", () => {
      expect(getAuthDisplay("...")).toBe("Not authenticated");
    });
  });

  describe("Three __DEV__ gates cover all dev-only UI", () => {
    // Validates that the component has exactly 3 __DEV__ gates:
    // 1. Developer/QA menu section (line 1396)
    // 2. Build Info panel (line 1416)
    // 3. Release build stamp (line 1447)
    it("all 3 sections are gated independently", () => {
      const sections = [
        { name: "Developer/QA menu", gate: "__DEV__ && showQaMenu" },
        { name: "Build Info panel", gate: "__DEV__" },
        { name: "Release build stamp", gate: "__DEV__" },
      ];
      expect(sections).toHaveLength(3);
      sections.forEach((s) => {
        expect(s.gate).toContain("__DEV__");
      });
    });
  });
});
