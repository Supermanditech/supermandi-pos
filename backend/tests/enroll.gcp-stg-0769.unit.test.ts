/**
 * GCP-STG-0769: Enrollment uses only pos_device_enrollments, no device_activation_codes fallback
 */
describe("GCP-STG-0769: No device_activation_codes fallback in enrollment", () => {
  const fs = require("fs");
  const enroll = fs.readFileSync("src/routes/v1/pos/enroll.ts", "utf8");

  it("should use pos_device_enrollments for enrollment lookup", () => {
    expect(enroll).toContain("FROM pos_device_enrollments e");
    expect(enroll).toContain("enrollment_code_hash");
  });

  it("should NOT use device_activation_codes in the main /enroll handler", () => {
    // Main enrollment handler is between posEnrollRouter.post("/enroll" and posEnrollRouter.post("/enroll/check-label"
    const enrollStart = enroll.indexOf('posEnrollRouter.post("/enroll"');
    const enrollEnd = enroll.indexOf('posEnrollRouter.post("/enroll/check-label"');
    expect(enrollStart).toBeGreaterThan(-1);
    expect(enrollEnd).toBeGreaterThan(enrollStart);
    const mainHandler = enroll.slice(enrollStart, enrollEnd);
    expect(mainHandler).not.toContain("device_activation_codes");
  });

  it("should use SHA-256 hash for code lookup (not plaintext)", () => {
    expect(enroll).toContain("hashCode");
    expect(enroll).toContain("enrollment_code_hash");
  });
});
