'use client';

// GO-LIVE-UI-REG-003: Registration-First Login (Lookup-First, NOT OTP-First)
// User must have a registration before they can request OTP

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { phoneOtpLogin, ApiError, lookupSupplierRegistration } from '@/lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

type Step = 'phone' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const recaptchaInitialized = useRef(false);

  // GO-LIVE-UI-REG-003: Track if lookup was successful (registration exists)
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

  // GO-LIVE-UI-REG-003: Lookup registration by phone FIRST
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
      const data = await lookupSupplierRegistration(normalizedPhone);

      // Handle lookup result
      if (!data.exists) {
        // No registration found - redirect to register
        setError('No registration found for this phone number.');
        setTimeout(() => {
          router.push('/register');
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
          router.push('/register');
        }, 1500);
      } else if (data.nextStep === 'CONTACT_SUPPORT') {
        setError('Your application was not approved. Please contact support for assistance.');
      } else {
        // Unknown status - show message
        setError(data.message || 'Unable to proceed. Please contact support.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to check registration. Please try again.');
      }
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
        } else if (err.code === 'ACCOUNT_LOCKED') {
          setError('Your account has been locked. Please contact support.');
        } else if (err.code === 'ACCOUNT_INACTIVE') {
          setError('Your account is not active. Please contact support.');
        } else if (err.code === 'USER_NOT_FOUND') {
          setError('No account found with this phone number. Please register first.');
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
      setResendCooldown(60);
      toast.success('OTP sent successfully!');
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
    <>
      <h2 className="text-xl font-semibold text-slate-800 mb-2">
        Sign in to your account
      </h2>

      {step === 'phone' && !lookupComplete && (
        <p className="text-slate-600 text-sm mb-6">
          Enter your registered phone number to continue
        </p>
      )}

      {step === 'phone' && lookupComplete && (
        <p className="text-slate-600 text-sm mb-6">
          Click "Send OTP" to receive a verification code at {phone}
        </p>
      )}

      {step === 'otp' && (
        <p className="text-slate-600 text-sm mb-6">
          Enter the 6-digit code sent to {phone}
        </p>
      )}

      {/* Firebase warning */}
      {!isFirebaseReady() && step === 'phone' && lookupComplete && (
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

      {/* Step 1: Phone Number - Lookup First */}
      {step === 'phone' && !lookupComplete && (
        <form onSubmit={handleContinue} className="space-y-4">
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
              placeholder="+91 9876543210"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Checking...
              </span>
            ) : (
              'Continue'
            )}
          </button>
        </form>
      )}

      {/* Step 1b: Phone Number - Send OTP (after successful lookup) */}
      {step === 'phone' && lookupComplete && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label htmlFor="phone" className="label">
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              value={phone}
              className="input bg-slate-50"
              placeholder="+91 9876543210"
              disabled={true}
            />
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

          <p className="text-center text-sm text-slate-600">
            <button
              type="button"
              className="text-primary-600 hover:text-primary-700 font-medium"
              onClick={handleChangePhone}
              disabled={isLoading}
            >
              Use different phone number
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
              placeholder="123456"
              maxLength={6}
              disabled={isLoading}
              autoFocus
            />
          </div>

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
              className="text-sm text-slate-600 hover:text-slate-800"
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

      {/* GO-LIVE-AUTH-FIX: Single register link at bottom - shown on all steps except success */}
      <div className="mt-6 text-center">
        <p className="text-slate-600">
          Don't have an account?{' '}
          <Link
            href="/register"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Register as Supplier
          </Link>
        </p>
      </div>
    </>
  );
}
