// SA-P1-015: Reorder Policy Supervision — SuperAdmin read-only view
import type { ReorderPolicyRecord, ReorderAuditEntry } from "../api/reorderPolicies";
import { formatDateTime } from "../lib/formatters";

interface ReorderPoliciesTabProps {
  policies: ReorderPolicyRecord[];
  policiesLoading: boolean;
  policiesError: string;
  policiesTotal: number;
  policiesOffset: number;
  auditLog: ReorderAuditEntry[];
  auditLoading: boolean;
  auditError: string;
  auditTotal: number;
  auditOffset: number;
  setPoliciesOffset: (v: number) => void;
  setAuditOffset: (v: number) => void;
  refreshPolicies: () => void;
  refreshAudit: () => void;
}

export function ReorderPoliciesTab({
  policies, policiesLoading, policiesError, policiesTotal, policiesOffset,
  auditLog, auditLoading, auditError, auditTotal, auditOffset,
  setPoliciesOffset, setAuditOffset, refreshPolicies, refreshAudit,
}: ReorderPoliciesTabProps) {
  return (
    <section className="card">
      {/* ── Policies Section ────────────────────────────────── */}
      <div className="cardHeader">
        <div className="cardTitle">Reorder Policies</div>
        <div className="muted">Per-product reorder thresholds and preferences across all stores (read-only)</div>
      </div>

      <div className="sa-flex sa-gap-8 sa-mb-16">
        <button className="btn" onClick={() => refreshPolicies()} disabled={policiesLoading}>
          {policiesLoading ? "Loading..." : "Refresh"}
        </button>
        <span className="muted sa-text-sm" style={{ marginLeft: "auto" }}>
          {policiesTotal} {policiesTotal === 1 ? "policy" : "policies"} total
        </span>
      </div>

      {policiesError && <div className="banner sa-mb-12" role="alert">{policiesError}</div>}

      {policies.length > 0 && (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Product</th>
                <th>Min Stock</th>
                <th>Target Stock</th>
                <th>Max Reorder</th>
                <th>Supplier</th>
                <th>Enabled</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td className="sa-text-sm">{p.storeName || p.storeId?.slice(0, 8) || "-"}</td>
                  <td
                    className="sa-fw-600 sa-nowrap"
                    style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", cursor: "default" }}
                    title={p.productName ?? undefined}
                  >{p.productName || p.productId?.slice(0, 8) || "-"}</td>
                  <td>{p.minStock}</td>
                  <td>{p.targetStock}</td>
                  <td>{p.maxReorderQty ?? "-"}</td>
                  <td className="sa-text-sm">{p.supplierName || (p.preferredSupplierId ? p.preferredSupplierId.slice(0, 8) : "-")}</td>
                  <td>
                    <span className={p.isEnabled ? "sa-badge-info" : "sa-badge-muted"}>
                      {p.isEnabled ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="sa-text-sm">{formatDateTime(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {policiesTotal > 50 && (
        <div className="sa-flex-center sa-gap-8 sa-mt-12">
          <button className="btn btnSm" disabled={policiesOffset === 0} onClick={() => setPoliciesOffset(Math.max(0, policiesOffset - 50))}>Previous</button>
          <span className="muted sa-text-sm">{policiesOffset + 1}–{Math.min(policiesOffset + 50, policiesTotal)} of {policiesTotal}</span>
          <button className="btn btnSm" disabled={policiesOffset + 50 >= policiesTotal} onClick={() => setPoliciesOffset(policiesOffset + 50)}>Next</button>
        </div>
      )}

      {!policiesLoading && policies.length === 0 && !policiesError && (
        <div className="muted sa-text-center sa-p-20">No reorder policies found.</div>
      )}

      {/* ── Audit Log Section ───────────────────────────────── */}
      <div className="cardHeader" style={{ marginTop: 32 }}>
        <div className="cardTitle">Policy Change Audit Log</div>
        <div className="muted">Recent reorder policy changes (created, updated, deleted)</div>
      </div>

      <div className="sa-flex sa-gap-8 sa-mb-16">
        <button className="btn" onClick={() => refreshAudit()} disabled={auditLoading}>
          {auditLoading ? "Loading..." : "Refresh"}
        </button>
        <span className="muted sa-text-sm" style={{ marginLeft: "auto" }}>
          {auditTotal} {auditTotal === 1 ? "entry" : "entries"} total
        </span>
      </div>

      {auditError && <div className="banner sa-mb-12" role="alert">{auditError}</div>}

      {auditLog.length > 0 && (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Admin</th>
                <th>Entity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry.id}>
                  <td className="sa-text-sm">{formatDateTime(entry.createdAt)}</td>
                  <td className="sa-fw-600">{entry.method}</td>
                  <td className="sa-text-sm">{entry.adminEmail || entry.adminId?.slice(0, 8) || "-"}</td>
                  <td className="sa-text-sm">{entry.storeName || entry.productName || entry.entityId?.slice(0, 8) || "-"}</td>
                  <td>
                    <span className={entry.statusCode < 300 ? "sa-badge-info" : "sa-badge-warn"}>
                      {entry.statusCode}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {auditTotal > 50 && (
        <div className="sa-flex-center sa-gap-8 sa-mt-12">
          <button className="btn btnSm" disabled={auditOffset === 0} onClick={() => setAuditOffset(Math.max(0, auditOffset - 50))}>Previous</button>
          <span className="muted sa-text-sm">{auditOffset + 1}–{Math.min(auditOffset + 50, auditTotal)} of {auditTotal}</span>
          <button className="btn btnSm" disabled={auditOffset + 50 >= auditTotal} onClick={() => setAuditOffset(auditOffset + 50)}>Next</button>
        </div>
      )}

      {!auditLoading && auditLog.length === 0 && !auditError && (
        <div className="muted sa-text-center sa-p-20">No audit log entries found.</div>
      )}
    </section>
  );
}
