'use client';

// AUTH-PARITY-002: Dual-channel forgot password (OTP + Email)
// Channel 1: Phone → OTP verify → new password → POST /api/v1/supplier/auth/forgot-password/otp-reset
// Channel 2: Email → reset link → token form → new password (existing flow)

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '@/lib/firebase';

// STG-354: Track client mount for Firebase readiness check (avoid SSR mismatch)

type Step = 'choose' | 'phone' | 'otp' | 'newPassword' | 'success' | 'email' | 'emailSent' | 'emailReset';
type Channel = 'otp' | 'email';

function PasswordChecklist({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'One uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'One digit', pass: /\d/.test(password) },
  ];
  return (
    <ul className="list-none p-0 mt-1 text-xs space-y-0.5">
      {checks.map((c) => (
        <li key={c.label} className={`flex items-center gap-1 ${c.pass ? 'text-green-600' : 'text-slate-400'}`}>
          <span>{c.pass ? '\u2713' : '\u2022'}</span> {c.label}
        </li>
      ))}
    </ul>
  );
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('choose');
  const [channel, setChannel] = useState<Channel>('otp');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtpVal] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const [idToken, setIdToken] = useState('');
  // REQ.AUTH.PASSWORD_FLOW_PARITY: Show/hide toggle for new password fields (parity with retailer)
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const recaptchaInitialized = useRef(false);
  // STG-354: Track client mount for Firebase readiness warning
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Setup reCAPTCHA when on phone step
  // STG-722: Gate on `mounted` — button must exist in DOM after hydration
  useEffect(() => {
    if (mounted && isFirebaseReady() && !recaptchaInitialized.current && step === 'phone' && channel === 'otp') {
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
  }, [mounted, step, channel]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (otpExpirySeconds > 0) {
      const timer = setTimeout(() => setOtpExpirySeconds(otpExpirySeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpExpirySeconds]);

  // Password validation rules (shared across both channels)
  const validatePassword = (): string | null => {
    if (newPassword.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(newPassword)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(newPassword)) return 'Password must contain at least one lowercase letter';
    if (!/\d/.test(newPassword)) return 'Password must contain at least one digit';
    if (newPassword !== confirmPassword) return 'Passwords do not match';
    return null;
  };

  // OTP Channel: Verify phone exists then send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(\+91)?[6-9]\d{9}$/.test(cleanedPhone) && !/^\+?[0-9]{10,13}$/.test(cleanedPhone)) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);
    try {
      // Verify account exists (anti-enumeration: always returns 200)
      await apiFetch<{ success: boolean }>('/api/v1/supplier/auth/forgot-password/otp-verify', {
        method: 'POST',
        body: JSON.stringify({ phone: cleanedPhone }),
      });

      // Send OTP via Firebase
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required.');
      }

      let normalizedPhone = cleanedPhone;
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : `+${normalizedPhone}`;
      }
      await sendOtp(normalizedPhone);
      setStep('otp');
      setResendCooldown(60);
      setOtpExpirySeconds(300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Channel: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const token = await verifyOtp(otp);
      setIdToken(token);
      setStep('newPassword');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Channel: Reset password with Firebase token
  const handleOtpResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const pwError = validatePassword();
    if (pwError) { setError(pwError); return; }

    setIsLoading(true);
    try {
      await apiFetch<{ success: boolean }>('/api/v1/supplier/auth/forgot-password/otp-reset', {
        method: 'POST',
        body: JSON.stringify({ idToken, newPassword }),
      });
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Email Channel: Request reset link
  const handleEmailRequest = async (e: React.FormEvent) => {
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

    setIsLoading(true);
    try {
      await apiFetch<{ success: boolean; message: string }>(
        '/api/v1/supplier/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
        }
      );
      setStep('emailSent');
    } catch {
      // Always show success to prevent email enumeration
      setStep('emailSent');
    } finally {
      setIsLoading(false);
    }
  };

  // Email Channel: Reset password with token
  const handleEmailReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!resetToken.trim()) {
      setError('Please enter the reset token from your email');
      return;
    }

    const pwError = validatePassword();
    if (pwError) { setError(pwError); return; }

    setIsLoading(true);
    try {
      await apiFetch<{ success: boolean }>('/api/v1/supplier/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          token: resetToken.trim(),
          newPassword,
          confirmPassword,
        }),
      });
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed. The token may be expired or invalid.');
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
      const cleanedPhone = phone.replace(/[\s-]/g, '');
      let normalizedPhone = cleanedPhone;
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : `+${normalizedPhone}`;
      }
      await sendOtp(normalizedPhone);
      setResendCooldown(60);
      setOtpExpirySeconds(300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  // Channel Selector
  if (step === 'choose') {
    return (
      <>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Reset Password</h2>
        <p className="text-slate-600 text-sm mb-6">Choose how you want to reset your password</p>
        <div className="space-y-3">
          <button
            onClick={() => { setChannel('otp'); setStep('phone'); setError(''); }}
            className="btn btn-primary w-full py-3"
          >
            Reset via mobile OTP
          </button>
          <button
            onClick={() => { setChannel('email'); setStep('email'); setError(''); }}
            className="btn btn-outline w-full py-3"
          >
            Reset via email link
          </button>
        </div>
        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <p className="text-slate-600 text-sm">
            Remember your password?{' '}
            <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign In
            </Link>
          </p>
        </div>
      </>
    );
  }

  // OTP Channel: Phone Entry
  if (step === 'phone' && channel === 'otp') {
    return (
      <>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Reset Password</h2>
        <p className="text-slate-600 text-sm mb-6">Enter your registered phone number to receive an OTP</p>

        {/* STG-354: Firebase unavailability warning (parity with Register/Onboard) */}
        {mounted && !isFirebaseReady() && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm" role="alert">
            <strong>Phone Verification Unavailable</strong>
            <p className="mt-1 text-xs">Firebase is not configured. Please try the email reset method or try again later.</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm" role="alert" aria-live="assertive">{error}</div>
        )}

        <form onSubmit={handleSendOtp} className="space-y-4">
          <div>
            <label htmlFor="phone" className="label">Phone Number</label>
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
        </form>

        <div className="mt-4 text-center">
          <button type="button" onClick={() => setStep('choose')} className="text-primary-600 hover:text-primary-700 font-medium text-sm">
            Use a different method
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <p className="text-slate-600 text-sm">
            Remember your password?{' '}
            <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign In
            </Link>
          </p>
        </div>
      </>
    );
  }

  // OTP Channel: OTP Verification
  if (step === 'otp') {
    return (
      <>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Reset Password</h2>
        <p className="text-slate-600 text-sm mb-6">Enter the 6-digit code sent to {phone}</p>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm" role="alert" aria-live="assertive">{error}</div>
        )}

        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label htmlFor="otp" className="label">Verification Code</label>
            <input
              type="text"
              id="otp"
              value={otp}
              onChange={(e) => setOtpVal(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input text-center text-2xl tracking-[0.5em] font-mono"
              placeholder="000000"
              maxLength={6}
              disabled={isLoading}
              autoFocus
            />
          </div>

          {otpExpirySeconds > 0 && (
            <p className={`text-xs text-center ${otpExpirySeconds <= 60 ? 'text-amber-600' : 'text-slate-500'}`} aria-live="polite">
              Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
            </p>
          )}
          {otpExpirySeconds === 0 && (
            <p className="text-xs text-center text-red-600" role="alert" aria-live="assertive">Code expired. Please resend OTP.</p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading || otp.length !== 6 || otpExpirySeconds === 0}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Verifying...
              </span>
            ) : otpExpirySeconds === 0 ? (
              'Code Expired'
            ) : (
              'Verify OTP'
            )}
          </button>

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtpVal(''); setError(''); recaptchaInitialized.current = false; }}
              className="text-primary-600 hover:text-primary-700 font-medium text-sm"
              disabled={isLoading}
            >
              Change Phone
            </button>
            <button
              id="resend-otp-button"
              type="button"
              onClick={handleResendOtp}
              className={`font-medium text-sm ${resendCooldown > 0 ? 'text-slate-400 cursor-not-allowed' : 'text-primary-600 hover:text-primary-700'}`}
              disabled={isLoading || resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
            </button>
          </div>
        </form>
      </>
    );
  }

  // OTP Channel: New Password
  if (step === 'newPassword') {
    return (
      <>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Reset Password</h2>
        <p className="text-slate-600 text-sm mb-6">Phone verified. Enter your new password below.</p>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm" role="alert" aria-live="assertive">{error}</div>
        )}

        <form onSubmit={handleOtpResetPassword} className="space-y-4">
          <div>
            <label htmlFor="newPassword" className="label">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input pr-12"
                placeholder="Enter new password"
                disabled={isLoading}
                autoFocus
              />
              <button type="button" aria-pressed={showNewPassword} aria-label={showNewPassword ? 'Hide new password' : 'Show new password'} onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium">{showNewPassword ? 'Hide' : 'Show'}</button>
            </div>
            <PasswordChecklist password={newPassword} />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="label">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input pr-12"
                placeholder="Confirm new password"
                disabled={isLoading}
              />
              <button type="button" aria-pressed={showConfirmPassword} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium">{showConfirmPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary w-full py-3" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Resetting...
              </span>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>
      </>
    );
  }

  // Email Channel: Email Entry
  if (step === 'email') {
    return (
      <>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Reset Password</h2>
        <p className="text-slate-600 text-sm mb-6">
          Enter your registered email address and we&apos;ll send you a password reset link.
        </p>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm" role="alert" aria-live="assertive">{error}</div>
        )}

        <form onSubmit={handleEmailRequest} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              disabled={isLoading}
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary w-full py-3" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Sending...
              </span>
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button type="button" onClick={() => setStep('choose')} className="text-primary-600 hover:text-primary-700 font-medium text-sm">
            Use a different method
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 text-center space-y-2">
          <p className="text-slate-600 text-sm">
            Remember your password?{' '}
            <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign In
            </Link>
          </p>
          <p className="text-slate-600 text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary-600 hover:text-primary-700 font-medium">
              Register
            </Link>
          </p>
        </div>
      </>
    );
  }

  // Email Channel: Check Your Email
  if (step === 'emailSent') {
    return (
      <>
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-blue-600">&#9993;</span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">Check Your Email</h2>
          <p className="text-slate-600 text-sm mb-6">
            If an account exists with <strong>{email}</strong>, we&apos;ve sent a password reset link.
            Please check your inbox and spam folder.
          </p>

          <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg mb-6 text-sm text-left">
            <p className="font-medium">What to do next:</p>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              <li>Open the email from SuperMandi</li>
              <li>Click the password reset link</li>
              <li>Enter your new password</li>
            </ol>
          </div>

          <div className="space-y-3">
            {/* R7.SUP.004: Wire button to emailReset step (was linking to /reset-password, making emailReset dead code) */}
            <button
              type="button"
              onClick={() => { setStep('emailReset'); setError(''); }}
              className="btn btn-primary w-full py-3"
            >
              I Have a Reset Token
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setError(''); }}
              className="text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              Try a different email
            </button>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 text-center">
          <p className="text-slate-600 text-sm">
            Remember your password?{' '}
            <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign In
            </Link>
          </p>
        </div>
      </>
    );
  }

  // Email Channel: Token + New Password
  if (step === 'emailReset') {
    return (
      <>
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Set New Password</h2>
        <p className="text-slate-600 text-sm mb-6">Enter the reset token from your email and choose a new password.</p>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm" role="alert" aria-live="assertive">{error}</div>
        )}

        <form onSubmit={handleEmailReset} className="space-y-4">
          <div>
            <label htmlFor="resetEmail" className="label">Email Address</label>
            <input
              type="email"
              id="resetEmail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              disabled={isLoading}
            />
          </div>
          <div>
            <label htmlFor="resetToken" className="label">Reset Token</label>
            <input
              type="text"
              id="resetToken"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              className="input font-mono text-sm"
              placeholder="Paste the token from your email"
              disabled={isLoading}
            />
          </div>
          <div>
            <label htmlFor="newPasswordEmail" className="label">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                id="newPasswordEmail"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input pr-12"
                placeholder="Enter new password"
                disabled={isLoading}
              />
              <button type="button" aria-pressed={showNewPassword} aria-label={showNewPassword ? 'Hide new password' : 'Show new password'} onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium">{showNewPassword ? 'Hide' : 'Show'}</button>
            </div>
            <PasswordChecklist password={newPassword} />
          </div>
          <div>
            <label htmlFor="confirmPasswordEmail" className="label">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPasswordEmail"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input pr-12"
                placeholder="Confirm new password"
                disabled={isLoading}
              />
              <button type="button" aria-pressed={showConfirmPassword} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium">{showConfirmPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary w-full py-3" disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Resetting...
              </span>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>
      </>
    );
  }

  // Success (shared by both channels)
  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl text-green-600">&#10003;</span>
      </div>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">Password Reset Successful</h2>
      <p className="text-slate-600 text-sm mb-6">
        Your password has been reset. You can now sign in with your new password.
      </p>
      <Link href="/login" className="btn btn-primary w-full py-3 block text-center">
        Sign In
      </Link>
    </div>
  );
}
