// T-073: SuperAdmin Invoices Tab — list, filter, detail, PDF download
import { useCallback, useEffect, useState } from "react";
import type { InvoiceListItem, InvoiceDetail, InvoiceListFilters, InvoiceModel, InvoiceType, InvoiceStatus } from "../api/invoices";
import { listInvoices, getInvoice, issueInvoice, cancelInvoice, downloadInvoicePdf } from "../api/invoices";
import { formatDateTime } from "../lib/formatters";
// UIUX-SA-008: Styled confirmation dialog instead of bare confirm()
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";

function formatMinor(minor: number): string {
  return "\u20B9" + (minor / 100).toFixed(2);
}

const STATUS_STYLES: Record<InvoiceStatus, { bg: string; color: string }> = {
  draft:     { bg: "var(--color-surface-alt)", color: "var(--color-text-secondary)" },
  issued:    { bg: "var(--color-primary-light)", color: "var(--color-primary-dark)" },
  paid:      { bg: "var(--color-success-soft)", color: "var(--color-success-dark)" },
  overdue:   { bg: "var(--color-warning-soft)", color: "var(--color-warning-dark)" },
  cancelled: { bg: "var(--color-error-soft)", color: "var(--color-error-dark)" },
  void:      { bg: "var(--color-border)", color: "var(--color-text-secondary)" },
};

