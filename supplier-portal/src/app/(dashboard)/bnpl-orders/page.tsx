'use client';

// T-280: Supplier-Side BNPL Visibility
// Shows which purchase orders are BNPL-backed (payment guaranteed)

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Breadcrumb from '@/components/Breadcrumb';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatters';
import { ShieldCheck, Package } from 'lucide-react';

interface BnplOrder {
  drawdownId: string;
  purchaseOrderId: string;
  principalMinor: number;
  paidAmountMinor: number;
  outstandingMinor: number;
  dueDate: string;
  status: string;
  providerId: string;
  providerName: string;
  storeName: string;
  storeCode: string;
  paymentGuaranteed: boolean;
  createdAt: string;
}

interface BnplSummary {
  totalOrders: number;
  activeOrders: number;
  outstandingMinor: number;
  totalFinancedMinor: number;
  totalRepaidMinor: number;
}

async function fetchBnplOrders(status?: string): Promise<{ orders: BnplOrder[]; summary: BnplSummary }> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', '100');

  const res = await fetch(`/api/v1/supplier/bnpl/backed-orders?${params}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const json = await res.json();
  return { orders: json.orders || [], summary: json.summary || {} };
}

function fmtDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'active': return { className: 'badge badge-info', label: 'Active' };
    case 'partial': return { className: 'badge badge-warning', label: 'Partial' };
    case 'overdue': return { className: 'badge badge-danger', label: 'Overdue' };
    case 'paid': return { className: 'badge badge-success', label: 'Paid' };
    default: return { className: 'badge', label: status };
  }
}

export default function BnplOrdersPage() {
  const [filterStatus, setFilterStatus] = useState<string>('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['bnpl-orders', filterStatus],
    queryFn: () => fetchBnplOrders(filterStatus || undefined),
  });

  const orders = data?.orders || [];
  const summary = data?.summary;

  return (
    <div>
      <Breadcrumb items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'BNPL Orders' }]} />

      <div className="page-header">
        <h1 className="page-title">BNPL-Backed Orders</h1>
        <p className="text-muted" style={{ marginTop: '0.25rem' }}>
          Orders financed through credit providers — payment guaranteed
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="card" style={{ padding: '1rem' }}>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>Total Financed</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatCurrency(summary.totalFinancedMinor / 100)}</div>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>Outstanding</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: summary.outstandingMinor > 0 ? '#dc2626' : undefined }}>
              {formatCurrency(summary.outstandingMinor / 100)}
            </div>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>Repaid</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#16a34a' }}>{formatCurrency(summary.totalRepaidMinor / 100)}</div>
          </div>
          <div className="card" style={{ padding: '1rem' }}>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>Active Orders</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{summary.activeOrders}</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['', 'active', 'overdue', 'paid'].map(s => (
          <button
            key={s}
            className={`btn ${filterStatus === s ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilterStatus(s)}
            style={{ fontSize: '0.8rem' }}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
        ) : isError ? (
          <div style={{ padding: '1rem', color: '#dc2626' }}>
            Failed to load BNPL orders.
            <button onClick={() => refetch()} className="btn btn-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>Retry</button>
          </div>
        ) : orders.length === 0 ? (
          <EmptyState icon={Package} title="No BNPL orders" description="No credit-backed orders found for the selected filter." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Provider</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Outstanding</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Guaranteed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const badge = statusBadge(order.status);
                return (
                  <tr key={order.drawdownId}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{order.storeName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{order.storeCode}</div>
                    </td>
                    <td>{order.providerName}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(order.principalMinor / 100)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: order.outstandingMinor > 0 ? '#dc2626' : undefined }}>
                      {formatCurrency(order.outstandingMinor / 100)}
                    </td>
                    <td>{fmtDate(order.dueDate)}</td>
                    <td><span className={badge.className}>{badge.label}</span></td>
                    <td>
                      {order.paymentGuaranteed ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#16a34a', fontSize: '0.8rem' }}>
                          <ShieldCheck size={14} /> Yes
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Internal</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
