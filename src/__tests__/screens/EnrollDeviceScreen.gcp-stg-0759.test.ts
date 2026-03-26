/**
 * GCP-STG-0759: EnrollDeviceScreen deprecation + Phone login link
 */
describe("GCP-STG-0759: EnrollDeviceScreen deprecation", () => {
  const fs = require("fs");
  const enroll = fs.readFileSync("src/screens/EnrollDeviceScreen.tsx", "utf8");

  it("should have @deprecated JSDoc tag", () => {
    expect(enroll).toContain("@deprecated GCP-STG-0759");
  });

  it("should have 'Use Phone Login' banner with testID", () => {
    expect(enroll).toContain('testID="enroll-phone-login-link"');
    expect(enroll).toContain("Use Phone Login Instead");
  });

  it("should navigate to V3Phone on phone login tap", () => {
    expect(enroll).toContain('"V3Phone"');
  });

  it("should still be registered in App.tsx navigator", () => {
    const app = fs.readFileSync("App.tsx", "utf8");
    expect(app).toContain('name="EnrollDevice"');
    expect(app).toContain("GCP-STG-0759: EnrollDevice deprecated");
  });

  it("should have manual focus ref for Android autoFocus fix", () => {
    expect(enroll).toContain("codeInputRef");
    expect(enroll).toContain("ref={codeInputRef}");
    expect(enroll).toContain(".focus()");
  });

  it("should keep autoFocus as well (belt and suspenders)", () => {
    expect(enroll).toContain("autoFocus");
  });
});
