// GCP-STG-0755: SuperAdmin password setup/change UI
import { useState, useCallback, useEffect } from "react";
import { getAuthHeaders, fetchWithTimeout } from "../api/authToken";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

type CardState = 'loading' | 'no-password' | 'has-password' | 'setting' | 'changing' | 'error';

interface SecurityStatus {
  passwordConfigured: boolean;
  totpEnabled: boolean;
  email: string;
}

function getPasswordStrength(pw: string): { label: string; color: string; pct: number } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { label: "Weak", color: "#e74c3c", pct: 33 };
  if (score <= 4) return { label: "Medium", color: "#f39c12", pct: 66 };
  return { label: "Strong", color: "#27ae60", pct: 100 };
}

export function SecuritySettingsCard() {
  const [state, setState] = useState<CardState>('loading');
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Set password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Change password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [changeNewPassword, setChangeNewPassword] = useState('');
  const [changeConfirmPassword, setChangeConfirmPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const fetchStatus = useCallback(async () => {
    setState('loading');
    setError('');
    setSuccess('');
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/security-status`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json', ...getAuthHeaders() },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || `Failed to fetch security status (${res.status})`);
        setState('error');
        return;
      }
      const data: SecurityStatus = await res.json();
      setStatus(data);
      setState(data.passwordConfigured ? 'has-password' : 'no-password');
    } catch {
      setError('Failed to fetch security status');
      setState('error');
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSetPassword = useCallback(async () => {
    setError('');
    setSuccess('');
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/\d/.test(newPassword)) { setError('Password must contain at least 1 number'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }

    setSubmitting(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/set-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || `Failed to set password (${res.status})`);
        return;
      }
      setSuccess('Password set successfully');
      setNewPassword('');
      setConfirmPassword('');
      await fetchStatus();
    } catch {
      setError('Failed to set password');
    } finally {
      setSubmitting(false);
    }
  }, [newPassword, confirmPassword, fetchStatus]);

  const handleChangePassword = useCallback(async () => {
    setError('');
    setSuccess('');
    if (!currentPassword) { setError('Current password is required'); return; }
    if (changeNewPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (!/\d/.test(changeNewPassword)) { setError('New password must contain at least 1 number'); return; }
    if (changeNewPassword !== changeConfirmPassword) { setError('Passwords do not match'); return; }

    setSubmitting(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/auth/change-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, newPassword: changeNewPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || `Failed to change password (${res.status})`);
        return;
      }
      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setChangeNewPassword('');
      setChangeConfirmPassword('');
      setState('has-password');
    } catch {
      setError('Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }, [currentPassword, changeNewPassword, changeConfirmPassword, fetchStatus]);

  const activePassword = state === 'changing' ? changeNewPassword : newPassword;
  const strength = activePassword.length > 0 ? getPasswordStrength(activePassword) : null;

  return (
    <div className="sa-stat-card sa-bg-surface-alt" style={{ maxWidth: 520 }}>
      <h4 className="sa-section-title">Password Security</h4>

      {state === 'loading' && (
        <div className="sa-text-muted sa-text-md">Loading security status...</div>
      )}

      {state === 'error' && (
        <div>
          <div className="errorText sa-mb-8" role="alert">{error}</div>
          <button onClick={fetchStatus} className="sa-btn-ghost-sm">Retry</button>
        </div>
      )}

      {state === 'has-password' && (
        <div className="sa-flex-col sa-gap-8">
          <div className="sa-flex sa-gap-8 sa-align-center">
            <span className="badge badgeOk">Password active</span>
            {status?.email && <span className="sa-text-xs sa-text-muted">{status.email}</span>}
          </div>
          <button
            onClick={() => { setState('changing'); setError(''); setSuccess(''); }}
            className="sa-btn-ghost-sm"
            style={{ alignSelf: 'flex-start' }}
          >
            Change Password
          </button>
          {success && <div className="sa-text-sm" style={{ color: '#27ae60' }} role="status">{success}</div>}
        </div>
      )}

      {state === 'no-password' && (
        <div className="sa-flex-col sa-gap-8">
          <div className="sa-text-muted sa-text-md">No password set. Set one now for added security.</div>
          <button
            onClick={() => { setState('setting'); setError(''); setSuccess(''); }}
            className="sa-btn-success-sm"
            style={{ alignSelf: 'flex-start' }}
          >
            Set Password
          </button>
        </div>
      )}

      {state === 'setting' && (
        <div className="sa-flex-col sa-gap-8">
          <div className="sa-text-muted sa-text-sm">Min 8 characters, at least 1 number.</div>
          <div className="sa-flex sa-gap-8 sa-align-center">
            <label htmlFor="sec-new-pw" className="sa-text-muted" style={{ minWidth: 130 }}>New Password:</label>
            <input
              id="sec-new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="sa-input"
              style={{ width: 220 }}
              aria-label="New password"
              autoComplete="new-password"
            />
          </div>
          <div className="sa-flex sa-gap-8 sa-align-center">
            <label htmlFor="sec-confirm-pw" className="sa-text-muted" style={{ minWidth: 130 }}>Confirm:</label>
            <input
              id="sec-confirm-pw"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="sa-input"
              style={{ width: 220 }}
              aria-label="Confirm new password"
              autoComplete="new-password"
            />
          </div>
          {strength && (
            <div style={{ maxWidth: 360 }}>
              <div style={{ height: 6, borderRadius: 3, background: '#ddd' }}>
                <div style={{ width: `${strength.pct}%`, height: '100%', borderRadius: 3, background: strength.color, transition: 'width 0.3s' }} />
              </div>
              <span className="sa-text-xs" style={{ color: strength.color }}>{strength.label}</span>
            </div>
          )}
          {error && <div className="errorText sa-text-sm" role="alert">{error}</div>}
          {success && <div className="sa-text-sm" style={{ color: '#27ae60' }} role="status">{success}</div>}
          <div className="sa-flex sa-gap-8">
            <button onClick={handleSetPassword} disabled={submitting} className="sa-btn-success-sm">
              {submitting ? 'Setting...' : 'Set Password'}
            </button>
            <button onClick={() => { setState('no-password'); setError(''); setNewPassword(''); setConfirmPassword(''); }} className="sa-btn-ghost-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {state === 'changing' && (
        <div className="sa-flex-col sa-gap-8">
          <div className="sa-text-muted sa-text-sm">Min 8 characters, at least 1 number.</div>
          <div className="sa-flex sa-gap-8 sa-align-center">
            <label htmlFor="sec-cur-pw" className="sa-text-muted" style={{ minWidth: 130 }}>Current Password:</label>
            <input
              id="sec-cur-pw"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="sa-input"
              style={{ width: 220 }}
              aria-label="Current password"
              autoComplete="current-password"
            />
          </div>
          <div className="sa-flex sa-gap-8 sa-align-center">
            <label htmlFor="sec-chg-new-pw" className="sa-text-muted" style={{ minWidth: 130 }}>New Password:</label>
            <input
              id="sec-chg-new-pw"
              type="password"
              value={changeNewPassword}
              onChange={(e) => setChangeNewPassword(e.target.value)}
              className="sa-input"
              style={{ width: 220 }}
              aria-label="New password"
              autoComplete="new-password"
            />
          </div>
          <div className="sa-flex sa-gap-8 sa-align-center">
            <label htmlFor="sec-chg-confirm-pw" className="sa-text-muted" style={{ minWidth: 130 }}>Confirm:</label>
            <input
              id="sec-chg-confirm-pw"
              type="password"
              value={changeConfirmPassword}
              onChange={(e) => setChangeConfirmPassword(e.target.value)}
              className="sa-input"
              style={{ width: 220 }}
              aria-label="Confirm new password"
              autoComplete="new-password"
            />
          </div>
          {strength && (
            <div style={{ maxWidth: 360 }}>
              <div style={{ height: 6, borderRadius: 3, background: '#ddd' }}>
                <div style={{ width: `${strength.pct}%`, height: '100%', borderRadius: 3, background: strength.color, transition: 'width 0.3s' }} />
              </div>
              <span className="sa-text-xs" style={{ color: strength.color }}>{strength.label}</span>
            </div>
          )}
          {error && <div className="errorText sa-text-sm" role="alert">{error}</div>}
          {success && <div className="sa-text-sm" style={{ color: '#27ae60' }} role="status">{success}</div>}
          <div className="sa-flex sa-gap-8">
            <button onClick={handleChangePassword} disabled={submitting} className="sa-btn-success-sm">
              {submitting ? 'Updating...' : 'Update Password'}
            </button>
            <button onClick={() => { setState('has-password'); setError(''); setCurrentPassword(''); setChangeNewPassword(''); setChangeConfirmPassword(''); }} className="sa-btn-ghost-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
