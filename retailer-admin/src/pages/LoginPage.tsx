import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { API_GATEWAY_BASE, safeJson } from '../lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';
import { BuildStamp } from '../components/BuildStamp';
import { ThemeToggle } from '../components/ThemeToggle';
import { logger } from '../lib/logger';

// ISSUE-177: Detect Facebook/Instagram in-app browser where reCAPTCHA fails
function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line\/|Snapchat|Twitter|LinkedIn/i.test(ua);
}

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
  const { login, isAuthenticated, store } = useAuth();

  // STG-207: Redirect authenticated users away from login page
  useEffect(() => {
    if (isAuthenticated && store) {
      navigate(`/s/${store.code}`, { replace: true });
    }
  }, [isAuthenticated, store, navigate]);

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
        logger.error('Failed to setup reCAPTCHA:', err);
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

      // LOGIN-RESPONSE-NO-SCHEMA-VALIDATION: guard against null/non-object response
      if (!data || typeof data !== 'object') {
        setError('Unexpected server response. Please try again or contact support.');
        return;
      }

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
        setError('Your application is under review (usually 1-2 business days). You will be notified via SMS and email once approved.');
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
      const msg = err instanceof Error ? err.message : 'Failed to send OTP. Please try again.';
      setError(msg);
      // GCP-STG-0147: Auto-switch to email/password when OTP is rate-limited
      if (msg.includes('Too many OTP attempts') || msg.includes('too-many-requests')) {
        setAuthMode('password');
      }
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
        throw new Error(data?.error?.message || 'Login failed');
      }

      if (!data) {
        throw new Error('Unexpected server response. Please try again.');
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
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(msg);
      // GCP-STG-0147: Auto-switch to email/password when OTP verify is rate-limited
      if (msg.includes('Too many attempts') || msg.includes('too-many-requests')) {
        setAuthMode('password');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStoreSelect = async (store: Store) => {
    if (!authData) return;
    try {
      // STG-053: Call select-store endpoint to get a JWT with actorId for multi-store users
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/auth/select-store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.token}`,
        },
        body: JSON.stringify({ storeId: store.id }),
        credentials: 'include',
      });
      if (response.ok) {
        const result = await safeJson<any>(response);
        if (!result) {
          setError('Unexpected server response. Please try again.');
          return;
        }
        login(result.token, result.refreshToken || authData.refreshToken, authData.user, store);
      } else {
        setError('Failed to select store. Please try again.');
        return;
      }
    } catch {
      setError('Network error selecting store. Please try again.');
      return;
    }
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
        throw new Error(data?.error?.message || 'Login failed');
      }

      if (!data) {
        throw new Error('Unexpected server response. Please try again.');
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch(`${API_GATEWAY_BASE}/api/v1/retailer-admin/registration/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone.trim() }),
          signal: controller.signal,
        });
      } catch { /* ignore -- best-effort clear */ } finally {
        clearTimeout(timeout);
      }
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
      {/* T-095: Unified login header */}
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

      {/* Main Content */}
      <main className="login-main login-page-fade">
        <div className="login-card-container">
          <div className="login-card-box">
            {/* ISSUE-177: In-app browser warning */}
            {isInAppBrowser() && (step === 'phone' || step === 'otp') && (
              <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
                <strong>Open in your browser for best experience.</strong>
                <p style={{ margin: '4px 0 8px' }}>Phone verification may not work in this app. Tap below to open in your default browser.</p>
                <button
                  onClick={() => {
                    try { navigator.clipboard.writeText(window.location.href); } catch { /* ignore */ }
                    window.open(window.location.href, '_system');
                  }}
                  style={{ background: '#ffc107', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Open in Browser
                </button>
              </div>
            )}
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
                <p className="login-alert-body">
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
                    <span className="login-btn-spinner">
                      <span className="login-spinner" />
                      Sending OTP...
                    </span>
                  ) : 'Send OTP'}
                </button>

                {/* T-003: Toggle to password login */}
                <div className="login-toggle-container">
                  <button type="button" onClick={() => { setAuthMode('password'); setError(''); }} className="login-text-link">
                    Sign in with email & password instead
                  </button>
                </div>

                <div className="login-divider">
                  <p className="login-secondary-text">
                    Don't have an account?{' '}
                    <Link to="/retailer/register" className="login-text-link">
                      Register
                    </Link>
                  </p>
                  <p className="login-secondary-text">
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
                    <p className="login-field-error">Please enter a valid email address</p>
                  )}
                </div>
                <div className="login-form-group">
                  <label className="login-form-label" htmlFor="login-password">Password</label>
                  <div className="login-password-wrapper">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      className="login-form-input login-form-input--password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="login-password-toggle"
                      aria-pressed={showPassword}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                    <span className="login-btn-spinner">
                      <span className="login-spinner" />
                      Signing in...
                    </span>
                  ) : 'Sign In'}
                </button>

                {/* Toggle back to OTP */}
                <div className="login-toggle-container">
                  <button type="button" onClick={() => { setAuthMode('otp'); setError(''); setEmail(''); setPassword(''); }} className="login-text-link">
                    Sign in with OTP instead
                  </button>
                </div>

                <div className="login-divider">
                  <p className="login-secondary-text">
                    Don't have an account?{' '}
                    <Link to="/retailer/register" className="login-text-link">
                      Register
                    </Link>
                  </p>
                  <p className="login-secondary-text">
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
                    <span className="login-btn-spinner">
                      <span className="login-spinner" />
                      Verifying...
                    </span>
                  ) : 'Verify & Sign In'}
                </button>

                <div className="login-otp-actions">
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
                  <div className="login-state-section">
                    <div className="login-warning-icon" aria-hidden="true">!</div>
                    <h3 className="login-state-heading login-state-heading--warning">No Store Assigned</h3>
                    <p className="login-state-description">
                      Your account is not associated with any store. Please contact support at{' '}
                      <a href="mailto:hello@supermandi.tech" className="login-email-link">hello@supermandi.tech</a>.
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
                  <div className="login-store-list">
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
              <div className="login-state-section">
                <div className="login-warning-icon" aria-hidden="true">!</div>
                <h3 className="login-state-heading">Account not found</h3>
                <p className="login-state-description">
                  This phone number is not associated with an active account. Please complete registration to continue.
                </p>
                <Link
                  to="/retailer/register"
                  state={{ phone }}
                  className="login-btn-primary login-link-as-btn"
                >
                  Register
                </Link>
                <div className="login-action-spacer">
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
              <div className="login-state-section">
                <div className="login-alert-warning login-alert-warning--left">
                  Your registration is incomplete. Please resume to complete your application.
                </div>
                <Link
                  to="/retailer/register"
                  state={{ phone, resume: true }}
                  className="login-btn-primary login-link-as-btn"
                >
                  Resume Registration
                </Link>
                <div className="login-action-spacer">
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
