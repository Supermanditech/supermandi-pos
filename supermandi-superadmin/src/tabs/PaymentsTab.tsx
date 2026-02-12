// SA-001: Payments tab extracted from App.tsx
import type { PosEvent } from "../api/posEvents";
import { PayloadDetails } from "../components/PayloadDetails";
import { formatDateTime } from "../lib/formatters";

interface PaymentsTabProps {
  paymentEvents: PosEvent[];
}

export function PaymentsTab({ paymentEvents }: PaymentsTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Payments</div>
        <div className="muted">Events where eventType starts with PAYMENT_</div>
      </div>

      {paymentEvents.length === 0 ? (
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
