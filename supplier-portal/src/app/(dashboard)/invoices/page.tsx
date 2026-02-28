'use client';

// T-073: Supplier Invoices Page
// Read-only view of invoices where the supplier is the seller

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getSupplierInvoices, getSupplierInvoiceDetail, type SupplierInvoice, type SupplierInvoiceDetail } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/formatters';
// T-113: Breadcrumb navigation
import Breadcrumb from '@/components/Breadcrumb';
// GAP-3: EmptyState component for consistent empty states
import EmptyState from '@/components/EmptyState';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { FileText } from 'lucide-react';

export default function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const limit = 20;

  const { data: invoicesData, isLoading, isError, refetch } = useQuery({
    queryKey: ['supplier-invoices', page, statusFilter],
    queryFn: () => getSupplierInvoices({ page, limit, status: statusFilter || undefined }),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['supplier-invoice-detail', selectedId],
    queryFn: () => selectedId ? getSupplierInvoiceDetail(selectedId) : Promise.resolve(null),
    enabled: !!selectedId,
  });

  // STG-084: apiFetch unwraps data.data, so invoicesData may be the array directly
  const invoices = Array.isArray(invoicesData) ? invoicesData : (invoicesData?.data || []);
  const total = Array.isArray(invoicesData) ? invoicesData.length : (invoicesData?.total || 0);
  const totalPages = Math.ceil(total / limit);

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    issued: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500',
    void: 'bg-gray-100 text-gray-500',
  };

  const downloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const token = (await import('@/lib/api')).getAuthToken();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const res = await fetch(`${apiBase}/api/v1/supplier/invoices/${invoiceId}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceNumber.replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download failed:', err);
      // UIUX-SUP-013: Show user feedback on PDF download failure
      toast.error('Failed to download PDF. Please try again.');
    }
  };

  return (
    <div>
      {/* T-113: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Invoices' }]} />
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Invoices</h1>
        <p className="text-slate-500 mt-1">View invoices for your sales and commissions.</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          aria-label="Filter by invoice status"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="text-sm text-slate-500">{total} invoice{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Error */}
      {isError && (
        <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          Failed to load invoices.{' '}
          <button onClick={() => refetch()} className="underline">Retry</button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 bg-slate-200 rounded w-1/5" />
              <div className="h-4 bg-slate-200 rounded w-1/6" />
              <div className="h-4 bg-slate-200 rounded w-1/4" />
              <div className="h-4 bg-slate-200 rounded w-1/6" />
              <div className="h-4 bg-slate-200 rounded w-1/6" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && invoices.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Invoices will appear here once orders are completed and billed."
        />
      )}

      {/* Table */}
      {!isLoading && invoices.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Invoice #</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Buyer</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase">Total</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase">Balance</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-sm">{inv.invoiceNumber}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="py-3 px-4 text-sm">{inv.buyerName}</td>
                    <td className="py-3 px-4 text-sm capitalize">{inv.invoiceType.replace('_', ' ')}</td>
                    <td className="py-3 px-4 text-sm text-right font-medium">{formatCurrency(inv.totalAmountMinor)}</td>
                    <td className={`py-3 px-4 text-sm text-right ${inv.balanceDueMinor > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(inv.balanceDueMinor)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[inv.status] || 'bg-gray-100'}`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedId(inv.id)}
                          className="text-sm text-blue-600 hover:underline">View</button>
                        <button onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}
                          className="text-sm text-blue-600 hover:underline"
                          aria-label={`Download PDF for invoice ${inv.invoiceNumber}`}>PDF</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
            aria-label="Go to previous page">Prev</button>
          <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50"
            aria-label="Go to next page">Next</button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedId && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[5vh] z-50"
          onClick={() => setSelectedId(null)}>
          <div className="bg-white rounded-lg w-[90%] max-w-2xl max-h-[85vh] overflow-auto p-6"
            onClick={e => e.stopPropagation()}>
            {detailLoading && (
              <div className="p-4 space-y-3 animate-pulse">
                <div className="h-6 bg-slate-200 rounded w-1/3" />
                <div className="grid grid-cols-2 gap-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-4 bg-slate-200 rounded" />)}
                </div>
                <div className="h-32 bg-slate-200 rounded" />
              </div>
            )}
            {detail && (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold">{detail.invoiceNumber}</h2>
                  <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-700 text-xl" aria-label="Close invoice detail">&times;</button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                  <div><span className="font-medium">Date:</span> {formatDate(detail.invoiceDate)}</div>
                  <div><span className="font-medium">Due:</span> {detail.dueDate ? formatDate(detail.dueDate) : '—'}</div>
                  <div><span className="font-medium">Status:</span> {detail.status.toUpperCase()}</div>
                  <div><span className="font-medium">Type:</span> {detail.invoiceType.replace('_', ' ')}</div>
                  <div><span className="font-medium">Buyer:</span> {detail.buyerName}{detail.buyerGstin ? ` (${detail.buyerGstin})` : ''}</div>
                  <div><span className="font-medium">Seller:</span> {detail.sellerName}</div>
                </div>

                {/* Items */}
                <h3 className="text-sm font-semibold mb-2">Items</h3>
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-1 px-2">Product</th>
                      <th className="text-right py-1 px-2">Qty</th>
                      <th className="text-right py-1 px-2">Rate</th>
                      <th className="text-right py-1 px-2">GST%</th>
                      <th className="text-right py-1 px-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map(item => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="py-1 px-2">{item.productName}</td>
                        <td className="py-1 px-2 text-right">{item.quantity} {item.unit}</td>
                        <td className="py-1 px-2 text-right">{formatCurrency(item.unitPriceMinor)}</td>
                        <td className="py-1 px-2 text-right">{item.gstRate}%</td>
                        <td className="py-1 px-2 text-right">{formatCurrency(item.totalMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-64 text-sm">
                    <div className="flex justify-between py-1"><span>Subtotal:</span><span>{formatCurrency(detail.subtotalMinor)}</span></div>
                    {detail.cgstMinor > 0 && <div className="flex justify-between py-1"><span>CGST:</span><span>{formatCurrency(detail.cgstMinor)}</span></div>}
                    {detail.sgstMinor > 0 && <div className="flex justify-between py-1"><span>SGST:</span><span>{formatCurrency(detail.sgstMinor)}</span></div>}
                    {detail.igstMinor > 0 && <div className="flex justify-between py-1"><span>IGST:</span><span>{formatCurrency(detail.igstMinor)}</span></div>}
                    <div className="flex justify-between py-1 border-t border-slate-200 font-bold">
                      <span>Total:</span><span>{formatCurrency(detail.totalAmountMinor)}</span>
                    </div>
                    {detail.amountPaidMinor > 0 && (
                      <>
                        <div className="flex justify-between py-1"><span>Paid:</span><span>{formatCurrency(detail.amountPaidMinor)}</span></div>
                        <div className={`flex justify-between py-1 font-semibold ${detail.balanceDueMinor > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          <span>Balance:</span><span>{formatCurrency(detail.balanceDueMinor)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Payments */}
                {detail.payments && detail.payments.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold mb-2">Payment History</h3>
                    {detail.payments.map(p => (
                      <div key={p.id} className="text-xs text-slate-500 py-1">
                        {formatDate(p.paymentDate)} — {formatCurrency(p.amountMinor)} via {p.paymentMode}
                        {p.paymentReference ? ` (Ref: ${p.paymentReference})` : ''}
                      </div>
                    ))}
                  </div>
                )}

                {/* Download + WhatsApp Payment Reminder */}
                <div className="mt-4 flex gap-2">
                  <button onClick={() => downloadPdf(detail.id, detail.invoiceNumber)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                    Download PDF
                  </button>
                  {/* WA-002: buyerPhone now included in API response for direct WhatsApp linking */}
                  {detail.buyerPhone && (
                  <button
                    onClick={() => {
                      const amount = `${'\u20B9'}${(detail.totalAmountMinor / 100).toFixed(2)}`;
                      const due = detail.dueDate ? new Date(detail.dueDate).toLocaleDateString('en-IN') : 'N/A';
                      const msg = `Payment reminder for invoice #${detail.invoiceNumber}, amount: ${amount}. Due: ${due}.`;
                      const phone = detail.buyerPhone!.replace(/\D/g, '');
                      if (phone.length < 10) return;
                      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm hover:bg-green-100 transition-colors"
                    title="Send payment reminder via WhatsApp"
                  >
                    <WhatsAppIcon size={16} />
                    Payment Reminder
                  </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
