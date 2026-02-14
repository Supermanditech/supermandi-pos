// SA-001: Audit logs tab extracted from App.tsx
import type { AuditLogRecord } from "../api/audit";
import { PayloadDetails } from "../components/PayloadDetails";
import { formatDateTime } from "../lib/formatters";

// #186.11: CSV export helper
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
      (l.error_message || "").replace(/"/g, '""'),
    ].map(v => `"${v}"`).join(",")
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => refreshAuditLogs()} disabled={auditLogsLoading}>
            {auditLogsLoading ? "Loading..." : "Refresh"}
          </button>

          <select
            value={auditLogsFilter.action || ""}
            onChange={(e) => {
              setAuditLogsFilter(prev => ({ ...prev, action: e.target.value || undefined }));
              setAuditLogsPage(() => 0);
            }}
            style={{ padding: "6px 10px" }}
          >
            <option value="">All Actions</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
            <option value="login">Login</option>
          </select>

          <select
            value={auditLogsFilter.resource_type || ""}
            onChange={(e) => {
              setAuditLogsFilter(prev => ({ ...prev, resource_type: e.target.value || undefined }));
              setAuditLogsPage(() => 0);
            }}
            style={{ padding: "6px 10px" }}
          >
            <option value="">All Resources</option>
            <option value="store">Store</option>
            <option value="device">Device</option>
            <option value="user">User</option>
            <option value="supplier">Supplier</option>
            <option value="product">Product</option>
          </select>

          {/* #186.10: Date range filter */}
          <input
            type="date"
            value={auditLogsFilter.from_date || ""}
            onChange={(e) => {
              setAuditLogsFilter(prev => ({ ...prev, from_date: e.target.value || undefined }));
              setAuditLogsPage(() => 0);
            }}
            style={{ padding: "5px 8px" }}
            title="From date"
          />
          <span className="muted">to</span>
          <input
            type="date"
            value={auditLogsFilter.to_date || ""}
            onChange={(e) => {
              setAuditLogsFilter(prev => ({ ...prev, to_date: e.target.value || undefined }));
              setAuditLogsPage(() => 0);
            }}
            style={{ padding: "5px 8px" }}
            title="To date"
          />

          {/* #186.11: CSV export */}
          <button
            onClick={() => exportAuditCsv(auditLogs)}
            disabled={auditLogs.length === 0}
            title="Export current page as CSV"
            style={{ padding: "6px 12px" }}
          >
            Export CSV
          </button>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
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

        {auditLogsError && <div className="errorText" style={{ marginBottom: 8 }}>{auditLogsError}</div>}

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
                <td className="mono" style={{ fontSize: 12 }}>
                  {formatDateTime(log.created_at)}
                </td>
                <td>
                  <span style={{
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    background: log.action === "delete" ? "#ffebee" :
                               log.action === "create" ? "#e8f5e9" :
                               log.action === "approve" ? "#e3f2fd" :
                               log.action === "reject" ? "#fff3e0" : "#f5f5f5",
                    color: log.action === "delete" ? "#c62828" :
                           log.action === "create" ? "#2e7d32" :
                           log.action === "approve" ? "#1565c0" :
                           log.action === "reject" ? "#e65100" : "#666"
                  }}>
                    {log.action.toUpperCase()}
                  </span>
                </td>
                <td>{log.resource_type}</td>
                <td className="mono" style={{ fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {log.resource_id || "-"}
                </td>
                <td className="mono" style={{ fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {log.actor_user_id || log.actor_ip || "system"}
                </td>
                <td>
                  {log.response_status ? (
                    <span style={{
                      color: log.response_status >= 400 ? "#c62828" : "#2e7d32"
                    }}>
                      {log.response_status}
                    </span>
                  ) : "-"}
                </td>
                <td>
                  {log.error_message && (
                    <span style={{ color: "#c62828", fontSize: 12 }}>{log.error_message}</span>
                  )}
                  {log.request_body && !log.error_message && (
                    <PayloadDetails payload={log.request_body} />
                  )}
                </td>
              </tr>
            ))}
            {auditLogs.length === 0 && !auditLogsLoading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "#888", padding: 24 }}>
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
