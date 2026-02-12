// SA-001: Extracted from App.tsx — Email OTP login gate component
// GO-LIVE-LOGIN-004: Email OTP login gate component
import React, { useEffect, useRef, useState } from "react";
import { sendAdminOtp, verifyAdminOtp } from "../api/authToken";

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
      await sendAdminOtp(trimmedEmail);
      setStep("otp");
      setOtp("");
      setCountdown(60);
    } catch (err: any) {
      setError(err?.message || "Failed to send OTP. Check your email and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    const trimmedOtp = otp.trim();
    if (trimmedOtp.length < 4) {
      setError("Enter the OTP from your email");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await verifyAdminOtp(email.trim().toLowerCase(), trimmedOtp);
      onLogin();
    } catch (err: any) {
      setError(err?.message || "Invalid OTP. Check your email and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="loginContainer">
      <div className="loginCard">
        <div className="loginHeader">
          <div className="brandPill" style={{ fontSize: 18 }}>SuperMandi</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 8 }}>SuperAdmin Login</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Secure email OTP authentication
          </div>
        </div>

        {step === "email" && (
          <form onSubmit={handleSendOtp}>
            <div className="loginField">
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@supermandi.com"
                disabled={loading}
                autoFocus
              />
            </div>

            {error && <div className="loginError">{error}</div>}

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
            <div className="loginInfo" style={{ marginBottom: 16, background: "#1e293b", borderRadius: 8, padding: 12 }}>
              OTP sent to <strong>{email}</strong>
            </div>

            <div className="loginField">
              <label>Enter OTP</label>
              <input
                ref={otpRef}
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Enter 6-digit code"
                maxLength={8}
                disabled={loading}
                autoComplete="one-time-code"
              />
            </div>

            {error && <div className="loginError">{error}</div>}

            <button
              type="submit"
              className="loginButton"
              disabled={loading || !otp.trim()}
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
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
                onClick={(e) => { setCountdown(60); handleSendOtp(e as any); }}
                disabled={loading || countdown > 0}
              >
                {countdown > 0 ? `Resend in ${countdown}s` : "Resend OTP"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
