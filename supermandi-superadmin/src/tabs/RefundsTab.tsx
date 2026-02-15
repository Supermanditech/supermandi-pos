// T-219: SuperAdmin Refund Management Tab
import { useCallback, useEffect, useState } from "react";
import { fetchRefunds, approveRefund, rejectRefund, type RefundRequest, type RefundStatus } from "../api/refunds";

function formatCurrency(minor: number): string {
  return "\u20B9" + (minor / 100).toFixed(2);
}

const STATUS_STYLES: Record<RefundStatus, { bg: string; color: string; label: string }> = {
  initiated:  { bg: "#fef3c7", color: "#92400e", label: "Initiated" },
  processing: { bg: "#dbeafe", color: "#1e40af", label: "Processing" },
  processed:  { bg: "#dcfce7", color: "#166534", label: "Processed" },
  failed:     { bg: "#fecaca", color: "#991b1b", label: "Failed" },
  cancelled:  { bg: "#e5e7eb", color: "#6b7280", label: "Cancelled" },
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
    } catch (err: any) {
      setError(err.message || "Failed to load refunds");
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await approveRefund(id);
      await refresh();
    } catch (err: any) {
      setError(err.message || "Approve failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    setActionLoading(rejectId);
    try {
      await rejectRefund(rejectId, rejectReason.trim());
      setRejectId(null);
      setRejectReason("");
      await refresh();
    } catch (err: any) {
      setError(err.message || "Reject failed");
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  return (
    <div style={{ padding: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1e293b" }}>Refund Management</h2>
          <p style={{ fontSize: "0.8125rem", color: "#64748b", marginTop: "0.25rem" }}>
            {total} total refund requests{statusFilter ? ` (${statusFilter})` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as RefundStatus | ""); setOffset(0); }}
            style={{ padding: "0.375rem 0.75rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.8125rem" }}
          >
            <option value="">All Statuses</option>
            <option value="initiated">Initiated</option>
            <option value="processing">Processing</option>
            <option value="processed">Processed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={refresh} style={{ padding: "0.375rem 0.75rem", fontSize: "0.8125rem", background: "#f1f5f9", border: "1px solid #d1d5db", borderRadius: "0.375rem", cursor: "pointer" }}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div style={{ padding: "0.75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "0.5rem", color: "#991b1b", marginBottom: "1rem", fontSize: "0.8125rem" }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>Loading refunds...</div>
      ) : refunds.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#9ca3af" }}>No refund requests found</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Store</th>
                <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Order</th>
                <th style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontWeight: 600, color: "#475569" }}>Amount</th>
                <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Reason</th>
                <th style={{ padding: "0.625rem 0.75rem", textAlign: "center", fontWeight: 600, color: "#475569" }}>Status</th>
                <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, color: "#475569" }}>Date</th>
                <th style={{ padding: "0.625rem 0.75rem", textAlign: "center", fontWeight: 600, color: "#475569" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => {
                const style = STATUS_STYLES[r.status] || STATUS_STYLES.initiated;
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.625rem 0.75rem" }}>
                      <div style={{ fontWeight: 500, color: "#1e293b" }}>{r.storeName || r.storeId.slice(0, 8)}</div>
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", fontFamily: "monospace", fontSize: "0.75rem", color: "#475569" }}>
                      {r.orderId.slice(0, 8)}...
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontWeight: 600, color: "#1e293b" }}>
                      {formatCurrency(r.refundAmount)}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", color: "#475569", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.reason}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "center" }}>
                      <span style={{ padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600, background: style.bg, color: style.color }}>
                        {style.label}
                      </span>
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", fontSize: "0.75rem", color: "#64748b" }}>
                      {formatDate(r.createdAt)}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "center" }}>
                      {r.status === "initiated" && (
                        <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                          <button
                            onClick={() => handleApprove(r.id)}
                            disabled={actionLoading === r.id}
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "0.25rem", cursor: actionLoading === r.id ? "not-allowed" : "pointer" }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setRejectId(r.id)}
                            disabled={actionLoading === r.id}
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: "0.25rem", cursor: actionLoading === r.id ? "not-allowed" : "pointer" }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {r.status === "failed" && r.failureReason && (
                        <span style={{ fontSize: "0.6875rem", color: "#991b1b" }} title={r.failureReason}>Failed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {total > limit && (
            <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem" }}>
              <button
                disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                style={{ padding: "0.375rem 0.75rem", fontSize: "0.8125rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", cursor: offset === 0 ? "not-allowed" : "pointer", opacity: offset === 0 ? 0.5 : 1 }}
              >
                Previous
              </button>
              <span style={{ padding: "0.375rem 0.75rem", fontSize: "0.8125rem", color: "#6b7280" }}>
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                disabled={offset + limit >= total}
                onClick={() => setOffset((o) => o + limit)}
                style={{ padding: "0.375rem 0.75rem", fontSize: "0.8125rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", cursor: offset + limit >= total ? "not-allowed" : "pointer", opacity: offset + limit >= total ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }} onClick={() => { setRejectId(null); setRejectReason(""); }}>
          <div style={{ background: "#fff", borderRadius: "0.75rem", padding: "1.5rem", maxWidth: "400px", width: "90%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#1e293b", marginBottom: "0.75rem" }}>Reject Refund</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              style={{ width: "100%", minHeight: "80px", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.8125rem", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button onClick={() => { setRejectId(null); setRejectReason(""); }} style={{ padding: "0.375rem 0.75rem", fontSize: "0.8125rem", background: "#f1f5f9", border: "1px solid #d1d5db", borderRadius: "0.375rem", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || actionLoading === rejectId}
                style={{ padding: "0.375rem 0.75rem", fontSize: "0.8125rem", background: "#991b1b", color: "#fff", border: "none", borderRadius: "0.375rem", cursor: !rejectReason.trim() ? "not-allowed" : "pointer", opacity: !rejectReason.trim() ? 0.5 : 1 }}
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
