// T-289: SuperAdmin Finance Monitoring Dashboard
// T-290: Provider Management (enable/disable, config)
// T-281: Provider Health Monitoring

import { useState, useEffect, useCallback } from 'react';
// UIUX-SA-003: Use centralized auth instead of wrong 'superadmin_token' key
import { getSessionToken, fetchWithTimeout } from '../api/authToken';
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

// UIUX-SA-003: Centralized auth via getSessionToken (reads 'supermandi_admin_session')
async function apiFetch(url: string, options?: RequestInit) {
  const token = getSessionToken() || '';
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options?.headers },
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
        try {
          await apiFetch(`/api/v1/admin/credit-providers/${providerId}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: !currentActive }),
          });
          fetchAll();
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Failed to update');
        }
      },
    });
  };

  if (loading) return <div style={{ padding: '2rem', color: '#64748b' }}>Loading finance dashboard...</div>;

  // Aggregate totals
  const totalDisbursed = stats.reduce((s, r) => s + parseInt(r.total_disbursed_minor, 10), 0);
  const totalOutstanding = stats.reduce((s, r) => s + parseInt(r.outstanding_minor, 10), 0);
  const totalRepaid = stats.reduce((s, r) => s + parseInt(r.total_repaid_minor, 10), 0);
  const totalActive = stats.reduce((s, r) => s + parseInt(r.active, 10), 0);
  const totalOverdue = stats.reduce((s, r) => s + parseInt(r.overdue, 10), 0);

  return (
    <div style={{ padding: '1.5rem' }}>
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
      <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Finance & Credit Providers</h2>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error} <button onClick={fetchAll} style={{ marginLeft: '0.5rem', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>Retry</button>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: '0.75rem', color: '#166534' }}>Total Disbursed</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{fmt(totalDisbursed)}</div>
        </div>
        <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '8px', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>Outstanding</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#dc2626' }}>{fmt(totalOutstanding)}</div>
        </div>
        <div style={{ background: '#eff6ff', padding: '1rem', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: '0.75rem', color: '#1e40af' }}>Repaid</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{fmt(totalRepaid)}</div>
        </div>
        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#475569' }}>Active Loans</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{totalActive}</div>
        </div>
        <div style={{ background: totalOverdue > 0 ? '#fef2f2' : '#f8fafc', padding: '1rem', borderRadius: '8px', border: `1px solid ${totalOverdue > 0 ? '#fecaca' : '#e2e8f0'}` }}>
          <div style={{ fontSize: '0.75rem', color: totalOverdue > 0 ? '#991b1b' : '#475569' }}>Overdue</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: totalOverdue > 0 ? '#dc2626' : undefined }}>{totalOverdue}</div>
        </div>
      </div>

      {/* Provider Health */}
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Provider Health</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
        {health.map(h => (
          <div key={h.providerId} style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: `1px solid ${h.status === 'healthy' ? '#bbf7d0' : h.status === 'degraded' ? '#fed7aa' : '#fecaca'}`,
            background: h.status === 'healthy' ? '#f0fdf4' : h.status === 'degraded' ? '#fff7ed' : '#fef2f2',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{h.providerId}</span>
              <span style={{
                fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '10px',
                background: h.status === 'healthy' ? '#dcfce7' : h.status === 'degraded' ? '#ffedd5' : '#fee2e2',
                color: h.status === 'healthy' ? '#166534' : h.status === 'degraded' ? '#9a3412' : '#991b1b',
              }}>{h.status}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              Latency: {h.latencyMs}ms
              {h.approvalRate != null && ` | Approval: ${h.approvalRate}%`}
            </div>
          </div>
        ))}
      </div>

      {/* Provider Configuration */}
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Providers ({providers.length})</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Provider</th>
            <th style={{ textAlign: 'left', padding: '0.5rem' }}>Mode</th>
            <th style={{ textAlign: 'center', padding: '0.5rem' }}>Priority</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Min</th>
            <th style={{ textAlign: 'right', padding: '0.5rem' }}>Max</th>
            <th style={{ textAlign: 'center', padding: '0.5rem' }}>Active</th>
            <th style={{ textAlign: 'center', padding: '0.5rem' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {providers.map(p => {
            return (
              <tr key={p.provider_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.5rem' }}>
                  <div style={{ fontWeight: 500 }}>{p.provider_name}</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{p.provider_id}</div>
                </td>
                <td style={{ padding: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#f1f5f9' }}>{p.mode}</span>
                </td>
                <td style={{ textAlign: 'center', padding: '0.5rem' }}>{p.priority}</td>
                <td style={{ textAlign: 'right', padding: '0.5rem', fontFamily: 'monospace' }}>{fmt(p.min_amount_minor)}</td>
                <td style={{ textAlign: 'right', padding: '0.5rem', fontFamily: 'monospace' }}>{fmt(p.max_amount_minor)}</td>
                <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                  <span style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                    background: p.is_active ? '#22c55e' : '#94a3b8',
                  }} />
                </td>
                <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                  <button
                    onClick={() => toggleProvider(p.provider_id, p.is_active)}
                    style={{
                      fontSize: '0.75rem', padding: '0.25rem 0.6rem', borderRadius: '4px',
                      border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer',
                    }}
                  >
                    {p.is_active ? 'Disable' : 'Enable'}
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
          <h3 style={{ margin: '1.5rem 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Per-Provider Stats</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Provider</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Total</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Active</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Overdue</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Paid</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Disbursed</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Outstanding</th>
                <th style={{ textAlign: 'right', padding: '0.5rem' }}>Repaid</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(s => (
                <tr key={s.provider_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 500 }}>{s.provider_id}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem' }}>{s.total_drawdowns}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem' }}>{s.active}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem', color: parseInt(s.overdue) > 0 ? '#dc2626' : undefined }}>{s.overdue}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem' }}>{s.paid}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem', fontFamily: 'monospace' }}>{fmt(s.total_disbursed_minor)}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem', fontFamily: 'monospace', color: parseInt(s.outstanding_minor) > 0 ? '#dc2626' : undefined }}>{fmt(s.outstanding_minor)}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem', fontFamily: 'monospace' }}>{fmt(s.total_repaid_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
