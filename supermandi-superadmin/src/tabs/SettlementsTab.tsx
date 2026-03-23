// GCP-STG-0355: SuperAdmin Settlement Management Tab
import { useCallback, useEffect, useState } from "react";
import {
  fetchSettlements,
  fetchSettlementSummary,
  approveSettlement,
  bulkApproveSettlements,
  markSettlementPaid,
  type SettlementRecord,
  type SettlementSummary,
  type SettlementStatus,
} from "../api/settlements";
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
import { formatDateTime } from "../lib/formatters";

// STG-813: Use Indian comma grouping
const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
function formatCurrency(minor: number): string {
  return inrFmt.format(minor / 100);
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:     { bg: "var(--color-warning-soft)", color: "var(--color-warning-dark)", label: "Pending" },
  approved:    { bg: "var(--color-primary-light)", color: "var(--color-primary-dark)", label: "Approved" },
  scheduled:   { bg: "var(--color-primary-light)", color: "var(--color-primary-dark)", label: "Scheduled" },
  paid:        { bg: "var(--color-success-soft)", color: "var(--color-success-dark)", label: "Paid" },
  reconciled:  { bg: "var(--color-success-soft)", color: "var(--color-success-dark)", label: "Reconciled" },
  disputed:    { bg: "var(--color-error-soft)", color: "var(--color-error-dark)", label: "Disputed" },
  cancelled:   { bg: "var(--color-border)", color: "var(--color-text-secondary)", label: "Cancelled" },
};

const STATUS_FILTER_OPTIONS: Array<{ value: SettlementStatus | ""; label: string }> = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "reconciled", label: "Reconciled" },
  { value: "disputed", label: "Disputed" },
  { value: "cancelled", label: "Cancelled" },
];

