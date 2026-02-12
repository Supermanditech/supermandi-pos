import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { API_GATEWAY_BASE } from '../lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';
import { BuildStamp } from '../components/BuildStamp';

// UI-SPEC-001: Stripe-level calm infrastructure design
// Solid neutral background (#F7F9FC), 448px card, Inter font, 44-48px buttons

type Step = 'phone' | 'otp' | 'stores' | 'not_onboarded' | 'incomplete';

interface Store {
  id: string;
  code: string;
  name: string;
}

interface OtpLoginResponse {
  success: boolean;
  token: string;
  refreshToken?: string;
  user: {
    id: string;
    phone: string;
    role: string;
  };
  stores: Store[];
}

// GO-LIVE-UI-REG-004: Lookup response from backend
// DR-009: action-only envelope (no exists boolean)
interface LookupResponse {
  action?: string;
  message?: string;
}

// UI-SPEC: Stripe-level infrastructure design system
const styles = {
  // Page layout - solid neutral background per spec
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
  logoText: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#2563eb',
  },
  logoSeparator: {
    color: '#94a3b8',
  },
  logoSubtext: {
    color: '#475569',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  headerLink: {
    fontSize: '0.875rem',
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 500,
  },
  // Main content
  main: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
  },
  cardContainer: {
    width: '100%',
    maxWidth: '448px',
  },
  // Card styling - white with subtle shadow per spec
  card: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    padding: '2rem',
  },
  cardTitle: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#0F172A',
    marginBottom: '0.5rem',
  },
  cardSubtitle: {
    color: '#64748b',
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
  },
  // Form elements - 40-44px height per spec
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#0F172A',
    marginBottom: '0.5rem',
  },
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
  inputDisabled: {
    background: '#f8fafc',
    cursor: 'not-allowed',
  },
  // Buttons - 44-48px height per spec
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
  btnPrimaryDisabled: {
    background: '#93c5fd',
    cursor: 'not-allowed',
  },
  btnSecondary: {
    width: '100%',
    height: '46px',
    padding: '0 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: '#0F172A',
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  // Alert styles - soft red background per spec
  alertError: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    padding: '0.875rem 1rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  alertWarning: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: '#92400e',
    padding: '0.875rem 1rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  // Footer - minimal, muted per spec
  footer: {
    background: 'white',
    borderTop: '1px solid #e2e8f0',
  },
  footerInner: {
    maxWidth: '1152px',
    margin: '0 auto',
    padding: '1rem 1.5rem',
    textAlign: 'center' as const,
    fontSize: '0.8125rem',
    color: '#64748b',
  },
  // Links
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
  textLinkDisabled: {
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  // Divider
  divider: {
    borderTop: '1px solid #e5e7eb',
    margin: '1.5rem 0',
    paddingTop: '1rem',
  },
  // Store selector
  storeButton: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start',
    padding: '1rem',
    background: '#F7F9FC',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    width: '100%',
    marginBottom: '0.75rem',
    transition: 'all 0.15s',
  },
  storeName: {
    fontWeight: 600,
    color: '#0F172A',
  },
  storeCode: {
    fontSize: '0.8125rem',
    color: '#64748b',
  },
  // AUTH-UX-LOGIN-001: Neutral icon container for "Account not found" state
  warningIconContainer: {
    width: '4rem',
    height: '4rem',
    background: '#f1f5f9',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1rem',
    fontSize: '1.5rem',
    color: '#64748b',
  },
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  // AUTH-OTP-001: OTP expiry countdown (Firebase OTP ~5 min)
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const [stores, setStores] = useState<Store[]>([]);
  const [authData, setAuthData] = useState<{ token: string; refreshToken: string; user: OtpLoginResponse['user'] } | null>(null);
  const recaptchaInitialized = useRef(false);

  // GO-LIVE-UI-REG-002: Track if lookup was successful (registration exists)
  const [lookupComplete, setLookupComplete] = useState(false);

  // Setup reCAPTCHA only when ready to send OTP (after successful lookup)
  useEffect(() => {
    if (isFirebaseReady() && !recaptchaInitialized.current && step === 'phone' && lookupComplete) {
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
  }, [step, lookupComplete]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // AUTH-OTP-001: OTP expiry countdown
  useEffect(() => {
    if (otpExpirySeconds > 0) {
      const timer = setTimeout(() => setOtpExpirySeconds(otpExpirySeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpExpirySeconds]);

  // GO-LIVE-UI-REG-002: Lookup registration by phone FIRST
  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate phone
    const cleanedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(\+91)?[6-9]\d{9}$/.test(cleanedPhone) && !/^\+?[0-9]{10,13}$/.test(cleanedPhone)) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);

    try {
      // Normalize phone for lookup
      let normalizedPhone = cleanedPhone;
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : `+${normalizedPhone}`;
      }

      // GO-LIVE-UI-REG-004: Call lookup endpoint
      const response = await fetch(
        `${API_GATEWAY_BASE}/api/v1/retailer-admin/registration/lookup?phone=${encodeURIComponent(normalizedPhone)}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );

      const data = await response.json() as LookupResponse;

      if (!response.ok) {
        throw new Error(data.message || 'Failed to check registration status');
      }

      // DR-009: Handle lookup result via action field (enumeration-safe)
      const action = data.action;
      if (action === 'REGISTER_REQUIRED') {
        setStep('not_onboarded');
        return;
      }
      if (action === 'LOGIN_ALLOWED') {
        setLookupComplete(true);
      } else if (action === 'PENDING_APPROVAL') {
        setError('Your application is under review. You will be able to login once approved.');
      } else if (action === 'VERIFY_PHONE' || action === 'UPLOAD_DOCUMENTS' || action === 'FIX_REQUIRED') {
        setStep('incomplete');
      } else if (action === 'CONTACT_SUPPORT') {
        setError('Your application was not approved. Please contact support for assistance.');
      } else {
        setError(data.message || 'Unable to proceed. Please contact support.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check registration. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Send OTP (only after successful lookup)
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required.');
      }

      await sendOtp(phone);
      setStep('otp');
      setResendCooldown(60);
      setOtpExpirySeconds(300); // AUTH-OTP-001: Firebase OTP ~5 min
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Verify OTP with Firebase and get ID token
      const idToken = await verifyOtp(otp);

      // Exchange Firebase token with backend for session JWT + stores list
      // AUDIT-RET-003: Include credentials for cookie-based session auth
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/auth/firebase-otp-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Login failed');
      }

      const result = data as OtpLoginResponse;

      // Store auth data for after store selection
      setAuthData({
        token: result.token,
        refreshToken: result.refreshToken || '',
        user: result.user,
      });

      // Handle stores based on count
      if (result.stores.length === 0) {
        // No stores assigned
        setStores([]);
        setStep('stores');
      } else if (result.stores.length === 1) {
        // Auto-enter single store
        const store = result.stores[0];
        login(result.token, result.refreshToken || '', result.user, store);
        navigate(`/s/${store.code}`, { replace: true });
      } else {
        // Multiple stores - show picker
        setStores(result.stores);
        setStep('stores');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStoreSelect = (store: Store) => {
    if (!authData) return;
    login(authData.token, authData.refreshToken, authData.user, store);
    navigate(`/s/${store.code}`, { replace: true });
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

      await sendOtp(phone);
      setResendCooldown(60);
      setOtpExpirySeconds(300); // AUTH-OTP-001: Reset expiry on resend
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to initial state
  const handleChangePhone = () => {
    setStep('phone');
    setOtp('');
    setError('');
    setLookupComplete(false);
    recaptchaInitialized.current = false;
  };

  return (
    <div style={styles.pageContainer}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* Header Bar */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoText}>SuperManditech</span>
            <span style={styles.logoSeparator}>|</span>
            <span style={styles.logoSubtext}>Retailer Portal</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        <div style={styles.cardContainer}>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Sign in to your account</h2>

            {step === 'phone' && !lookupComplete && (
              <p style={styles.cardSubtitle}>Enter your registered phone number to continue</p>
            )}

            {step === 'phone' && lookupComplete && (
              <p style={styles.cardSubtitle}>Click "Send OTP" to receive a verification code at {phone}</p>
            )}

            {step === 'otp' && (
              <p style={styles.cardSubtitle}>Enter the 6-digit code sent to {phone}</p>
            )}

            {step === 'stores' && stores.length > 0 && (
              <p style={styles.cardSubtitle}>Select a store to continue</p>
            )}

            {/* Firebase warning */}
            {!isFirebaseReady() && step === 'phone' && lookupComplete && (
              <div style={styles.alertWarning}>
                <strong>Phone Verification Unavailable</strong>
                <p style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                  Login requires phone verification which is currently unavailable.
                </p>
              </div>
            )}

            {/* Error display */}
            {error && <div style={styles.alertError}>{error}</div>}

            {/* Step 1: Phone Number - Lookup First */}
            {step === 'phone' && !lookupComplete && (
              <form onSubmit={handleContinue}>
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

                <button
                  type="submit"
                  style={{
                    ...styles.btnPrimary,
                    ...(isLoading ? styles.btnPrimaryDisabled : {}),
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      Checking...
                    </span>
                  ) : 'Continue'}
                </button>

                <div style={styles.divider}>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0, textAlign: 'center' }}>
                    Don't have an account?{' '}
                    <Link to="/retailer/register" style={styles.textLink}>
                      Register
                    </Link>
                  </p>
                  {/* RET-CLEANUP-001: Forgot password link */}
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.5rem 0 0', textAlign: 'center' }}>
                    <Link to="/retailer/forgot-password" style={styles.textLink}>
                      Forgot Password?
                    </Link>
                  </p>
                </div>
              </form>
            )}

            {/* Step 1b: Phone Number - Send OTP (after successful lookup) */}
            {step === 'phone' && lookupComplete && (
              <form onSubmit={handleSendOtp}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Phone Number</label>
                  <input
                    type="tel"
                    style={{ ...styles.input, ...styles.inputDisabled }}
                    placeholder="+91 9876543210"
                    value={phone}
                    disabled={true}
                  />
                </div>

                <button
                  id="send-otp-button"
                  type="submit"
                  style={{
                    ...styles.btnPrimary,
                    ...(isLoading || !isFirebaseReady() ? styles.btnPrimaryDisabled : {}),
                  }}
                  disabled={isLoading || !isFirebaseReady()}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      Sending OTP...
                    </span>
                  ) : 'Send OTP'}
                </button>

                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={handleChangePhone}
                    style={styles.textLink}
                    disabled={isLoading}
                  >
                    Use different phone number
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
                    style={{
                      ...styles.input,
                      textAlign: 'center',
                      fontSize: '1.25rem',
                      letterSpacing: '0.5rem',
                      fontFamily: 'monospace',
                    }}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    disabled={isLoading}
                    autoFocus
                  />
                </div>

                {/* AUTH-OTP-001: OTP expiry countdown */}
                {otpExpirySeconds > 0 && (
                  <p style={{
                    fontSize: '0.8125rem',
                    color: otpExpirySeconds <= 60 ? '#dc2626' : '#64748b',
                    textAlign: 'center',
                    marginBottom: '1rem',
                  }}>
                    Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
                  </p>
                )}
                {otpExpirySeconds === 0 && step === 'otp' && (
                  <p style={{
                    fontSize: '0.8125rem',
                    color: '#dc2626',
                    textAlign: 'center',
                    marginBottom: '1rem',
                  }}>
                    Code expired. Please resend OTP.
                  </p>
                )}

                <button
                  type="submit"
                  style={{
                    ...styles.btnPrimary,
                    ...(isLoading || otp.length !== 6 ? styles.btnPrimaryDisabled : {}),
                  }}
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'inline-block', width: '1rem', height: '1rem', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                      Verifying...
                    </span>
                  ) : 'Verify & Sign In'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleChangePhone}
                    style={styles.textLink}
                    disabled={isLoading}
                  >
                    Change Phone Number
                  </button>

                  <button
                    id="resend-otp-button"
                    type="button"
                    onClick={handleResendOtp}
                    style={{
                      ...styles.textLink,
                      ...(resendCooldown > 0 ? styles.textLinkDisabled : {}),
                    }}
                    disabled={isLoading || resendCooldown > 0}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            )}

            {/* Step 3: Store Selection */}
            {step === 'stores' && (
              <div>
                {stores.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <div style={styles.warningIconContainer}>!</div>
                    <h3 style={{ color: '#d97706', marginBottom: '0.5rem' }}>No Store Assigned</h3>
                    <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                      Your account is not associated with any store. Please contact your administrator.
                    </p>
                    <button
                      onClick={() => {
                        setStep('phone');
                        setOtp('');
                        setPhone('');
                        setAuthData(null);
                        setLookupComplete(false);
                      }}
                      style={styles.btnSecondary}
                    >
                      Back to Login
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {stores.map((store) => (
                      <button
                        key={store.id}
                        onClick={() => handleStoreSelect(store)}
                        style={styles.storeButton}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = '#f3f4f6';
                          e.currentTarget.style.borderColor = '#3b82f6';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = '#f9fafb';
                          e.currentTarget.style.borderColor = '#e5e7eb';
                        }}
                      >
                        <span style={styles.storeName}>{store.name}</span>
                        <span style={styles.storeCode}>Code: {store.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AUTH-UX-LOGIN-001: Account Not Found State - Professional messaging */}
            {step === 'not_onboarded' && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={styles.warningIconContainer}>!</div>
                <h3 style={{ color: '#475569', marginBottom: '0.5rem', fontWeight: 600 }}>Account not found</h3>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                  This phone number is not associated with an active account. Please complete registration to continue.
                </p>
                <Link
                  to="/retailer/register"
                  state={{ phone }}
                  style={{
                    ...styles.btnPrimary,
                    display: 'block',
                    textDecoration: 'none',
                    textAlign: 'center',
                    lineHeight: '46px',
                  }}
                >
                  Register
                </Link>
                <div style={{ marginTop: '1rem' }}>
                  <button
                    onClick={() => {
                      setStep('phone');
                      setPhone('');
                      setError('');
                    }}
                    style={styles.textLink}
                  >
                    Use a different phone number
                  </button>
                </div>
              </div>
            )}

            {/* Incomplete Registration — Resume flow */}
            {step === 'incomplete' && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div style={{
                  ...styles.alertWarning,
                  textAlign: 'left',
                }}>
                  Your registration is incomplete. Please resume to complete your application.
                </div>
                <Link
                  to="/retailer/register"
                  state={{ phone, resume: true }}
                  style={{
                    ...styles.btnPrimary,
                    display: 'block',
                    textDecoration: 'none',
                    textAlign: 'center',
                    lineHeight: '46px',
                  }}
                >
                  Resume Registration
                </Link>
                <div style={{ marginTop: '1rem' }}>
                  <button
                    onClick={() => {
                      setStep('phone');
                      setPhone('');
                      setError('');
                    }}
                    style={styles.textLink}
                  >
                    Use a different phone number
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          &copy; 2026 SuperManditech. All rights reserved.
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}
