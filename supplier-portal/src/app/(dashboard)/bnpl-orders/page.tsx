'use client';

// T-280: Supplier-Side BNPL Visibility
// UIUX-SUP-003: Replaced undefined CSS classes with Tailwind utilities
// UIUX-SUP-004: Replaced raw fetch() with apiFetch for auth + 401 redirect + timeout

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Breadcrumb from '@/components/Breadcrumb';
import EmptyState from '@/components/EmptyState';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { apiFetch } from '@/lib/api';
import { ShieldCheck, Package, Banknote, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';

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

const BNPL_PAGE_SIZE = 20;

async function fetchBnplOrders(status?: string, page = 1): Promise<{ orders: BnplOrder[]; summary: BnplSummary; total: number }> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(BNPL_PAGE_SIZE));
  params.set('offset', String((page - 1) * BNPL_PAGE_SIZE));

  const json = await apiFetch<{ orders: BnplOrder[]; summary: BnplSummary; total?: number }>(
    `/api/v1/supplier/bnpl/backed-orders?${params}`
  );
  return { orders: json.orders || [], summary: json.summary || {} as BnplSummary, total: json.total ?? json.orders?.length ?? 0 };
}

// R6.SUP.019: Use shared formatDate for consistent IST-aware date display

const statusBadgeStyles: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  partial: 'bg-amber-100 text-amber-700',
  overdue: 'bg-red-100 text-red-700',
  paid: 'bg-green-100 text-green-700',
};

function StatusBadge({ status }: { status: string }) {
  const styles = statusBadgeStyles[status] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${styles}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function BnplOrdersPage() {
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['bnpl-orders', filterStatus, currentPage],
    queryFn: () => fetchBnplOrders(filterStatus || undefined, currentPage),
  });

  const orders = data?.orders || [];
  const summary = data?.summary;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / BNPL_PAGE_SIZE));

  return (
    <div>
      {/* REQ.AUDIT.W5.SUPPLIER.BREADCRUMB-WRONG-PROP.001: normalize href→path */}
      <Breadcrumb items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'BNPL Orders' }]} />

      <div className="mt-4 mb-6">
        <h1 className="text-xl font-bold text-slate-900">BNPL-Backed Orders</h1>
        <p className="text-sm text-slate-500 mt-1">
          Orders financed through credit providers — payment guaranteed
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><Banknote size={14} /> Total Financed</div>
            <div className="text-lg font-bold mt-1">{formatCurrency(summary.totalFinancedMinor)}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><AlertTriangle size={14} /> Outstanding</div>
            <div className={`text-lg font-bold mt-1 ${summary.outstandingMinor > 0 ? 'text-red-600' : ''}`}>
              {formatCurrency(summary.outstandingMinor)}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 size={14} /> Repaid</div>
            <div className="text-lg font-bold mt-1 text-green-600">{formatCurrency(summary.totalRepaidMinor)}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500"><Activity size={14} /> Active Orders</div>
            <div className="text-lg font-bold mt-1">{summary.activeOrders}</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4" role="tablist" aria-label="BNPL order status filter">
        {['', 'active', 'overdue', 'paid'].map(s => (
          <button
            key={s}
            role="tab"
            aria-selected={filterStatus === s}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              filterStatus === s
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            onClick={() => { setFilterStatus(s); setCurrentPage(1); }}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-4 bg-slate-200 rounded w-1/4" />
                <div className="h-4 bg-slate-200 rounded w-1/6" />
                <div className="h-4 bg-slate-200 rounded w-1/6" />
                <div className="h-4 bg-slate-200 rounded w-1/6" />
                <div className="h-4 bg-slate-200 rounded w-1/6" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="p-4 text-red-600 flex items-center gap-2">
            Failed to load BNPL orders.
            <button onClick={() => refetch()} className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-slate-50">
              Retry
            </button>
          </div>
        ) : orders.length === 0 ? (
          <EmptyState icon={Package} title="No BNPL orders" description="No credit-backed orders found for the selected filter." />
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Store</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Provider</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Amount</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Outstanding</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Guaranteed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.drawdownId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{order.storeName}</div>
                      <div className="text-xs text-slate-400">{order.storeCode}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{order.providerName}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(order.principalMinor)}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${order.outstandingMinor > 0 ? 'text-red-600' : ''}`}>
                      {formatCurrency(order.outstandingMinor)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(order.dueDate)}</td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3">
                      {order.paymentGuaranteed ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                          <ShieldCheck size={14} /> Yes
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Internal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 px-4 py-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-sm text-slate-600">
                Page {currentPage} of {totalPages} ({total} orders)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1 text-sm border border-slate-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
