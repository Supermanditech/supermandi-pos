/**
 * GCP-STG-0776: Demo store enrollment bypasses gated by DEMO_MODE_ENABLED
 */
describe("GCP-STG-0776: Demo mode env var gating", () => {
  const fs = require("fs");
  const enroll = fs.readFileSync("src/routes/v1/pos/enroll.ts", "utf8");

  it("should check DEMO_MODE_ENABLED env var before allowing demo bypasses", () => {
    expect(enroll).toContain('DEMO_MODE_ENABLED');
    expect(enroll).toContain('process.env.DEMO_MODE_ENABLED === "true"');
  });

  it("should log warning when demo bypass attempted but disabled", () => {
    expect(enroll).toContain("Demo bypass attempted but DEMO_MODE_ENABLED=false");
  });

  it("should default demo mode to disabled (false)", () => {
    // isDemo should only be true when BOTH env var is true AND store code matches
    const demoLines = enroll.match(/const isDemo = .*(demoModeEnabled|DEMO_MODE_ENABLED).*&&/g);
    expect(demoLines).not.toBeNull();
    expect(demoLines!.length).toBeGreaterThanOrEqual(2); // main handler + lookup handler
  });
});
