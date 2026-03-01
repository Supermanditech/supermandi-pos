// T-289: SuperAdmin Finance Monitoring Dashboard
// T-290: Provider Management (enable/disable, config)
// T-281: Provider Health Monitoring

import { useState, useEffect, useCallback } from 'react';
// UIUX-SA-003: Use centralized auth instead of wrong 'superadmin_token' key
// P2-4: Use getAuthHeaders() to include X-Request-ID correlation tracing
import { getAuthHeaders, fetchWithTimeout } from '../api/authToken';
// UIUX-SA-007: Use parseError for sanitized error messages instead of generic 'API error: {status}'
import { parseError } from '../api/errorSanitizer';
// UIUX-SA-011: Styled confirmation dialog for provider toggle
import { ConfirmDialog, type ConfirmDialogConfig } from '../components/ConfirmDialog';

interface ProviderConfig {
  id: string;
  provider_id: string;
  provider_name: string;
  mode: string;
  is_active: boolean;
  priority: number;
  min_amount_minor: number;
  max_amount_minor: number;
}

interface ProviderStat {
  provider_id: string;
  total_drawdowns: string;
  active: string;
  overdue: string;
  paid: string;
  defaulted: string;
  total_disbursed_minor: string;
  outstanding_minor: string;
  total_repaid_minor: string;
}

interface HealthStatus {
  providerId: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  lastChecked: string;
  approvalRate?: number;
}

function fmt(minorStr: string | number): string {
  const minor = typeof minorStr === 'string' ? parseInt(minorStr, 10) : minorStr;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format((minor || 0) / 100);
}