export function InvoicesTab() {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [modelFilter, setModelFilter] = useState<InvoiceModel | "">("");
  const [typeFilter, setTypeFilter] = useState<InvoiceType | "">("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");

  // Detail modal
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // UIUX-SA-008: Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const filters: InvoiceListFilters = { limit: 50, offset };
      if (modelFilter) filters.invoiceModel = modelFilter;
      if (typeFilter) filters.invoiceType = typeFilter;
      if (statusFilter) filters.status = statusFilter;
      const result = await listInvoices(filters);
      setInvoices(result.data);
      setTotal(result.total);
    } catch (err: any) {
      setError(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [offset, modelFilter, typeFilter, statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const inv = await getInvoice(id);
      setDetail(inv);
    } catch (err: any) {
      setError(err.message || "Failed to load invoice");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleIssue = async (id: string) => {
    setActionLoading(true);
    try {
      await issueInvoice(id);
      await refresh();
      if (detail?.id === id) {
        const updated = await getInvoice(id);
        setDetail(updated);
      }
    } catch (err: any) {
      setError(err.message || "Failed to issue invoice");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = (id: string) => {
    setConfirmDialog({
      title: "Cancel Invoice",
      message: "Are you sure you want to cancel this invoice? This action is irreversible.",
      confirmLabel: "Cancel Invoice",
      variant: "danger",
      onConfirm: async () => {
        setConfirmDialog(null);
        setActionLoading(true);
        try {
          await cancelInvoice(id);
          await refresh();
          if (detail?.id === id) setDetail(null);
        } catch (err: any) {
          setError(err.message || "Failed to cancel invoice");
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleDownload = async (id: string, invoiceNumber: string) => {
    try {
      await downloadInvoicePdf(id, invoiceNumber);
    } catch (err: any) {
      setError(err.message || "Failed to download PDF");
    }
  };

  return (
    <section className="card">
      {/* UIUX-SA-008: Confirmation dialog */}
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} loading={actionLoading} />}
      <div className="cardHeader">
        <div className="cardTitle">Invoices</div>
        <div className="muted">GST invoices across buy-resell and platform-fee models</div>
      </div>

      {/* Filters */}
      <div className="sa-flex sa-gap-8 sa-flex-wrap sa-mb-16">
        <label htmlFor="filter-invoices-model" className="sa-sr-only">Invoice model</label>
        <select id="filter-invoices-model" value={modelFilter} onChange={(e) => { setModelFilter(e.target.value as any); setOffset(0); }} className="sa-select">
          <option value="">All Models</option>
          <option value="buy_resell">Buy-Resell</option>
          <option value="platform_fee">Platform Fee</option>
        </select>
        <label htmlFor="filter-invoices-type" className="sa-sr-only">Invoice type</label>
        <select id="filter-invoices-type" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as any); setOffset(0); }} className="sa-select">
          <option value="">All Types</option>
          <option value="purchase">Purchase</option>
          <option value="sale">Sale</option>
          <option value="commission">Commission</option>
          <option value="credit_note">Credit Note</option>
          <option value="debit_note">Debit Note</option>
        </select>
        <label htmlFor="filter-invoices-status" className="sa-sr-only">Invoice status</label>
        <select id="filter-invoices-status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setOffset(0); }} className="sa-select">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="issued">Issued</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="btn" onClick={() => refresh()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
        <span className="muted sa-text-sm" style={{ marginLeft: "auto" }}>{total} invoice{total !== 1 ? "s" : ""}</span>
      </div>

      {error && <div className="banner sa-mb-12">{error}</div>}

      {/* Table */}
      {invoices.length > 0 && (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th><th>Date</th><th>Model</th><th>Type</th>
                <th>Seller</th><th>Buyer</th><th className="sa-text-right">Total</th>
                <th className="sa-text-right">Balance</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const st = STATUS_STYLES[inv.status] || STATUS_STYLES.draft;
                return (
                  <tr key={inv.id}>
                    <td className="sa-fw-600 sa-text-sm sa-text-brand" style={{ cursor: "pointer" }} tabIndex={0} role="button" onClick={() => openDetail(inv.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(inv.id); } }}>{inv.invoiceNumber}</td>
                    <td className="sa-text-sm">{formatDateTime(inv.invoiceDate)}</td>
                    <td className="sa-text-xs">{inv.invoiceModel === "buy_resell" ? "Buy-Resell" : "Platform Fee"}</td>
                    <td className="sa-text-xs" style={{ textTransform: "capitalize" }}>{inv.invoiceType.replace("_", " ")}</td>
                    <td className="sa-text-sm sa-nowrap" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{inv.sellerName}</td>
                    <td className="sa-text-sm sa-nowrap" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{inv.buyerName}</td>
                    <td className="sa-text-right sa-fw-600 sa-text-sm">{formatMinor(inv.totalAmountMinor)}</td>
                    <td className="sa-text-right sa-text-sm" style={{ color: inv.balanceDueMinor > 0 ? "var(--color-error)" : "var(--color-success)" }}>{formatMinor(inv.balanceDueMinor)}</td>
                    <td>
                      <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>{inv.status.toUpperCase()}</span>
                    </td>
                    <td>
                      <div className="sa-flex sa-gap-4">
                        <button className="sa-btn-xs sa-btn-ghost-sm" onClick={() => openDetail(inv.id)}>View</button>
                        <button className="sa-btn-xs sa-btn-ghost-sm" onClick={() => handleDownload(inv.id, inv.invoiceNumber)}>PDF</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="sa-flex-center sa-gap-8 sa-mt-12">
          <button className="btn btnSm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
          <span className="sa-page-info" style={{ alignSelf: "center" }}>{offset + 1}&ndash;{Math.min(offset + 50, total)} of {total}</span>
          <button className="btn btnSm" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>Next</button>
        </div>
      )}

      {!loading && invoices.length === 0 && !error && (
        <div className="muted sa-text-center sa-p-24">No invoices found.</div>
      )}

      {/* Detail Modal */}
      {(detail || detailLoading) && (
        <div className="sa-modal-overlay" onClick={() => !detailLoading && setDetail(null)} onKeyDown={(e) => { if (e.key === "Escape") setDetail(null); }}>
          <div className="sa-modal-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {detailLoading && <div className="muted sa-text-center sa-p-24">Loading invoice...</div>}
            {detail && (
              <>
                <div className="sa-flex-between sa-mb-16">
                  <div>
                    <h3 style={{ margin: 0 }}>{detail.invoiceNumber}</h3>
                    <div className="muted sa-text-sm">{detail.invoiceModel === "buy_resell" ? "Buy-Resell" : "Platform Fee"} &mdash; {detail.invoiceType.replace("_", " ")}</div>
                  </div>
                  <div className="sa-flex sa-gap-8">
                    {detail.status === "draft" && (
                      <button className="btn btnSm" onClick={() => handleIssue(detail.id)} disabled={actionLoading}>Issue</button>
                    )}
                    {(detail.status === "draft" || detail.status === "issued") && (
                      <button className="btnGhost btnSm sa-text-danger" onClick={() => handleCancel(detail.id)} disabled={actionLoading}>Cancel</button>
                    )}
                    <button className="btn btnSm" onClick={() => handleDownload(detail.id, detail.invoiceNumber)}>Download PDF</button>
                    <button className="btnGhost btnSm" onClick={() => setDetail(null)}>Close</button>
                  </div>
                </div>

                {/* Parties */}
                <div className="sa-grid-2 sa-mb-16">
                  <div className="sa-section">
                    <div className="sa-fw-600 sa-text-sm sa-mb-4">From (Seller)</div>
                    <div className="sa-text-md">{detail.sellerName}</div>
                    {detail.sellerGstin && <div className="muted sa-text-xs">GSTIN: {detail.sellerGstin}</div>}
                    {detail.sellerAddress && <div className="muted sa-text-xs">{detail.sellerAddress}</div>}
                  </div>
                  <div className="sa-section">
                    <div className="sa-fw-600 sa-text-sm sa-mb-4">To (Buyer)</div>
                    <div className="sa-text-md">{detail.buyerName}</div>
                    {detail.buyerGstin && <div className="muted sa-text-xs">GSTIN: {detail.buyerGstin}</div>}
                    {detail.buyerAddress && <div className="muted sa-text-xs">{detail.buyerAddress}</div>}
                  </div>
                </div>

                {/* Items table */}
                <div className="tableWrap sa-mb-16">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Product</th><th>HSN</th><th className="sa-text-right">Qty</th>
                        <th className="sa-text-right">Rate</th><th className="sa-text-right">Tax</th>
                        <th className="sa-text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((item, i) => (
                        <tr key={item.id}>
                          <td>{i + 1}</td>
                          <td className="sa-fw-500" style={{ maxWidth: 200 }}>{item.productName}</td>
                          <td className="sa-text-xs">{item.hsnCode || "-"}</td>
                          <td className="sa-text-right">{item.quantity} {item.unit}</td>
                          <td className="sa-text-right">{formatMinor(item.unitPriceMinor)}</td>
                          <td className="sa-text-right">{formatMinor(item.cgstMinor + item.sgstMinor + item.igstMinor)}</td>
                          <td className="sa-text-right sa-fw-600">{formatMinor(item.totalMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="sa-flex-end">
                  <div style={{ minWidth: 250 }}>
                    <div className="sa-flex-between sa-text-md sa-mb-4">
                      <span>Subtotal:</span><span>{formatMinor(detail.subtotalMinor)}</span>
                    </div>
                    {detail.discountMinor > 0 && (
                      <div className="sa-flex-between sa-text-md sa-mb-4">
                        <span>Discount:</span><span>-{formatMinor(detail.discountMinor)}</span>
                      </div>
                    )}
                    {detail.cgstMinor > 0 && (
                      <div className="sa-flex-between sa-text-md sa-mb-4">
                        <span>CGST:</span><span>{formatMinor(detail.cgstMinor)}</span>
                      </div>
                    )}
                    {detail.sgstMinor > 0 && (
                      <div className="sa-flex-between sa-text-md sa-mb-4">
                        <span>SGST:</span><span>{formatMinor(detail.sgstMinor)}</span>
                      </div>
                    )}
                    {detail.igstMinor > 0 && (
                      <div className="sa-flex-between sa-text-md sa-mb-4">
                        <span>IGST:</span><span>{formatMinor(detail.igstMinor)}</span>
                      </div>
                    )}
                    {detail.platformFeeMinor && detail.platformFeeMinor > 0 && (
                      <div className="sa-flex-between sa-text-md sa-mb-4">
                        <span>Platform Fee ({detail.platformFeePercent}%):</span><span>{formatMinor(detail.platformFeeMinor)}</span>
                      </div>
                    )}
                    <hr className="sa-mt-8 sa-mb-8" />
                    <div className="sa-flex-between sa-fw-700 sa-text-base">
                      <span>Total:</span><span>{formatMinor(detail.totalAmountMinor)}</span>
                    </div>
                    {detail.amountPaidMinor > 0 && (
                      <>
                        <div className="sa-flex-between sa-text-md sa-mt-4">
                          <span>Paid:</span><span>{formatMinor(detail.amountPaidMinor)}</span>
                        </div>
                        <div className="sa-flex-between sa-text-md sa-fw-600" style={{ color: detail.balanceDueMinor > 0 ? "var(--color-error)" : "var(--color-success)" }}>
                          <span>Balance:</span><span>{formatMinor(detail.balanceDueMinor)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Payments */}
                {detail.payments.length > 0 && (
                  <div className="sa-mt-16">
                    <div className="sa-fw-600 sa-text-md sa-mb-8">Payment History</div>
                    {detail.payments.map((p) => (
                      <div key={p.id} className="muted sa-text-sm sa-mb-4">
                        {formatDateTime(p.paymentDate)} &mdash; {formatMinor(p.amountMinor)} via {p.paymentMode}
                        {p.paymentReference && <span> (Ref: {p.paymentReference})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
