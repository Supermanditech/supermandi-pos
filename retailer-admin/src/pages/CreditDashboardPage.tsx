// T-277: Credit Dashboard — Retailer Admin Portal
// Aggregated view across ALL credit providers

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import Breadcrumb from '../components/Breadcrumb';
import EmptyState from '../components/EmptyState';
import { IndianRupee, TrendingUp, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

interface BalanceData {
  totalCreditLimitMinor: number;
  usedMinor: number;
  availableMinor: number;
  activeDrawdowns: number;
  overdueDrawdowns: number;
  perProvider: { providerId: string; totalCreditLimitMinor: number; usedMinor: number; availableMinor: number }[];
}

interface ActiveDrawdown {
  id: string;
  principalMinor: number;
  paidAmountMinor: number;
  outstandingMinor: number;
  dueDate: string;
  status: string;
  providerId: string;
  providerName: string;
  supplierName: string;
  externalLoanId?: string;
}

interface UpcomingEmi {
  installmentNumber: number;
  dueDate: string;
  principalMinor: number;
  interestMinor: number;
  totalMinor: number;
  providerName: string;
  supplierName: string;
}

function fmt(minor: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format((minor || 0) / 100);
}

function fmtDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function statusBadge(status: string): { color: string; bg: string; label: string } {
  switch (status) {
    case 'active': return { color: '#166534', bg: '#dcfce7', label: 'Active' };
    case 'partial': return { color: '#92400e', bg: '#fef3c7', label: 'Partial' };
    case 'overdue': return { color: '#991b1b', bg: '#fee2e2', label: 'Overdue' };
    case 'paid': return { color: '#1e40af', bg: '#dbeafe', label: 'Paid' };
    default: return { color: '#475569', bg: '#f1f5f9', label: status };
  }
}

export default function CreditDashboardPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();

  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [drawdowns, setDrawdowns] = useState<ActiveDrawdown[]>([]);
  const [emis, setEmis] = useState<UpcomingEmi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/v1/retailer-admin/reports/credit-summary', accessToken);
      if (res.status === 401) return;
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const json = await safeJson<any>(res);
      if (!json) throw new Error('Invalid response');
      setBalance(json.balance || null);
      setDrawdowns(json.activeDrawdowns || []);
      setEmis(json.upcomingEmis || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load credit dashboard');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const utilization = balance ? Math.round((balance.usedMinor / Math.max(balance.totalCreditLimitMinor, 1)) * 100) : 0;

  return (
    <>
      <div style={{ padding: '0 1rem' }}>
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Credit & Finance' }]} />
      </div>
      <header className="page-header">
        <h1 className="page-title">Credit & Finance</h1>
      </header>

      <div className="page-content">
        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
            <button onClick={fetchDashboard} className="btn btn-secondary" style={{ marginLeft: '1rem', fontSize: '0.8rem' }}>Retry</button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading credit dashboard...</div>
        ) : !balance ? (
          <EmptyState
            icon={<IndianRupee size={24} />}
            title="No credit data"
            description="Credit features are not yet active for your store."
          />
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
              <div className="stat-card">
                <div className="stat-label">Credit Limit</div>
                <div className="stat-value">{fmt(balance.totalCreditLimitMinor)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Available</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{fmt(balance.availableMinor)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Outstanding</div>
                <div className="stat-value" style={{ color: balance.usedMinor > 0 ? 'var(--danger)' : undefined }}>{fmt(balance.usedMinor)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Utilization</div>
                <div className="stat-value" style={{ color: utilization > 80 ? 'var(--danger)' : undefined }}>{utilization}%</div>
              </div>
            </div>

            {/* Utilization Bar */}
            <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                <span>Used: {fmt(balance.usedMinor)}</span>
                <span>Limit: {fmt(balance.totalCreditLimitMinor)}</span>
              </div>
              <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(utilization, 100)}%`,
                  height: '100%',
                  background: utilization > 80 ? '#ef4444' : utilization > 50 ? '#f59e0b' : '#22c55e',
                  borderRadius: '4px',
                  transition: 'width 0.3s',
                }} />
              </div>
              {balance.overdueDrawdowns > 0 && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#dc2626', fontSize: '0.8rem' }}>
                  <AlertTriangle size={14} /> {balance.overdueDrawdowns} overdue payment(s)
                </div>
              )}
            </div>

            {/* Per-Provider Breakdown */}
            {balance.perProvider && balance.perProvider.length > 1 && (
              <div className="card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>By Provider</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  {balance.perProvider.map(p => (
                    <div key={p.providerId} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{p.providerId}</div>
                      <div style={{ fontWeight: 600, fontSize: '1rem' }}>{fmt(p.availableMinor)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>available</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming EMIs */}
            {emis.length > 0 && (
              <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={16} /> Upcoming Payments (30 days)
                  </h3>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Due Date</th>
                      <th>Provider</th>
                      <th>Supplier</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emis.map((emi, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500 }}>{fmtDate(emi.dueDate)}</td>
                        <td>{emi.providerName}</td>
                        <td>{emi.supplierName}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(emi.totalMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Active Drawdowns */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingUp size={16} /> Active Credit ({drawdowns.length})
                </h3>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Supplier</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Outstanding</th>
                    <th>Due Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {drawdowns.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={<CheckCircle size={24} />}
                          title="No active credit"
                          description="All dues are cleared. No outstanding credit."
                        />
                      </td>
                    </tr>
                  ) : (
                    drawdowns.map(dd => {
                      const badge = statusBadge(dd.status);
                      return (
                        <tr key={dd.id}>
                          <td>{dd.providerName}</td>
                          <td>{dd.supplierName}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(dd.principalMinor)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: dd.outstandingMinor > 0 ? '#dc2626' : undefined }}>{fmt(dd.outstandingMinor)}</td>
                          <td>{fmtDate(dd.dueDate)}</td>
                          <td>
                            <span style={{ padding: '0.2rem 0.6rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500, background: badge.bg, color: badge.color }}>
                              {badge.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
