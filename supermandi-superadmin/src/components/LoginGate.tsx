// SA-001: Extracted from App.tsx — Email OTP login gate component
// GO-LIVE-LOGIN-004: Email OTP login gate component
import React, { useEffect, useRef, useState } from "react";
import { sendAdminOtp, verifyAdminOtp } from "../api/authToken";
import { ThemeToggle } from "./ThemeToggle";
import { BuildStamp } from "./BuildStamp";

export function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  // Auto-focus OTP input when switching to OTP step
  useEffect(() => {
    if (step === "otp" && otpRef.current) {
      otpRef.current.focus();
    }
  }, [step]);

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await sendAdminOtp(trimmedEmail);
      if (!result.success) {
        setError(result.error || "Failed to send OTP. Check your email and try again.");
        return;
      }
      setStep("otp");
      setOtp("");
      setCountdown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send OTP. Check your email and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const trimmedOtp = otp.trim();
    if (trimmedOtp.length !== 6) {
      setError("Enter the 6-digit OTP from your email");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await verifyAdminOtp(email.trim().toLowerCase(), trimmedOtp);
      if (!result.success) {
        setError(result.error || "Invalid OTP. Check your email and try again.");
        return;
      }
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid OTP. Check your email and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sa-login-wrapper">
      {/* T-095: Unified login header — shortmark + brand text + portal name */}
      <header className="auth-header">
        <div className="auth-header-inner">
          <div className="auth-header-brand">
            <img src="/admin/brand/logo-shortmark.svg" alt="" width={24} height={24} className="brand-mark-light" />
            <img src="/admin/brand/logo-shortmark-inverse.svg" alt="" width={24} height={24} className="brand-mark-dark" />
            <span className="auth-logo-pill">SuperMandi</span>
            <span className="auth-logo-separator">|</span>
            <span className="auth-logo-subtext">SuperAdmin</span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <div className="loginContainer" style={{ flex: 1 }}>
      <div className="loginCard">
        <div className="loginHeader">
          <div className="sa-login-title">SuperAdmin Login</div>
          <div className="muted sa-mt-4">
            Secure email OTP authentication
          </div>
        </div>

        {step === "email" && (
          <form onSubmit={handleSendOtp}>
            <div className="loginField">
              <label htmlFor="admin-email">Email address</label>
              <input
                id="admin-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@supermandi.tech"
                disabled={loading}
                autoFocus
              />
            </div>

            {error && <div className="loginError" role="alert">{error}</div>}

            <button
              type="submit"
              className="loginButton"
              disabled={loading || !email.trim()}
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>

            <div className="loginInfo">
              Only authorised admin emails can sign in. Contact the platform owner if you need access.
            </div>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp}>
            <div className="loginInfo sa-otp-banner">
              OTP sent to <strong>{email}</strong>
            </div>

            <div className="loginField">
              <label htmlFor="admin-otp">Enter OTP</label>
              <input
                id="admin-otp"
                name="otp"
                ref={otpRef}
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Enter 6-digit code"
                maxLength={6}
                disabled={loading}
                autoComplete="one-time-code"
              />
            </div>

            {error && <div className="loginError" role="alert">{error}</div>}

            <button
              type="submit"
              className="loginButton"
              disabled={loading || !otp.trim()}
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            <div className="sa-login-actions">
              <button
                type="button"
                className="loginLink"
                onClick={() => { setStep("email"); setError(""); setOtp(""); }}
                disabled={loading}
              >
                ← Change email
              </button>
              <button
                type="button"
                className="loginLink"
                onClick={(e) => { handleSendOtp(e as any); }}
                disabled={loading || countdown > 0}
              >
                {countdown > 0 ? `Resend in ${countdown}s` : "Resend OTP"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
    {/* T-097: Unified footer — standard text + BuildStamp */}
    <footer className="sa-app-footer">
      <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
      <BuildStamp />
    </footer>
    </div>
  );
}
