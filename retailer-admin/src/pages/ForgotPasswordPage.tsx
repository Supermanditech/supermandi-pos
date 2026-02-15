import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { API_GATEWAY_BASE, safeJson } from '../lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';
import { BuildStamp } from '../components/BuildStamp';

// T-002: Real forgot password flow (OTP-based via Firebase)
// Step 1: Enter phone + store code → verify account exists
// Step 2: Send OTP via Firebase
// Step 3: Enter OTP → verify → get Firebase idToken
// Step 4: Enter new password → POST /api/v1/retailer-admin/auth/forgot-password/reset

type Step = 'phone' | 'otp' | 'newPassword' | 'success';

const styles = {
  pageContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#F7F9FC',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    background: 'white',
    borderBottom: '1px solid #e2e8f0',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
  },
  headerInner: {
    maxWidth: '1152px',
    width: '100%',
    margin: '0 auto',
    padding: '0 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  logoText: { fontSize: '1.5rem', fontWeight: 600, color: '#2563eb' },
  logoSeparator: { color: '#94a3b8' },
  logoSubtext: { color: '#475569', fontSize: '0.875rem', fontWeight: 500 },
  main: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
  },
  cardContainer: { width: '100%', maxWidth: '448px' },
  card: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    padding: '2rem',
  },
  cardTitle: { fontSize: '1.5rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' },
  cardSubtitle: { color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' },
  formGroup: { marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0F172A', marginBottom: '0.5rem' },
  input: {
    width: '100%',
    height: '42px',
    padding: '0 1rem',
    fontSize: '0.9375rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  btnPrimary: {
    width: '100%',
    height: '46px',
    padding: '0 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: 'white',
    background: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    marginBottom: '1rem',
  },
  btnPrimaryDisabled: { background: '#93c5fd', cursor: 'not-allowed' },
  alertError: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    padding: '0.875rem 1rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  textLink: {
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 500,
    fontSize: '0.875rem',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
  },
  divider: { borderTop: '1px solid #e5e7eb', margin: '1.5rem 0', paddingTop: '1rem' },
  footer: { background: 'white', borderTop: '1px solid #e2e8f0' },
  footerInner: {
    maxWidth: '1152px',
    margin: '0 auto',
    padding: '1rem 1.5rem',
    textAlign: 'center' as const,
    fontSize: '0.8125rem',
    color: '#64748b',
  },
  passwordHint: { fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' },
};

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [storeCode, setStoreCode] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const [idToken, setIdToken] = useState('');
  const recaptchaInitialized = useRef(false);
  const [accountVerified, setAccountVerified] = useState(false);

  // Setup reCAPTCHA when account is verified
  useEffect(() => {
    if (isFirebaseReady() && !recaptchaInitialized.current && step === 'phone' && accountVerified) {
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
  }, [step, accountVerified]);

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

  // Step 1: Verify account exists
  const handleVerifyAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(\+91)?[6-9]\d{9}$/.test(cleanedPhone) && !/^\+?[0-9]{10,13}$/.test(cleanedPhone)) {
      setError('Please enter a valid phone number');
      return;
    }
    if (!storeCode.trim()) {
      setError('Please enter your store code');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_GATEWAY_BASE}/api/v1/retailer-admin/auth/forgot-password/request`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanedPhone, storeCode: storeCode.trim() }),
          credentials: 'include',
        }
      );
      const data = await safeJson(response);
      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Account verification failed');
      }
      setAccountVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1b: Send OTP via Firebase
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required.');
      }
      const cleanedPhone = phone.replace(/[\s-]/g, '');
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

  // Step 2: Verify OTP
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

  // Step 3: Reset password
  const handleResetPassword = async (e: React.FormEvent) => {
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
          body: JSON.stringify({ idToken, newPassword, storeCode: storeCode.trim() }),
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

  return (
    <div style={styles.pageContainer}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoText}>SuperManditech</span>
            <span style={styles.logoSeparator}>|</span>
            <span style={styles.logoSubtext}>Retailer Portal</span>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.cardContainer}>
          <div style={styles.card}>
            {step !== 'success' && (
              <>
                <h1 style={styles.cardTitle}>Reset Password</h1>
                <p style={styles.cardSubtitle}>
                  {step === 'phone' && !accountVerified && 'Enter your phone number and store code to verify your account.'}
                  {step === 'phone' && accountVerified && 'Account verified. Click "Send OTP" to receive a verification code.'}
                  {step === 'otp' && `Enter the 6-digit code sent to ${phone}`}
                  {step === 'newPassword' && 'Phone verified. Enter your new password below.'}
                </p>
              </>
            )}

            {error && <div style={styles.alertError}>{error}</div>}

            {/* Step 1: Phone + Store Code */}
            {step === 'phone' && !accountVerified && (
              <form onSubmit={handleVerifyAccount}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Phone Number</label>
                  <input
                    type="tel"
                    style={styles.input}
                    placeholder="+91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Store Code</label>
                  <input
                    type="text"
                    style={styles.input}
                    placeholder="e.g. MYSTORE"
                    value={storeCode}
                    onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="submit"
                  style={{ ...styles.btnPrimary, ...(isLoading ? styles.btnPrimaryDisabled : {}) }}
                  disabled={isLoading}
                >
                  {isLoading ? 'Verifying...' : 'Verify Account'}
                </button>
              </form>
            )}

            {/* Step 1b: Send OTP */}
            {step === 'phone' && accountVerified && (
              <form onSubmit={handleSendOtp}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Phone Number</label>
                  <input type="tel" style={{ ...styles.input, background: '#f8fafc' }} value={phone} disabled />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Store Code</label>
                  <input type="text" style={{ ...styles.input, background: '#f8fafc' }} value={storeCode} disabled />
                </div>
                <button
                  id="send-otp-button"
                  type="submit"
                  style={{ ...styles.btnPrimary, ...(isLoading || !isFirebaseReady() ? styles.btnPrimaryDisabled : {}) }}
                  disabled={isLoading || !isFirebaseReady()}
                >
                  {isLoading ? 'Sending OTP...' : 'Send OTP'}
                </button>
                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    style={styles.textLink}
                    onClick={() => { setAccountVerified(false); setError(''); }}
                    disabled={isLoading}
                  >
                    Change phone number
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: OTP Verification */}
            {step === 'otp' && (
              <form onSubmit={handleVerifyOtp}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Verification Code</label>
                  <input
                    type="text"
                    style={{ ...styles.input, textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.5rem', fontFamily: 'monospace' }}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
                {otpExpirySeconds > 0 && (
                  <p style={{ fontSize: '0.75rem', textAlign: 'center', color: otpExpirySeconds <= 60 ? '#dc2626' : '#64748b', marginBottom: '0.75rem' }}>
                    Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
                  </p>
                )}
                {otpExpirySeconds === 0 && (
                  <p style={{ fontSize: '0.75rem', textAlign: 'center', color: '#dc2626', marginBottom: '0.75rem' }}>
                    Code expired. Please resend OTP.
                  </p>
                )}
                <button
                  type="submit"
                  style={{ ...styles.btnPrimary, ...(isLoading || otp.length !== 6 ? styles.btnPrimaryDisabled : {}) }}
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? 'Verifying...' : 'Verify OTP'}
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    style={styles.textLink}
                    onClick={() => { setStep('phone'); setOtp(''); setError(''); setAccountVerified(false); recaptchaInitialized.current = false; }}
                    disabled={isLoading}
                  >
                    Change Phone
                  </button>
                  <button
                    id="resend-otp-button"
                    type="button"
                    style={{ ...styles.textLink, ...(resendCooldown > 0 ? { color: '#9ca3af', cursor: 'not-allowed' } : {}) }}
                    onClick={handleResendOtp}
                    disabled={isLoading || resendCooldown > 0}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: New Password */}
            {step === 'newPassword' && (
              <form onSubmit={handleResetPassword}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>New Password</label>
                  <input
                    type="password"
                    style={styles.input}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isLoading}
                    autoFocus
                  />
                  <p style={styles.passwordHint}>Min 8 characters, 1 uppercase, 1 lowercase, 1 digit</p>
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Confirm Password</label>
                  <input
                    type="password"
                    style={styles.input}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <button
                  type="submit"
                  style={{ ...styles.btnPrimary, ...(isLoading ? styles.btnPrimaryDisabled : {}) }}
                  disabled={isLoading}
                >
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            )}

            {/* Step 4: Success */}
            {step === 'success' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: '4rem', height: '4rem', background: '#f0fdf4', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem', color: '#22c55e' }}>
                  &#10003;
                </div>
                <h2 style={styles.cardTitle}>Password Reset Successful</h2>
                <p style={{ ...styles.cardSubtitle, marginBottom: '1.5rem' }}>
                  Your password has been reset. You can now sign in with your new password.
                </p>
                <Link
                  to="/retailer/login"
                  style={{ ...styles.btnPrimary, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  Sign In
                </Link>
              </div>
            )}

            {step !== 'success' && (
              <div style={styles.divider}>
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                  Remember your password?{' '}
                  <Link to="/retailer/login" style={styles.textLink}>Sign In</Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          &copy; 2026 SuperManditech. All rights reserved.
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}
