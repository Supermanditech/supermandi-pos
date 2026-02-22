'use client';

// T-002: Supplier reset password — token from email
// User arrives here from the reset link in their email, or manually enters token
// POST /api/v1/supplier/auth/reset-password with { email, token, newPassword }

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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

function ResetPasswordInner() {
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
          <Link
            href="/login"
            className="btn btn-primary w-full py-3 block text-center"
          >
            Sign In
          </Link>
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
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
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
          <input
            type="password"
            id="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input"
            placeholder="Enter new password"
            disabled={isLoading}
            autoFocus={!!email && !!token}
          />
          <p className="text-xs text-slate-500 mt-1">Min 8 characters, 1 uppercase, 1 lowercase, 1 digit</p>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="label">
            Confirm Password
          </label>
          <input
            type="password"
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input"
            placeholder="Confirm new password"
            disabled={isLoading}
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
