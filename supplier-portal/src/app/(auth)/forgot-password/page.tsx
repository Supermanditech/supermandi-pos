'use client';

// GL-WF-035: Forgot Password Page

import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { requestPasswordReset, resetPassword } from '@/lib/api';

type Step = 'request' | 'verify';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Please enter your email');
      return;
    }

    setIsLoading(true);
    try {
      const result = await requestPasswordReset(email);
      toast.success(result.message || 'Reset code sent to your email');
      setStep('verify');

      // For development, show the token
      if (result.devToken) {
        setDevToken(result.devToken);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token.trim()) {
      toast.error('Please enter the reset code');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const result = await resetPassword(email, token, newPassword);
      toast.success(result.message || 'Password reset successfully!');
      // Redirect to login after short delay
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
            SuperMandi
          </h1>
          <p className="text-slate-400 mt-2">Supplier Portal - Password Reset</p>
        </div>

        {/* Form Card */}
        <div className="card">
          {step === 'request' ? (
            <>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">
                Forgot Password?
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                Enter your email address and we'll send you a reset code.
              </p>

              <form onSubmit={handleRequestReset} className="space-y-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="your@email.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={isLoading}
                >
                  {isLoading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">
                Reset Password
              </h2>
              <p className="text-slate-500 text-sm mb-6">
                Enter the code sent to <strong>{email}</strong> and your new password.
              </p>

              {/* Dev token display */}
              {devToken && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <p className="text-xs text-yellow-600 font-medium">DEV MODE</p>
                  <p className="text-yellow-800 font-mono text-lg">{devToken}</p>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="label">Reset Code (6 digits)</label>
                  <input
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="input font-mono text-center text-xl tracking-widest"
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                </div>

                <div>
                  <label className="label">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input"
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                  />
                </div>

                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input"
                    placeholder="Re-enter password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  disabled={isLoading}
                >
                  {isLoading ? 'Resetting...' : 'Reset Password'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep('request');
                    setToken('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setDevToken(null);
                  }}
                  className="text-sm text-slate-500 hover:text-slate-700 w-full text-center"
                >
                  Didn't receive code? Try again
                </button>
              </form>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-slate-200 text-center">
            <Link
              href="/login"
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