export function SettlementsTab() {
  // List state
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Filters
  const [statusFilter, setStatusFilter] = useState<SettlementStatus | "">("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Summary
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);

  // Mark Paid modal
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutUtr, setPayoutUtr] = useState("");

  // Bulk approve input
  const [bulkSupplierId, setBulkSupplierId] = useState("");

  const refreshList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchSettlements({
        status: statusFilter || undefined,
        supplierId: supplierFilter.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit,
        offset,
      });
      setSettlements(result.data);
      setTotal(result.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load settlements");
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter, supplierFilter, fromDate, toDate]);

  const refreshSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const s = await fetchSettlementSummary();
      setSummary(s);
    } catch {
      // Non-critical — summary is optional
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => { refreshList(); }, [refreshList]);
  useEffect(() => { refreshSummary(); }, [refreshSummary]);

  // R7.SA.007: Approve with confirmation dialog (money-movement)
  const handleApprove = (id: string, amount: number) => {
    setConfirmDialog({
      title: "Approve Settlement",
      message: `Approve payout of ${formatCurrency(amount)}? This will mark the settlement as approved for disbursement.`,
      confirmLabel: "Approve",
      variant: "warning",
      onConfirm: () => {
        setConfirmDialog(null);
        executeApprove(id);
      },
    });
  };

  const executeApprove = async (id: string) => {
    setError("");
    setActionLoading(id);
    try {
      await approveSettlement(id);
      await Promise.all([refreshList(), refreshSummary()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Bulk approve with confirmation
  const handleBulkApprove = () => {
    if (!bulkSupplierId.trim()) return;
    setConfirmDialog({
      title: "Bulk Approve Settlements",
      message: `Approve ALL pending settlements for supplier ${bulkSupplierId.trim()}?`,
      confirmLabel: "Bulk Approve",
      variant: "warning",
      onConfirm: () => {
        setConfirmDialog(null);
        executeBulkApprove();
      },
    });
  };

  const executeBulkApprove = async () => {
    setError("");
    setActionLoading("bulk");
    try {
      const count = await bulkApproveSettlements(bulkSupplierId.trim());
      setBulkSupplierId("");
      setError(""); // clear any stale error
      // Show success inline — count might be 0 if none were pending
      if (count === 0) {
        setError("No pending settlements found for this supplier.");
      }
      await Promise.all([refreshList(), refreshSummary()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bulk approve failed");
    } finally {
      setActionLoading(null);
    }
  };

  // Mark paid
  const handleMarkPaid = async () => {
    if (!markPaidId || !payoutRef.trim()) return;
    setError("");
    setActionLoading(markPaidId);
    try {
      await markSettlementPaid(markPaidId, payoutRef.trim(), payoutUtr.trim() || undefined);
      setMarkPaidId(null);
      setPayoutRef("");
      setPayoutUtr("");
      await Promise.all([refreshList(), refreshSummary()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Mark paid failed");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="sa-p-24">
      {/* R7.SA.007: Confirmation dialog for money-movement actions */}
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} loading={actionLoading !== null} />}

      {/* Header */}
      <div className="sa-flex-between sa-mb-20">
        <div>
          <h2 className="sa-text-xl sa-fw-700">Settlement Management</h2>
          <p className="sa-text-md sa-text-muted sa-mt-4">
            {total} total settlements{statusFilter ? ` (${statusFilter})` : ""}
          </p>
        </div>
        <button onClick={() => { refreshList(); refreshSummary(); }} className="sa-btn-ghost-sm">
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {summary && !summaryLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
          <div style={{ padding: "16px", borderRadius: "8px", background: "var(--color-warning-soft)", border: "1px solid var(--color-warning)" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-warning-dark)", textTransform: "uppercase" }}>Pending</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-warning-dark)", marginTop: "4px" }}>{formatCurrency(summary.totalPendingMinor)}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{summary.pendingCount} settlement{summary.pendingCount !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ padding: "16px", borderRadius: "8px", background: "var(--color-primary-light)", border: "1px solid var(--color-primary)" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-primary-dark)", textTransform: "uppercase" }}>Approved</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-primary-dark)", marginTop: "4px" }}>{formatCurrency(summary.totalApprovedMinor)}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{summary.approvedCount} settlement{summary.approvedCount !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ padding: "16px", borderRadius: "8px", background: "var(--color-success-soft)", border: "1px solid var(--color-success)" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-success-dark)", textTransform: "uppercase" }}>Paid</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-success-dark)", marginTop: "4px" }}>{formatCurrency(summary.totalPaidMinor)}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px" }}>{summary.paidCount} settlement{summary.paidCount !== 1 ? "s" : ""}</div>
          </div>
        </div>
      )}
      {summaryLoading && <div className="sa-text-center sa-p-12 sa-text-muted">Loading summary...</div>}

      {/* Filters */}
      <div className="sa-flex sa-gap-8 sa-mb-16" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label htmlFor="filter-settlement-status" className="sa-sr-only">Status</label>
          <select
            id="filter-settlement-status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as SettlementStatus | ""); setOffset(0); }}
            className="sa-select"
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-settlement-supplier" className="sa-sr-only">Supplier ID</label>
          <input
            id="filter-settlement-supplier"
            type="text"
            placeholder="Supplier ID..."
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            onBlur={() => { setOffset(0); refreshList(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { setOffset(0); refreshList(); } }}
            className="sa-input"
            style={{ width: "180px" }}
          />
        </div>
        <div>
          <label htmlFor="filter-settlement-from" className="sa-sr-only">From date</label>
          <input
            id="filter-settlement-from"
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setOffset(0); }}
            className="sa-input"
          />
        </div>
        <div>
          <label htmlFor="filter-settlement-to" className="sa-sr-only">To date</label>
          <input
            id="filter-settlement-to"
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setOffset(0); }}
            className="sa-input"
          />
        </div>
      </div>

      {/* Bulk approve */}
      <div className="sa-flex sa-gap-8 sa-mb-16" style={{ alignItems: "center" }}>
        <label htmlFor="bulk-approve-supplier" className="sa-sr-only">Bulk approve supplier ID</label>
        <input
          id="bulk-approve-supplier"
          type="text"
          placeholder="Supplier ID for bulk approve..."
          value={bulkSupplierId}
          onChange={(e) => setBulkSupplierId(e.target.value)}
          className="sa-input"
          style={{ width: "220px" }}
        />
        <button
          onClick={handleBulkApprove}
          disabled={!bulkSupplierId.trim() || actionLoading !== null}
          className="sa-btn-xs"
          style={{
            background: "var(--color-warning-soft)",
            color: "var(--color-warning-dark)",
            border: "1px solid var(--color-warning)",
            cursor: !bulkSupplierId.trim() || actionLoading !== null ? "not-allowed" : "pointer",
            opacity: !bulkSupplierId.trim() ? 0.5 : 1,
          }}
        >
          {actionLoading === "bulk" ? "Approving..." : "Bulk Approve"}
        </button>
      </div>

      {error && <div className="sa-alert-error sa-mb-16" role="alert">{error}</div>}

      {loading ? (
        <div className="sa-text-center sa-p-24 sa-text-muted">Loading settlements...</div>
      ) : settlements.length === 0 ? (
        <div className="sa-text-center sa-p-24 sa-text-muted">No settlements found</div>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th className="sa-th">Supplier</th>
                <th className="sa-th">Store</th>
                <th className="sa-th sa-th--right">Gross</th>
                <th className="sa-th sa-th--right">Commission</th>
                <th className="sa-th sa-th--right">Net Payout</th>
                <th className="sa-th" style={{ textAlign: "center" }}>Status</th>
                <th className="sa-th">Date</th>
                <th className="sa-th" style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => {
                const style = STATUS_STYLES[s.status] || STATUS_STYLES.pending;
                return (
                  <tr key={s.id}>
                    <td className="sa-td">
                      <div className="sa-fw-500">{s.supplierName || s.supplierId.slice(0, 12)}</div>
                      <div className="sa-text-xs sa-text-muted">{s.billingModel}</div>
                    </td>
                    <td className="sa-td sa-text-muted">
                      {s.storeName || s.storeId.slice(0, 12)}
                    </td>
                    <td className="sa-td sa-td--right sa-fw-500">
                      {formatCurrency(s.grossAmountMinor)}
                    </td>
                    <td className="sa-td sa-td--right sa-text-muted">
                      {formatCurrency(s.commissionMinor)}
                      <div className="sa-text-xs">{s.commissionPercent}%</div>
                    </td>
                    <td className="sa-td sa-td--right sa-fw-600">
                      {formatCurrency(s.netPayoutMinor)}
                    </td>
                    <td className="sa-td" style={{ textAlign: "center" }}>
                      <span style={{ padding: "2px 8px", borderRadius: "9999px", fontSize: 11, fontWeight: 600, background: style.bg, color: style.color }}>
                        {style.label}
                      </span>
                    </td>
                    <td className="sa-td sa-text-sm sa-text-muted">
                      {formatDateTime(s.createdAt)}
                    </td>
                    <td className="sa-td" style={{ textAlign: "center" }}>
                      <div className="sa-flex sa-gap-4" style={{ justifyContent: "center" }}>
                        {s.status === "pending" && (
                          <button
                            onClick={() => handleApprove(s.id, s.netPayoutMinor)}
                            disabled={actionLoading !== null}
                            className="sa-btn-xs"
                            style={{
                              background: "var(--color-success-soft)",
                              color: "var(--color-success-dark)",
                              border: "1px solid var(--color-success)",
                              cursor: actionLoading !== null ? "not-allowed" : "pointer",
                              opacity: actionLoading !== null && actionLoading !== s.id ? 0.5 : 1,
                            }}
                          >
                            {actionLoading === s.id ? "Approving..." : "Approve"}
                          </button>
                        )}
                        {s.status === "approved" && (
                          <button
                            onClick={() => setMarkPaidId(s.id)}
                            disabled={actionLoading !== null}
                            className="sa-btn-xs"
                            style={{
                              background: "var(--color-primary-light)",
                              color: "var(--color-primary-dark)",
                              border: "1px solid var(--color-primary)",
                              cursor: actionLoading !== null ? "not-allowed" : "pointer",
                              opacity: actionLoading !== null && actionLoading !== s.id ? 0.5 : 1,
                            }}
                          >
                            Mark Paid
                          </button>
                        )}
                        {s.payoutUtr && (
                          <span className="sa-text-xs sa-text-muted" title={`UTR: ${s.payoutUtr}`}>
                            UTR: {s.payoutUtr.slice(0, 12)}
                          </span>
                        )}
                      </div>
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

      {/* Mark Paid Modal */}
      {markPaidId && (
        <div className="sa-modal-overlay" onClick={() => { setMarkPaidId(null); setPayoutRef(""); setPayoutUtr(""); }} onKeyDown={(e) => { if (e.key === "Escape") { setMarkPaidId(null); setPayoutRef(""); setPayoutUtr(""); } }}>
          <div className="sa-modal-sm" role="dialog" aria-modal="true" aria-labelledby="mark-paid-modal-title" onClick={(e) => e.stopPropagation()}>
            <h3 className="sa-modal-title" id="mark-paid-modal-title">Mark Settlement as Paid</h3>
            <div style={{ marginBottom: "12px" }}>
              <label htmlFor="payout-ref" style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
                Payout Reference <span style={{ color: "var(--color-error)" }}>*</span>
              </label>
              <input
                id="payout-ref"
                type="text"
                value={payoutRef}
                onChange={(e) => setPayoutRef(e.target.value)}
                placeholder="e.g. NEFT/IMPS reference..."
                className="sa-input"
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label htmlFor="payout-utr" style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
                UTR Number (optional)
              </label>
              <input
                id="payout-utr"
                type="text"
                value={payoutUtr}
                onChange={(e) => setPayoutUtr(e.target.value)}
                placeholder="UTR number..."
                className="sa-input"
                style={{ width: "100%" }}
              />
            </div>
            <div className="sa-modal-actions">
              <button onClick={() => { setMarkPaidId(null); setPayoutRef(""); setPayoutUtr(""); }} className="sa-btn-ghost-sm">
                Cancel
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={!payoutRef.trim() || actionLoading === markPaidId}
                className="sa-btn-xs"
                style={{
                  background: "var(--color-success-soft)",
                  color: "var(--color-success-dark)",
                  border: "1px solid var(--color-success)",
                  cursor: !payoutRef.trim() ? "not-allowed" : "pointer",
                  opacity: !payoutRef.trim() ? 0.5 : 1,
                }}
              >
                {actionLoading === markPaidId ? "Saving..." : "Mark as Paid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
