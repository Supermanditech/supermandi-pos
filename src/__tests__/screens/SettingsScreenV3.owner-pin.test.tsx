/**
 * V3-REG-027: POS Settings owner PIN + Add Staff cross-platform tests
 * Verifies Alert.prompt is NOT used in Android POS paths.
 */

describe("POS Settings owner PIN flow (V3-POS-024)", () => {
  it("should NOT use Alert.prompt in runtime code paths", () => {
    const fs = require("fs");
    const settings = fs.readFileSync("src/screens/v3/SettingsScreenV3.tsx", "utf8");
    // Only allowed in comments, not in runtime calls
    const lines = settings.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("//") || line.startsWith("*")) continue; // skip comments
      expect(line).not.toMatch(/Alert\.prompt\s*\(/);
    }
  });

  it("should use Modal component for owner PIN input", () => {
    const fs = require("fs");
    const settings = fs.readFileSync("src/screens/v3/SettingsScreenV3.tsx", "utf8");
    expect(settings).toContain("Modal");
    expect(settings).toContain('testID="settings-modal"');
  });

  it("should have owner PIN entry + confirmation steps in modal", () => {
    const fs = require("fs");
    const settings = fs.readFileSync("src/screens/v3/SettingsScreenV3.tsx", "utf8");
    expect(settings).toContain("modal-owner-pin");
    expect(settings).toContain("modal-owner-pin-confirm");
    expect(settings).toContain("PINs do not match");
  });

  it("should validate PIN format (4-6 digits)", () => {
    const fs = require("fs");
    const settings = fs.readFileSync("src/screens/v3/SettingsScreenV3.tsx", "utf8");
    expect(settings).toContain('"PIN must be 4-6 digits"');
    expect(settings).toContain("keyboardType=\"number-pad\"");
    expect(settings).toContain("secureTextEntry");
  });

  it("should call /api/v1/retailer-admin/staff/owner-pin endpoint", () => {
    const fs = require("fs");
    const settings = fs.readFileSync("src/screens/v3/SettingsScreenV3.tsx", "utf8");
    expect(settings).toContain("/api/v1/retailer-admin/staff/owner-pin");
  });

  it("should have cross-platform Add Staff modal (not Alert.prompt)", () => {
    const fs = require("fs");
    const settings = fs.readFileSync("src/screens/v3/SettingsScreenV3.tsx", "utf8");
    expect(settings).toContain('testID="modal-staff-name"');
    expect(settings).toContain('testID="modal-staff-pin"');
    expect(settings).toContain("createStaff");
  });
});
