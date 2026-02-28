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
}

// EVENTS-PAYMENTS-CLIENTSIDE-PAGINATION: page payment events to prevent rendering 1000+ rows
const PAYMENTS_PAGE_SIZE = 50;

export function PaymentsTab({ paymentEvents, loading, error }: PaymentsTabProps) {
  const [page, setPage] = useState(0);
  const maxPage = Math.max(0, Math.ceil(paymentEvents.length / PAYMENTS_PAGE_SIZE) - 1);
  const pageEvents = paymentEvents.slice(page * PAYMENTS_PAGE_SIZE, (page + 1) * PAYMENTS_PAGE_SIZE);

  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Payments</div>
        <div className="muted">Events where eventType starts with PAYMENT_</div>
      </div>

      {/* UIUX-SA-013: Show loading/error states instead of misleading empty state */}
      {loading ? (
        <div className="empty sa-text-muted">Loading payment events...</div>
      ) : error ? (
        <div className="empty sa-text-danger">{error}</div>
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
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="sa-btn-xs">←</button>
              <span>Page {page + 1} / {maxPage + 1} ({paymentEvents.length} total)</span>
              <button onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page >= maxPage} className="sa-btn-xs">→</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
