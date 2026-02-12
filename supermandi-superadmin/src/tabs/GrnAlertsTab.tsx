// SA-001: GRN excess alerts tab extracted from App.tsx
import type { GrnExcessAlert } from "../api/grnAlerts";
import { formatDateTime } from "../lib/formatters";

interface GrnAlertsTabProps {
  grnAlerts: GrnExcessAlert[];
  grnAlertsLoading: boolean;
  grnAlertsError: string;
  grnAlertsFilter: "" | "OPEN" | "ACKNOWLEDGED" | "DISMISSED";
  grnAlertsTotal: number;
  grnAlertsOpenCount: number;
  grnAlertsOffset: number;
  grnAlertActionLoading: string | null;
  setGrnAlertsFilter: (v: "" | "OPEN" | "ACKNOWLEDGED" | "DISMISSED") => void;
  setGrnAlertsOffset: (v: number) => void;
  refreshGrnAlerts: () => void;
  handleGrnAlertAction: (alertId: string, status: "ACKNOWLEDGED" | "DISMISSED") => void;
}

export function GrnAlertsTab({
  grnAlerts, grnAlertsLoading, grnAlertsError, grnAlertsFilter,
  grnAlertsTotal, grnAlertsOpenCount, grnAlertsOffset, grnAlertActionLoading,
  setGrnAlertsFilter, setGrnAlertsOffset, refreshGrnAlerts, handleGrnAlertAction,
}: GrnAlertsTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">GRN Excess Receipt Alerts</div>
        <div className="muted">Items received in quantities exceeding purchase order amounts</div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <select value={grnAlertsFilter} onChange={(e) => { setGrnAlertsFilter(e.target.value as any); setGrnAlertsOffset(0); }} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}>
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
        <button className="btn" onClick={() => refreshGrnAlerts()} disabled={grnAlertsLoading}>
          {grnAlertsLoading ? "Loading..." : "Refresh"}
        </button>
        <span className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>
          {grnAlertsTotal} alert{grnAlertsTotal !== 1 ? "s" : ""} total
          {grnAlertsOpenCount > 0 && (
            <span style={{ marginLeft: 6, color: "#f59e0b", fontWeight: 600 }}>({grnAlertsOpenCount} open)</span>
          )}
        </span>
      </div>

      {grnAlertsError && <div className="alertDanger" style={{ marginBottom: 12 }}>{grnAlertsError}</div>}

      {grnAlerts.length > 0 && (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Store</th><th>Order #</th><th>Product</th><th>Ordered</th><th>Received</th><th>Excess</th><th>%</th><th>Status</th><th>Date</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grnAlerts.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontSize: 12 }}>{a.store_name || a.store_id.slice(0, 8)}</td>
                  <td style={{ fontSize: 12 }}>{a.order_number || a.purchase_order_id.slice(0, 8)}</td>
                  <td style={{ fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.product_name}</td>
                  <td>{a.ordered_qty}</td>
                  <td style={{ fontWeight: 600 }}>{a.total_received_qty}</td>
                  <td style={{ color: "#dc2626", fontWeight: 600 }}>+{a.excess_qty}</td>
                  <td style={{ color: "#f59e0b", fontWeight: 600 }}>{a.excess_pct}%</td>
                  <td>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: a.status === "OPEN" ? "#fef3c7" : a.status === "ACKNOWLEDGED" ? "#dbeafe" : "#f1f5f9", color: a.status === "OPEN" ? "#92400e" : a.status === "ACKNOWLEDGED" ? "#1e40af" : "#475569" }}>
                      {a.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDateTime(a.created_at)}</td>
                  <td>
                    {a.status === "OPEN" && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btnSm" onClick={() => handleGrnAlertAction(a.id, "ACKNOWLEDGED")} disabled={grnAlertActionLoading === a.id} style={{ fontSize: 11, padding: "2px 8px" }}>Acknowledge</button>
                        <button className="btnGhost btnSm" onClick={() => handleGrnAlertAction(a.id, "DISMISSED")} disabled={grnAlertActionLoading === a.id} style={{ fontSize: 11, padding: "2px 8px" }}>Dismiss</button>
                      </div>
                    )}
                    {a.status !== "OPEN" && a.acknowledged_at && (
                      <span className="muted" style={{ fontSize: 11 }}>{formatDateTime(a.acknowledged_at)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {grnAlertsTotal > 50 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 12 }}>
          <button className="btn btnSm" disabled={grnAlertsOffset === 0} onClick={() => setGrnAlertsOffset(Math.max(0, grnAlertsOffset - 50))}>Previous</button>
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>{grnAlertsOffset + 1}–{Math.min(grnAlertsOffset + 50, grnAlertsTotal)} of {grnAlertsTotal}</span>
          <button className="btn btnSm" disabled={grnAlertsOffset + 50 >= grnAlertsTotal} onClick={() => setGrnAlertsOffset(grnAlertsOffset + 50)}>Next</button>
        </div>
      )}

      {!grnAlertsLoading && grnAlerts.length === 0 && !grnAlertsError && (
        <div className="muted" style={{ textAlign: "center", padding: 32 }}>No GRN excess alerts found.</div>
      )}
    </section>
  );
}
