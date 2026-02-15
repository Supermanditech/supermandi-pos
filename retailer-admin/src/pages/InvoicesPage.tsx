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
import { FileText } from 'lucide-react';

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
  buyerGstin?: string;
  buyerAddress?: string;
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

  const openDetail = async (invoiceId: string) => {
    if (!accessToken) return;
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/v1/retailer-admin/invoices/${invoiceId}`, accessToken);
      if (!res.ok) throw new Error("Failed to load invoice detail");
      const json = await safeJson(res);
      setDetail(json?.data || null);
    } catch {
      setDetail(null);
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
      console.error("PDF download failed:", err);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* T-112: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Invoices' }]} />
      <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem" }}>Invoices</h2>

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setOffset(0); }}
          style={{ padding: "0.4rem 0.6rem", borderRadius: 4, border: "1px solid #d1d5db", fontSize: "0.85rem" }}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>{total} invoice{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Error */}
      {error && <div style={{ color: "#dc2626", marginBottom: "1rem", padding: "0.5rem", background: "#fef2f2", borderRadius: 4 }}>{error}</div>}

      {/* Loading */}
      {loading && <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>Loading invoices...</div>}

      {/* Table */}
      {!loading && invoices.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Invoices will appear here once orders are processed and billed."
        />
      )}

      {!loading && invoices.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                <th style={{ padding: "0.5rem" }}>Invoice #</th>
                <th style={{ padding: "0.5rem" }}>Date</th>
                <th style={{ padding: "0.5rem" }}>Seller</th>
                <th style={{ padding: "0.5rem" }}>Type</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>Total</th>
                <th style={{ padding: "0.5rem", textAlign: "right" }}>Balance</th>
                <th style={{ padding: "0.5rem" }}>Status</th>
                <th style={{ padding: "0.5rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: "0.8rem" }}>{inv.invoiceNumber}</td>
                  <td style={{ padding: "0.5rem" }}>{fmtDate(inv.invoiceDate)}</td>
                  <td style={{ padding: "0.5rem" }}>{inv.sellerName}</td>
                  <td style={{ padding: "0.5rem", textTransform: "capitalize" }}>{inv.invoiceType.replace("_", " ")}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right", fontWeight: 600 }}>{fmt(inv.totalAmountMinor)}</td>
                  <td style={{ padding: "0.5rem", textAlign: "right", color: inv.balanceDueMinor > 0 ? "#dc2626" : "#16a34a" }}>
                    {fmt(inv.balanceDueMinor)}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: "0.75rem", fontWeight: 600, color: "#fff", background: statusColors[inv.status] || "#6b7280" }}>
                      {inv.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem", display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => openDetail(inv.id)}
                      style={{ padding: "2px 8px", fontSize: "0.75rem", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", cursor: "pointer" }}>
                      View
                    </button>
                    <button onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}
                      style={{ padding: "2px 8px", fontSize: "0.75rem", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", cursor: "pointer" }}>
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
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1rem", alignItems: "center" }}>
          <button disabled={currentPage <= 1} onClick={() => setOffset(offset - limit)}
            style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 4, cursor: currentPage <= 1 ? "default" : "pointer", opacity: currentPage <= 1 ? 0.5 : 1 }}>
            Prev
          </button>
          <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>Page {currentPage} of {totalPages}</span>
          <button disabled={currentPage >= totalPages} onClick={() => setOffset(offset + limit)}
            style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 4, cursor: currentPage >= totalPages ? "default" : "pointer", opacity: currentPage >= totalPages ? 0.5 : 1 }}>
            Next
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {(detail || detailLoading) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "5vh", zIndex: 1000 }}
          onClick={() => { setDetail(null); }}>
          <div style={{ background: "#fff", borderRadius: 8, width: "90%", maxWidth: 700, maxHeight: "85vh", overflow: "auto", padding: "1.5rem" }}
            onClick={e => e.stopPropagation()}>
            {detailLoading && <div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>}
            {detail && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{detail.invoiceNumber}</h3>
                  <button onClick={() => setDetail(null)}
                    style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer" }}>X</button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.85rem", marginBottom: "1rem" }}>
                  <div><strong>Date:</strong> {fmtDate(detail.invoiceDate)}</div>
                  <div><strong>Due:</strong> {detail.dueDate ? fmtDate(detail.dueDate) : "-"}</div>
                  <div><strong>Status:</strong> {detail.status.toUpperCase()}</div>
                  <div><strong>Type:</strong> {detail.invoiceType.replace("_", " ")}</div>
                  <div><strong>From:</strong> {detail.sellerName}{detail.sellerGstin ? ` (${detail.sellerGstin})` : ""}</div>
                  <div><strong>To:</strong> {detail.buyerName}</div>
                </div>

                {/* Items */}
                <h4 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>Items</h4>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", marginBottom: "1rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ padding: "4px", textAlign: "left" }}>Product</th>
                      <th style={{ padding: "4px", textAlign: "right" }}>Qty</th>
                      <th style={{ padding: "4px", textAlign: "right" }}>Rate</th>
                      <th style={{ padding: "4px", textAlign: "right" }}>GST%</th>
                      <th style={{ padding: "4px", textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map(item => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "4px" }}>{item.productName}</td>
                        <td style={{ padding: "4px", textAlign: "right" }}>{item.quantity} {item.unit}</td>
                        <td style={{ padding: "4px", textAlign: "right" }}>{fmt(item.unitPriceMinor)}</td>
                        <td style={{ padding: "4px", textAlign: "right" }}>{item.gstRate}%</td>
                        <td style={{ padding: "4px", textAlign: "right" }}>{fmt(item.totalMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ width: 250, fontSize: "0.85rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                      <span>Subtotal:</span><span>{fmt(detail.subtotalMinor)}</span>
                    </div>
                    {detail.cgstMinor > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>CGST:</span><span>{fmt(detail.cgstMinor)}</span>
                      </div>
                    )}
                    {detail.sgstMinor > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>SGST:</span><span>{fmt(detail.sgstMinor)}</span>
                      </div>
                    )}
                    {detail.igstMinor > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>IGST:</span><span>{fmt(detail.igstMinor)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderTop: "1px solid #e5e7eb", fontWeight: 700 }}>
                      <span>Total:</span><span>{fmt(detail.totalAmountMinor)}</span>
                    </div>
                    {detail.amountPaidMinor > 0 && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                          <span>Paid:</span><span>{fmt(detail.amountPaidMinor)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontWeight: 600, color: detail.balanceDueMinor > 0 ? "#dc2626" : "#16a34a" }}>
                          <span>Balance:</span><span>{fmt(detail.balanceDueMinor)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Payments */}
                {detail.payments && detail.payments.length > 0 && (
                  <div style={{ marginTop: "1rem" }}>
                    <h4 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>Payment History</h4>
                    {detail.payments.map(p => (
                      <div key={p.id} style={{ fontSize: "0.8rem", padding: "2px 0", color: "#6b7280" }}>
                        {fmtDate(p.paymentDate)} — {fmt(p.amountMinor)} via {p.paymentMode}
                        {p.paymentReference ? ` (Ref: ${p.paymentReference})` : ""}
                      </div>
                    ))}
                  </div>
                )}

                {/* Download */}
                <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                  <button onClick={() => downloadPdf(detail.id, detail.invoiceNumber)}
                    style={{ padding: "6px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: "0.85rem" }}>
                    Download PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
