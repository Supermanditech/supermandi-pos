// SA-001: Payments tab extracted from App.tsx
import type { PosEvent } from "../api/posEvents";
import { PayloadDetails } from "../components/PayloadDetails";
import { formatDateTime } from "../lib/formatters";

interface PaymentsTabProps {
  paymentEvents: PosEvent[];
  // UIUX-SA-013: Accept loading/error from parent to avoid misleading empty state
  loading?: boolean;
  error?: string | null;
}

export function PaymentsTab({ paymentEvents, loading, error }: PaymentsTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Payments</div>
        <div className="muted">Events where eventType starts with PAYMENT_</div>
      </div>

      {/* UIUX-SA-013: Show loading/error states instead of misleading empty state */}
      {loading ? (
        <div className="empty" style={{ color: '#64748b' }}>Loading payment events...</div>
      ) : error ? (
        <div className="empty" style={{ color: '#dc2626' }}>{error}</div>
      ) : paymentEvents.length === 0 ? (
        <div className="empty">No payment events found for the current filters.</div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Device ID</th>
                <th>Store ID</th>
                <th>Event Type</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {paymentEvents.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{formatDateTime(e.createdAt)}</td>
                  <td className="mono">{e.deviceId}</td>
                  <td className="mono">{e.storeId}</td>
                  <td className="mono">{e.eventType}</td>
                  <td>
                    <PayloadDetails payload={e.payload} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
