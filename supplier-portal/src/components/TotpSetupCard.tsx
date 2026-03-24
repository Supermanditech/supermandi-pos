'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import toast from 'react-hot-toast';

// GCP-STG-0541: TOTP 2FA setup card for supplier portal

interface TotpSetupResponse {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

type TotpState = 'idle' | 'loading' | 'setup' | 'verifying' | 'enabled' | 'disabling' | 'error';

export default function TotpSetupCard({ totpEnabled: initialEnabled }: { totpEnabled?: boolean }) {
  const [state, setState] = useState<TotpState>(initialEnabled ? 'enabled' : 'idle');
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleEnableSetup = async () => {
    setState('loading');
    setErrorMsg('');
    try {
      const data = await apiFetch<TotpSetupResponse>('/api/v1/supplier/auth/totp-setup', {
        method: 'POST',
      });
      setSetupData(data);
      setState('setup');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start TOTP setup';
      setErrorMsg(msg);
      setState('error');
      toast.error(msg);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(verifyCode)) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    setState('verifying');
    setErrorMsg('');
    try {
      await apiFetch<{ message: string }>('/api/v1/supplier/auth/totp-verify', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode }),
      });
      toast.success('Two-factor authentication enabled!');
      setState('enabled');
      setSetupData(null);
      setVerifyCode('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid code. Please try again.';
      setErrorMsg(msg);
      setState('setup');
      toast.error(msg);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(disableCode)) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    setState('disabling');
    setErrorMsg('');
    try {
      await apiFetch<{ message: string }>('/api/v1/supplier/auth/totp-disable', {
        method: 'POST',
        body: JSON.stringify({ code: disableCode }),
      });
      toast.success('Two-factor authentication disabled.');
      setState('idle');
      setDisableCode('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid code. Could not disable 2FA.';
      setErrorMsg(msg);
      setState('enabled');
      toast.error(msg);
    }
  };

  const handleCancel = () => {
    setState('idle');
    setSetupData(null);
    setVerifyCode('');
    setErrorMsg('');
  };

  return (
    <div className="card mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Two-Factor Authentication
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Add an extra layer of security to your account using an authenticator app.
          </p>
        </div>
        {state === 'enabled' && (
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
            Enabled
          </span>
        )}
      </div>

      {/* Error state */}
      {state === 'error' && (
        <div className="space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{errorMsg || 'Something went wrong. Please try again.'}</p>
          </div>
          <button onClick={handleEnableSetup} className="btn btn-primary">
            Retry Setup
          </button>
        </div>
      )}

      {/* Idle — not enabled */}
      {state === 'idle' && (
        <button onClick={handleEnableSetup} className="btn btn-primary">
          Enable 2FA
        </button>
      )}

      {/* Loading */}
      {state === 'loading' && (
        <div className="flex items-center gap-2 text-slate-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Setting up...</span>
        </div>
      )}

      {/* Setup — show QR, secret, backup codes, verify input */}
      {state === 'setup' && setupData && (
        <div className="space-y-5">
          {/* Step 1: QR Code */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              1. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
            </p>
            <div className="flex justify-center bg-white p-4 rounded-lg border border-slate-200 w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setupData.qrCodeDataUrl}
                alt="TOTP QR Code"
                width={200}
                height={200}
                className="rounded"
              />
            </div>
          </div>

          {/* Step 2: Manual secret */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              2. Or enter this secret manually:
            </p>
            <code className="block bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded font-mono text-sm break-all select-all">
              {setupData.secret}
            </code>
          </div>

          {/* Step 3: Backup codes */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              3. Save these backup codes in a safe place. Each code can only be used once:
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2">
                {setupData.backupCodes.map((code, i) => (
                  <code key={i} className="font-mono text-sm text-yellow-800">
                    {code}
                  </code>
                ))}
              </div>
              <p className="text-xs text-yellow-600 mt-3">
                Store these codes securely. You will need them if you lose access to your authenticator app.
              </p>
            </div>
          </div>

          {/* Step 4: Verify */}
          <form onSubmit={handleVerify} className="space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              4. Enter the 6-digit code from your authenticator app to verify:
            </p>
            <div className="flex gap-3 items-start max-w-xs">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="input font-mono text-center text-lg tracking-widest"
                autoComplete="one-time-code"
                required
              />
            </div>
            {errorMsg && state === 'setup' && (
              <p className="text-xs text-red-600">{errorMsg}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={verifyCode.length !== 6}
              >
                Verify &amp; Enable
              </button>
              <button type="button" onClick={handleCancel} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Verifying spinner */}
      {state === 'verifying' && (
        <div className="flex items-center gap-2 text-slate-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Verifying...</span>
        </div>
      )}

      {/* Enabled — show disable option */}
      {state === 'enabled' && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-700">
              Two-factor authentication is active. You will be prompted for a code on each login.
            </p>
          </div>
          <form onSubmit={handleDisable} className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              To disable 2FA, enter your current authenticator code:
            </p>
            <div className="flex gap-3 items-start max-w-xs">
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="input font-mono text-center text-lg tracking-widest"
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="submit"
              className="btn bg-red-600 text-white hover:bg-red-700"
              disabled={disableCode.length !== 6}
            >
              Disable 2FA
            </button>
          </form>
        </div>
      )}

      {/* Disabling spinner */}
      {state === 'disabling' && (
        <div className="flex items-center gap-2 text-slate-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Disabling...</span>
        </div>
      )}
    </div>
  );
}
