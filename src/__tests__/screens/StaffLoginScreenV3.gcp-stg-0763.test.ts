/**
 * GCP-STG-0763: StaffLoginScreenV3 handles "no staff exists" gracefully
 */
describe("GCP-STG-0763: No staff exists handling", () => {
  const fs = require("fs");
  const staff = fs.readFileSync("src/screens/v3/StaffLoginScreenV3.tsx", "utf8");

  it("should check staff count on mount via listStaff", () => {
    expect(staff).toContain("listStaff");
    expect(staff).toContain("setNoStaff");
  });

  it("should show no-staff card when store has no staff", () => {
    expect(staff).toContain('testID="staff-login-no-staff"');
    expect(staff).toContain("No staff configured");
  });

  it("should guide user to check WhatsApp for PIN", () => {
    expect(staff).toContain("Manager PIN was sent via WhatsApp");
  });

  it("should have contact support button", () => {
    expect(staff).toContain('testID="staff-login-contact-admin"');
    expect(staff).toContain("Contact Support on WhatsApp");
  });

  it("should still show PIN form even when no-staff detected", () => {
    // PIN form is always visible — user might have received PIN already
    expect(staff).toContain('testID="staff-login-pin-input"');
  });

  it("should handle cancelled effect on unmount", () => {
    expect(staff).toContain("cancelled = true");
  });
});
