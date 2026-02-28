// STG-217: Replaced hardcoded hex colors with CSS variables for dark mode
// T-073: Retailer Invoices Page
// Read-only view of invoices where the store is the buyer

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
// T-120: URL state for filter persistence
import { useUrlState } from '../hooks/useUrlState';
// GAP-2: EmptyState component for consistent empty states
import EmptyState from '../components/EmptyState';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { FileText } from 'lucide-react';
import { logger } from '../lib/logger';

interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  invoiceModel: string;
  invoiceType: string;
  status: string;
  sellerName: string;
  buyerName: string;
  subtotalMinor: number;
  totalTaxMinor: number;
  totalAmountMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;
  createdAt: string;
}

interface InvoiceDetail extends InvoiceListItem {
  sellerGstin?: string;
  sellerAddress?: string;
  sellerPhone?: string;  // WA-002: For direct WhatsApp linking
  buyerGstin?: string;
  buyerAddress?: string;
  buyerPhone?: string;   // WA-002: For direct WhatsApp linking
  taxableAmountMinor: number;
  discountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  platformFeePercent?: number;
  platformFeeMinor?: number;
  items: Array<{
    id: string;
    productName: string;
    hsnCode?: string;
    quantity: number;
    unit: string;
    unitPriceMinor: number;
    taxableAmountMinor: number;
    gstRate: number;
    totalMinor: number;
  }>;
  payments: Array<{
    id: string;
    paymentDate: string;
    amountMinor: number;
    paymentMode: string;
    paymentReference?: string;
  }>;
}

function fmt(minor: number): string {
  return `\u20B9${(minor / 100).toFixed(2)}`;
}

function fmtDate(d: string): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const statusColors: Record<string, string> = {
  draft: "#6b7280",
  issued: "#2563eb",
  paid: "#16a34a",
  overdue: "#dc2626",
  cancelled: "#9ca3af",
  void: "#9ca3af",
};

