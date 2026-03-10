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

      <div className="sa-flex sa-gap-8 sa-mb-16">
        <select value={grnAlertsFilter} onChange={(e) => { setGrnAlertsFilter(e.target.value as any); setGrnAlertsOffset(0); }} className="sa-select sa-radius-6">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
        <button className="btn" onClick={() => refreshGrnAlerts()} disabled={grnAlertsLoading}>
          {grnAlertsLoading ? "Loading..." : "Refresh"}
        </button>
        <span className="muted sa-text-sm" style={{ marginLeft: "auto" }}>
          {grnAlertsTotal} alert{grnAlertsTotal !== 1 ? "s" : ""} total
          {grnAlertsOpenCount > 0 && (
            <span className="sa-text-warning sa-fw-600" style={{ marginLeft: 6 }}>({grnAlertsOpenCount} open)</span>
          )}
        </span>
      </div>

      {grnAlertsError && <div className="banner sa-mb-12" role="alert">{grnAlertsError}</div>}

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
                  <td className="sa-text-sm">{a.store_name || a.store_id.slice(0, 8)}</td>
                  <td className="sa-text-sm">{a.order_number || a.purchase_order_id.slice(0, 8)}</td>
                  <td
                    className="sa-fw-600 sa-nowrap"
                    style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", cursor: "default" }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Product: ${a.product_name}`}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); } }}
                  >{a.product_name}</td>
                  <td>{a.ordered_qty}</td>
                  <td className="sa-fw-600">{a.total_received_qty}</td>
                  <td className="sa-text-danger sa-fw-600">+{a.excess_qty}</td>
                  <td className="sa-text-warning sa-fw-600">{a.excess_pct}%</td>
                  <td>
                    <span className={a.status === "OPEN" ? "sa-badge-warn" : a.status === "ACKNOWLEDGED" ? "sa-badge-info" : "sa-badge-muted"}>
                      {a.status}
                    </span>
                  </td>
                  <td className="sa-text-sm">{formatDateTime(a.created_at)}</td>
                  <td>
                    {a.status === "OPEN" && (
                      <div className="sa-flex sa-gap-4">
                        <button className="sa-btn-xs" onClick={() => handleGrnAlertAction(a.id, "ACKNOWLEDGED")} disabled={grnAlertActionLoading === a.id}>{grnAlertActionLoading === a.id ? "Updating..." : "Acknowledge"}</button>
                        <button className="sa-btn-ghost-sm sa-btn-xs" onClick={() => handleGrnAlertAction(a.id, "DISMISSED")} disabled={grnAlertActionLoading === a.id}>{grnAlertActionLoading === a.id ? "Updating..." : "Dismiss"}</button>
                      </div>
                    )}
                    {a.status !== "OPEN" && a.acknowledged_at && (
                      <span className="muted sa-text-xs">{formatDateTime(a.acknowledged_at)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {grnAlertsTotal > 50 && (
        <div className="sa-flex-center sa-gap-8 sa-mt-12">
          <button className="btn btnSm" disabled={grnAlertsOffset === 0} onClick={() => setGrnAlertsOffset(Math.max(0, grnAlertsOffset - 50))}>Previous</button>
          <span className="muted sa-text-sm">{grnAlertsOffset + 1}–{Math.min(grnAlertsOffset + 50, grnAlertsTotal)} of {grnAlertsTotal}</span>
          <button className="btn btnSm" disabled={grnAlertsOffset + 50 >= grnAlertsTotal} onClick={() => setGrnAlertsOffset(grnAlertsOffset + 50)}>Next</button>
        </div>
      )}

      {!grnAlertsLoading && grnAlerts.length === 0 && !grnAlertsError && (
        <div className="muted sa-text-center sa-p-20">No GRN excess alerts found.</div>
      )}
    </section>
  );
}
