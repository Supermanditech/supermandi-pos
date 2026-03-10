// SA-001: Events tab extracted from App.tsx
import type { PosEvent } from "../api/posEvents";
import type { GroupKey } from "../types";
import { PayloadDetails } from "../components/PayloadDetails";
import { formatDateTime } from "../lib/formatters";

interface EventsTabProps {
  filteredEvents: PosEvent[];
  pageEvents: PosEvent[];
  grouped: Array<{ key: string; count: number; lastSeen: string; lastEventType: string }>;
  groupBy: GroupKey;
  page: number;
  setPage: (fn: (p: number) => number) => void;
  pageSize: number;
  // R7.SA.004: Loading state indicator
  loading?: boolean;
  // R7.SA.005: Error state display
  error?: string;
}

export function EventsTab({
  filteredEvents,
  pageEvents,
  grouped,
  groupBy,
  page,
  setPage,
  pageSize,
  loading,
  error,
}: EventsTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Event Stream</div>
        <div className="muted">Showing {filteredEvents.length} events (newest first)</div>
      </div>

      {/* R7.SA.005: Error state display */}
      {error && (
        <div className="banner sa-mb-12" role="alert">
          {error}
        </div>
      )}

      {/* R7.SA.004: Loading state indicator */}
      {loading && (
        <div className="muted sa-py-8 sa-text-center">
          Loading events…
        </div>
      )}

      {groupBy !== "none" && (
        <div className="tableWrap">
          <div className="muted sa-mb-8">
            Grouped by <span className="mono">{groupBy}</span> (showing {grouped.length} groups)
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{groupBy}</th>
                <th>Count</th>
                <th>Last seen</th>
                <th>Last event</th>
              </tr>
            </thead>
            <tbody>
              {grouped.slice(0, 50).map((g) => (
                <tr key={g.key}>
                  <td className="mono">{g.key}</td>
                  <td className="mono">{g.count}</td>
                  <td className="mono">{formatDateTime(g.lastSeen)}</td>
                  <td className="mono">{g.lastEventType}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {grouped.length > 50 && <div className="muted sa-mt-8">Showing first 50 groups.</div>}
        </div>
      )}

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="sa-flex sa-gap-8 sa-flex-wrap">
          <button className="tab" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            Prev
          </button>
          <button
            className="tab"
            onClick={() => {
              const maxPage = Math.max(0, Math.ceil(filteredEvents.length / pageSize) - 1);
              setPage((p) => Math.min(maxPage, p + 1));
            }}
            disabled={page >= Math.max(0, Math.ceil(filteredEvents.length / pageSize) - 1)}
          >
            Next
          </button>
          <span className="muted">
            Page {page + 1} / {Math.max(1, Math.ceil(filteredEvents.length / pageSize))}
          </span>
        </div>
      </div>

      {/* R3-EVT-002: Don't show empty state while loading */}
      {filteredEvents.length === 0 && !loading ? (
        <div className="empty">No events found for the current filters.</div>
      ) : filteredEvents.length === 0 ? null : (
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
      )}
    </section>
  );
}
