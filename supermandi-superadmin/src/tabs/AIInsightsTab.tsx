// T-316: SuperAdmin AI Insights & Anomaly Detection Tab
// Shows AI-powered anomalies, alerts, and customer insights across stores

import { useState, useEffect, useCallback } from 'react';
// UIUX-SA-002: Use centralized auth instead of wrong 'superadmin_token' key
// P2-4: Use getAuthHeaders() to include X-Request-ID correlation tracing
import { getAuthHeaders, fetchWithTimeout } from '../api/authToken';
// UIUX-SA-006: Use parseError for sanitized error messages instead of generic 'API error: {status}'
import { parseError } from '../api/errorSanitizer';
import { formatDateTime } from '../lib/formatters';

// AI-INSIGHTS-HARDCODED-ENDPOINTS: Use VITE_API_BASE_URL so dev proxy and prod base paths work
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

interface AnomalyEvent {
  id: string;
  storeId: string;
  anomalyType: string;
  severity: string;
  description: string;
  metadata: Record<string, unknown>;
  isReviewed: boolean;
  detectedAt: string;
}

interface Alert {
  id: string;
  storeId: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// P2-4: Use getAuthHeaders() for full auth context (Authorization + X-Request-ID correlation)
// fetchWithTimeout handles 401 auto-logout via handleAutoLogout()
async function apiFetch(path: string, options?: RequestInit) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetchWithTimeout(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options?.headers },
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function AIInsightsTab() {
  const [view, setView] = useState<'anomalies' | 'alerts' | 'jobs'>('anomalies');
  const [storeId, setStoreId] = useState('');
  const [anomalies, setAnomalies] = useState<AnomalyEvent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<string | null>(null);
  const [jobRunning, setJobRunning] = useState(false);
  const [pendingJob, setPendingJob] = useState<{ endpoint: string; name: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      if (view === 'anomalies') {
        const result = await apiFetch(`/api/v1/admin/ai/anomalies?storeId=${encodeURIComponent(storeId)}&limit=50`);
        setAnomalies(result.anomalies || []);
      } else if (view === 'alerts') {
        const result = await apiFetch(`/api/v1/admin/ai/alerts?storeId=${encodeURIComponent(storeId)}&limit=50`);
        setAlerts(result.alerts || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [view, storeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const VALID_JOB_ENDPOINTS = new Set([
    'admin/jobs/ai-alerts', 'admin/jobs/ai-forecasts', 'admin/jobs/ai-smart-reorder',
    'admin/jobs/ai-auto-closing', 'admin/jobs/ai-customer-insights',
    'admin/jobs/ai-anomaly-detection', 'admin/jobs/ai-recommendations',
  ]);
  const runJob = async (endpoint: string, name: string) => {
    if (jobRunning) return;
    setJobResult(null);
    setError(null);
    if (!VALID_JOB_ENDPOINTS.has(endpoint)) { setError('Invalid job endpoint'); return; }
    setJobRunning(true);
    try {
      const result = await apiFetch(`/api/v1/${endpoint}`, { method: 'POST' });
      setJobResult(`${name}: ${JSON.stringify(result)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Job failed');
    } finally {
      setJobRunning(false);
    }
  };

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'var(--color-error)';
      case 'warning': return 'var(--color-warning)';
      default: return 'var(--color-primary)';
    }
  };

  return (
    <div className="sa-p-24">
      <div className="sa-flex-between sa-mb-16">
        <h2 className="sa-text-lg sa-fw-600" style={{ margin: 0 }}>AI Intelligence</h2>
        <div className="sa-flex sa-gap-8">
          {(['anomalies', 'alerts', 'jobs'] as const).map(v => (
            <button key={v} onClick={() => { setView(v); setError(null); setJobResult(null); }} className="sa-btn-sm sa-radius-6 sa-border" style={{
              background: view === v ? 'var(--color-primary-dark)' : 'var(--color-surface)',
              color: view === v ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
            }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
      </div>

      {error && (
        <div className="sa-alert-error sa-mb-16">
          {error}
        </div>
      )}

      {view !== 'jobs' && (
        <div className="sa-flex sa-gap-8 sa-mb-16">
          <label htmlFor="filter-aiinsights-store" className="sa-sr-only">Store ID</label>
          <input
            id="filter-aiinsights-store"
            value={storeId}
            onChange={e => setStoreId(e.target.value)}
            placeholder="Enter Store ID..."
            className="sa-input sa-radius-6" style={{ width: 300 }}
          />
          <button onClick={fetchData} disabled={!storeId} className="sa-btn-sm sa-radius-6" style={{
            background: storeId ? 'var(--color-primary-dark)' : 'var(--color-text-secondary)', color: 'var(--color-text-inverse)',
          }}>Load</button>
        </div>
      )}

      {view === 'anomalies' && (
        <div>
          {loading ? (
            <div className="sa-p-20 sa-text-center sa-text-muted">Loading...</div>
          ) : anomalies.length === 0 ? (
            <div className="sa-p-20 sa-text-center sa-text-muted">
              {storeId ? 'No anomalies detected' : 'Enter a Store ID to view anomalies'}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th className="sa-th">Type</th>
                  <th className="sa-th">Severity</th>
                  <th className="sa-th">Description</th>
                  <th className="sa-th">Detected</th>
                  <th className="sa-th sa-text-center">Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map(a => (
                  <tr key={a.id}>
                    <td className="sa-td">
                      <span className="sa-badge-muted">
                        {a.anomalyType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="sa-td">
                      <span className="sa-fw-600 sa-text-sm" style={{ color: severityColor(a.severity) }}>
                        {a.severity}
                      </span>
                    </td>
                    <td className="sa-td sa-nowrap" style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.description}
                    </td>
                    <td className="sa-td sa-text-sm sa-text-muted">
                      {formatDateTime(a.detectedAt)}
                    </td>
                    <td className="sa-td sa-text-center">
                      <span className={a.isReviewed ? 'sa-dot sa-dot--success' : 'sa-dot sa-dot--warning'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === 'alerts' && (
        <div>
          {loading ? (
            <div className="sa-p-20 sa-text-center sa-text-muted">Loading...</div>
          ) : alerts.length === 0 ? (
            <div className="sa-p-20 sa-text-center sa-text-muted">
              {storeId ? 'No alerts' : 'Enter a Store ID to view alerts'}
            </div>
          ) : (
            alerts.map(a => (
              <div key={a.id} className="sa-p-12 sa-mb-8 sa-radius-6" style={{
                border: `1px solid ${a.isRead ? 'var(--color-border)' : severityColor(a.severity)}`,
                borderLeftWidth: 3,
              }}>
                <div className="sa-flex-between">
                  <span className="sa-fw-500 sa-text-md">{a.title}</span>
                  <span className="sa-text-xs sa-text-muted">
                    {formatDateTime(a.createdAt)}
                  </span>
                </div>
                <div className="sa-text-sm sa-text-muted sa-mt-4">{a.message}</div>
              </div>
            ))
          )}
        </div>
      )}

      {view === 'jobs' && (
        <div>
          <p className="sa-text-md sa-text-muted sa-mb-16">
            Manually trigger AI computation jobs. In production, these run on Cloud Scheduler.
          </p>
          <div className="sa-flex-col sa-gap-8">
            {[
              { endpoint: 'admin/jobs/ai-alerts', name: 'Run Alert Analysis' },
              { endpoint: 'admin/jobs/ai-forecasts', name: 'Run Demand Forecasting' },
              { endpoint: 'admin/jobs/ai-smart-reorder', name: 'Run Smart Reorder' },
              { endpoint: 'admin/jobs/ai-auto-closing', name: 'Run Auto Daily Closing' },
              { endpoint: 'admin/jobs/ai-customer-insights', name: 'Run Customer Insights' },
              { endpoint: 'admin/jobs/ai-anomaly-detection', name: 'Run Anomaly Detection' },
              { endpoint: 'admin/jobs/ai-recommendations', name: 'Run Recommendations' },
            ].map(job => (
              <button key={job.endpoint} onClick={() => setPendingJob(job)} disabled={jobRunning} className="sa-btn-ghost-sm sa-radius-6 sa-text-left">
                {jobRunning ? 'Running...' : job.name}
              </button>
            ))}
          </div>
          {jobResult && (
            <pre className="sa-mt-16 sa-p-12 sa-bg-surface-alt sa-radius-6 sa-text-sm sa-overflow-auto">
              {jobResult}
            </pre>
          )}
          {pendingJob && (
            <div className="sa-modal-overlay" onClick={() => setPendingJob(null)} onKeyDown={(e) => { if (e.key === "Escape") setPendingJob(null); }}>
              <div className="sa-modal-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <h3 style={{ margin: '0 0 12px' }}>Confirm Job Execution</h3>
                <p className="sa-text-md">Run <strong>{pendingJob.name}</strong>? This triggers an expensive AI computation across all stores.</p>
                <div className="sa-flex sa-gap-8 sa-mt-16" style={{ justifyContent: 'flex-end' }}>
                  <button className="sa-btn-ghost-sm" onClick={() => setPendingJob(null)}>Cancel</button>
                  <button className="sa-btn-sm" style={{ background: 'var(--color-primary-dark)', color: 'var(--color-text-inverse)' }} onClick={() => { const j = pendingJob; setPendingJob(null); runJob(j.endpoint, j.name); }}>Run Job</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
