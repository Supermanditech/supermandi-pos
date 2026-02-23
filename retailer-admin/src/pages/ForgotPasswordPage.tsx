import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { API_GATEWAY_BASE, safeJson } from '../lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';
import { BuildStamp } from '../components/BuildStamp';
import { ThemeToggle } from '../components/ThemeToggle';

// AUTH-PARITY-002: Dual-channel forgot password (OTP + Email)
// Channel 1: Phone → OTP verify → new password
// Channel 2: Email → reset link → token form → new password

type Step = 'choose' | 'phone' | 'emailEntry' | 'otp' | 'newPassword' | 'success' | 'emailSent' | 'emailReset';
type Channel = 'otp' | 'email';

function PasswordChecklist({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'One uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'One digit', pass: /\d/.test(password) },
  ];
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
      {checks.map((c) => (
        <li key={c.label} style={{ color: c.pass ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.25rem', lineHeight: '1.5' }}>
          <span>{c.pass ? '\u2713' : '\u2022'}</span> {c.label}
        </li>
      ))}
    </ul>
  );
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('choose');
  const [channel, setChannel] = useState<Channel>('otp');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const [idToken, setIdToken] = useState('');
  const recaptchaInitialized = useRef(false);

  // Setup reCAPTCHA when on phone step
  useEffect(() => {
    if (isFirebaseReady() && !recaptchaInitialized.current && step === 'phone') {
      try {
        setupRecaptcha('send-otp-button');
        recaptchaInitialized.current = true;
      } catch (err) {
        console.error('Failed to setup reCAPTCHA:', err);
      }
    }
    return () => {
      cleanup();
      recaptchaInitialized.current = false;
    };
  }, [step]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (otpExpirySeconds > 0) {
      const timer = setTimeout(() => setOtpExpirySeconds(otpExpirySeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpExpirySeconds]);

  // OTP Channel: Verify phone exists then send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(\+91)?[6-9]\d{9}$/.test(cleanedPhone) && !/^\+?[0-9]{10,13}$/.test(cleanedPhone)) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);
    try {
      // Verify account exists
      const response = await fetch(
        `${API_GATEWAY_BASE}/api/v1/retailer-admin/auth/forgot-password/request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanedPhone }),
          credentials: 'include',
        }
      );
      const data = await safeJson(response);
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Account verification failed');
      }

      // Send OTP via Firebase
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required.');
      }

      let normalizedPhone = cleanedPhone;
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : `+${normalizedPhone}`;
      }
      await sendOtp(normalizedPhone);
      setStep('otp');
      setResendCooldown(60);
      setOtpExpirySeconds(300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Channel: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const token = await verifyOtp(otp);
      setIdToken(token);
      setStep('newPassword');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Channel: Reset password with Firebase token
  const handleOtpResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

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
        `${API_GATEWAY_BASE}/api/v1/retailer-admin/auth/forgot-password/reset`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, newPassword }),
          credentials: 'include',
        }
      );
      const data = await safeJson(response);
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Password reset failed');
      }
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Email Channel: Request reset link
  const handleEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_GATEWAY_BASE}/api/v1/retailer-admin/auth/forgot-password/email-request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
          credentials: 'include',
        }
      );
      await safeJson(response);
      setStep('emailSent');
    } catch {
      // Always show success to prevent email enumeration
      setStep('emailSent');
    } finally {
      setIsLoading(false);
    }
  };

  // Email Channel: Reset password with token
  const handleEmailReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!resetToken.trim()) {
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
          body: JSON.stringify({ email: email.trim().toLowerCase(), token: resetToken.trim(), newPassword }),
          credentials: 'include',
        }
      );
      const data = await safeJson(response);
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Password reset failed');
      }
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed. The token may be expired or invalid.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setIsLoading(true);
    try {
      cleanup();
      recaptchaInitialized.current = false;
      setupRecaptcha('resend-otp-button');
      recaptchaInitialized.current = true;
      const cleanedPhone = phone.replace(/[\s-]/g, '');
      let normalizedPhone = cleanedPhone;
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : `+${normalizedPhone}`;
      }
      await sendOtp(normalizedPhone);
      setResendCooldown(60);
      setOtpExpirySeconds(300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectChannel = (ch: Channel) => {
    setChannel(ch);
    setStep(ch === 'otp' ? 'phone' : 'phone');
    setError('');
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
            {/* Channel Selector */}
            {step === 'choose' && (
              <>
                <h2 className="login-card-title">Reset Password</h2>
                <p className="login-card-subtitle">Choose how you want to reset your password</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <button
                    onClick={() => selectChannel('otp')}
                    className={channel === 'otp' ? 'login-btn-primary login-btn-channel-active' : 'login-btn-secondary'}
                  >
                    Reset via mobile OTP
                  </button>
                  <button
                    onClick={() => { setChannel('email'); setStep('emailEntry'); setError(''); }}
                    className={channel === 'email' ? 'login-btn-primary login-btn-channel-active' : 'login-btn-secondary'}
                  >
                    Reset via email link
                  </button>
                </div>
                <div className="login-divider">
                  <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                    Remember your password?{' '}
                    <Link to="/retailer/login" className="login-text-link">Sign In</Link>
                  </p>
                </div>
              </>
            )}

            {/* OTP Channel: Phone Entry */}
            {step === 'phone' && channel === 'otp' && (
              <>
                <h2 className="login-card-title">Reset Password</h2>
                <p className="login-card-subtitle">Enter your registered phone number to receive an OTP</p>
                {error && <div className="login-alert-error" role="alert">{error}</div>}
                <form onSubmit={handleSendOtp}>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="forgot-phone">Phone Number</label>
                    <input
                      id="forgot-phone"
                      name="phone"
                      type="tel"
                      className="login-form-input"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>
                  <button
                    id="send-otp-button"
                    type="submit"
                    className="login-btn-primary"
                    disabled={isLoading || !isFirebaseReady()}
                  >
                    {isLoading ? 'Sending OTP...' : 'Send OTP'}
                  </button>
                  <div style={{ textAlign: 'center' }}>
                    <button type="button" onClick={() => setStep('choose')} className="login-text-link">
                      Use a different method
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Email Channel: Email Entry */}
            {step === 'emailEntry' && (
              <>
                <h2 className="login-card-title">Reset Password</h2>
                <p className="login-card-subtitle">Enter your registered email address and we'll send you a password reset link.</p>
                {error && <div className="login-alert-error" role="alert">{error}</div>}
                <form onSubmit={handleEmailRequest}>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="forgot-email">Email Address</label>
                    <input
                      id="forgot-email"
                      name="email"
                      type="email"
                      className="login-form-input"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>
                  <button type="submit" className="login-btn-primary" disabled={isLoading}>
                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                  <div style={{ textAlign: 'center' }}>
                    <button type="button" onClick={() => setStep('choose')} className="login-text-link">
                      Use a different method
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Email Channel: Check Email */}
            {step === 'emailSent' && (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '4rem', height: '4rem', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem', color: '#2563eb' }}>
                    &#9993;
                  </div>
                  <h2 className="login-card-title">Check Your Email</h2>
                  <p className="login-card-subtitle" style={{ marginBottom: '1.5rem' }}>
                    We've sent a password reset link to <strong>{email}</strong>.
                    Please check your inbox and spam folder. It may take a few minutes to arrive.
                  </p>
                  <button
                    onClick={() => setStep('emailReset')}
                    className="login-btn-primary"
                  >
                    I Have a Reset Token
                  </button>
                  <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                    <button type="button" onClick={() => { setStep('emailEntry'); setError(''); }} className="login-text-link">
                      Try a different email
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Email Channel: Token + New Password */}
            {step === 'emailReset' && (
              <>
                <h2 className="login-card-title">Set New Password</h2>
                <p className="login-card-subtitle">Enter the reset token from your email and choose a new password.</p>
                {error && <div className="login-alert-error" role="alert">{error}</div>}
                <form onSubmit={handleEmailReset}>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="emailreset-email">Email Address</label>
                    <input id="emailreset-email" name="email" type="email" className="login-form-input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="emailreset-token">Reset Token</label>
                    <input id="emailreset-token" name="token" type="text" className="login-form-input" style={{ fontFamily: 'monospace', fontSize: '0.875rem' }} placeholder="Paste the token from your email" value={resetToken} onChange={(e) => setResetToken(e.target.value)} disabled={isLoading} />
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="emailreset-new-password">New Password</label>
                    <input id="emailreset-new-password" name="newPassword" type="password" className="login-form-input" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={isLoading} />
                    <PasswordChecklist password={newPassword} />
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="emailreset-confirm-password">Confirm Password</label>
                    <input id="emailreset-confirm-password" name="confirmPassword" type="password" className="login-form-input" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isLoading} />
                  </div>
                  <button type="submit" className="login-btn-primary" disabled={isLoading}>
                    {isLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>
              </>
            )}

            {/* OTP Channel: OTP Verification */}
            {step === 'otp' && (
              <>
                <h2 className="login-card-title">Reset Password</h2>
                <p className="login-card-subtitle">Enter the 6-digit code sent to {phone}</p>
                {error && <div className="login-alert-error" role="alert">{error}</div>}
                <form onSubmit={handleVerifyOtp}>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="forgot-otp">Verification Code</label>
                    <input
                      id="forgot-otp"
                      name="otp"
                      type="text"
                      className="login-form-input login-form-input--otp"
                      placeholder="Enter 6-digit PIN"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>
                  <div aria-live="polite">
                  {otpExpirySeconds > 0 && (
                    <p className={`login-otp-expiry ${otpExpirySeconds <= 60 ? 'login-otp-expiry--warning' : 'login-otp-expiry--normal'}`}>
                      Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
                    </p>
                  )}
                  {otpExpirySeconds === 0 && step === 'otp' && (
                    <p className="login-otp-expiry login-otp-expiry--warning">Code expired. Please resend OTP.</p>
                  )}
                  </div>
                  <button type="submit" className="login-btn-primary" disabled={isLoading || otp.length !== 6}>
                    {isLoading ? 'Verifying...' : 'Verify OTP'}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(''); recaptchaInitialized.current = false; }} className="login-text-link" disabled={isLoading}>
                      Change Phone
                    </button>
                    <button
                      id="resend-otp-button"
                      type="button"
                      onClick={handleResendOtp}
                      className="login-text-link"
                      disabled={isLoading || resendCooldown > 0}
                      style={resendCooldown > 0 ? { color: '#9ca3af', cursor: 'not-allowed' } : {}}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* OTP Channel: New Password */}
            {step === 'newPassword' && (
              <>
                <h2 className="login-card-title">Reset Password</h2>
                <p className="login-card-subtitle">Phone verified. Enter your new password below.</p>
                {error && <div className="login-alert-error" role="alert">{error}</div>}
                <form onSubmit={handleOtpResetPassword}>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="otpreset-new-password">New Password</label>
                    <input id="otpreset-new-password" name="newPassword" type="password" className="login-form-input" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={isLoading} autoFocus />
                    <PasswordChecklist password={newPassword} />
                  </div>
                  <div className="login-form-group">
                    <label className="login-form-label" htmlFor="otpreset-confirm-password">Confirm Password</label>
                    <input id="otpreset-confirm-password" name="confirmPassword" type="password" className="login-form-input" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isLoading} />
                  </div>
                  <button type="submit" className="login-btn-primary" disabled={isLoading}>
                    {isLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>
              </>
            )}

            {/* Success */}
            {step === 'success' && (
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
            )}

            {/* Back to login */}
            {step !== 'success' && step !== 'choose' && step !== 'emailSent' && (
              <div className="login-divider">
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                  Remember your password?{' '}
                  <Link to="/retailer/login" className="login-text-link">Sign In</Link>
                </p>
              </div>
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
