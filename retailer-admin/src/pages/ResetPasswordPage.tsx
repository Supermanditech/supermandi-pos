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
        throw new Error(data?.error?.message || data?.message || 'Password reset failed');
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
              <div className="forgot-center-section">
                <div className="forgot-icon-circle forgot-icon-circle--error" aria-hidden="true">
                  !
                </div>
                <h2 className="login-card-title">Invalid Reset Link</h2>
                <p className="login-card-subtitle forgot-subtitle-spaced">
                  This page requires a valid password reset link from your email. Please request a new reset link.
                </p>
                <Link to="/retailer/forgot-password" className="login-btn-primary forgot-signin-link">
                  Request Password Reset
                </Link>
                <div className="forgot-action-link">
                  <p className="login-secondary-text">
                    Remember your password?{' '}
                    <Link to="/retailer/login" className="login-text-link">Sign In</Link>
                  </p>
                </div>
              </div>
            ) : step === 'success' ? (
              <div className="forgot-center-section">
                <div className="forgot-icon-circle forgot-icon-circle--success" aria-hidden="true">
                  &#10003;
                </div>
                <h2 className="login-card-title">Password Reset Successful</h2>
                <p className="login-card-subtitle forgot-subtitle-spaced">
                  Your password has been reset. You can now sign in with your new password.
                </p>
                <Link to="/retailer/login" className="login-btn-primary forgot-signin-link">
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
                      className="login-form-input forgot-token-input"
                      placeholder="Paste the token from your email"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      disabled={isLoading}
                      autoFocus={!!email && !token}
                    />
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="reset-new-password">New Password</label>
                    <div className="login-password-wrapper">
                      <input
                        id="reset-new-password"
                        name="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        className="login-form-input login-form-input--password"
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={isLoading}
                        autoFocus={!!email && !!token}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="login-password-toggle"
                        aria-pressed={showNewPassword}
                        aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      >
                        {showNewPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="forgot-pw-hint">Min 8 characters, 1 uppercase, 1 lowercase, 1 digit</p>
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="reset-confirm-password">Confirm Password</label>
                    <div className="login-password-wrapper">
                      <input
                        id="reset-confirm-password"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="login-form-input login-form-input--password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="login-password-toggle"
                        aria-pressed={showConfirmPassword}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
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
                  <p className="login-secondary-text">
                    Need a new token?{' '}
                    <Link to="/retailer/forgot-password" className="login-text-link">Request Reset</Link>
                  </p>
                  <p className="login-secondary-text">
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
        <div className="login-footer-inner login-footer-layout">
          <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
          <div className="login-footer-links">
            <Link to="/retailer/help" className="login-footer-link">Help</Link>
            <BuildStamp />
          </div>
        </div>
      </footer>
    </div>
  );
}
