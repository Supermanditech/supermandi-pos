/**
 * STG-012 + STG-048: VoiceButton component unit tests
 *
 * Covers:
 * - STG-012: Brand-colored FAB uses useThemeColors() (not static theme import)
 * - STG-012: Contextual "Tap to speak" label shown on first use, hidden after
 * - STG-012: i18n key voice.tapToSpeak resolved
 * - STG-048: Enhanced elevation/shadow styles for floating effect
 * - STG-048: Proper button sizing (56px) and border radius
 *
 * Source-code analysis test (no rendering) — validates module exports and structure.
 */

import * as fs from "fs";
import * as path from "path";

const VOICE_BUTTON_PATH = path.resolve(
  __dirname,
  "../../components/voice/VoiceButton.tsx",
);

const EN_JSON_PATH = path.resolve(
  __dirname,
  "../../i18n/locales/en.json",
);

const HI_JSON_PATH = path.resolve(
  __dirname,
  "../../i18n/locales/hi.json",
);

describe("VoiceButton (STG-012 + STG-048)", () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(VOICE_BUTTON_PATH, "utf-8");
  });

  // =========================================================================
  // STG-012: Brand colors via useThemeColors()
  // =========================================================================

  describe("STG-012: Brand-colored FAB", () => {
    it("imports useThemeColors from theme (not static theme import)", () => {
      expect(source).toContain("import { useThemeColors }");
      // Must NOT use static `import { theme }` for colors
      expect(source).not.toMatch(/import\s*\{\s*theme\s*\}\s*from/);
    });

    it("calls useThemeColors() inside the component", () => {
      expect(source).toContain("useThemeColors()");
    });

    it("uses colors.primary for idle state background", () => {
      // The button background should use colors.primary (from theme hook)
      expect(source).toContain("colors.primary");
    });

    it("uses colors.error for recording state background", () => {
      expect(source).toContain("colors.error");
    });

    it("uses colors.textInverse for icon/spinner color", () => {
      expect(source).toContain("colors.textInverse");
    });

    it("does not hardcode any hex color values for button backgrounds", () => {
      // No hardcoded hex in backgroundColor assignments
      const bgColorLines = source
        .split("\n")
        .filter((line) => line.includes("backgroundColor") && !line.trim().startsWith("//"));
      for (const line of bgColorLines) {
        // Allow hex only in comments, not in actual assignments
        if (line.includes("#") && !line.trim().startsWith("//") && !line.trim().startsWith("*")) {
          // Allowed: theme color references are fine, just no literal hex in value position
          // e.g., `backgroundColor: "#2563EB"` is forbidden
          expect(line).not.toMatch(/backgroundColor:\s*["']#[0-9a-fA-F]+["']/);
        }
      }
    });
  });

  // =========================================================================
  // STG-012: Contextual "Tap to speak" label
  // =========================================================================

  describe("STG-012: Contextual label", () => {
    it("imports AsyncStorage for first-use persistence", () => {
      expect(source).toContain("AsyncStorage");
      expect(source).toContain("@react-native-async-storage/async-storage");
    });

    it("defines VOICE_LABEL_DISMISSED_KEY constant", () => {
      expect(source).toContain("VOICE_LABEL_DISMISSED_KEY");
      expect(source).toContain("@supermandi/voice_label_dismissed");
    });

    it("imports useTranslation for i18n", () => {
      expect(source).toContain("useTranslation");
      expect(source).toContain("react-i18next");
    });

    it("uses voice.tapToSpeak i18n key", () => {
      expect(source).toContain('t("voice.tapToSpeak")');
    });

    it("has a label testID for e2e testing", () => {
      expect(source).toContain("label");
      expect(source).toMatch(/testID.*label/);
    });

    it("shows label only when idle and not disabled", () => {
      // Label visibility gated on state === "idle" and !isDisabled
      expect(source).toContain('state === "idle"');
      expect(source).toContain("!isDisabled");
      expect(source).toContain("showLabel");
    });

    it("dismisses label on press interaction", () => {
      expect(source).toContain("dismissLabel");
    });

    it("persists dismissal to AsyncStorage", () => {
      expect(source).toContain("AsyncStorage.setItem");
      expect(source).toContain("AsyncStorage.getItem");
    });
  });

  // =========================================================================
  // STG-012: i18n keys
  // =========================================================================

  describe("STG-012: i18n keys", () => {
    it("en.json has voice.tapToSpeak key", () => {
      const en = JSON.parse(fs.readFileSync(EN_JSON_PATH, "utf-8"));
      expect(en.voice).toBeDefined();
      expect(en.voice.tapToSpeak).toBe("Tap to speak");
    });

    it("hi.json has voice.tapToSpeak key", () => {
      const hi = JSON.parse(fs.readFileSync(HI_JSON_PATH, "utf-8"));
      expect(hi.voice).toBeDefined();
      expect(hi.voice.tapToSpeak).toBe("बोलने के लिए टैप करें");
    });
  });

  // =========================================================================
  // STG-048: Position fix and elevation
  // =========================================================================

  describe("STG-048: Elevation and shadow", () => {
    it("uses elevation: 8 for proper floating effect", () => {
      expect(source).toContain("elevation: 8");
    });

    it("uses shadowOffset with height: 4 for depth", () => {
      expect(source).toContain("height: 4");
    });

    it("uses shadowOpacity: 0.3 for visible shadow", () => {
      expect(source).toContain("shadowOpacity: 0.3");
    });

    it("uses shadowRadius: 6 for spread", () => {
      expect(source).toContain("shadowRadius: 6");
    });

    it("uses colors.shadow for shadowColor (theme-aware)", () => {
      expect(source).toContain("shadowColor: colors.shadow");
    });

    it("button size is 56px (BUTTON_SIZE constant)", () => {
      expect(source).toContain("BUTTON_SIZE = 56");
      expect(source).toContain("width: BUTTON_SIZE");
      expect(source).toContain("height: BUTTON_SIZE");
    });

    it("uses useMemo for dynamic styles (theme-reactive)", () => {
      expect(source).toContain("useMemo");
      expect(source).toContain("dynamicStyles");
    });
  });

  // =========================================================================
  // STG-048: SellScanScreen FAB position
  // =========================================================================

  describe("STG-048: SellScanScreen FAB position", () => {
    let sellSource: string;

    beforeAll(() => {
      const sellPath = path.resolve(
        __dirname,
        "../../screens/SellScanScreen.tsx",
      );
      sellSource = fs.readFileSync(sellPath, "utf-8");
    });

    it("voiceFab uses bottom: 80 to stay above tab bar", () => {
      // The voiceFab style should have bottom: 80
      const fabMatch = sellSource.match(/voiceFab:\s*\{[^}]*bottom:\s*(\d+)/);
      expect(fabMatch).not.toBeNull();
      expect(Number(fabMatch![1])).toBeGreaterThanOrEqual(80);
    });

    it("voiceFabWithCart uses bottom >= 140 for cart clearance", () => {
      const cartMatch = sellSource.match(
        /voiceFabWithCart:\s*\{[^}]*bottom:\s*(\d+)/,
      );
      expect(cartMatch).not.toBeNull();
      expect(Number(cartMatch![1])).toBeGreaterThanOrEqual(140);
    });

    it("voiceFab uses elevation: 8 for proper floating effect", () => {
      const fabSection = sellSource.match(
        /voiceFab:\s*\{[^}]*elevation:\s*(\d+)/,
      );
      expect(fabSection).not.toBeNull();
      expect(Number(fabSection![1])).toBeGreaterThanOrEqual(8);
    });

    it("voiceFab uses brand primary color (not accent)", () => {
      const fabSection = sellSource.match(
        /voiceFab:\s*\{[^}]*backgroundColor:\s*([^\n,]+)/,
      );
      expect(fabSection).not.toBeNull();
      expect(fabSection![1]).toContain("primary");
    });

    it("voiceFab has zIndex: 100 for layer ordering", () => {
      const fabSection = sellSource.match(
        /voiceFab:\s*\{[\s\S]*?zIndex:\s*(\d+)/,
      );
      expect(fabSection).not.toBeNull();
      expect(Number(fabSection![1])).toBe(100);
    });
  });

  // =========================================================================
  // General: Component structure
  // =========================================================================

  describe("Component structure", () => {
    it("exports VoiceButton as named export", () => {
      expect(source).toContain("export function VoiceButton");
    });

    it("exports VoiceButtonState type", () => {
      expect(source).toContain("export type VoiceButtonState");
    });

    it("exports VoiceButtonProps interface", () => {
      expect(source).toContain("export interface VoiceButtonProps");
    });

    it("exports default", () => {
      expect(source).toContain("export default VoiceButton");
    });

    it("preserves testID props for pressable, icon, and spinner", () => {
      expect(source).toContain("testID={`${testID}-pressable`}");
      expect(source).toContain("testID={`${testID}-icon`}");
      expect(source).toContain("testID={`${testID}-spinner`}");
    });

    it("preserves accessibility labels for all states", () => {
      expect(source).toContain("Recording voice command");
      expect(source).toContain("Processing voice command");
      expect(source).toContain("Press and hold to speak");
    });

    it("does not import StyleSheet (uses dynamic styles)", () => {
      expect(source).not.toContain("StyleSheet");
    });
  });
});
