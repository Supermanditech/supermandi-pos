import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { API_GATEWAY_BASE } from '../lib/api';
import { setupRecaptcha, sendOtp as firebaseSendOtp, verifyOtp as firebaseVerifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';

// GO-LIVE-LOGIN: Registration page with phone OTP + password

type Step = 'phone' | 'otp' | 'details' | 'success';

// Password validation
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function validatePassword(password: string): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!PASSWORD_REGEX.test(password)) {
    return 'Password must contain at least one uppercase letter, one lowercase letter, and one number';
  }
  return null;
}

function PasswordStrengthIndicator({ password }: { password: string }) {
  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);

  const checks = [hasLength, hasUpper, hasLower, hasNumber];
  const strength = checks.filter(Boolean).length;

  return (
    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
        {[1, 2, 3, 4].map(level => (
          <div
            key={level}
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              background: strength >= level
                ? strength <= 2 ? '#ef4444' : strength === 3 ? '#f59e0b' : '#22c55e'
                : '#e5e7eb',
            }}
          />
        ))}
      </div>
      <ul style={{ margin: 0, padding: '0 0 0 1rem', color: '#6b7280' }}>
        <li style={{ color: hasLength ? '#22c55e' : '#6b7280' }}>At least 8 characters</li>
        <li style={{ color: hasUpper ? '#22c55e' : '#6b7280' }}>One uppercase letter</li>
        <li style={{ color: hasLower ? '#22c55e' : '#6b7280' }}>One lowercase letter</li>
        <li style={{ color: hasNumber ? '#22c55e' : '#6b7280' }}>One number</li>
      </ul>
    </div>
  );
}

export default function RegisterPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [idToken, setIdToken] = useState('');
  const recaptchaInitialized = useRef(false);

  // Setup reCAPTCHA on mount
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
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required for registration.');
      }

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
      const token = await firebaseVerifyOtp(otp);
      setIdToken(token);
      setStep('details');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    // Check password match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          email: email.trim().toLowerCase(),
          password,
          storeCode: storeCode?.toUpperCase(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Registration failed');
      }

      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Firebase warning */}
      {!isFirebaseReady() && (
        <div style={{
          background: '#fee2e2',
          border: '1px solid #ef4444',
          color: '#991b1b',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          maxWidth: '400px',
        }}>
          <strong>Phone Verification Unavailable</strong>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
            Registration requires phone verification which is currently unavailable.
          </p>
        </div>
      )}

      <div className="login-card">
        <h1 className="login-title">SuperMandi</h1>
        <p className="login-subtitle">
          {step === 'success' ? 'Registration Complete' : `Register for Store: ${storeCode}`}
        </p>

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

        {step === 'phone' && (
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
                autoFocus
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                We'll send an OTP to verify your phone number
              </p>
            </div>

            <button
              id="send-otp-button"
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              disabled={isLoading || !isFirebaseReady()}
            >
              {isLoading ? 'Sending OTP...' : 'Send OTP'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
              Already have an account?{' '}
              <Link to={`/s/${storeCode}/login`} style={{ color: '#2563eb' }}>
                Login
              </Link>
            </p>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <div className="form-group">
              <label className="form-label">Enter OTP</label>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Enter the 6-digit code sent to {phone}
              </p>
              <input
                type="text"
                className="form-input"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={{ letterSpacing: '0.5rem', textAlign: 'center', fontSize: '1.25rem' }}
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? 'Verifying...' : 'Verify OTP'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => {
                setStep('phone');
                setOtp('');
                recaptchaInitialized.current = false;
              }}
            >
              Change Phone Number
            </button>
          </form>
        )}

        {step === 'details' && (
          <form onSubmit={handleRegister}>
            <div style={{ background: '#ecfdf5', color: '#059669', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
              Phone verified successfully!
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: '3rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#6b7280',
                    fontSize: '0.75rem',
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {password && <PasswordStrengthIndicator password={password} />}
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {confirmPassword && password !== confirmPassword && (
                <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Passwords do not match
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={isLoading || !validatePassword(password) === null || password !== confirmPassword}
            >
              {isLoading ? 'Creating Account...' : 'Complete Registration'}
            </button>
          </form>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: '#ecfdf5',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              fontSize: '2rem',
            }}>
              ✓
            </div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#059669' }}>
              Registration Successful!
            </h2>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
              Your account has been created. You can now login with your phone number and password.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => navigate(`/s/${storeCode}/login`)}
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