// P2-4: Use getAuthHeaders() for full auth context (Authorization + X-Request-ID correlation)
// fetchWithTimeout handles 401 auto-logout via handleAutoLogout()
async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options?.headers },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function CreditProvidersTab() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [stats, setStats] = useState<ProviderStat[]>([]);
  const [health, setHealth] = useState<HealthStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // UIUX-SA-011: Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  // UNMAPPED.042: Track which provider is being toggled
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [provResult, dashResult, healthResult] = await Promise.all([
        apiFetch('/api/v1/admin/credit-providers'),
        apiFetch('/api/v1/admin/credit-providers/dashboard'),
        apiFetch('/api/v1/admin/credit-providers/health'),
      ]);
      setProviders(provResult.providers || []);
      setStats(dashResult.providerStats || []);
      setHealth(healthResult.providers || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleProvider = (providerId: string, currentActive: boolean) => {
    const provName = providers.find(p => p.provider_id === providerId)?.provider_name || providerId;
    setConfirmDialog({
      title: currentActive ? 'Disable Credit Provider' : 'Enable Credit Provider',
      message: currentActive
        ? `Disable "${provName}"? This will stop all new credit applications through this provider.`
        : `Enable "${provName}"? This will allow new credit applications through this provider.`,
      confirmLabel: currentActive ? 'Disable' : 'Enable',
      variant: currentActive ? 'danger' : 'info',
      onConfirm: async () => {
        setConfirmDialog(null);
        setTogglingId(providerId);
        try {
          await apiFetch(`/api/v1/admin/credit-providers/${providerId}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: !currentActive }),
          });
          await fetchAll();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Failed to update');
        } finally {
          setTogglingId(null);
        }
      },
    });
  };

  if (loading) return <div className="sa-p-24 sa-text-muted">Loading finance dashboard...</div>;

  // Aggregate totals
  const totalDisbursed = stats.reduce((s, r) => s + Math.round(Number(r.total_disbursed_minor) || 0), 0);
  const totalOutstanding = stats.reduce((s, r) => s + Math.round(Number(r.outstanding_minor) || 0), 0);
  const totalRepaid = stats.reduce((s, r) => s + Math.round(Number(r.total_repaid_minor) || 0), 0);
  const totalActive = stats.reduce((s, r) => s + Math.round(Number(r.active) || 0), 0);
  const totalOverdue = stats.reduce((s, r) => s + Math.round(Number(r.overdue) || 0), 0);

  return (
    <div className="sa-p-24">
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
      <h2 className="sa-text-xl sa-fw-600 sa-mb-20">Finance & Credit Providers</h2>

      {error && (
        <div className="sa-alert-error sa-mb-16">
          {error} <button onClick={fetchAll} className="sa-btn-text" style={{ marginLeft: '0.5rem', textDecoration: 'underline' }}>Retry</button>
        </div>
      )}

      {/* Summary Cards */}
      {/* STG-389: Responsive grid — auto-fit wraps on narrow viewports */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }} className="sa-mb-20">
        <div className="sa-stat-card sa-bg-success-soft" style={{ borderColor: 'var(--color-success)' }}>
          <div className="sa-stat-label sa-text-success">Total Disbursed</div>
          <div className="sa-stat-value--sm sa-fw-700">{fmt(totalDisbursed)}</div>
        </div>
        <div className="sa-stat-card sa-bg-error-soft" style={{ borderColor: 'var(--color-error)' }}>
          <div className="sa-stat-label sa-text-error">Outstanding</div>
          <div className="sa-stat-value--sm sa-fw-700 sa-text-danger">{fmt(totalOutstanding)}</div>
        </div>
        <div className="sa-stat-card" style={{ background: 'var(--color-primary-light)', borderColor: 'var(--color-primary-soft)' }}>
          <div className="sa-stat-label sa-text-info">Repaid</div>
          <div className="sa-stat-value--sm sa-fw-700">{fmt(totalRepaid)}</div>
        </div>
        <div className="sa-stat-card sa-bg-surface-alt">
          <div className="sa-stat-label">Active Loans</div>
          <div className="sa-stat-value--sm sa-fw-700">{totalActive}</div>
        </div>
        <div className={`sa-stat-card ${totalOverdue > 0 ? 'sa-bg-error-soft' : 'sa-bg-surface-alt'}`} style={{ borderColor: totalOverdue > 0 ? 'var(--color-error)' : undefined }}>
          <div className={`sa-stat-label ${totalOverdue > 0 ? 'sa-text-error' : ''}`}>Overdue</div>
          <div className={`sa-stat-value--sm sa-fw-700 ${totalOverdue > 0 ? 'sa-text-danger' : ''}`}>{totalOverdue}</div>
        </div>
      </div>

      {/* Provider Health */}
      <h3 className="sa-text-lg sa-fw-600 sa-mb-12">Provider Health</h3>
      <div className="sa-grid-auto sa-mb-20">
        {health.map(h => (
          <div key={h.providerId} className={`sa-p-12 sa-radius-8 sa-border ${h.status === 'healthy' ? 'sa-bg-success-soft' : h.status === 'degraded' ? 'sa-bg-warning-soft' : 'sa-bg-error-soft'}`} style={{
            borderColor: h.status === 'healthy' ? 'var(--color-success)' : h.status === 'degraded' ? 'var(--color-warning)' : 'var(--color-error)',
          }}>
            <div className="sa-flex-between">
              <span className="sa-fw-500 sa-text-md">{h.providerId}</span>
              <span className={h.status === 'healthy' ? 'sa-badge-ok' : h.status === 'degraded' ? 'sa-badge-warn' : 'sa-badge-error'}>{h.status}</span>
            </div>
            <div className="sa-text-sm sa-text-muted sa-mt-4">
              Latency: {h.latencyMs}ms
              {h.approvalRate != null && ` | Approval: ${h.approvalRate}%`}
            </div>
          </div>
        ))}
      </div>

      {/* Provider Configuration */}
      <h3 className="sa-text-lg sa-fw-600 sa-mb-12">Providers ({providers.length})</h3>
      <table className="table">
        <thead>
          <tr>
            <th className="sa-th">Provider</th>
            <th className="sa-th">Mode</th>
            <th className="sa-th" style={{ textAlign: 'center' }}>Priority</th>
            <th className="sa-th sa-th--right">Min</th>
            <th className="sa-th sa-th--right">Max</th>
            <th className="sa-th" style={{ textAlign: 'center' }}>Active</th>
            <th className="sa-th" style={{ textAlign: 'center' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {providers.map(p => {
            return (
              <tr key={p.provider_id}>
                <td className="sa-td">
                  <div className="sa-fw-500">{p.provider_name}</div>
                  <div className="sa-text-xs sa-text-muted">{p.provider_id}</div>
                </td>
                <td className="sa-td">
                  <span className="sa-badge-muted">{p.mode}</span>
                </td>
                <td className="sa-td" style={{ textAlign: 'center' }}>{p.priority}</td>
                <td className="sa-td sa-td--right sa-td--mono">{fmt(p.min_amount_minor)}</td>
                <td className="sa-td sa-td--right sa-td--mono">{fmt(p.max_amount_minor)}</td>
                <td className="sa-td" style={{ textAlign: 'center' }}>
                  <span className={`sa-dot ${togglingId === p.provider_id ? 'sa-dot--warning' : p.is_active ? 'sa-dot--success' : 'sa-dot--muted'}`} style={{
                    animation: togglingId === p.provider_id ? 'pulse 1s ease-in-out infinite' : undefined,
                  }} />
                </td>
                <td className="sa-td" style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => toggleProvider(p.provider_id, p.is_active)}
                    disabled={togglingId === p.provider_id}
                    className="sa-btn-ghost-sm"
                    style={{
                      opacity: togglingId === p.provider_id ? 0.6 : 1,
                      cursor: togglingId === p.provider_id ? 'wait' : 'pointer',
                    }}
                  >
                    {togglingId === p.provider_id ? 'Updating...' : p.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Per-Provider Stats */}
      {stats.length > 0 && (
        <>
          <h3 className="sa-text-lg sa-fw-600 sa-mt-20 sa-mb-12">Per-Provider Stats</h3>
          <table className="table">
            <thead>
              <tr>
                <th className="sa-th">Provider</th>
                <th className="sa-th sa-th--right">Total</th>
                <th className="sa-th sa-th--right">Active</th>
                <th className="sa-th sa-th--right">Overdue</th>
                <th className="sa-th sa-th--right">Paid</th>
                <th className="sa-th sa-th--right">Disbursed</th>
                <th className="sa-th sa-th--right">Outstanding</th>
                <th className="sa-th sa-th--right">Repaid</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.provider_id}>
                  <td className="sa-td sa-td--bold">{s.provider_id}</td>
                  <td className="sa-td sa-td--right">{s.total_drawdowns}</td>
                  <td className="sa-td sa-td--right">{s.active}</td>
                  <td className="sa-td sa-td--right" style={{ color: parseInt(s.overdue) > 0 ? 'var(--color-error)' : undefined }}>{s.overdue}</td>
                  <td className="sa-td sa-td--right">{s.paid}</td>
                  <td className="sa-td sa-td--right sa-td--mono">{fmt(s.total_disbursed_minor)}</td>
                  <td className="sa-td sa-td--right sa-td--mono" style={{ color: parseInt(s.outstanding_minor) > 0 ? 'var(--color-error)' : undefined }}>{fmt(s.outstanding_minor)}</td>
                  <td className="sa-td sa-td--right sa-td--mono">{fmt(s.total_repaid_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
