import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { API_GATEWAY_BASE, safeJson } from '../lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';
import { BuildStamp } from '../components/BuildStamp';
import { ThemeToggle } from '../components/ThemeToggle';

// UI-SPEC-001: Stripe-level calm infrastructure design
// Solid neutral background (#F7F9FC), 448px card, Inter font, 44-48px buttons
// T-090: All styles moved to CSS classes in index.css (.login-page-container, .login-card-box, etc.)

type Step = 'phone' | 'otp' | 'stores' | 'not_onboarded' | 'incomplete';
type AuthMode = 'otp' | 'password';

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

  // T-003: Dual auth -- password + OTP toggle
  const [authMode, setAuthMode] = useState<AuthMode>('otp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  // T-021: Setup reCAPTCHA when in OTP phone step (initialize early for combined lookup+send)
  useEffect(() => {
    if (isFirebaseReady() && !recaptchaInitialized.current && step === 'phone' && authMode === 'otp') {
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
  }, [step, authMode]);

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

  // T-021: Combined lookup + OTP send -- single "Send OTP" click
  const handleSendOtp = async (e: React.FormEvent) => {
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

      // Step 1: Lookup registration status
      const response = await fetch(
        `${API_GATEWAY_BASE}/api/v1/retailer-admin/registration/lookup`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: normalizedPhone }), credentials: 'include' }
      );

      const data = await safeJson(response) as LookupResponse;

      if (!response.ok) {
        throw new Error(data.message || 'Failed to check registration status');
      }

      // Handle lookup result — UNMAPPED.006: validate action enum
      const KNOWN_ACTIONS = ['REGISTER_REQUIRED', 'PENDING_APPROVAL', 'ACCOUNT_SUSPENDED', 'VERIFY_PHONE', 'UPLOAD_DOCUMENTS', 'FIX_REQUIRED', 'CONTACT_SUPPORT', 'LOGIN_ALLOWED'] as const;
      const action = data.action;
      if (typeof action !== 'string' || !(KNOWN_ACTIONS as readonly string[]).includes(action)) {
        setError('Unexpected server response. Please try again or contact support.');
        return;
      }
      if (action === 'REGISTER_REQUIRED') {
        setStep('not_onboarded');
        return;
      }
      if (action === 'PENDING_APPROVAL') {
        setError('Your application is under review (usually 1-2 business days). You will be notified via WhatsApp and email once approved.');
        return;
      }
      if (action === 'ACCOUNT_SUSPENDED') {
        setError('Your account has been suspended. Please contact support at hello@supermandi.tech for assistance.');
        return;
      }
      if (action === 'VERIFY_PHONE' || action === 'UPLOAD_DOCUMENTS' || action === 'FIX_REQUIRED') {
        setStep('incomplete');
        return;
      }
      if (action === 'CONTACT_SUPPORT') {
        setError('Your application was not approved. Please contact support at hello@supermandi.tech for assistance.');
        return;
      }
      if (action !== 'LOGIN_ALLOWED') {
        setError(data.message || 'Unable to proceed. Please contact support.');
        return;
      }

      // Step 2: Send OTP via Firebase (lookup succeeded)
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required.');
      }

      await sendOtp(phone);
      setStep('otp');
      setResendCooldown(60);
      setOtpExpirySeconds(300);
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

      const data = await safeJson(response);

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

      // UNMAPPED.006: Validate store objects from backend
      const validStores = (result.stores || []).filter(
        (s): s is Store => Boolean(s && typeof s.id === 'string' && typeof s.code === 'string' && s.code.length > 0 && typeof s.name === 'string')
      );

      // Handle stores based on count
      if (validStores.length === 0) {
        // No stores assigned
        setStores([]);
        setStep('stores');
      } else if (validStores.length === 1) {
        // Auto-enter single store
        const store = validStores[0];
        login(result.token, result.refreshToken || '', result.user, store);
        navigate(`/s/${store.code}`, { replace: true });
      } else {
        // Multiple stores - show picker
        setStores(validStores);
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

  // T-003 + AUTH-PARITY-001: Email+password login (parity with supplier)
  const handlePasswordLogin = async (e: React.FormEvent) => {
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
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        credentials: 'include',
      });

      const data = await safeJson(response);
      if (!response.ok) {
        throw new Error(data.error?.message || 'Login failed');
      }

      const result = data as OtpLoginResponse;
      setAuthData({ token: result.token, refreshToken: result.refreshToken || '', user: result.user });

      // UNMAPPED.006: Validate store objects from backend
      const validStores = (result.stores || []).filter(
        (s): s is Store => Boolean(s && typeof s.id === 'string' && typeof s.code === 'string' && s.code.length > 0 && typeof s.name === 'string')
      );

      if (validStores.length === 0) {
        setStores([]);
        setStep('stores');
      } else if (validStores.length === 1) {
        const store = validStores[0];
        login(result.token, result.refreshToken || '', result.user, store);
        navigate(`/s/${store.code}`, { replace: true });
      } else {
        setStores(validStores);
        setStep('stores');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to initial state
  // T-009: Clear DRAFT registration on backend + sessionStorage when switching phone
  const handleChangePhone = async () => {
    // Best-effort backend clear -- expire DRAFT application so GSTIN/phone can be reused
    if (phone) {
      try {
        await fetch(`${API_GATEWAY_BASE}/api/v1/retailer-admin/registration/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone.trim() }),
        });
      } catch { /* ignore -- best-effort clear */ }
    }
    setStep('phone');
    setOtp('');
    setError('');
    setEmail('');
    setPassword('');
    recaptchaInitialized.current = false;
    sessionStorage.removeItem('supermandi_retailer_reg_state');
  };

  return (
    <div className="login-page-container">
      {/* AUDIT-RET-004: Fade-in + spin animations to prevent white flash on mount */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shimmer { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }
        .login-page-fade { animation: fadeIn 0.3s ease-out; }
        .login-skeleton { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200px 100%; animation: shimmer 1.5s infinite; border-radius: 6px; }
      `}</style>
      {/* T-095: Unified login header */}
      <header className="login-header">
        <div className="login-header-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="login-logo">
            <img src="/retailer/brand/logo-shortmark.svg" alt="" width={20} height={20} />
            <span className="login-logo-text">SuperMandi</span>
            <span className="login-logo-separator">|</span>
            <span className="login-logo-subtext">Retailer Portal</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="login-main login-page-fade">
        <div className="login-card-container">
          <div className="login-card-box">
            <h2 className="login-card-title">Sign in to your account</h2>

            {step === 'phone' && authMode === 'otp' && (
              <p className="login-card-subtitle">Enter your registered phone number to receive an OTP</p>
            )}

            {step === 'phone' && authMode === 'password' && (
              <p className="login-card-subtitle">Sign in with your account and password</p>
            )}

            {step === 'otp' && (
              <p className="login-card-subtitle">Enter the 6-digit code sent to {phone}</p>
            )}

            {step === 'stores' && stores.length > 0 && (
              <p className="login-card-subtitle">Select a store to continue</p>
            )}

            {/* Firebase warning */}
            {!isFirebaseReady() && step === 'phone' && authMode === 'otp' && (
              <div className="login-alert-warning">
                <strong>Phone Verification Unavailable</strong>
                <p style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                  Login requires phone verification which is currently unavailable.
                </p>
              </div>
            )}

            {/* Error display */}
            {error && <div className="login-alert-error" role="alert">{error}</div>}

            {/* T-021: Phone Number -- combined lookup + OTP send */}
            {step === 'phone' && authMode === 'otp' && (
              <form onSubmit={handleSendOtp}>
                <div className="login-form-group">
                  <label className="login-form-label" htmlFor="login-phone">Phone Number</label>
                  <input
                    id="login-phone"
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
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span className="login-spinner" />
                      Sending OTP...
                    </span>
                  ) : 'Send OTP'}
                </button>

                {/* T-003: Toggle to password login */}
                <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                  <button type="button" onClick={() => { setAuthMode('password'); setError(''); }} className="login-text-link">
                    Sign in with email & password instead
                  </button>
                </div>

                <div className="login-divider">
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0, textAlign: 'center' }}>
                    Don't have an account?{' '}
                    <Link to="/retailer/register" className="login-text-link">
                      Register
                    </Link>
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.5rem 0 0', textAlign: 'center' }}>
                    <Link to="/retailer/forgot-password" className="login-text-link">
                      Forgot Password?
                    </Link>
                  </p>
                </div>
              </form>
            )}

            {/* AUTH-PARITY-001: Email+Password Login Form (parity with supplier) */}
            {step === 'phone' && authMode === 'password' && (
              <form onSubmit={handlePasswordLogin}>
                <div className="login-form-group">
                  <label className="login-form-label" htmlFor="login-email">Email Address</label>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    className="login-form-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    disabled={isLoading}
                    autoFocus
                  />
                  {emailTouched && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (
                    <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>Please enter a valid email address</p>
                  )}
                </div>
                <div className="login-form-group">
                  <label className="login-form-label" htmlFor="login-password">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      className="login-form-input"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      style={{ paddingRight: '3rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.8125rem', padding: 0 }}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="login-btn-primary"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span className="login-spinner" />
                      Signing in...
                    </span>
                  ) : 'Sign In'}
                </button>

                {/* Toggle back to OTP */}
                <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                  <button type="button" onClick={() => { setAuthMode('otp'); setError(''); setEmail(''); setPassword(''); }} className="login-text-link">
                    Sign in with OTP instead
                  </button>
                </div>

                <div className="login-divider">
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0, textAlign: 'center' }}>
                    Don't have an account?{' '}
                    <Link to="/retailer/register" className="login-text-link">
                      Register
                    </Link>
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.5rem 0 0', textAlign: 'center' }}>
                    <Link to="/retailer/forgot-password" className="login-text-link">
                      Forgot Password?
                    </Link>
                  </p>
                </div>
              </form>
            )}

            {/* Step 2: OTP Verification */}
            {step === 'otp' && (
              <form onSubmit={handleVerifyOtp}>
                <div className="login-form-group">
                  <label className="login-form-label" htmlFor="login-otp">Verification Code</label>
                  <input
                    id="login-otp"
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

                {/* AUTH-OTP-001: OTP expiry countdown */}
                <div aria-live="polite">
                {otpExpirySeconds > 0 && (
                  <p className={`login-otp-expiry ${otpExpirySeconds <= 60 ? 'login-otp-expiry--warning' : 'login-otp-expiry--normal'}`}>
                    Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
                  </p>
                )}
                {otpExpirySeconds === 0 && step === 'otp' && (
                  <p className="login-otp-expiry login-otp-expiry--warning">
                    Code expired. Please resend OTP.
                  </p>
                )}
                </div>

                <button
                  type="submit"
                  className="login-btn-primary"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span className="login-spinner" />
                      Verifying...
                    </span>
                  ) : 'Verify & Sign In'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleChangePhone}
                    className="login-text-link"
                    disabled={isLoading}
                  >
                    Change Phone Number
                  </button>

                  <button
                    id="resend-otp-button"
                    type="button"
                    onClick={handleResendOtp}
                    className="login-text-link"
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
                    <div className="login-warning-icon">!</div>
                    <h3 style={{ color: '#d97706', marginBottom: '0.5rem' }}>No Store Assigned</h3>
                    <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                      Your account is not associated with any store. Please contact support at{' '}
                      <a href="mailto:hello@supermandi.tech" style={{ color: '#2563eb' }}>hello@supermandi.tech</a>.
                    </p>
                    <button
                      onClick={() => {
                        setStep('phone');
                        setOtp('');
                        setPhone('');
                        setAuthData(null);
                      }}
                      className="login-btn-secondary"
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
                        className="login-store-btn"
                      >
                        <span className="login-store-name">{store.name}</span>
                        <span className="login-store-code">Code: {store.code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AUTH-UX-LOGIN-001: Account Not Found State - Professional messaging */}
            {step === 'not_onboarded' && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div className="login-warning-icon">!</div>
                <h3 style={{ color: '#475569', marginBottom: '0.5rem', fontWeight: 600 }}>Account not found</h3>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                  This phone number is not associated with an active account. Please complete registration to continue.
                </p>
                <Link
                  to="/retailer/register"
                  state={{ phone }}
                  className="login-btn-primary"
                  style={{ display: 'block', textDecoration: 'none', textAlign: 'center', lineHeight: '46px' }}
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
                    className="login-text-link"
                  >
                    Use a different phone number
                  </button>
                </div>
              </div>
            )}

            {/* Incomplete Registration -- Resume flow */}
            {step === 'incomplete' && (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div className="login-alert-warning" style={{ textAlign: 'left' }}>
                  Your registration is incomplete. Please resume to complete your application.
                </div>
                <Link
                  to="/retailer/register"
                  state={{ phone, resume: true }}
                  className="login-btn-primary"
                  style={{ display: 'block', textDecoration: 'none', textAlign: 'center', lineHeight: '46px' }}
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
                    className="login-text-link"
                  >
                    Use a different phone number
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* T-097: Unified footer */}
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