export default function InvoicesPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  // T-120: Sync status filter with URL for back/forward persistence
  const [statusFilter, setStatusFilter] = useUrlState('status');
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const limit = 20;

  const loadInvoices = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (statusFilter) params.set("status", statusFilter);
      const res = await authFetch(`/api/v1/retailer-admin/invoices?${params}`, accessToken);
      if (!res.ok) throw new Error(`Failed to load invoices: ${res.status}`);
      const json = await safeJson(res);
      setInvoices(json?.data || []);
      setTotal(json?.total || 0);
    } catch (err: any) {
      setError(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [accessToken, offset, statusFilter]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  // REQ.AUDIT.W5.RETAILER.INVOICES-STALE-MODAL-ON-PAGINATION.001: close detail when list changes
  useEffect(() => { setDetail(null); }, [offset, statusFilter]);

  const openDetail = async (invoiceId: string) => {
    if (!accessToken) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await authFetch(`/api/v1/retailer-admin/invoices/${invoiceId}`, accessToken);
      if (!res.ok) throw new Error("Failed to load invoice detail");
      const json = await safeJson(res);
      setDetail(json?.data || null);
    } catch (e: any) {
      setDetail(null);
      setDetailError(e.message || "Failed to load invoice detail");
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    if (!accessToken) return;
    try {
      const res = await authFetch(`/api/v1/retailer-admin/invoices/${invoiceId}/pdf`, accessToken);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoiceNumber.replace(/\//g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error("PDF download failed:", err);
      setError("Failed to download PDF. Please try again.");
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="inv-container">
      {/* T-112: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Invoices' }]} />
      <h2 className="inv-title">Invoices</h2>

      {/* Filters */}
      <div className="po-filter-bar">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setOffset(0); }}
          className="form-input po-filter-select">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="text-sm-muted">{total} invoice{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Error */}
      {error && <div className="alert-error-inline">{error}</div>}

      {/* Loading */}
      {loading && <div className="text-center-muted">Loading invoices...</div>}

      {/* Table */}
      {!loading && invoices.length === 0 && (
        <EmptyState
          icon={<FileText size={24} />}
          title="No invoices yet"
          description="Invoices will appear here once orders are processed and billed."
        />
      )}

      {!loading && invoices.length > 0 && (
        <div className="table-container">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Seller</th>
                <th>Type</th>
                <th className="cell-right">Total</th>
                <th className="cell-right">Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td className="inv-table-mono">{inv.invoiceNumber}</td>
                  <td>{fmtDate(inv.invoiceDate)}</td>
                  <td>{inv.sellerName}</td>
                  <td className="inv-table-cap">{inv.invoiceType.replace("_", " ")}</td>
                  <td className="cell-mono-right-bold">{fmt(inv.totalAmountMinor)}</td>
                  <td className="cell-right" style={{ color: inv.balanceDueMinor > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {fmt(inv.balanceDueMinor)}
                  </td>
                  <td>
                    <span className="badge" style={{ color: "#fff", background: statusColors[inv.status] || "#6b7280" }}>
                      {inv.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="inv-table-actions">
                    <button onClick={() => openDetail(inv.id)} className="btn btn-secondary btn-xs">
                      View
                    </button>
                    <button onClick={() => downloadPdf(inv.id, inv.invoiceNumber)} className="btn btn-secondary btn-xs">
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="po-pagination">
          <button aria-label="Previous page of invoices" disabled={currentPage <= 1} onClick={() => setOffset(offset - limit)}
            className="btn btn-secondary">
            Prev
          </button>
          <span className="text-sm-muted">Page {currentPage} of {totalPages}</span>
          <button aria-label="Next page of invoices" disabled={currentPage >= totalPages} onClick={() => setOffset(offset + limit)}
            className="btn btn-secondary">
            Next
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {(detail || detailLoading || detailError) && (
        <div className="modal-overlay-custom"
          onClick={() => { setDetail(null); setDetailError(null); }}
          onKeyDown={e => { if (e.key === 'Escape') { setDetail(null); setDetailError(null); } }}
          tabIndex={-1} ref={(el) => { if (el) el.focus(); }}>
          <div className="card inv-modal-card"
            onClick={e => e.stopPropagation()}>
            {detailLoading && <div className="po-modal-loading">Loading...</div>}
            {detailError && !detailLoading && (
              <div className="po-modal-loading">
                <p className="po-modal-error">Failed to load invoice</p>
                <p className="po-modal-hint">{detailError}</p>
                <button onClick={() => setDetailError(null)} className="btn btn-secondary" style={{ marginTop: "1rem" }}>Close</button>
              </div>
            )}
            {detail && (
              <>
                <div className="inv-modal-header">
                  <h3 className="inv-modal-title">{detail.invoiceNumber}</h3>
                  <button aria-label="Close invoice detail" onClick={() => setDetail(null)}
                    className="inv-modal-close">X</button>
                </div>

                <div className="inv-detail-grid">
                  <div><strong>Date:</strong> {fmtDate(detail.invoiceDate)}</div>
                  <div><strong>Due:</strong> {detail.dueDate ? fmtDate(detail.dueDate) : "-"}</div>
                  <div><strong>Status:</strong> {detail.status.toUpperCase()}</div>
                  <div><strong>Type:</strong> {detail.invoiceType.replace("_", " ")}</div>
                  <div><strong>From:</strong> {detail.sellerName}{detail.sellerGstin ? ` (${detail.sellerGstin})` : ""}</div>
                  <div><strong>To:</strong> {detail.buyerName}</div>
                </div>

                {/* Items */}
                <h4 className="po-items-title">Items</h4>
                <table className="po-items-table" style={{ marginBottom: "1rem" }}>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th className="cell-right">Qty</th>
                      <th className="cell-right">Rate</th>
                      <th className="cell-right">GST%</th>
                      <th className="cell-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map(item => (
                      <tr key={item.id}>
                        <td>{item.productName}</td>
                        <td className="cell-right">{item.quantity} {item.unit}</td>
                        <td className="cell-right">{fmt(item.unitPriceMinor)}</td>
                        <td className="cell-right">{item.gstRate}%</td>
                        <td className="cell-right cell-bold">{fmt(item.totalMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="inv-totals-wrap">
                  <div className="inv-totals">
                    <div className="inv-totals-row">
                      <span>Subtotal:</span><span>{fmt(detail.subtotalMinor)}</span>
                    </div>
                    {detail.cgstMinor > 0 && (
                      <div className="inv-totals-row">
                        <span>CGST:</span><span>{fmt(detail.cgstMinor)}</span>
                      </div>
                    )}
                    {detail.sgstMinor > 0 && (
                      <div className="inv-totals-row">
                        <span>SGST:</span><span>{fmt(detail.sgstMinor)}</span>
                      </div>
                    )}
                    {detail.igstMinor > 0 && (
                      <div className="inv-totals-row">
                        <span>IGST:</span><span>{fmt(detail.igstMinor)}</span>
                      </div>
                    )}
                    <div className="inv-totals-total">
                      <span>Total:</span><span>{fmt(detail.totalAmountMinor)}</span>
                    </div>
                    {detail.amountPaidMinor > 0 && (
                      <>
                        <div className="inv-totals-row">
                          <span>Paid:</span><span>{fmt(detail.amountPaidMinor)}</span>
                        </div>
                        <div className="inv-totals-row" style={{ fontWeight: 600, color: detail.balanceDueMinor > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          <span>Balance:</span><span>{fmt(detail.balanceDueMinor)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Payments */}
                {detail.payments && detail.payments.length > 0 && (
                  <div className="inv-payments">
                    <h4 className="po-items-title">Payment History</h4>
                    {detail.payments.map(p => (
                      <div key={p.id} className="inv-payment-row">
                        {fmtDate(p.paymentDate)} — {fmt(p.amountMinor)} via {p.paymentMode}
                        {p.paymentReference ? ` (Ref: ${p.paymentReference})` : ""}
                      </div>
                    ))}
                  </div>
                )}

                {/* Download + WhatsApp Share */}
                <div className="imp-actions" style={{ marginTop: "1rem" }}>
                  <button onClick={() => downloadPdf(detail.id, detail.invoiceNumber)}
                    className="btn btn-primary">
                    Download PDF
                  </button>
                  {/* WA-002: sellerPhone now included in API response for direct WhatsApp linking */}
                  {detail.sellerPhone && (
                  <button
                    onClick={() => {
                      const amount = fmt(detail.totalAmountMinor);
                      const msg = `Regarding invoice #${detail.invoiceNumber}, amount: ${amount}. Status: ${detail.status.toUpperCase()}.`;
                      const phone = detail.sellerPhone!.replace(/\D/g, '');
                      if (phone.length < 10) return;
                      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                    }}
                    className="po-wa-btn"
                    title="Share invoice details via WhatsApp"
                  >
                    <WhatsAppIcon size={16} />
                    WhatsApp
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
