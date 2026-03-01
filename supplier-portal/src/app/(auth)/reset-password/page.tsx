'use client';

// T-002: Supplier reset password — token from email
// User arrives here from the reset link in their email, or manually enters token
// POST /api/v1/supplier/auth/reset-password with { email, token, newPassword }

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

type Step = 'form' | 'success' | 'missing-params';

// T-111: Wrap useSearchParams in Suspense boundary (Next.js 16 requirement)
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordSkeleton />}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-slate-200 rounded w-2/3" />
      <div className="h-4 bg-slate-100 rounded w-full" />
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i}>
            <div className="h-4 bg-slate-100 rounded w-1/4 mb-2" />
            <div className="h-10 bg-slate-100 rounded w-full" />
          </div>
        ))}
      </div>
      <div className="h-12 bg-slate-200 rounded w-full" />
    </div>
  );
}

// STG-357: Password strength checklist (parity with forgot-password page)
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

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramEmail = searchParams.get('email') || '';
  const paramToken = searchParams.get('token') || '';
  const [step, setStep] = useState<Step>(!paramEmail && !paramToken ? 'missing-params' : 'form');
  const [email, setEmail] = useState(paramEmail);
  const [token, setToken] = useState(paramToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // STG-357: Show/hide password toggles
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  // UNMAPPED.040: Redirect countdown on success
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    if (step !== 'success') return;
    setCountdown(5);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          router.push('/login');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [step, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!token.trim()) {
      setError('Please enter the reset token from your email');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError('Password must contain at least one digit');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await apiFetch<{ success: boolean; message: string }>(
        '/api/v1/supplier/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            token: token.trim(),
            newPassword,
          }),
        }
      );
      setStep('success');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Password reset failed. The token may be expired or invalid.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'missing-params') {
    return (
      <>
        <div className="text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-red-500">!</span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">
            Invalid Reset Link
          </h2>
          <p className="text-slate-600 text-sm mb-6">
            This page requires a valid password reset link from your email. Please request a new reset link.
          </p>
          <Link
            href="/forgot-password"
            className="btn btn-primary w-full py-3 block text-center"
          >
            Request Password Reset
          </Link>
          <p className="text-slate-600 text-sm mt-4">
            Remember your password?{' '}
            <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign In
            </Link>
          </p>
        </div>
      </>
    );
  }

  if (step === 'success') {
    return (
      <>
        <div className="text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-green-600">&#10003;</span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">
            Password Reset Successful
          </h2>
          <p className="text-slate-600 text-sm mb-6">
            Your password has been reset. You can now sign in with your new password.
          </p>
          {/* REQ.AUDIT.W5.SUPPLIER.RESET-COUNTDOWN-INTERVAL-LEAK.001: clear interval before navigation */}
          <button
            onClick={() => {
              if (countdownRef.current) clearInterval(countdownRef.current);
              router.push('/login');
            }}
            className="btn btn-primary w-full py-3"
          >
            Sign In{countdown > 0 ? ` (${countdown}s)` : ''}
          </button>
          <p className="text-slate-400 text-xs mt-3" aria-live="polite">
            Redirecting to login in {countdown} second{countdown !== 1 ? 's' : ''}...
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        Set New Password
      </h2>
      <p className="text-slate-600 text-sm mb-6">
        Enter the reset token from your email and choose a new password.
      </p>

      {error && (
        <div role="alert" className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">
            Email Address
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@example.com"
            disabled={isLoading}
            autoFocus={!email}
          />
        </div>

        <div>
          <label htmlFor="token" className="label">
            Reset Token
          </label>
          <input
            type="text"
            id="token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="input font-mono text-sm"
            placeholder="Paste the token from your email"
            disabled={isLoading}
            autoFocus={!!email && !token}
          />
        </div>

        <div>
          <label htmlFor="newPassword" className="label">
            New Password
          </label>
          <div className="relative">
            <input
              type={showNewPw ? 'text' : 'password'}
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input pr-12"
              placeholder="Enter new password"
              disabled={isLoading}
              autoFocus={!!email && !!token}
            />
            <button
              type="button"
              onClick={() => setShowNewPw(!showNewPw)}
              aria-pressed={showNewPw}
              aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium"
            >
              {showNewPw ? 'Hide' : 'Show'}
            </button>
          </div>
          <PasswordChecklist password={newPassword} />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="label">
            Confirm Password
          </label>
          <div className="relative">
            <input
              type={showConfirmPw ? 'text' : 'password'}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input pr-12"
              placeholder="Confirm new password"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPw(!showConfirmPw)}
              aria-pressed={showConfirmPw}
              aria-label={showConfirmPw ? 'Hide confirm password' : 'Show confirm password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium"
            >
              {showConfirmPw ? 'Hide' : 'Show'}
            </button>
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full py-3"
          disabled={isLoading}
        >
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

      <div className="mt-6 pt-4 border-t border-slate-200 text-center space-y-2">
        <p className="text-slate-600 text-sm">
          Need a new token?{' '}
          <Link href="/forgot-password" className="text-primary-600 hover:text-primary-700 font-medium">
            Request Reset
          </Link>
        </p>
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
