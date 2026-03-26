/**
 * GCP-STG-0774: Enrollment accepts only `code` field, no aliases
 */
describe("GCP-STG-0774: Single enrollment code field name", () => {
  const fs = require("fs");
  const enroll = fs.readFileSync("src/routes/v1/pos/enroll.ts", "utf8");

  it("should accept only req.body.code in main /enroll handler", () => {
    // Main handler should NOT use enrollmentCode or enrollment_code aliases
    const mainHandler = enroll.slice(
      enroll.indexOf('posEnrollRouter.post("/enroll"'),
      enroll.indexOf('posEnrollRouter.post("/enroll/check-label"')
    );
    expect(mainHandler).not.toContain("req.body?.enrollmentCode");
    expect(mainHandler).not.toContain("req.body?.enrollment_code");
    expect(mainHandler).toContain("req.body?.code");
  });

  it("should accept only code in check-label endpoint", () => {
    const checkLabel = enroll.slice(
      enroll.indexOf('posEnrollRouter.post("/enroll/check-label"'),
      enroll.indexOf("posEnrollRouter.post(\"/lookup-activation\"") || undefined
    );
    expect(checkLabel).not.toContain("req.body?.enrollmentCode");
    expect(checkLabel).toContain("req.body?.code");
  });

  it("POS client should send only `code` field", () => {
    const api = fs.readFileSync(
      require("path").resolve(__dirname, "../../src/services/api/enrollApi.ts"),
      "utf8"
    );
    expect(api).toContain("code: input.enrollmentCode");
    expect(api).not.toContain("enrollmentCode: input.enrollmentCode");
  });
});
