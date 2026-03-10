// T-219: SuperAdmin Refund Management Tab
import { useCallback, useEffect, useState } from "react";
import { fetchRefunds, approveRefund, rejectRefund, type RefundRequest, type RefundStatus } from "../api/refunds";
// R7.SA.007: Confirmation dialog before money-movement actions
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
import { formatDateTime } from "../lib/formatters";

// STG-813: Use Indian comma grouping (₹1,00,000.00 not ₹100000.00)
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
function formatCurrency(minor: number): string {
  return inrFmt.format(minor / 100);
}

const STATUS_STYLES: Record<RefundStatus, { bg: string; color: string; label: string }> = {
  initiated:  { bg: "var(--color-warning-soft)", color: "var(--color-warning-dark)", label: "Initiated" },
  processing: { bg: "var(--color-primary-light)", color: "var(--color-primary-dark)", label: "Processing" },
  processed:  { bg: "var(--color-success-soft)", color: "var(--color-success-dark)", label: "Processed" },
  failed:     { bg: "var(--color-error-soft)", color: "var(--color-error-dark)", label: "Failed" },
  cancelled:  { bg: "var(--color-border)", color: "var(--color-text-secondary)", label: "Cancelled" },
};

export function RefundsTab() {
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<RefundStatus | "">("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // R7.SA.007: Confirmation dialog state for money-movement actions
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  const limit = 50;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchRefunds({
        status: statusFilter || undefined,
        limit,
        offset,
      });
      setRefunds(result.data);
      setTotal(result.total);
    } catch (err: unknown) {
      setError(err.message || "Failed to load refunds");
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  // R7.SA.007: Actual approve — only called after user confirms in dialog
  // STG-815: Clear stale error before each action
  const executeApprove = async (id: string) => {
    setError("");
    setActionLoading(id);
    try {
      await approveRefund(id);
      await refresh();
    } catch (err: unknown) {
      setError(err.message || "Approve failed");
    } finally {
      setActionLoading(null);
    }
  };

  // R7.SA.007: Show confirmation before triggering money movement
  const handleApprove = (id: string, amount: number) => {
    setConfirmDialog({
      title: "Approve Refund",
      message: `Approve refund of ${formatCurrency(amount)}? This will initiate a credit/bank transfer.`,
      confirmLabel: "Approve",
      variant: "warning",
      onConfirm: () => {
        setConfirmDialog(null);
        executeApprove(id);
      },
    });
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    setError("");
    setActionLoading(rejectId);
    try {
      await rejectRefund(rejectId, rejectReason.trim());
      setRejectId(null);
      setRejectReason("");
      await refresh();
    } catch (err: unknown) {
      setError(err.message || "Reject failed");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (iso: string) => formatDateTime(iso);

  return (
    <div className="sa-p-24">
      {/* R7.SA.007: Confirmation dialog for refund approval */}
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} loading={actionLoading !== null} />}
      <div className="sa-flex-between sa-mb-20">
        <div>
          <h2 className="sa-text-xl sa-fw-700">Refund Management</h2>
          <p className="sa-text-md sa-text-muted sa-mt-4">
            {total} total refund requests{statusFilter ? ` (${statusFilter})` : ""}
          </p>
        </div>
        <div className="sa-flex sa-gap-8">
          <label htmlFor="filter-refunds-status" className="sa-sr-only">Refund status</label>
          <select
            id="filter-refunds-status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as RefundStatus | ""); setOffset(0); }}
            className="sa-select"
          >
            <option value="">All Statuses</option>
            <option value="initiated">Initiated</option>
            <option value="processing">Processing</option>
            <option value="processed">Processed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={refresh} className="sa-btn-ghost-sm">
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="sa-alert-error sa-mb-16" role="alert">{error}</div>}

      {loading ? (
        <div className="sa-text-center sa-p-24 sa-text-muted">Loading refunds...</div>
      ) : refunds.length === 0 ? (
        <div className="sa-text-center sa-p-24 sa-text-muted">No refund requests found</div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th className="sa-th">Store</th>
                <th className="sa-th">Order</th>
                <th className="sa-th sa-th--right">Amount</th>
                <th className="sa-th">Reason</th>
                <th className="sa-th" style={{ textAlign: "center" }}>Status</th>
                <th className="sa-th">Date</th>
                <th className="sa-th" style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => {
                const style = STATUS_STYLES[r.status] || STATUS_STYLES.initiated;
                return (
                  <tr key={r.id}>
                    <td className="sa-td">
                      <div className="sa-fw-500">{r.storeName || r.storeId.slice(0, 8)}</div>
                    </td>
                    <td className="sa-td sa-td--mono sa-text-muted">
                      {r.orderId.slice(0, 8)}...
                    </td>
                    <td className="sa-td sa-td--right sa-fw-600">
                      {formatCurrency(r.refundAmount)}
                    </td>
                    <td className="sa-td sa-text-muted sa-nowrap" style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.reason}
                    </td>
                    <td className="sa-td" style={{ textAlign: "center" }}>
                      <span style={{ padding: "2px 8px", borderRadius: "9999px", fontSize: 11, fontWeight: 600, background: style.bg, color: style.color }}>
                        {style.label}
                      </span>
                    </td>
                    <td className="sa-td sa-text-sm sa-text-muted">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="sa-td" style={{ textAlign: "center" }}>
                      {r.status === "initiated" && (
                        <div className="sa-flex sa-gap-4" style={{ justifyContent: "center" }}>
                          <button
                            onClick={() => handleApprove(r.id, r.refundAmount)}
                            disabled={actionLoading !== null}
                            className="sa-btn-xs" style={{ background: "var(--color-success-soft)", color: "var(--color-success-dark)", border: "1px solid var(--color-success)", cursor: actionLoading !== null ? "not-allowed" : "pointer", opacity: actionLoading !== null && actionLoading !== r.id ? 0.5 : 1 }}
                          >
                            {actionLoading === r.id ? "Approving..." : "Approve"}
                          </button>
                          <button
                            onClick={() => setRejectId(r.id)}
                            disabled={actionLoading !== null}
                            className="sa-btn-xs" style={{ background: "var(--color-error-soft)", color: "var(--color-error-dark)", border: "1px solid var(--color-error)", cursor: actionLoading !== null ? "not-allowed" : "pointer", opacity: actionLoading !== null && actionLoading !== r.id ? 0.5 : 1 }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {r.status === "failed" && r.failureReason && (
                        <span className="sa-text-xs sa-text-error" title={r.failureReason}>Failed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {total > limit && (
            <div className="sa-pagination" style={{ justifyContent: "center" }}>
              <button
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                className="sa-btn-ghost-sm"
                style={{ opacity: offset === 0 ? 0.5 : 1, cursor: offset === 0 ? "not-allowed" : "pointer" }}
              >
                Previous
              </button>
              <span className="sa-page-info">
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                className="sa-btn-ghost-sm"
                style={{ opacity: offset + limit >= total ? 0.5 : 1, cursor: offset + limit >= total ? "not-allowed" : "pointer" }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className="sa-modal-overlay" onClick={() => { setRejectId(null); setRejectReason(""); }} onKeyDown={(e) => { if (e.key === 'Escape') { setRejectId(null); setRejectReason(""); } }}>
          <div className="sa-modal-sm" role="dialog" aria-modal="true" aria-labelledby="reject-modal-title" onClick={(e) => e.stopPropagation()}>
            <h3 className="sa-modal-title" id="reject-modal-title">Reject Refund</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              className="sa-textarea"
              style={{ minHeight: "80px" }}
            />
            <div className="sa-modal-actions">
              <button onClick={() => { setRejectId(null); setRejectReason(""); }} className="sa-btn-ghost-sm">
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || actionLoading === rejectId}
                className="sa-btn-danger-sm"
                style={{ opacity: !rejectReason.trim() ? 0.5 : 1, cursor: !rejectReason.trim() ? "not-allowed" : "pointer" }}
              >
                Reject Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
