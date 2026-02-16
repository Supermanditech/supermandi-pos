// T-316: SuperAdmin AI Insights & Anomaly Detection Tab
// Shows AI-powered anomalies, alerts, and customer insights across stores

import { useState, useEffect, useCallback } from 'react';

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

async function apiFetch(url: string, options?: RequestInit) {
  const token = localStorage.getItem('superadmin_token') || '';
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
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

  const fetchData = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      if (view === 'anomalies') {
        const result = await apiFetch(`/api/v1/admin/ai/anomalies?storeId=${storeId}&limit=50`);
        setAnomalies(result.anomalies || []);
      } else if (view === 'alerts') {
        const result = await apiFetch(`/api/v1/admin/ai/alerts?storeId=${storeId}&limit=50`);
        setAlerts(result.alerts || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [view, storeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const runJob = async (endpoint: string, name: string) => {
    setJobResult(null);
    setError(null);
    try {
      const result = await apiFetch(`/api/v1/${endpoint}`, { method: 'POST' });
      setJobResult(`${name}: ${JSON.stringify(result)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Job failed');
    }
  };

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return '#DC2626';
      case 'warning': return '#F59E0B';
      default: return '#0EA5E9';
    }
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>AI Intelligence</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['anomalies', 'alerts', 'jobs'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '0.4rem 0.8rem', borderRadius: 6, border: '1px solid #e2e8f0',
              background: view === v ? '#1e40af' : '#fff',
              color: view === v ? '#fff' : '#475569',
              cursor: 'pointer', fontSize: '0.8rem',
            }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {view !== 'jobs' && (
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={storeId}
            onChange={e => setStoreId(e.target.value)}
            placeholder="Enter Store ID..."
            style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.85rem', width: 300 }}
          />
          <button onClick={fetchData} disabled={!storeId} style={{
            padding: '0.5rem 1rem', borderRadius: 6, border: 'none',
            background: storeId ? '#1e40af' : '#94a3b8', color: '#fff', cursor: 'pointer', fontSize: '0.85rem',
          }}>Load</button>
        </div>
      )}

      {view === 'anomalies' && (
        <div>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>
          ) : anomalies.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              {storeId ? 'No anomalies detected' : 'Enter a Store ID to view anomalies'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Severity</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Description</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Detected</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem' }}>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', borderRadius: 4, background: '#f1f5f9' }}>
                        {a.anomalyType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{ color: severityColor(a.severity), fontWeight: 600, fontSize: '0.8rem' }}>
                        {a.severity}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.description}
                    </td>
                    <td style={{ padding: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(a.detectedAt).toLocaleString('en-IN')}
                    </td>
                    <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: a.isReviewed ? '#22c55e' : '#f59e0b' }} />
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
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading...</div>
          ) : alerts.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              {storeId ? 'No alerts' : 'Enter a Store ID to view alerts'}
            </div>
          ) : (
            alerts.map(a => (
              <div key={a.id} style={{
                padding: '0.75rem', marginBottom: '0.5rem', borderRadius: 6,
                border: `1px solid ${a.isRead ? '#e2e8f0' : severityColor(a.severity)}`,
                borderLeftWidth: 3,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{a.title}</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    {new Date(a.createdAt).toLocaleString('en-IN')}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>{a.message}</div>
              </div>
            ))
          )}
        </div>
      )}

      {view === 'jobs' && (
        <div>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
            Manually trigger AI computation jobs. In production, these run on Cloud Scheduler.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              { endpoint: 'admin/jobs/ai-alerts', name: 'Run Alert Analysis' },
              { endpoint: 'admin/jobs/ai-forecasts', name: 'Run Demand Forecasting' },
              { endpoint: 'admin/jobs/ai-smart-reorder', name: 'Run Smart Reorder' },
              { endpoint: 'admin/jobs/ai-auto-closing', name: 'Run Auto Daily Closing' },
              { endpoint: 'admin/jobs/ai-customer-insights', name: 'Run Customer Insights' },
              { endpoint: 'admin/jobs/ai-anomaly-detection', name: 'Run Anomaly Detection' },
              { endpoint: 'admin/jobs/ai-recommendations', name: 'Run Recommendations' },
            ].map(job => (
              <button key={job.endpoint} onClick={() => runJob(job.endpoint, job.name)} style={{
                padding: '0.5rem 1rem', borderRadius: 6, border: '1px solid #e2e8f0',
                background: '#fff', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left',
              }}>
                {job.name}
              </button>
            ))}
          </div>
          {jobResult && (
            <pre style={{ marginTop: '1rem', padding: '0.75rem', background: '#f1f5f9', borderRadius: 6, fontSize: '0.8rem', overflow: 'auto' }}>
              {jobResult}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
