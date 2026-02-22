import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_GATEWAY_BASE, safeJson } from '../lib/api';
import { BuildStamp } from '../components/BuildStamp';

// AUTH-PARITY-003: Retailer reset-password page — parity with supplier /reset-password
// User arrives from email link: /retailer/reset-password?email=X&token=Y
// POST /api/v1/retailer-admin/auth/forgot-password/email-reset

type Step = 'form' | 'success';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
            <img src="/retailer/brand/logo-shortmark.svg" alt="" width={20} height={20} />
            <span className="login-logo-text">SuperMandi</span>
            <span className="login-logo-separator">|</span>
            <span className="login-logo-subtext">Retailer Portal</span>
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="login-card-container">
          <div className="login-card-box">
            {step === 'success' ? (
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
                    <input
                      id="reset-new-password"
                      name="newPassword"
                      type="password"
                      className="login-form-input"
                      placeholder="Enter new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={isLoading}
                      autoFocus={!!email && !!token}
                    />
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Min 8 characters, 1 uppercase, 1 lowercase, 1 digit</p>
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="reset-confirm-password">Confirm Password</label>
                    <input
                      id="reset-confirm-password"
                      name="confirmPassword"
                      type="password"
                      className="login-form-input"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isLoading}
                    />
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
            <Link to="/retailer/help" style={{ color: '#94A3B8', fontSize: '0.75rem', textDecoration: 'none' }}>Help</Link>
            <BuildStamp />
          </div>
        </div>
      </footer>
    </div>
  );
}
