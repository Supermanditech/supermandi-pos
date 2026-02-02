import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { API_GATEWAY_BASE } from '../lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';

// GO-LIVE-UI-REG-002: Registration-First Login (Lookup-First, NOT OTP-First)
// User must have a registration before they can request OTP

type Step = 'phone' | 'otp' | 'stores';

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
interface LookupResponse {
  exists: boolean;
  type?: string;
  application_id?: string;
  status?: string;
  nextStep?: string;
  businessName?: string;
  message?: string;
  action?: string;
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

      // Handle lookup result
      if (!data.exists) {
        // No registration found - redirect to register
        setError('No registration found for this phone number.');
        setTimeout(() => {
          navigate('/retailer/register', {
            state: {
              message: 'No registration found for this phone number. Please register first.',
              phone: normalizedPhone
            }
          });
        }, 1500);
        return;
      }

      // Registration exists - check if login is allowed
      if (data.nextStep === 'LOGIN_ALLOWED') {
        // Can proceed with OTP
        setLookupComplete(true);
        // reCAPTCHA will be setup by useEffect
      } else if (data.nextStep === 'PENDING_APPROVAL') {
        setError('Your application is under review. You will be able to login once approved.');
      } else if (data.nextStep === 'VERIFY_PHONE' || data.nextStep === 'UPLOAD_DOCUMENTS' || data.nextStep === 'FIX_REQUIRED') {
        setError('Please complete your registration before logging in.');
        setTimeout(() => {
          navigate('/retailer/register', {
            state: {
              message: 'Please complete your registration.',
              applicationId: data.application_id
            }
          });
        }, 1500);
      } else if (data.nextStep === 'CONTACT_SUPPORT') {
        setError('Your application was not approved. Please contact support for assistance.');
      } else {
        // Unknown status - show message
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
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/auth/firebase-otp-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
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
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">SuperMandi</h1>
        <p className="login-subtitle">Retailer Portal</p>

        {step === 'phone' && !lookupComplete && (
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            Enter your registered phone number to continue
          </p>
        )}

        {step === 'phone' && lookupComplete && (
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            Click "Send OTP" to receive a verification code at {phone}
          </p>
        )}

        {step === 'otp' && (
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            Enter the 6-digit code sent to {phone}
          </p>
        )}

        {/* Firebase warning */}
        {!isFirebaseReady() && step === 'phone' && lookupComplete && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            <strong>Phone Verification Unavailable</strong>
            <p style={{ marginTop: '0.25rem', marginBottom: 0 }}>
              Login requires phone verification which is currently unavailable.
            </p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {/* Step 1: Phone Number - Lookup First */}
        {step === 'phone' && !lookupComplete && (
          <form onSubmit={handleContinue}>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+91 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '1rem' }}
              disabled={isLoading}
            >
              {isLoading ? 'Checking...' : 'Continue'}
            </button>

            <div style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: '1rem',
              textAlign: 'center',
            }}>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
                Don't have an account?{' '}
                <Link to="/retailer/register" style={{ color: '#2563eb', textDecoration: 'none' }}>
                  Register
                </Link>
              </p>
            </div>
          </form>
        )}

        {/* Step 1b: Phone Number - Send OTP (after successful lookup) */}
        {step === 'phone' && lookupComplete && (
          <form onSubmit={handleSendOtp}>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+91 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={true}
              />
            </div>

            <button
              id="send-otp-button"
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '1rem' }}
              disabled={isLoading || !isFirebaseReady()}
            >
              {isLoading ? 'Sending OTP...' : 'Send OTP'}
            </button>

            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={handleChangePhone}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
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
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <input
                type="text"
                className="form-input"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.5rem' }}
                maxLength={6}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '1rem' }}
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? 'Verifying...' : 'Verify & Sign In'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleChangePhone}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
                disabled={isLoading}
              >
                Change Phone
              </button>

              <button
                id="resend-otp-button"
                type="button"
                onClick={handleResendOtp}
                style={{
                  background: 'none',
                  border: 'none',
                  color: resendCooldown > 0 ? '#9ca3af' : '#2563eb',
                  fontSize: '0.875rem',
                  cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  padding: 0,
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
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <div style={{
                  width: '4rem',
                  height: '4rem',
                  background: '#fef3c7',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                  fontSize: '1.5rem',
                }}>
                  !
                </div>
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
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center' }}>
                  Select a store to continue
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {stores.map((store) => (
                    <button
                      key={store.id}
                      onClick={() => handleStoreSelect(store)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        padding: '1rem',
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        width: '100%',
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#f3f4f6';
                        e.currentTarget.style.borderColor = '#3b82f6';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = '#f9fafb';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }}
                    >
                      <span style={{ fontWeight: '600', color: '#111827' }}>{store.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Code: {store.code}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
