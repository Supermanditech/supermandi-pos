'use client';

// GO-LIVE-UI-REG-003: Registration-First Login (Lookup-First, NOT OTP-First)
// User must have a registration before they can request OTP

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { phoneOtpLogin, loginSupplier, ApiError, lookupSupplierRegistration, apiFetch } from '@/lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

type Step = 'phone' | 'otp' | 'not_onboarded' | 'incomplete';
type AuthMode = 'otp' | 'password';

export default function LoginPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // FIX-064: Persist cooldown to sessionStorage so remount can't bypass it
  const COOLDOWN_KEY = 'supplier_otp_cooldown_until';
  const [resendCooldown, setResendCooldown] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const stored = sessionStorage.getItem(COOLDOWN_KEY);
    if (!stored) return 0;
    const remaining = Math.ceil((parseInt(stored, 10) - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  });
  // AUTH-OTP-001: OTP expiry countdown (Firebase OTP ~5 min)
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const recaptchaInitialized = useRef(false);

  // T-003: Dual auth — password + OTP toggle
  const [authMode, setAuthMode] = useState<AuthMode>('otp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // REQ.AUTH.PARITY.LOGIN_FLOW: show/hide password toggle + email validation (parity with retailer)
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  // Track if component has mounted (for SSR compatibility)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  // FIX-064: Resend cooldown timer — clear sessionStorage when done
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (typeof window !== 'undefined') {
      sessionStorage.removeItem(COOLDOWN_KEY);
    }
  }, [resendCooldown]);

  // AUTH-OTP-001: OTP expiry countdown
  useEffect(() => {
    if (otpExpirySeconds > 0) {
      const timer = setTimeout(() => setOtpExpirySeconds(otpExpirySeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpExpirySeconds]);

  // T-021: Combined lookup + OTP send — single "Send OTP" click
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
      const data = await lookupSupplierRegistration(normalizedPhone);

      // Handle lookup result
      if (!data.exists) {
        setStep('not_onboarded');
        return;
      }

      if (data.nextStep === 'PENDING_APPROVAL') {
        setError('Your application is under review. You will be able to login once approved.');
        return;
      }
      if (data.nextStep === 'VERIFY_PHONE' || data.nextStep === 'UPLOAD_DOCUMENTS' || data.nextStep === 'FIX_REQUIRED') {
        setStep('incomplete');
        return;
      }
      if (data.nextStep === 'ACCOUNT_SUSPENDED') {
        setError('Your account has been suspended. Please contact support at hello@supermandi.tech for assistance.');
        return;
      }
      if (data.nextStep === 'CONTACT_SUPPORT') {
        setError('Your application was not approved. Please contact support for assistance.');
        return;
      }
      if (data.nextStep !== 'LOGIN_ALLOWED') {
        setError(data.message || 'Unable to proceed. Please contact support.');
        return;
      }

      // Step 2: Send OTP via Firebase (lookup succeeded)
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required.');
      }

      await sendOtp(phone);
      setStep('otp');
      // FIX-064: Persist cooldown end timestamp
      sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() + 60 * 1000));
      setResendCooldown(60);
      setOtpExpirySeconds(300);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to send OTP. Please try again.');
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

      // Exchange Firebase token with backend for session JWT
      const result = await phoneOtpLogin(idToken);

      // Handle different account statuses
      if (result.status === 'pending') {
        router.push('/pending-approval');
        return;
      }

      if (result.status === 'inactive' || result.status === 'locked') {
        setError('Your account is not active. Please contact support.');
        return;
      }

      // Success - approved supplier
      await refreshProfile();
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PENDING_APPROVAL') {
          router.push('/pending-approval');
          return; // BATCH-003: Stop execution after navigation
        } else if (err.code === 'ACCOUNT_LOCKED') {
          setError('Your account has been locked. Please contact support.');
        } else if (err.code === 'ACCOUNT_SUSPENDED') {
          // SA-P1-005: Suspended supplier
          setError('Your account has been suspended. Please contact support at hello@supermandi.tech for assistance.');
        } else if (err.code === 'ACCOUNT_INACTIVE') {
          setError('Your account is not active. Please contact support.');
        } else if (err.code === 'USER_NOT_FOUND') {
          setError('No account found with this phone number. Please register first.');
        } else if (err.status >= 500) {
          setError('Server error. Please try again later or contact support.');
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setError('');
    setIsLoading(true);

    try {
      // Re-setup reCAPTCHA before resending
      cleanup();
      recaptchaInitialized.current = false;
      setupRecaptcha('resend-otp-button');
      recaptchaInitialized.current = true;

      await sendOtp(phone);
      // REQ.AUDIT.W5.SUPPLIER.LOGIN-OTP-RESEND-NO-FIELD-CLEAR.001: clear stale OTP on resend
      setOtp('');
      // FIX-064: Persist cooldown end timestamp
      sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() + 60 * 1000));
      setResendCooldown(60);
      setOtpExpirySeconds(300); // AUTH-OTP-001: Reset expiry on resend
      toast.success('New code sent — please enter the new code.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  // T-003: Password login handler
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      await loginSupplier({ email: email.trim().toLowerCase(), password });
      await refreshProfile();
      toast.success('Welcome back!');
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'PENDING_APPROVAL') {
          router.push('/pending-approval');
          return;
        } else if (err.code === 'ACCOUNT_LOCKED') {
          setError('Your account has been locked due to too many failed attempts. Please try again later.');
        } else if (err.code === 'ACCOUNT_SUSPENDED') {
          setError('Your account has been suspended. Please contact support at hello@supermandi.tech for assistance.');
        } else if (err.code === 'PASSWORD_NOT_SET') {
          setError('Your account uses OTP login. Please switch to "Sign in with OTP" or set a password via "Forgot Password".');
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to initial state
  // T-009: Clear DRAFT registration on backend + sessionStorage when switching phone
  const handleChangePhone = async () => {
    // Best-effort backend clear — expire DRAFT application so GSTIN/phone can be reused
    if (phone) {
      try {
        await apiFetch('/api/v1/supplier/registration/clear', {
          method: 'POST',
          body: JSON.stringify({ phone: phone.trim() }),
        });
      } catch { /* ignore — best-effort clear */ }
    }
    setStep('phone');
    setOtp('');
    setError('');
    setPassword('');
    setEmail('');
    recaptchaInitialized.current = false;
    sessionStorage.removeItem('supermandi_supplier_reg_state');
  };

  if (!mounted) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-slate-200 rounded w-2/3" />
        <div className="h-4 bg-slate-100 rounded w-1/2" />
        <div className="h-10 bg-slate-200 rounded" />
        <div className="h-12 bg-slate-200 rounded" />
      </div>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        Sign in to your account
      </h2>

      {step === 'phone' && authMode === 'otp' && (
        <p className="text-slate-600 text-sm mb-6">
          Enter your registered phone number to receive an OTP
        </p>
      )}

      {step === 'phone' && authMode === 'password' && (
        <p className="text-slate-600 text-sm mb-6">
          Sign in with your account and password
        </p>
      )}

      {step === 'otp' && (
        <p className="text-slate-600 text-sm mb-6">
          Enter the 6-digit code sent to {phone}
        </p>
      )}

      {/* Firebase warning - only show after client mount */}
      {mounted && !isFirebaseReady() && step === 'phone' && authMode === 'otp' && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm">
          <strong>Phone Verification Unavailable</strong>
          <p className="mt-1">
            Login requires phone verification which is currently unavailable.
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* T-021: Phone Number — combined lookup + OTP send */}
      {step === 'phone' && authMode === 'otp' && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label htmlFor="phone" className="label">
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
              placeholder="+91 98765 43210"
              disabled={isLoading}
              autoFocus
            />
            {phone.trim().length > 0 && phone.replace(/[\s\-()]/g, '').length < 10 && (
              <p className="text-xs text-slate-400 mt-1">Enter a 10-digit mobile number</p>
            )}
          </div>

          <button
            id="send-otp-button"
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading || !isFirebaseReady()}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Sending OTP...
              </span>
            ) : (
              'Send OTP'
            )}
          </button>

          {/* T-003: Toggle to password login */}
          <p className="text-center text-sm">
            <button
              type="button"
              className="text-primary-600 hover:text-primary-700 font-medium"
              onClick={() => { setAuthMode('password'); setError(''); }}
            >
              Sign in with email & password instead
            </button>
          </p>
        </form>
      )}

      {/* T-003: Password Login Form */}
      {step === 'phone' && authMode === 'password' && (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              className="input"
              placeholder="you@example.com"
              disabled={isLoading}
              autoFocus
            />
            {/* REQ.AUTH.PARITY.LOGIN_FLOW: email validation on blur — parity with retailer */}
            {emailTouched && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (
              <p className="text-xs text-red-600 mt-1">Please enter a valid email address</p>
            )}
          </div>
          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            {/* REQ.AUTH.PARITY.LOGIN_FLOW: show/hide toggle — parity with retailer */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-12"
                placeholder="Enter your password"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>

          {/* REQ.AUTH.NAVIGATION.PARITY: Forgot Password + Register links inside password form (parity with retailer) */}
          <div className="text-center space-y-1.5">
            <p className="text-slate-600 text-sm">
              <Link href="/forgot-password" className="text-primary-600 hover:text-primary-700 font-medium">
                Forgot Password?
              </Link>
            </p>
            <p className="text-slate-600 text-sm">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-primary-600 hover:text-primary-700 font-medium">
                Register
              </Link>
            </p>
          </div>

          {/* Toggle back to OTP */}
          <p className="text-center text-sm">
            <button
              type="button"
              className="text-primary-600 hover:text-primary-700 font-medium"
              onClick={() => { setAuthMode('otp'); setError(''); setEmail(''); setPassword(''); setShowPassword(false); setEmailTouched(false); }}
            >
              Sign in with OTP instead
            </button>
          </p>
        </form>
      )}

      {/* Step 2: OTP Verification */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label htmlFor="otp" className="label">
              Verification Code
            </label>
            <input
              type="text"
              id="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input text-center text-xl tracking-widest"
              placeholder="Enter 6-digit PIN"
              maxLength={6}
              disabled={isLoading}
              autoFocus
            />
          </div>

          {/* AUTH-OTP-001: OTP expiry countdown */}
          {otpExpirySeconds > 0 && (
            <p className={`text-xs text-center ${otpExpirySeconds <= 60 ? 'text-red-600' : 'text-slate-500'}`}>
              Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
            </p>
          )}
          {otpExpirySeconds === 0 && step === 'otp' && (
            <p className="text-xs text-center text-red-600">
              Code expired. Please resend OTP.
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading || otp.length !== 6}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Verifying...
              </span>
            ) : (
              'Verify & Sign In'
            )}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-sm text-slate-600 hover:text-slate-900"
              onClick={handleChangePhone}
              disabled={isLoading}
            >
              Change Phone Number
            </button>

            <button
              id="resend-otp-button"
              type="button"
              className={`text-sm font-medium ${
                resendCooldown > 0
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-primary-600 hover:text-primary-700'
              }`}
              onClick={handleResendOtp}
              disabled={isLoading || resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
            </button>
          </div>
        </form>
      )}

      {/* AUTH-UX-LOGIN-001: Account Not Found State - Professional messaging */}
      {step === 'not_onboarded' && (
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-slate-500">!</span>
          </div>
          <h3 className="text-slate-700 font-semibold mb-2">Account not found</h3>
          <p className="text-slate-500 text-sm mb-6">
            This phone number is not associated with an active account. Please complete registration to continue.
          </p>
          <Link
            href="/register"
            className="btn btn-primary w-full py-3 block text-center"
          >
            Register
          </Link>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setPhone('');
                setError('');
              }}
              className="text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              Use a different phone number
            </button>
          </div>
        </div>
      )}

      {/* Incomplete Registration — Resume flow */}
      {step === 'incomplete' && (
        <div className="text-center py-4">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-4 text-sm text-left">
            Your registration is incomplete. Please resume to complete your application.
          </div>
          <Link
            href={`/register?phone=${encodeURIComponent(phone)}&resume=true`}
            className="btn btn-primary w-full py-3 block text-center"
          >
            Resume Registration
          </Link>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setPhone('');
                setError('');
              }}
              className="text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              Use a different phone number
            </button>
          </div>
        </div>
      )}

      {/* GO-LIVE-AUTH-FIX: Single register link at bottom - shown on phone/otp steps only */}
      {(step === 'phone' || step === 'otp') && (
        <div className="mt-6 text-center space-y-2">
          <p className="text-slate-600">
            Don't have an account?{' '}
            <Link
              href="/register"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Register
            </Link>
          </p>
          {/* T-002: Forgot password link restored */}
          <p className="text-slate-600 text-sm">
            <Link
              href="/forgot-password"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Forgot Password?
            </Link>
          </p>
        </div>
      )}
    </>
  );
}
