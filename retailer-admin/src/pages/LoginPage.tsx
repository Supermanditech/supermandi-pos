import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { setupRecaptcha, sendOtp as firebaseSendOtp, verifyOtp as firebaseVerifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';

// Demo mode is ONLY available when:
// 1. NOT in production (import.meta.env.PROD === false)
// 2. AND VITE_DEMO_MODE is explicitly set to 'true'
const DEMO_MODE_AVAILABLE = !import.meta.env.PROD && import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_PHONE = '+919999999999'; // Only this phone works in demo mode

// TEMPORARY BYPASS - Remove after Firebase OTP is working
// Usage: Add ?bypass=supermandi2026 to URL
const TEMP_BYPASS_KEY = 'supermandi2026';

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

  // TEMPORARY BYPASS - Check URL param and auto-login via dev endpoint
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('bypass') === TEMP_BYPASS_KEY) {
      // Call the backend dev-bypass endpoint to get a real JWT
      const doBypassLogin = async () => {
        try {
          const response = await fetch('/api/v1/retailer-admin/auth/dev-bypass', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bypassKey: TEMP_BYPASS_KEY,
              storeCode: storeCode || 'DEMO001',
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            console.error('Bypass login failed:', data.error?.message || 'Unknown error');
            setError('Bypass login failed. Backend may be in production mode.');
            return;
          }

          login(
            data.data.accessToken,
            data.data.refreshToken,
            data.data.user,
            data.data.store
          );
          navigate(`/s/${storeCode}`, { replace: true });
        } catch (err) {
          console.error('Bypass login error:', err);
          setError('Bypass login failed. Check if backend is running.');
        }
      };

      doBypassLogin();
    }
  }, [location.search, login, navigate, storeCode]);

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
    console.log('[OTP] handleVerifyOtp called');
    setError('');
    setIsLoading(true);

    try {
      console.log('[OTP] Starting OTP verification, otp length:', otp.length);

      // Demo mode: bypass Firebase with mock data (dev only)
      if (DEMO_MODE_AVAILABLE && demoMode) {
        if (phone !== DEMO_PHONE) {
          throw new Error(`Demo mode only works with phone: ${DEMO_PHONE}`);
        }

        const mockResponse = {
          accessToken: 'demo-token-' + Date.now(),
          refreshToken: 'demo-refresh-' + Date.now(),
          user: {
            id: 'demo-user-001',
            phone: DEMO_PHONE,
            role: 'RETAILER_ADMIN',
          },
          store: {
            id: 'a0000000-0000-0000-0000-000000000001',
            code: 'DEMO001',
            name: 'SuperMandi Demo Store',
          },
        };

        login(
          mockResponse.accessToken,
          mockResponse.refreshToken,
          mockResponse.user,
          mockResponse.store
        );

        navigate(from, { replace: true });
        return;
      }

      // Production: verify OTP with Firebase and get ID token
      console.log('[OTP] Calling firebaseVerifyOtp...');
      const idToken = await firebaseVerifyOtp(otp);
      console.log('[OTP] Got idToken, length:', idToken?.length || 'NULL');

      // Exchange Firebase ID token for app JWT via backend
      console.log('[OTP] Calling backend /firebase-login...');
      const response = await fetch('/api/v1/retailer-admin/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: idToken,
          storeCode: storeCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Login failed');
      }

      login(
        data.data.accessToken,
        data.data.refreshToken,
        data.data.user,
        data.data.store
      );

      navigate(from, { replace: true });
    } catch (err) {
      console.error('[OTP] Error in handleVerifyOtp:', err);
      const errorMsg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      console.log('[OTP] Setting error message:', errorMsg);
      setError(errorMsg);
    } finally {
      console.log('[OTP] Finally block - setting isLoading false');
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

      {/* GO-LIVE-REVEAL-001: Firebase not configured warning */}
      {!isFirebaseReady() && (
        <div style={{
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          color: '#92400e',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          maxWidth: '400px',
        }}>
          <strong>Firebase Configuration Required</strong>
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
              disabled={isLoading}
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
                console.log('[BUTTON] Verify OTP clicked via onClick!');
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
