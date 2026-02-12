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
}

export function EventsTab({
  filteredEvents,
  pageEvents,
  grouped,
  groupBy,
  page,
  setPage,
  pageSize,
}: EventsTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div className="cardTitle">Event Stream</div>
        <div className="muted">Showing {filteredEvents.length} events (newest first)</div>
      </div>

      {groupBy !== "none" && (
        <div className="tableWrap">
          <div className="muted" style={{ marginBottom: 8 }}>
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
          {grouped.length > 50 && <div className="muted" style={{ marginTop: 8 }}>Showing first 50 groups.</div>}
        </div>
      )}

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="tab" onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Prev
          </button>
          <button
            className="tab"
            onClick={() => {
              const maxPage = Math.max(0, Math.ceil(filteredEvents.length / pageSize) - 1);
              setPage((p) => Math.min(maxPage, p + 1));
            }}
          >
            Next
          </button>
          <span className="muted">
            Page {page + 1} / {Math.max(1, Math.ceil(filteredEvents.length / pageSize))}
          </span>
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="empty">No events found for the current filters.</div>
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
