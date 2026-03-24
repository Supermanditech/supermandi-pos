// GCP-STG-0540: TOTP 2FA setup card for Retailer Admin portal
// Setup wizard: Enable → QR code → Verify → Enabled badge
// Disable flow: Enter code → Confirm → Disabled

import { useState, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import { logger } from '../lib/logger';

type TotpStep = 'idle' | 'loading' | 'setup' | 'enabled';

interface TotpSetupResponse {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export default function TotpSetupCard() {
  const { accessToken } = useAuth();

  // Core state
  const [step, setStep] = useState<TotpStep>('idle');
  const [setupData, setSetupData] = useState<TotpSetupResponse | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  // Feedback state
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [disabling, setDisabling] = useState(false);

  // Check current TOTP status on mount would require a GET endpoint;
  // since the backend doesn't expose one, we start at 'idle' and let the user
  // discover their status via the enable/disable flow.

  const handleEnable = useCallback(async () => {
    if (!accessToken) return;
    setStep('loading');
    setError(null);

    try {
      const response = await authFetch('/api/v1/retailer-admin/auth/totp-setup', accessToken, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await safeJson(response);
        // If TOTP is already enabled, reflect that
        if (response.status === 409 || data?.error?.code === 'TOTP_ALREADY_ENABLED') {
          setStep('enabled');
          return;
        }
        throw new Error(data?.error?.message || `Setup failed (${response.status})`);
      }

      const data = await safeJson(response);
      const payload: TotpSetupResponse = data?.data || data || {};
      setSetupData(payload);
      setStep('setup');
    } catch (err: any) {
      logger.error('TOTP setup failed:', err);
      setError(err.message || 'Failed to start 2FA setup');
      setStep('idle');
    }
  }, [accessToken]);

  const handleVerify = useCallback(async () => {
    if (!accessToken || verifyCode.length !== 6) return;
    setVerifying(true);
    setError(null);

    try {
      const response = await authFetch('/api/v1/retailer-admin/auth/totp-verify', accessToken, {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode }),
      });

      if (!response.ok) {
        const data = await safeJson(response);
        throw new Error(data?.error?.message || `Verification failed (${response.status})`);
      }

      setStep('enabled');
      setVerifyCode('');
      setSetupData(null);
    } catch (err: any) {
      logger.error('TOTP verify failed:', err);
      setError(err.message || 'Invalid code. Please try again.');
    } finally {
      setVerifying(false);
    }
  }, [accessToken, verifyCode]);

  const handleDisable = useCallback(async () => {
    if (!accessToken || disableCode.length !== 6) return;
    setDisabling(true);
    setError(null);

    try {
      const response = await authFetch('/api/v1/retailer-admin/auth/totp-disable', accessToken, {
        method: 'POST',
        body: JSON.stringify({ code: disableCode }),
      });

      if (!response.ok) {
        const data = await safeJson(response);
        throw new Error(data?.error?.message || `Disable failed (${response.status})`);
      }

      setStep('idle');
      setDisableCode('');
      setShowDisable(false);
    } catch (err: any) {
      logger.error('TOTP disable failed:', err);
      setError(err.message || 'Failed to disable 2FA. Check your code.');
    } finally {
      setDisabling(false);
    }
  }, [accessToken, disableCode]);

  // Sanitize code input: digits only, max 6
  const handleCodeInput = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setter(val);
    setError(null);
  };

  return (
    <section className="card set-section">
      <h2 className="set-section-title">
        <span className="set-section-icon" aria-hidden="true">&#128272;</span>
        Two-Factor Authentication
      </h2>

      {error && (
        <div className="set-pw-error" role="alert" aria-live="assertive">{error}</div>
      )}

      {/* IDLE: Not enabled, show enable button */}
      {step === 'idle' && (
        <div>
          <p className="set-hint-text" style={{ marginBottom: '1rem' }}>
            Add an extra layer of security to your account with a time-based one-time password (TOTP) authenticator app.
          </p>
          <button onClick={handleEnable} className="set-password-btn">
            Enable 2FA
          </button>
        </div>
      )}

      {/* LOADING: Fetching setup data */}
      {step === 'loading' && (
        <div className="set-hint-text">Setting up two-factor authentication...</div>
      )}

      {/* SETUP: Show QR code + secret + verify input */}
      {step === 'setup' && setupData && (
        <div>
          <p className="set-hint-text" style={{ marginBottom: '1rem' }}>
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
          </p>

          {/* QR Code */}
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <img
              src={setupData.qrCodeDataUrl}
              alt="TOTP QR Code — scan with authenticator app"
              style={{ maxWidth: 200, height: 'auto', borderRadius: 8, border: '1px solid var(--border-color, #e2e8f0)' }}
            />
          </div>

          {/* Manual secret */}
          <div style={{ marginBottom: '1rem' }}>
            <label className="set-label">Manual Entry Key</label>
            <code style={{
              display: 'block',
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-secondary, #f8fafc)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              wordBreak: 'break-all',
              letterSpacing: '0.05em',
              color: 'var(--text-primary, #1e293b)',
            }}>
              {setupData.secret}
            </code>
            <p className="set-hint-text">
              If you cannot scan the QR code, enter this key manually in your authenticator app.
            </p>
          </div>

          {/* Backup codes */}
          {setupData.backupCodes && setupData.backupCodes.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label className="set-label">Backup Codes (save these securely)</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '0.5rem',
                padding: '0.75rem',
                background: 'var(--bg-secondary, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                borderRadius: 6,
              }}>
                {setupData.backupCodes.map((code, i) => (
                  <code key={i} style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-primary, #1e293b)' }}>
                    {code}
                  </code>
                ))}
              </div>
              <p className="set-hint-text">
                Each backup code can be used once if you lose access to your authenticator app.
              </p>
            </div>
          )}

          {/* Verify input */}
          <div style={{ marginBottom: '1rem' }}>
            <label className="set-label" htmlFor="totp-verify-code">Enter 6-digit code from your app</label>
            <input
              id="totp-verify-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="form-input set-input"
              value={verifyCode}
              onChange={handleCodeInput(setVerifyCode)}
              placeholder="000000"
              maxLength={6}
              style={{ maxWidth: 200, letterSpacing: '0.2em', fontSize: '1.1rem', textAlign: 'center' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleVerify}
              disabled={verifying || verifyCode.length !== 6}
              className="set-password-btn"
            >
              {verifying ? 'Verifying...' : 'Verify & Enable'}
            </button>
            <button
              onClick={() => { setStep('idle'); setSetupData(null); setVerifyCode(''); setError(null); }}
              className="set-password-btn"
              style={{ background: 'var(--text-muted, #94a3b8)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ENABLED: Show badge + disable option */}
      {step === 'enabled' && (
        <div>
          <div className="set-pw-success" role="status" aria-live="polite" style={{ marginBottom: '1rem' }}>
            2FA Enabled — Your account is protected with two-factor authentication.
          </div>

          {!showDisable ? (
            <button
              onClick={() => { setShowDisable(true); setError(null); }}
              className="set-password-btn"
              style={{ background: 'var(--danger, #ef4444)' }}
            >
              Disable 2FA
            </button>
          ) : (
            <div>
              <p className="set-hint-text" style={{ marginBottom: '0.5rem' }}>
                Enter a 6-digit code from your authenticator app to confirm disabling 2FA:
              </p>
              <div style={{ marginBottom: '0.75rem' }}>
                <input
                  id="totp-disable-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="form-input set-input"
                  value={disableCode}
                  onChange={handleCodeInput(setDisableCode)}
                  placeholder="000000"
                  maxLength={6}
                  style={{ maxWidth: 200, letterSpacing: '0.2em', fontSize: '1.1rem', textAlign: 'center' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  onClick={handleDisable}
                  disabled={disabling || disableCode.length !== 6}
                  className="set-password-btn"
                  style={{ background: 'var(--danger, #ef4444)' }}
                >
                  {disabling ? 'Disabling...' : 'Confirm Disable'}
                </button>
                <button
                  onClick={() => { setShowDisable(false); setDisableCode(''); setError(null); }}
                  className="set-password-btn"
                  style={{ background: 'var(--text-muted, #94a3b8)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
