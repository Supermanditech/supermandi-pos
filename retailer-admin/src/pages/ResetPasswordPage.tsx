import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_GATEWAY_BASE, safeJson } from '../lib/api';
import { BuildStamp } from '../components/BuildStamp';
import { ThemeToggle } from '../components/ThemeToggle';

// AUTH-PARITY-003: Retailer reset-password page — parity with supplier /reset-password
// User arrives from email link: /retailer/reset-password?email=X&token=Y
// POST /api/v1/retailer-admin/auth/forgot-password/email-reset

type Step = 'form' | 'success' | 'missing-params';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const paramEmail = searchParams.get('email') || '';
  const paramToken = searchParams.get('token') || '';
  const [step, setStep] = useState<Step>(!paramEmail && !paramToken ? 'missing-params' : 'form');
  const [email, setEmail] = useState(paramEmail);
  const [token, setToken] = useState(paramToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // REQ.AUDIT.W5.RETAILER.RESET-PASSWORD-NO-VISIBILITY-TOGGLE.001
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // R7.RET.009: AbortController ref to cancel in-flight fetch on unmount
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!token.trim()) {
      setError('Please enter the reset token from your email');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError('Password must contain at least one digit');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    // R7.RET.009: Abort any previous request; create new controller for this fetch
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const response = await fetch(
        `${API_GATEWAY_BASE}/api/v1/retailer-admin/auth/forgot-password/email-reset`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            token: token.trim(),
            newPassword,
          }),
          credentials: 'include',
          signal: controller.signal,
        }
      );
      const data = await safeJson(response);
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Password reset failed');
      }
      setStep('success');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Password reset failed. The token may be expired or invalid.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <header className="login-header">
        <div className="login-header-inner">
          <div className="login-logo">
            <img className="brand-mark brand-mark-light" src="/retailer/brand/logo-shortmark.svg" alt="" width={20} height={20} />
            <img className="brand-mark brand-mark-dark" src="/retailer/brand/logo-shortmark-inverse.svg" alt="" width={20} height={20} />
            <span className="login-logo-text">SuperMandi</span>
            <span className="login-logo-separator">|</span>
            <span className="login-logo-subtext">Retailer Portal</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="login-main">
        <div className="login-card-container">
          <div className="login-card-box">
            {step === 'missing-params' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '4rem', height: '4rem', background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem', color: '#ef4444' }}>
                  !
                </div>
                <h2 className="login-card-title">Invalid Reset Link</h2>
                <p className="login-card-subtitle" style={{ marginBottom: '1.5rem' }}>
                  This page requires a valid password reset link from your email. Please request a new reset link.
                </p>
                <Link to="/retailer/forgot-password" className="login-btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                  Request Password Reset
                </Link>
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem', marginTop: '1rem' }}>
                  Remember your password?{' '}
                  <Link to="/retailer/login" className="login-text-link">Sign In</Link>
                </p>
              </div>
            ) : step === 'success' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '4rem', height: '4rem', background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem', color: '#22c55e' }}>
                  &#10003;
                </div>
                <h2 className="login-card-title">Password Reset Successful</h2>
                <p className="login-card-subtitle" style={{ marginBottom: '1.5rem' }}>
                  Your password has been reset. You can now sign in with your new password.
                </p>
                <Link to="/retailer/login" className="login-btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                  Sign In
                </Link>
              </div>
            ) : (
              <>
                <h2 className="login-card-title">Set New Password</h2>
                <p className="login-card-subtitle">Enter the reset token from your email and choose a new password.</p>

                {error && <div className="login-alert-error" role="alert">{error}</div>}

                <form onSubmit={handleSubmit}>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="reset-email">Email Address</label>
                    <input
                      id="reset-email"
                      name="email"
                      type="email"
                      className="login-form-input"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      autoFocus={!email}
                    />
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="reset-token">Reset Token</label>
                    <input
                      id="reset-token"
                      name="token"
                      type="text"
                      className="login-form-input"
                      style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                      placeholder="Paste the token from your email"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      disabled={isLoading}
                      autoFocus={!!email && !token}
                    />
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="reset-new-password">New Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="reset-new-password"
                        name="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        className="login-form-input"
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={isLoading}
                        autoFocus={!!email && !!token}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.8125rem', padding: 0 }}
                        tabIndex={-1}
                      >
                        {showNewPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Min 8 characters, 1 uppercase, 1 lowercase, 1 digit</p>
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="reset-confirm-password">Confirm Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="reset-confirm-password"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="login-form-input"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.8125rem', padding: 0 }}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                  <button type="submit" className="login-btn-primary" disabled={isLoading}>
                    {isLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>

                <div className="login-divider">
                  <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem', margin: '0 0 0.5rem' }}>
                    Need a new token?{' '}
                    <Link to="/retailer/forgot-password" className="login-text-link">Request Reset</Link>
                  </p>
                  <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                    Remember your password?{' '}
                    <Link to="/retailer/login" className="login-text-link">Sign In</Link>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="login-footer">
        <div className="login-footer-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>&copy; 2026 SuperMandi Tech Pvt Ltd &middot; Made in India</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/retailer/help" style={{ color: 'inherit', fontSize: '0.75rem', textDecoration: 'none' }}>Help</Link>
            <BuildStamp />
          </div>
        </div>
      </footer>
    </div>
  );
}
