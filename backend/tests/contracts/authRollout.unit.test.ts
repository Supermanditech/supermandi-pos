/**
 * V3-HARDEN-118/119: Auth rollout safety contract tests
 * Verifies OTP auth route is mounted correctly in the v1 router.
 */
import * as fs from "fs";
import * as path from "path";

const INDEX_SRC = fs.readFileSync(path.resolve(__dirname, "../../src/routes/v1/index.ts"), "utf8");
const OTP_SRC = fs.readFileSync(path.resolve(__dirname, "../../src/routes/v1/pos/otpAuth.ts"), "utf8");

describe("V3-FIX-115: OTP auth route mounted without device token", () => {
  it("posOtpAuthRouter is imported in v1 index", () => {
    expect(INDEX_SRC).toContain('import { posOtpAuthRouter } from "./pos/otpAuth"');
  });

  it("posOtpAuthRouter is mounted on /pos path", () => {
    expect(INDEX_SRC).toContain('v1Router.use("/pos", posOtpAuthRouter)');
  });

  it("OTP route comment confirms no device token required", () => {
    expect(INDEX_SRC).toContain("no device token required");
  });
});

describe("V3-FIX-116: OTP routes validate input (capability handshake)", () => {
  it("send-otp validates phone format and returns INVALID_PHONE", () => {
    expect(OTP_SRC).toContain("INVALID_PHONE");
    expect(OTP_SRC).toContain("Valid 10-digit phone number required");
  });

  it("verify-otp validates input and returns INVALID_INPUT", () => {
    expect(OTP_SRC).toContain("INVALID_INPUT");
    expect(OTP_SRC).toContain("Phone and 6-digit OTP required");
  });
});

describe("V3-DELETE-117: No enrollment dependency in OTP auth", () => {
  it("otpAuth.ts does not import requireDeviceToken", () => {
    expect(OTP_SRC).not.toContain("requireDeviceToken");
  });

  it("otpAuth.ts does not import deviceToken middleware", () => {
    expect(OTP_SRC).not.toContain("deviceToken");
  });

  it("otpAuth.ts does not reference enrollment", () => {
    expect(OTP_SRC).not.toContain("enroll");
    expect(OTP_SRC).not.toContain("enrollment");
  });
});

describe("V3-HARDEN-118: Auth gate script exists", () => {
  it("auth-rollout-gate.sh exists and checks send-otp", () => {
    const gateSrc = fs.readFileSync(
      path.resolve(__dirname, "../../../scripts/gates/auth-rollout-gate.sh"), "utf8"
    );
    expect(gateSrc).toContain("send-otp");
    expect(gateSrc).toContain("pos_otp");
    expect(gateSrc).toContain("GATE FAILED");
    expect(gateSrc).toContain("GATE PASSED");
  });
});

describe("V3-HARDEN-119: Version parity check script exists", () => {
  it("version-parity-check.sh exists and reports SHA", () => {
    const paritySrc = fs.readFileSync(
      path.resolve(__dirname, "../../../scripts/gates/version-parity-check.sh"), "utf8"
    );
    expect(paritySrc).toContain("App build SHA");
    expect(paritySrc).toContain("Backend SHA");
    expect(paritySrc).toContain("Gateway SHA");
    expect(paritySrc).toContain("Parity Report");
  });
});
