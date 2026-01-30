import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { API_GATEWAY_BASE } from '../lib/api';
import { setupRecaptcha, sendOtp as firebaseSendOtp, verifyOtp as firebaseVerifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';

// Demo mode is ONLY available when:
// 1. NOT in production (import.meta.env.PROD === false)
// 2. AND VITE_DEMO_MODE is explicitly set to 'true'
const DEMO_MODE_AVAILABLE = !import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_PHONE = '+919999999999'; // Only this phone works in demo mode

function normalizeStore(store: Record<string, string>) {
  return {
    id: store.storeId ?? store.id,
    code: store.storeCode ?? store.code,
    name: store.storeName ?? store.name,
  };
}

function parseAuthResponse(payload: { data?: Record<string, unknown> } | Record<string, unknown>) {
  const data = 'data' in payload ? payload.data : payload;
  const token = (data as Record<string, unknown>)?.token ?? (data as Record<string, unknown>)?.accessToken;
  const refreshToken = (data as Record<string, unknown>)?.refreshToken ?? '';
  const user = (data as Record<string, unknown>)?.user;
  const store = (data as Record<string, unknown>)?.store;

  if (!token || !user || !store) {
    throw new Error('Login response missing token or store details');
  }

  return {
    token: token as string,
    refreshToken: refreshToken as string,
    user: user as { id: string; phone: string; role: string },
    store: normalizeStore(store as Record<string, string>),
  };
}

export default function LoginPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const recaptchaInitialized = useRef(false);

  // Demo mode state - only used if DEMO_MODE_AVAILABLE
  const [demoMode, setDemoMode] = useState(false);

  // Get the intended destination after login
  const from = (location.state as { from?: Location })?.from?.pathname || `/s/${storeCode}`;

  // Setup reCAPTCHA on mount (only if Firebase is configured)
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

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // In demo mode with correct phone, skip Firebase
      if (DEMO_MODE_AVAILABLE && demoMode) {
        if (phone !== DEMO_PHONE) {
          throw new Error(`Demo mode only works with phone: ${DEMO_PHONE}`);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        setStep('otp');
        setIsLoading(false);
        return;
      }

      // Check if Firebase is configured
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Set VITE_FIREBASE_* environment variables and restart the server.');
      }

      // Production: trigger Firebase Phone Auth
      await firebaseSendOtp(phone);
      setStep('otp');
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

      // GO-LIVE-139: Demo mode - get proper JWT from backend
      if (DEMO_MODE_AVAILABLE && demoMode) {
        if (phone !== DEMO_PHONE) {
          throw new Error(`Demo mode only works with phone: ${DEMO_PHONE}`);
        }

        // Call backend to get a proper demo JWT token
        const demoResponse = await fetch(API_GATEWAY_BASE + '/api/v1/demo/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!demoResponse.ok) {
          const errorData = await demoResponse.json().catch(() => ({}));
          throw new Error(errorData.error?.message || errorData.message || 'Failed to get demo token');
        }

        const demoData = await demoResponse.json();
        const authPayload = parseAuthResponse(demoData);
        login(authPayload.token, authPayload.refreshToken, authPayload.user, authPayload.store);

        navigate(from, { replace: true });
        return;
      }

      // Production: verify OTP with Firebase and get ID token
      const idToken = await firebaseVerifyOtp(otp);

      // Exchange Firebase ID token for app JWT via backend
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: idToken,
          storeCode: storeCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error('Authentication service is temporarily unavailable. Please try again in a few moments.');
        }
        throw new Error(data.error?.message || 'Login failed');
      }

      const authPayload = parseAuthResponse(data);
      login(authPayload.token, authPayload.refreshToken, authPayload.user, authPayload.store);

      navigate(from, { replace: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Demo Mode Banner - only shown in dev with demo enabled */}
      {DEMO_MODE_AVAILABLE && demoMode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: '#dc2626',
          color: 'white',
          padding: '0.5rem',
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '0.875rem',
          zIndex: 1000,
        }}>
          ⚠️ DEMO MODE - FOR DEVELOPMENT ONLY - NOT FOR PRODUCTION ⚠️
        </div>
      )}

      {/* P2-RD-003: Firebase validation - error in production, warning in dev */}
      {!isFirebaseReady() && (
        <div style={{
          background: import.meta.env.PROD ? '#fee2e2' : '#fef3c7',
          border: `1px solid ${import.meta.env.PROD ? '#ef4444' : '#f59e0b'}`,
          color: import.meta.env.PROD ? '#991b1b' : '#92400e',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          maxWidth: '400px',
        }}>
          <strong>{import.meta.env.PROD ? 'Authentication Unavailable' : 'Firebase Configuration Required'}</strong>
          {import.meta.env.PROD ? (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
              Login is currently unavailable. Please contact support if this issue persists.
            </p>
          ) : (
            <>
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
                Set the following environment variables in <code>retailer-admin/.env</code>:
              </p>
              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem', fontSize: '0.8rem' }}>
                <li>VITE_FIREBASE_API_KEY</li>
                <li>VITE_FIREBASE_AUTH_DOMAIN</li>
                <li>VITE_FIREBASE_PROJECT_ID</li>
              </ul>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#78350f' }}>
                Then restart the dev server.
              </p>
            </>
          )}
        </div>
      )}

      <div className="login-card" style={{ marginTop: DEMO_MODE_AVAILABLE && demoMode ? '2rem' : 0 }}>
        <h1 className="login-title">SuperMandi</h1>
        <p className="login-subtitle">Retailer Portal - {storeCode}</p>

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

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp}>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+91 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <button
              id="send-otp-button"
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={isLoading || (import.meta.env.PROD && !isFirebaseReady() && !demoMode)}
            >
              {isLoading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className="form-group">
              <label className="form-label">Enter OTP sent to {phone}</label>
              <input
                type="text"
                className="form-input"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                required
              />
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              disabled={isLoading}
              onClick={(e) => {
                handleVerifyOtp(e as unknown as React.FormEvent);
              }}
            >
              {isLoading ? 'Verifying...' : 'Verify OTP'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => setStep('phone')}
            >
              Change Phone Number
            </button>
          </form>
        )}

        {/* Demo Mode Toggle - ONLY shown in development with VITE_DEMO_MODE=true */}
        {DEMO_MODE_AVAILABLE && (
          <div style={{
            marginTop: '2rem',
            paddingTop: '1rem',
            borderTop: '2px dashed #dc2626',
            background: '#fef2f2',
            margin: '2rem -2.5rem -2.5rem',
            padding: '1rem 2.5rem 2.5rem',
            borderRadius: '0 0 1rem 1rem',
          }}>
            <p style={{
              fontSize: '0.75rem',
              color: '#dc2626',
              fontWeight: 'bold',
              marginBottom: '0.75rem',
              textTransform: 'uppercase',
            }}>
              Development Only
            </p>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
              />
              Enable Demo Mode
            </label>
            {demoMode && (
              <div style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: '0.5rem' }}>
                <p>Use phone: <strong>{DEMO_PHONE}</strong></p>
                <p>Any OTP will work</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
