'use client';

// T-280: Supplier-Side BNPL Visibility
// Shows which purchase orders are BNPL-backed (payment guaranteed)
// UIUX-SUP-003: Fixed CSS classes to use Tailwind (badge/page-header/text-muted don't exist)
// UIUX-SUP-004: Replaced raw fetch with apiFetch (auth, 401 redirect, timeout)
// UIUX-SUP-014: Fixed double-division — formatCurrency already divides by 100

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Breadcrumb from '@/components/Breadcrumb';
import EmptyState from '@/components/EmptyState';
import { formatCurrency } from '@/lib/formatters';
import { apiFetch } from '@/lib/api';
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

interface BnplResponse {
  orders: BnplOrder[];
  summary: BnplSummary;
}

async function fetchBnplOrders(status?: string): Promise<{ orders: BnplOrder[]; summary: BnplSummary }> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', '100');

  // UIUX-SUP-004: Use apiFetch for proper auth handling (401 redirect, token refresh, timeout)
  const json = await apiFetch<BnplResponse>(`/api/v1/supplier/bnpl/backed-orders?${params}`);
  return { orders: json.orders || [], summary: json.summary || {} as BnplSummary };
}

function fmtDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// UIUX-SUP-003: Status badge styles using Tailwind instead of non-existent CSS classes
const statusStyles: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  paid: 'bg-green-100 text-green-700',
};

function statusBadge(status: string) {
  const cls = statusStyles[status] || 'bg-slate-100 text-slate-600';
  return { className: `inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`, label: status.charAt(0).toUpperCase() + status.slice(1) };
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

      <div className="mb-6 mt-4">
        <h1 className="text-2xl font-bold text-slate-800">BNPL-Backed Orders</h1>
        <p className="text-slate-500 mt-1">
          Orders financed through credit providers — payment guaranteed
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-slate-500 text-xs">Total Financed</div>
            <div className="text-xl font-bold mt-1">{formatCurrency(summary.totalFinancedMinor)}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-slate-500 text-xs">Outstanding</div>
            <div className={`text-xl font-bold mt-1 ${summary.outstandingMinor > 0 ? 'text-red-600' : ''}`}>
              {formatCurrency(summary.outstandingMinor)}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-slate-500 text-xs">Repaid</div>
            <div className="text-xl font-bold mt-1 text-green-600">{formatCurrency(summary.totalRepaidMinor)}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-slate-500 text-xs">Active Orders</div>
            <div className="text-xl font-bold mt-1">{summary.activeOrders}</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['', 'active', 'overdue', 'paid'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filterStatus === s
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : isError ? (
          <div className="p-4 text-red-600">
            Failed to load BNPL orders.
            <button onClick={() => refetch()} className="ml-2 px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200">Retry</button>
          </div>
        ) : orders.length === 0 ? (
          <EmptyState icon={Package} title="No BNPL orders" description="No credit-backed orders found for the selected filter." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="text-left p-3 font-medium text-slate-600">Store</th>
                <th className="text-left p-3 font-medium text-slate-600">Provider</th>
                <th className="text-right p-3 font-medium text-slate-600">Amount</th>
                <th className="text-right p-3 font-medium text-slate-600">Outstanding</th>
                <th className="text-left p-3 font-medium text-slate-600">Due Date</th>
                <th className="text-left p-3 font-medium text-slate-600">Status</th>
                <th className="text-left p-3 font-medium text-slate-600">Guaranteed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const badge = statusBadge(order.status);
                return (
                  <tr key={order.drawdownId} className="border-b border-slate-100">
                    <td className="p-3">
                      <div className="font-medium">{order.storeName}</div>
                      <div className="text-xs text-slate-400">{order.storeCode}</div>
                    </td>
                    <td className="p-3">{order.providerName}</td>
                    <td className="p-3 text-right font-mono">{formatCurrency(order.principalMinor)}</td>
                    <td className={`p-3 text-right font-mono font-semibold ${order.outstandingMinor > 0 ? 'text-red-600' : ''}`}>
                      {formatCurrency(order.outstandingMinor)}
                    </td>
                    <td className="p-3">{fmtDate(order.dueDate)}</td>
                    <td className="p-3"><span className={badge.className}>{badge.label}</span></td>
                    <td className="p-3">
                      {order.paymentGuaranteed ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                          <ShieldCheck size={14} /> Yes
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Internal</span>
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
