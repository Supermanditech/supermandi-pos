// GCP-STG-0539: TOTP 2FA setup UI for SuperAdmin portal
// GCP-STG-0548: Trusted devices section + revoke button
import { useState, useCallback } from "react";
import { getAuthHeaders, fetchWithTimeout } from "../api/authToken";

/** GCP-STG-0548: Device trust duration in days. "Remember device" checkbox will be added to login TOTP step when backend returns totpRequired. */
export const TOTP_DEVICE_TRUST_DAYS = 30;

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

type TotpState = 'idle' | 'loading' | 'setup' | 'verifying' | 'enabled' | 'disabling';

interface TotpSetupData {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export function TotpSetupCard() {
  const [state, setState] = useState<TotpState>('idle');
  const [setupData, setSetupData] = useState<TotpSetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState('');
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [codesSaved, setCodesSaved] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy All');
  const [revoking, setRevoking] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState('');

  // Check current TOTP status on first render
  const checkStatus = useCallback(async () => {
    setCheckingStatus(true);
    setError('');
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/totp-setup`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...getAuthHeaders(),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setTotpEnabled(!!data.enabled);
        setState(data.enabled ? 'enabled' : 'idle');
      } else if (res.status === 404) {
        // Endpoint may not support GET — assume not enabled
        setTotpEnabled(false);
        setState('idle');
      } else {
        // Non-critical — default to idle
        setTotpEnabled(false);
        setState('idle');
      }
    } catch {
      // Non-critical — default to idle
      setTotpEnabled(false);
      setState('idle');
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  // Auto-check status on mount
  useState(() => { checkStatus(); });

  const handleEnable = useCallback(async () => {
    setState('loading');
    setError('');
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/totp-setup`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: '{}',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message || data?.message || `Setup failed (${res.status})`);
        setState('idle');
        return;
      }
      const data = await res.json();
      setSetupData({
        secret: data.secret,
        qrCodeDataUrl: data.qrCodeDataUrl,
        backupCodes: data.backupCodes || [],
      });
      setState('setup');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
      setState('idle');
    }
  }, []);

  const handleVerify = useCallback(async () => {
    const code = verifyCode.trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError('Enter a valid 6-digit code');
      return;
    }
    setState('verifying');
    setError('');
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/totp-verify`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message || data?.message || `Verification failed (${res.status})`);
        setState('setup');
        return;
      }
      setTotpEnabled(true);
      setSetupData(null);
      setVerifyCode('');
      setState('enabled');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
      setState('setup');
    }
  }, [verifyCode]);

  const handleDisable = useCallback(async () => {
    const code = disableCode.trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError('Enter a valid 6-digit code to disable 2FA');
      return;
    }
    setState('disabling');
    setError('');
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/totp-disable`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message || data?.message || `Disable failed (${res.status})`);
        setState('enabled');
        return;
      }
      setTotpEnabled(false);
      setDisableCode('');
      setState('idle');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
      setState('enabled');
    }
  }, [disableCode]);

  // GCP-STG-0548: Revoke all trusted devices
  const handleRevokeDevices = useCallback(async () => {
    setRevoking(true);
    setError('');
    setRevokeSuccess('');
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/totp-revoke-devices`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: '{}',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message || data?.message || `Revoke failed (${res.status})`);
        return;
      }
      setRevokeSuccess('All trusted devices revoked. TOTP will be required on next login.');
      setTimeout(() => setRevokeSuccess(''), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRevoking(false);
    }
  }, []);

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-surface, #fff)',
    border: '1px solid var(--color-border, #e0e0e0)',
    borderRadius: 8,
    padding: 20,
    marginTop: 20,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--color-text, #1a1a1a)',
  };

  const descStyle: React.CSSProperties = {
    fontSize: 14,
    color: 'var(--color-text-secondary, #666)',
    marginBottom: 16,
  };

  const badgeEnabledStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 600,
    background: '#e6f9e6',
    color: '#1a7a1a',
  };

  const badgeDisabledStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 600,
    background: '#f5f5f5',
    color: '#888',
  };

  const errorStyle: React.CSSProperties = {
    color: '#d32f2f',
    background: '#ffeaea',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 12,
  };

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 16,
    fontFamily: 'monospace',
    letterSpacing: 4,
    border: '1px solid var(--color-border, #ccc)',
    borderRadius: 6,
    width: 160,
    textAlign: 'center' as const,
  };

  const btnPrimaryStyle: React.CSSProperties = {
    padding: '8px 20px',
    fontSize: 14,
    fontWeight: 600,
    background: 'var(--color-primary, #2563eb)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  };

  const btnDangerStyle: React.CSSProperties = {
    ...btnPrimaryStyle,
    background: '#d32f2f',
  };

  const btnGhostStyle: React.CSSProperties = {
    padding: '6px 16px',
    fontSize: 13,
    background: 'transparent',
    color: 'var(--color-text-secondary, #666)',
    border: '1px solid var(--color-border, #ccc)',
    borderRadius: 6,
    cursor: 'pointer',
  };

  const secretBoxStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 13,
    background: 'var(--color-surface-alt, #f5f5f5)',
    padding: '8px 12px',
    borderRadius: 6,
    wordBreak: 'break-all',
    userSelect: 'all',
    border: '1px solid var(--color-border, #e0e0e0)',
  };

  const backupCodesStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 13,
    background: '#fffbe6',
    border: '1px solid #ffe082',
    borderRadius: 6,
    padding: 12,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 4,
  };

  if (checkingStatus) {
    return (
      <div style={cardStyle}>
        <div style={titleStyle}>Two-Factor Authentication</div>
        <div style={descStyle}>Checking 2FA status...</div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div style={titleStyle}>Two-Factor Authentication</div>
        {totpEnabled ? (
          <span style={badgeEnabledStyle}>2FA Enabled &#10003;</span>
        ) : (
          <span style={badgeDisabledStyle}>Not Enabled</span>
        )}
      </div>

      <div style={descStyle}>
        Add an extra layer of security to your account using a TOTP authenticator app (Google Authenticator, Authy, etc).
      </div>

      {error && <div style={errorStyle} role="alert">{error}</div>}

      {/* Idle state — show Enable button */}
      {state === 'idle' && (
        <button
          style={btnPrimaryStyle}
          onClick={handleEnable}
          disabled={false}
        >
          Enable 2FA
        </button>
      )}

      {/* Loading state */}
      {state === 'loading' && (
        <button style={{ ...btnPrimaryStyle, opacity: 0.6 }} disabled>
          Setting up...
        </button>
      )}

      {/* Setup state — show QR, secret, backup codes, verify input */}
      {(state === 'setup' || state === 'verifying') && setupData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
              1. Scan this QR code with your authenticator app:
            </div>
            <img
              src={setupData.qrCodeDataUrl}
              alt="TOTP QR Code"
              style={{ width: 200, height: 200, border: '1px solid var(--color-border, #e0e0e0)', borderRadius: 8 }}
            />
          </div>

          <div>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
              Or enter this secret manually:
            </div>
            <div style={secretBoxStyle}>{setupData.secret}</div>
          </div>

          {setupData.backupCodes.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14, color: '#b8860b' }}>
                Backup codes (save these securely):
              </div>
              <div style={backupCodesStyle}>
                {setupData.backupCodes.map((code, i) => (
                  <span key={i}>{code}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  style={btnGhostStyle}
                  onClick={() => {
                    navigator.clipboard.writeText(setupData.backupCodes.join('\n'));
                    setCopyLabel('Copied!');
                    setTimeout(() => setCopyLabel('Copy All'), 2000);
                  }}
                >
                  {copyLabel}
                </button>
                <button
                  type="button"
                  style={btnGhostStyle}
                  onClick={() => {
                    const text = 'SuperMandi SuperAdmin — TOTP Backup Codes\n' +
                      'Generated: ' + new Date().toISOString() + '\n\n' +
                      setupData.backupCodes.join('\n') + '\n\nEach code can be used once.';
                    const blob = new Blob([text], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'supermandi-superadmin-backup-codes.txt';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download as Text
                </button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={codesSaved}
                  onChange={(e) => setCodesSaved(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ color: 'var(--color-text, #1a1a1a)' }}>I have saved these recovery codes</span>
              </label>
            </div>
          )}

          <div>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
              2. Enter the 6-digit code from your authenticator:
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="000000"
                style={inputStyle}
                disabled={state === 'verifying'}
                aria-label="TOTP verification code"
              />
              <button
                style={btnPrimaryStyle}
                onClick={handleVerify}
                disabled={state === 'verifying' || verifyCode.trim().length !== 6 || (setupData!.backupCodes.length > 0 && !codesSaved)}
              >
                {state === 'verifying' ? 'Verifying...' : 'Verify & Enable'}
              </button>
              <button
                style={btnGhostStyle}
                onClick={() => { setState('idle'); setSetupData(null); setVerifyCode(''); setError(''); }}
                disabled={state === 'verifying'}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enabled state — show disable option + trusted devices */}
      {(state === 'enabled' || state === 'disabling') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {/* GCP-STG-0548: Trusted Devices section */}
          <div style={{
            background: 'var(--color-surface-alt, #f8f9fa)',
            border: '1px solid var(--color-border, #e0e0e0)',
            borderRadius: 6,
            padding: 16,
          }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: 'var(--color-text, #1a1a1a)' }}>
              Trusted Devices
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary, #666)', marginBottom: 12 }}>
              When you enable &quot;Remember this device&quot; during login, your device will be trusted for {TOTP_DEVICE_TRUST_DAYS} days.
              Revoking clears all trusted devices, requiring TOTP on the next login from every device.
            </div>
            {revokeSuccess && (
              <div style={{ color: '#1a7a1a', background: '#e6f9e6', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 8 }} role="status">
                {revokeSuccess}
              </div>
            )}
            <button
              style={{ ...btnDangerStyle, fontSize: 13, padding: '6px 16px' }}
              onClick={handleRevokeDevices}
              disabled={revoking}
            >
              {revoking ? 'Revoking...' : 'Revoke All Trusted Devices'}
            </button>
          </div>

          <div style={{ fontSize: 14, color: 'var(--color-text-secondary, #666)' }}>
            To disable 2FA, enter a code from your authenticator app:
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="000000"
              style={inputStyle}
              disabled={state === 'disabling'}
              aria-label="TOTP code to disable 2FA"
            />
            <button
              style={btnDangerStyle}
              onClick={handleDisable}
              disabled={state === 'disabling' || disableCode.trim().length !== 6}
            >
              {state === 'disabling' ? 'Disabling...' : 'Disable 2FA'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
