// GCP-STG-0147: Firebase OTP rate limit — email/password fallback
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const firebasePath = path.resolve(__dirname, "../lib/firebase.ts");
const firebaseCode = fs.readFileSync(firebasePath, "utf-8");

const loginPath = path.resolve(__dirname, "../pages/LoginPage.tsx");
const loginCode = fs.readFileSync(loginPath, "utf-8");

describe("GCP-STG-0147: OTP rate limit handling", () => {
  describe("firebase.ts — error message", () => {
    test("auth/too-many-requests suggests email/password fallback", () => {
      expect(firebaseCode).toContain("Too many OTP attempts");
      expect(firebaseCode).toContain("email & password instead");
    });
  });

  describe("LoginPage.tsx — auto-switch to password mode", () => {
    test("sendOtp catch block covers Firebase rate limit pattern", () => {
      expect(loginCode).toContain("Too many OTP attempts");
      expect(loginCode).toContain("setAuthMode('password')");
    });

    test("sendOtp catch block covers backend 429 pattern", () => {
      // Backend authRateLimiter returns "Too many authentication attempts"
      const sendSection = loginCode.slice(
        loginCode.indexOf("handleSendOtp"),
        loginCode.indexOf("handleVerifyOtp")
      );
      expect(sendSection).toContain("Too many authentication");
    });

    test("verifyOtp catch block covers all rate limit patterns", () => {
      const verifySection = loginCode.slice(
        loginCode.indexOf("handleVerifyOtp"),
        loginCode.indexOf("handleStoreSelect")
      );
      expect(verifySection).toContain("Too many OTP attempts");
      expect(verifySection).toContain("Too many attempts");
      expect(verifySection).toContain("Too many authentication");
      expect(verifySection).toContain("too-many-requests");
      expect(verifySection).toContain("setAuthMode('password')");
    });

    test("email/password login option exists as fallback", () => {
      expect(loginCode).toContain("Sign in with email & password");
    });

    test("password auth mode handles email + password login", () => {
      expect(loginCode).toContain("handlePasswordLogin");
      expect(loginCode).toContain("auth/login");
    });
  });
});
