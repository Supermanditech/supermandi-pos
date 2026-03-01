// SA-001: Audit logs tab extracted from App.tsx
import type { AuditLogRecord } from "../api/audit";
import { PayloadDetails } from "../components/PayloadDetails";
import { formatDateTime } from "../lib/formatters";

// #186.11: CSV export helper
// REQ.AUDIT.W5.SUPERADMIN.AUDIT-CSV-NON-RFC4180.001: RFC 4180 compliant field escaping
function escapeField(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  // RFC 4180: quote fields containing comma, double-quote, or newline; escape inner quotes by doubling
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `"${s}"`;
}

function exportAuditCsv(logs: AuditLogRecord[]) {
  const header = "Time,Action,Resource,ResourceID,Actor,Status,Error\n";
  const rows = logs.map(l =>
    [
      l.created_at,
      l.action,
      l.resource_type,
      l.resource_id || "",
      l.actor_user_id || l.actor_ip || "system",
      l.response_status ?? "",
      l.error_message || "",
    ].map(escapeField).join(",")
  ).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface AuditTabProps {
  auditLogs: AuditLogRecord[];
  auditLogsTotal: number;
  auditLogsLoading: boolean;
  auditLogsError: string;
  auditLogsPage: number;
  auditLogsFilter: { action?: string; resource_type?: string; from_date?: string; to_date?: string };
  setAuditLogsPage: (fn: (p: number) => number) => void;
  setAuditLogsFilter: (fn: (f: { action?: string; resource_type?: string; from_date?: string; to_date?: string }) => { action?: string; resource_type?: string; from_date?: string; to_date?: string }) => void;
  refreshAuditLogs: () => void;
}

export function AuditTab({
  auditLogs,
  auditLogsTotal,
  auditLogsLoading,
  auditLogsError,
  auditLogsPage,
  auditLogsFilter,
  setAuditLogsPage,
  setAuditLogsFilter,
  refreshAuditLogs,
}: AuditTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Audit Logs</div>
        <div className="muted">System activity and admin actions ({auditLogsTotal} total)</div>
      </div>

      <div className="tableWrap">
        <div className="sa-flex sa-gap-8 sa-mb-12 sa-flex-wrap">
          <button onClick={() => refreshAuditLogs()} disabled={auditLogsLoading}>
            {auditLogsLoading ? "Loading..." : "Refresh"}
          </button>

          <label htmlFor="filter-audit-action" className="sa-sr-only">Action</label>
          <select
            id="filter-audit-action"
            value={auditLogsFilter.action || ""}
            onChange={(e) => {
              setAuditLogsFilter(prev => ({ ...prev, action: e.target.value || undefined }));
              setAuditLogsPage(() => 0);
            }}
            className="sa-select"
          >
            <option value="">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
            <option value="login">Login</option>
          </select>

          <label htmlFor="filter-audit-resource" className="sa-sr-only">Resource type</label>
          <select
            id="filter-audit-resource"
            value={auditLogsFilter.resource_type || ""}
            onChange={(e) => {
              setAuditLogsFilter(prev => ({ ...prev, resource_type: e.target.value || undefined }));
              setAuditLogsPage(() => 0);
            }}
            className="sa-select"
          >
            <option value="">All Resources</option>
            <option value="store">Store</option>
            <option value="device">Device</option>
            <option value="user">User</option>
            <option value="supplier">Supplier</option>
            <option value="product">Product</option>
          </select>

          {/* #186.10: Date range filter */}
          <label htmlFor="filter-audit-from" className="sa-sr-only">From date</label>
          <input
            id="filter-audit-from"
            type="date"
            value={auditLogsFilter.from_date || ""}
            onChange={(e) => {
              setAuditLogsFilter(prev => ({ ...prev, from_date: e.target.value || undefined }));
              setAuditLogsPage(() => 0);
            }}
            className="sa-input"
            title="From date"
          />
          <span className="muted">to</span>
          <label htmlFor="filter-audit-to" className="sa-sr-only">To date</label>
          <input
            id="filter-audit-to"
            type="date"
            value={auditLogsFilter.to_date || ""}
            onChange={(e) => {
              setAuditLogsFilter(prev => ({ ...prev, to_date: e.target.value || undefined }));
              setAuditLogsPage(() => 0);
            }}
            className="sa-input"
            title="To date"
          />

          {/* #186.11: CSV export */}
          <button
            onClick={() => exportAuditCsv(auditLogs)}
            disabled={auditLogs.length === 0}
            title="Export current page as CSV"
            className="sa-btn-sm"
          >
            Export CSV
          </button>

          <div className="sa-flex sa-gap-8" style={{ marginLeft: "auto" }}>
            <button
              disabled={auditLogsPage === 0}
              onClick={() => setAuditLogsPage(prev => Math.max(0, prev - 1))}
            >
              &larr; Prev
            </button>
            <span className="muted">Page {auditLogsPage + 1} of {Math.max(1, Math.ceil(auditLogsTotal / 50))}</span>
            <button
              disabled={(auditLogsPage + 1) * 50 >= auditLogsTotal}
              onClick={() => setAuditLogsPage(prev => prev + 1)}
            >
              Next &rarr;
            </button>
          </div>
        </div>

        {auditLogsError && <div className="errorText sa-mb-8">{auditLogsError}</div>}

        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Resource ID</th>
              <th>Actor</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td className="mono sa-text-sm">
                  {formatDateTime(log.created_at)}
                </td>
                <td>
                  <span className={
                    log.action === "delete" ? "sa-badge-error" :
                    log.action === "create" ? "sa-badge-ok" :
                    log.action === "approve" ? "sa-badge-info" :
                    log.action === "reject" ? "sa-badge-warn" : "sa-badge-muted"
                  }>
                    {log.action.toUpperCase()}
                  </span>
                </td>
                <td>{log.resource_type}</td>
                <td className="mono sa-text-xs" style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {log.resource_id || "-"}
                </td>
                <td className="mono sa-text-xs" style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {log.actor_user_id || log.actor_ip || "system"}
                </td>
                <td>
                  {log.response_status ? (
                    <span className={log.response_status >= 400 ? "sa-text-error" : "sa-text-success"}>
                      {log.response_status}
                    </span>
                  ) : "-"}
                </td>
                <td>
                  {log.error_message && (
                    <span className="sa-text-error sa-text-sm">{log.error_message}</span>
                  )}
                  {log.request_body && !log.error_message && (
                    <PayloadDetails payload={log.request_body} />
                  )}
                </td>
              </tr>
            ))}
            {auditLogs.length === 0 && !auditLogsLoading && (
              <tr>
                <td colSpan={7} className="sa-text-center sa-text-muted sa-p-24">
                  No audit logs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
