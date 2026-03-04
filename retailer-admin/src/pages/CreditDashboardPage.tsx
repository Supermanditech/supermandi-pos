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

function statusBadge(status: string): { className: string; label: string } {
  switch (status) {
    case 'active': return { className: 'credit-badge-green', label: 'Active' };
    case 'partial': return { className: 'credit-badge-amber', label: 'Partial' };
    case 'overdue': return { className: 'credit-badge-red', label: 'Overdue' };
    case 'paid': return { className: 'credit-badge-blue', label: 'Paid' };
    default: return { className: 'credit-badge-muted', label: status };
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

  // RET-C3-006: Clamp utilization to 0–100 to handle inconsistent API data
  const utilization = balance ? Math.min(Math.round((balance.usedMinor / Math.max(balance.totalCreditLimitMinor, 1)) * 100), 100) : 0;

  // STG-483: Auth loading guard
  if (!accessToken) return <div className="text-center-muted">Loading...</div>;

  return (
    <>
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Credit & Finance' }]} />
      </div>
      <header className="page-header">
        <h1 className="page-title">Credit & Finance</h1>
      </header>

      <div className="page-content">
        {error && (
          <div className="alert-error-inline">
            {error}
            <button aria-label="Retry loading credit dashboard" onClick={fetchDashboard} className="btn btn-secondary">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="loading-center">Loading credit dashboard...</div>
        ) : !balance ? (
          <EmptyState
            icon={<IndianRupee size={24} />}
            title="No credit data"
            description="Credit features are not yet active for your store."
          />
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-4 grid-mb-lg">
              <div className="stat-card">
                <div className="stat-label">Credit Limit</div>
                <div className="stat-value">{fmt(balance.totalCreditLimitMinor)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Available</div>
                <div className="stat-value stat-value--success">{fmt(balance.availableMinor)}</div>
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
            <div className="card card-mb-lg" style={{ padding: '1rem' }}>
              <div className="credit-util-header">
                <span>Used: {fmt(balance.usedMinor)}</span>
                <span>Limit: {fmt(balance.totalCreditLimitMinor)}</span>
              </div>
              <div className="credit-util-track">
                <div style={{
                  width: `${Math.min(utilization, 100)}%`,
                  height: '100%',
                  background: utilization > 80 ? '#ef4444' : utilization > 50 ? '#f59e0b' : '#22c55e',
                  borderRadius: '4px',
                  transition: 'width 0.3s',
                }} />
              </div>
              {balance.overdueDrawdowns > 0 && (
                <div className="credit-overdue-warn">
                  <AlertTriangle size={14} /> {balance.overdueDrawdowns} overdue payment(s)
                </div>
              )}
            </div>

            {/* RET-C3-008: Show per-provider breakdown for 1+ providers */}
            {balance.perProvider && balance.perProvider.length > 0 && (
              <div className="card card-mb-lg" style={{ padding: '1rem' }}>
                <h3 className="credit-provider-title">By Provider</h3>
                <div className="credit-provider-grid">
                  {balance.perProvider.map(p => (
                    <div key={p.providerId} className="credit-provider-card">
                      <div className="credit-provider-label">{p.providerId}</div>
                      <div className="credit-provider-value">{fmt(p.availableMinor)} <span className="credit-provider-avail">available</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* RET-C3-007: Always show EMI section with empty state */}
            <div className="card card-mb-lg">
              <div className="card-section-header">
                <h3 className="card-section-title">
                  <Clock size={16} /> Upcoming Payments (30 days)
                </h3>
              </div>
              {emis.length > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Due Date</th>
                      <th>Provider</th>
                      <th>Supplier</th>
                      <th className="cell-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emis.map((emi, i) => (
                      <tr key={i}>
                        <td className="cell-bold">{fmtDate(emi.dueDate)}</td>
                        <td>{emi.providerName}</td>
                        <td>{emi.supplierName}</td>
                        <td className="cell-mono-right">{fmt(emi.totalMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="credit-emi-empty">
                  No upcoming EMI payments in the next 30 days.
                </div>
              )}
            </div>

            {/* Active Drawdowns */}
            <div className="card card-no-padding">
              <div className="card-section-header">
                <h3 className="card-section-title">
                  <TrendingUp size={16} /> Active Credit ({drawdowns.length})
                </h3>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Supplier</th>
                    <th className="cell-right">Amount</th>
                    <th className="cell-right">Outstanding</th>
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
                          <td className="cell-mono-right">{fmt(dd.principalMinor)}</td>
                          <td className="cell-mono-right-bold" style={{ color: dd.outstandingMinor > 0 ? 'var(--danger)' : undefined }}>{fmt(dd.outstandingMinor)}</td>
                          <td>{fmtDate(dd.dueDate)}</td>
                          <td>
                            <span className={`credit-status-badge ${badge.className}`}>
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
