'use client';

// GO-LIVE-SUP-AUTH-002: Phone OTP + Business Details registration for Supplier Portal
// NO PASSWORD - Firebase Phone OTP → Business details → Pending approval

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { phoneOtpRegister, ApiError } from '@/lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '@/lib/firebase';

type Step = 'phone' | 'otp' | 'details' | 'success';

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [idToken, setIdToken] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
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

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

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
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required for registration.');
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
      const token = await verifyOtp(otp);
      setIdToken(token);
      setStep('details');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP. Please try again.');
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

      await sendOtp(phone);
      setResendCooldown(60);
      toast.success('OTP sent successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
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

    // Validate business name
    if (!businessName.trim()) {
      setError('Business name is required');
      return;
    }

    // Validate GSTIN if provided (optional field)
    // GL-CRIT-0031: Fixed GSTIN regex - position 14 can be any alphanumeric
    if (gstin.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$/.test(gstin.trim().toUpperCase())) {
      setError('Please enter a valid 15-character GSTIN');
      return;
    }

    setIsLoading(true);

    try {
      await phoneOtpRegister({
        idToken,
        email: email.trim().toLowerCase(),
        businessName: businessName.trim(),
        gstin: gstin.trim().toUpperCase() || undefined,
      });

      setStep('success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EMAIL_EXISTS') {
          setError('This email is already registered');
        } else if (err.code === 'PHONE_EXISTS') {
          setError('This phone number is already registered');
        } else if (err.code === 'GSTIN_EXISTS') {
          setError('This GSTIN is already registered');
        } else {
          setError(err.message);
        }
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <h2 className="text-xl font-semibold text-slate-800 mb-2">
        {step === 'success' ? 'Registration Submitted' : 'Register as Supplier'}
      </h2>

      {step !== 'success' && (
        <p className="text-slate-600 text-sm mb-6">
          {step === 'phone' && 'Step 1 of 3: Verify Phone'}
          {step === 'otp' && 'Step 2 of 3: Enter OTP'}
          {step === 'details' && 'Step 3 of 3: Business Details'}
        </p>
      )}

      {/* Firebase warning */}
      {!isFirebaseReady() && step === 'phone' && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm">
          <strong>Phone Verification Unavailable</strong>
          <p className="mt-1">
            Registration requires phone verification which is currently unavailable.
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Phone Number */}
      {step === 'phone' && (
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
              placeholder="+91 9876543210"
              disabled={isLoading}
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-2">
              We&apos;ll send an OTP to verify your phone number
            </p>
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
            Already have an account?{' '}
            <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign In
            </Link>
          </p>
        </form>
      )}

      {/* Step 2: OTP Verification */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label htmlFor="otp" className="label">
              Enter OTP
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Enter the 6-digit code sent to {phone}
            </p>
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
              'Verify OTP'
            )}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-sm text-slate-600 hover:text-slate-800"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError('');
                recaptchaInitialized.current = false;
              }}
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

      {/* Step 3: Business Details (NO PASSWORD) */}
      {step === 'details' && (
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">
            Phone verified successfully!
          </div>

          <div>
            <label htmlFor="email" className="label">
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="supplier@example.com"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="businessName" className="label">
              Business Name *
            </label>
            <input
              type="text"
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="input"
              placeholder="Your Company Name"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="gstin" className="label">
              GSTIN (Optional)
            </label>
            <input
              type="text"
              id="gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              className="input"
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              disabled={isLoading}
            />
            <p className="text-xs text-slate-500 mt-1">
              15-character GST Identification Number
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading || !email.trim() || !businessName.trim()}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Submitting...
              </span>
            ) : (
              'Complete Registration'
            )}
          </button>
        </form>
      )}

      {/* Step 4: Success */}
      {step === 'success' && (
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-amber-600">!</span>
          </div>
          <h3 className="text-lg font-semibold text-amber-600 mb-2">
            Pending Admin Approval
          </h3>
          <p className="text-slate-600 mb-6">
            Your supplier account has been submitted for review. You will receive a notification once your account is approved.
          </p>
          <button
            className="btn btn-primary w-full py-3"
            onClick={() => router.push('/login')}
          >
            Go to Login
          </button>
        </div>
      )}

      {step !== 'success' && step !== 'phone' && (
        <div className="mt-6 text-center">
          <p className="text-slate-600">
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Sign In
            </Link>
          </p>
        </div>
      )}
    </>
  );
}
