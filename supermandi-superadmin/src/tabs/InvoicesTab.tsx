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
  draft:     { bg: "#f1f5f9", color: "#475569" },
  issued:    { bg: "#dbeafe", color: "#1e40af" },
  paid:      { bg: "#dcfce7", color: "#166534" },
  overdue:   { bg: "#fef3c7", color: "#92400e" },
  cancelled: { bg: "#fecaca", color: "#991b1b" },
  void:      { bg: "#e5e7eb", color: "#6b7280" },
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
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <select value={modelFilter} onChange={(e) => { setModelFilter(e.target.value as any); setOffset(0); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
          <option value="">All Models</option>
          <option value="buy_resell">Buy-Resell</option>
          <option value="platform_fee">Platform Fee</option>
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as any); setOffset(0); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
          <option value="">All Types</option>
          <option value="purchase">Purchase</option>
          <option value="sale">Sale</option>
          <option value="commission">Commission</option>
          <option value="credit_note">Credit Note</option>
          <option value="debit_note">Debit Note</option>
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setOffset(0); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
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
        <span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>{total} invoice{total !== 1 ? "s" : ""}</span>
      </div>

      {error && <div className="alertDanger" style={{ marginBottom: 12 }}>{error}</div>}

      {/* Table */}
      {invoices.length > 0 && (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th><th>Date</th><th>Model</th><th>Type</th>
                <th>Seller</th><th>Buyer</th><th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Balance</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const st = STATUS_STYLES[inv.status] || STATUS_STYLES.draft;
                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600, fontSize: 12, cursor: "pointer", color: "#2563eb" }} onClick={() => openDetail(inv.id)}>{inv.invoiceNumber}</td>
                    <td style={{ fontSize: 12 }}>{formatDateTime(inv.invoiceDate)}</td>
                    <td style={{ fontSize: 11 }}>{inv.invoiceModel === "buy_resell" ? "Buy-Resell" : "Platform Fee"}</td>
                    <td style={{ fontSize: 11, textTransform: "capitalize" }}>{inv.invoiceType.replace("_", " ")}</td>
                    <td style={{ fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.sellerName}</td>
                    <td style={{ fontSize: 12, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.buyerName}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, fontSize: 12 }}>{formatMinor(inv.totalAmountMinor)}</td>
                    <td style={{ textAlign: "right", fontSize: 12, color: inv.balanceDueMinor > 0 ? "#dc2626" : "#16a34a" }}>{formatMinor(inv.balanceDueMinor)}</td>
                    <td>
                      <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: st.bg, color: st.color }}>{inv.status.toUpperCase()}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btnGhost btnSm" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => openDetail(inv.id)}>View</button>
                        <button className="btnGhost btnSm" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => handleDownload(inv.id, inv.invoiceNumber)}>PDF</button>
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
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
          <button className="btn btnSm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>{offset + 1}&ndash;{Math.min(offset + 50, total)} of {total}</span>
          <button className="btn btnSm" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>Next</button>
        </div>
      )}

      {!loading && invoices.length === 0 && !error && (
        <div className="muted" style={{ textAlign: "center", padding: 32 }}>No invoices found.</div>
      )}

      {/* Detail Modal */}
      {(detail || detailLoading) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => !detailLoading && setDetail(null)}>
          <div style={{ background: "white", borderRadius: 12, padding: 24, maxWidth: 800, width: "90%", maxHeight: "85vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            {detailLoading && <div className="muted" style={{ textAlign: "center", padding: 32 }}>Loading invoice...</div>}
            {detail && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{detail.invoiceNumber}</h3>
                    <div className="muted" style={{ fontSize: 12 }}>{detail.invoiceModel === "buy_resell" ? "Buy-Resell" : "Platform Fee"} &mdash; {detail.invoiceType.replace("_", " ")}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {detail.status === "draft" && (
                      <button className="btn btnSm" onClick={() => handleIssue(detail.id)} disabled={actionLoading}>Issue</button>
                    )}
                    {(detail.status === "draft" || detail.status === "issued") && (
                      <button className="btnGhost btnSm" style={{ color: "#dc2626" }} onClick={() => handleCancel(detail.id)} disabled={actionLoading}>Cancel</button>
                    )}
                    <button className="btn btnSm" onClick={() => handleDownload(detail.id, detail.invoiceNumber)}>Download PDF</button>
                    <button className="btnGhost btnSm" onClick={() => setDetail(null)}>Close</button>
                  </div>
                </div>

                {/* Parties */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>From (Seller)</div>
                    <div style={{ fontSize: 13 }}>{detail.sellerName}</div>
                    {detail.sellerGstin && <div className="muted" style={{ fontSize: 11 }}>GSTIN: {detail.sellerGstin}</div>}
                    {detail.sellerAddress && <div className="muted" style={{ fontSize: 11 }}>{detail.sellerAddress}</div>}
                  </div>
                  <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>To (Buyer)</div>
                    <div style={{ fontSize: 13 }}>{detail.buyerName}</div>
                    {detail.buyerGstin && <div className="muted" style={{ fontSize: 11 }}>GSTIN: {detail.buyerGstin}</div>}
                    {detail.buyerAddress && <div className="muted" style={{ fontSize: 11 }}>{detail.buyerAddress}</div>}
                  </div>
                </div>

                {/* Items table */}
                <div className="tableWrap" style={{ marginBottom: 16 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Product</th><th>HSN</th><th style={{ textAlign: "right" }}>Qty</th>
                        <th style={{ textAlign: "right" }}>Rate</th><th style={{ textAlign: "right" }}>Tax</th>
                        <th style={{ textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((item, i) => (
                        <tr key={item.id}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 500, maxWidth: 200 }}>{item.productName}</td>
                          <td style={{ fontSize: 11 }}>{item.hsnCode || "-"}</td>
                          <td style={{ textAlign: "right" }}>{item.quantity} {item.unit}</td>
                          <td style={{ textAlign: "right" }}>{formatMinor(item.unitPriceMinor)}</td>
                          <td style={{ textAlign: "right" }}>{formatMinor(item.cgstMinor + item.sgstMinor + item.igstMinor)}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMinor(item.totalMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ minWidth: 250 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span>Subtotal:</span><span>{formatMinor(detail.subtotalMinor)}</span>
                    </div>
                    {detail.discountMinor > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span>Discount:</span><span>-{formatMinor(detail.discountMinor)}</span>
                      </div>
                    )}
                    {detail.cgstMinor > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span>CGST:</span><span>{formatMinor(detail.cgstMinor)}</span>
                      </div>
                    )}
                    {detail.sgstMinor > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span>SGST:</span><span>{formatMinor(detail.sgstMinor)}</span>
                      </div>
                    )}
                    {detail.igstMinor > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span>IGST:</span><span>{formatMinor(detail.igstMinor)}</span>
                      </div>
                    )}
                    {detail.platformFeeMinor && detail.platformFeeMinor > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span>Platform Fee ({detail.platformFeePercent}%):</span><span>{formatMinor(detail.platformFeeMinor)}</span>
                      </div>
                    )}
                    <hr style={{ margin: "8px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
                      <span>Total:</span><span>{formatMinor(detail.totalAmountMinor)}</span>
                    </div>
                    {detail.amountPaidMinor > 0 && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                          <span>Paid:</span><span>{formatMinor(detail.amountPaidMinor)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: detail.balanceDueMinor > 0 ? "#dc2626" : "#16a34a" }}>
                          <span>Balance:</span><span>{formatMinor(detail.balanceDueMinor)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Payments */}
                {detail.payments.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Payment History</div>
                    {detail.payments.map((p) => (
                      <div key={p.id} className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
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
