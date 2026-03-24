// SA-001: Extracted from App.tsx — Email OTP login gate component
// GO-LIVE-LOGIN-004: Email OTP login gate component
// GCP-STG-0538: Added password login mode with authMode toggle
import React, { useEffect, useRef, useState } from "react";
import { sendAdminOtp, verifyAdminOtp, fetchWithTimeout } from "../api/authToken";
import { ThemeToggle } from "./ThemeToggle";
import { BuildStamp } from "./BuildStamp";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

export function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  // GCP-STG-0457: Lockout countdown when account is locked after too many attempts
  const [lockoutCountdown, setLockoutCountdown] = useState(0);
  // GCP-STG-0538: Password login mode toggle
  const [authMode, setAuthMode] = useState<'otp' | 'password'>('otp');
  const [password, setPassword] = useState("");
  const otpRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

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

  // GCP-STG-0457: Countdown timer for account lockout
  useEffect(() => {
    if (lockoutCountdown <= 0) return;
    const timer = setTimeout(() => setLockoutCountdown(lockoutCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [lockoutCountdown]);

  // GCP-STG-0538: Auto-focus password input when switching to password mode
  useEffect(() => {
    if (authMode === 'password' && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [authMode]);

  // GCP-STG-0538: Handle password login
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    if (!password) {
      setError("Enter your password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/login-password`, {
        method: "POST",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({ error: { message: 'Too many attempts' } }));
        const unlockAt = data?.error?.unlockAt;
        if (unlockAt) {
          const secondsLeft = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
          setLockoutCountdown(secondsLeft);
          const minutes = Math.ceil(secondsLeft / 60);
          setError(`Account locked. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`);
        } else {
          setError(data?.error?.message || "Too many attempts. Please try again later.");
        }
        return;
      }

      if (res.status === 403) {
        setError("Email not authorized");
        return;
      }

      if (res.status === 401) {
        setError("Invalid password");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message || `Login failed (${res.status})`);
        return;
      }

      const data = await res.json();
      // SEC-010: Backend sets HttpOnly cookie; store session flag + expiry in localStorage
      if (data.token) {
        const ttlMs = data.expiresIn ? data.expiresIn * 1000 : 24 * 60 * 60 * 1000;
        const expiresAt = Date.now() + ttlMs;
        try {
          localStorage.setItem('supermandi_admin_session', 'cookie-auth');
          localStorage.setItem('supermandi_admin_session_expiry', expiresAt.toString());
          localStorage.setItem('supermandi_admin_last_activity', Date.now().toString());
        } catch {
          // ignore storage errors
        }
      }
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // R4-TS-001: Accept SyntheticEvent base type (works for both form submit and button click)
  async function handleSendOtp(e: React.SyntheticEvent) {
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
        // GCP-STG-0457: Show lockout countdown when account is locked
        if (result.unlockAt) {
          const secondsLeft = Math.max(0, Math.ceil((result.unlockAt - Date.now()) / 1000));
          setLockoutCountdown(secondsLeft);
          const minutes = Math.ceil(secondsLeft / 60);
          setError(`Account locked. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`);
        } else {
          setError(result.error || "Invalid OTP. Check your email and try again.");
        }
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
            {authMode === 'otp' ? 'Secure email OTP authentication' : 'Password authentication'}
          </div>
        </div>

        {step === "email" && authMode === 'otp' && (
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

            {/* GCP-STG-0538: Auth mode toggle */}
            <div style={{ textAlign: 'center', margin: '8px 0' }}>
              <button
                type="button"
                className="loginLink"
                onClick={() => { setAuthMode('password'); setError(''); }}
              >
                Use password instead
              </button>
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

        {/* GCP-STG-0538: Password login form */}
        {step === "email" && authMode === 'password' && (
          <form onSubmit={handlePasswordLogin}>
            <div className="loginField">
              <label htmlFor="admin-email-pw">Email address</label>
              <input
                id="admin-email-pw"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@supermandi.tech"
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="loginField">
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                ref={passwordRef}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>

            {/* GCP-STG-0538: Auth mode toggle */}
            <div style={{ textAlign: 'center', margin: '8px 0' }}>
              <button
                type="button"
                className="loginLink"
                onClick={() => { setAuthMode('otp'); setError(''); setPassword(''); }}
              >
                Use OTP instead
              </button>
            </div>

            {/* GCP-STG-0538: Lockout countdown for password mode */}
            {lockoutCountdown > 0 && (
              <div className="loginError" role="alert">
                Account locked. Try again in {Math.ceil(lockoutCountdown / 60)} minute{Math.ceil(lockoutCountdown / 60) !== 1 ? "s" : ""} ({lockoutCountdown}s).
              </div>
            )}
            {error && lockoutCountdown <= 0 && <div className="loginError" role="alert">{error}</div>}

            <button
              type="submit"
              className="loginButton"
              disabled={loading || !email.trim() || !password || lockoutCountdown > 0}
            >
              {loading ? "Logging in..." : lockoutCountdown > 0 ? `Locked (${lockoutCountdown}s)` : "Log In"}
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

            {/* GCP-STG-0457: Show lockout countdown or generic error */}
            {lockoutCountdown > 0 && (
              <div className="loginError" role="alert">
                Account locked. Try again in {Math.ceil(lockoutCountdown / 60)} minute{Math.ceil(lockoutCountdown / 60) !== 1 ? "s" : ""} ({lockoutCountdown}s).
              </div>
            )}
            {error && lockoutCountdown <= 0 && <div className="loginError" role="alert">{error}</div>}

            <button
              type="submit"
              className="loginButton"
              disabled={loading || !otp.trim() || lockoutCountdown > 0}
            >
              {loading ? "Verifying..." : lockoutCountdown > 0 ? `Locked (${lockoutCountdown}s)` : "Verify OTP"}
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
                onClick={(e) => { handleSendOtp(e); }}
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
