// SA-001: Payments tab extracted from App.tsx
import { useState } from "react";
import type { PosEvent } from "../api/posEvents";
import { PayloadDetails } from "../components/PayloadDetails";
import { formatDateTime } from "../lib/formatters";

interface PaymentsTabProps {
  paymentEvents: PosEvent[];
  // UIUX-SA-013: Accept loading/error from parent to avoid misleading empty state
  loading?: boolean;
  error?: string | null;
  // R3-PAY-001: Total fetched event count and fetch limit to detect server-side truncation
  totalEventCount?: number;
  fetchLimit?: number;
}

// EVENTS-PAYMENTS-CLIENTSIDE-PAGINATION: page payment events to prevent rendering 1000+ rows
const PAYMENTS_PAGE_SIZE = 50;

export function PaymentsTab({ paymentEvents, loading, error, totalEventCount, fetchLimit }: PaymentsTabProps) {
  const [page, setPage] = useState(0);
  // R2-FIX PAY-001: Clamp page to valid range (prevents out-of-bounds when events change)
  // ESLint: derive clamped page from state + props instead of using setState in useEffect
  const maxPage = Math.max(0, Math.ceil(paymentEvents.length / PAYMENTS_PAGE_SIZE) - 1);
  const clampedPage = Math.min(page, maxPage);
  const pageEvents = paymentEvents.slice(clampedPage * PAYMENTS_PAGE_SIZE, (clampedPage + 1) * PAYMENTS_PAGE_SIZE);

  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Payments</div>
        <div className="muted">Events where eventType starts with PAYMENT_</div>
      </div>

      {/* R3-PAY-001: Warn when server-side fetch limit may have truncated results */}
      {typeof totalEventCount === "number" && typeof fetchLimit === "number" && totalEventCount >= fetchLimit && (
        <div className="sa-text-sm sa-px-12 sa-py-8" style={{ background: "#fff3cd", color: "#856404", borderRadius: 4, margin: "8px 12px" }}>
          Showing payment events from the first {fetchLimit} events fetched. Some events may not be displayed. Increase the fetch limit to see more.
        </div>
      )}

      {/* UIUX-SA-013: Show loading/error states instead of misleading empty state */}
      {loading ? (
        <div className="empty sa-text-muted">Loading payment events...</div>
      ) : error ? (
        <div className="empty sa-text-danger" role="alert">{error}</div>
      ) : paymentEvents.length === 0 ? (
        <div className="empty">No payment events found for the current filters.</div>
      ) : (
        <>
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
                {pageEvents.map((e) => (
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
          {paymentEvents.length > PAYMENTS_PAGE_SIZE && (
            <div className="sa-flex sa-gap-12 sa-text-sm sa-text-muted sa-px-12 sa-py-8">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={clampedPage === 0} className="sa-btn-xs">←</button>
              <span>Page {clampedPage + 1} / {maxPage + 1} ({paymentEvents.length} total)</span>
              <button onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={clampedPage >= maxPage} className="sa-btn-xs">→</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
