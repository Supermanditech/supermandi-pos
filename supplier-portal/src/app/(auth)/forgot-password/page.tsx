'use client';

// T-002: Supplier forgot password — email-based token reset
// Step 1: Enter email → POST /api/v1/supplier/auth/forgot-password
// Step 2: Show "check your email" message with link to reset page

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

type Step = 'email' | 'sent';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
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
      setStep('sent');
    } catch {
      // Always show success to prevent email enumeration
      // Backend returns 200 even for non-existent emails
      setStep('sent');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'sent') {
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
            <Link
              href="/reset-password"
              className="btn btn-primary w-full py-3 block text-center"
            >
              I Have a Reset Token
            </Link>
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

  return (
    <>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        Reset Password
      </h2>
      <p className="text-slate-600 text-sm mb-6">
        Enter your registered email address and we&apos;ll send you a password reset link.
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
            placeholder="you@company.com"
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
              Sending...
            </span>
          ) : (
            'Send Reset Link'
          )}
        </button>
      </form>

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
