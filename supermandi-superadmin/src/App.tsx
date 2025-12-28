import { useEffect, useMemo, useState } from "react";
import { fetchHealth } from "./api/health";
import { fetchPosEvents, type PosEvent } from "./api/posEvents";
import { askAi } from "./api/ai";
import { ADMIN_TOKEN_STORAGE_KEY, getAdminToken } from "./api/authToken";
import "./App.css";

type TabKey = "events" | "devices" | "stores" | "payments" | "ai";
type GroupKey = "none" | "transactionId" | "billId";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function toIsoSafe(v: string): string {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
}

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function PayloadDetails({ payload }: { payload: unknown }) {
  const [open, setOpen] = useState(false);

  const text = useMemo(() => {
    if (!open) return "";
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }, [open, payload]);

  return (
    <details
      onToggle={(e) => {
        const el = e.currentTarget;
        setOpen(el.open);
      }}
    >
      <summary className="summary">View JSON</summary>
      {open && <pre className="json">{text}</pre>}
    </details>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabKey>("events");

  // Runtime admin token (stored in localStorage). This avoids committing secrets.
  const [adminTokenInput, setAdminTokenInput] = useState<string>("");

  const [health, setHealth] = useState<{ ok: boolean; statusText: string; lastCheckedAt?: string }>(
    { ok: false, statusText: "unknown" }
  );

  const [events, setEvents] = useState<PosEvent[]>([]);
  const [eventsError, setEventsError] = useState<string>("");
  const [healthError, setHealthError] = useState<string>("");
  const [lastRefreshAt, setLastRefreshAt] = useState<string>("");

  // AI panel
  const [aiQuestion, setAiQuestion] = useState<string>("");
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [aiError, setAiError] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Filters (apply to event table + payments view)
  const [deviceIdFilter, setDeviceIdFilter] = useState<string>("");
  const [storeIdFilter, setStoreIdFilter] = useState<string>("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [limit, setLimit] = useState<number>(200); // fetch window

  // View options
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState<number>(0);

  async function refreshHealth() {
    try {
      const data = await fetchHealth();
      const ok = String(data.status).toLowerCase() === "ok";
      setHealth({ ok, statusText: data.status, lastCheckedAt: new Date().toISOString() });
      setHealthError("");
    } catch (e: any) {
      setHealth({ ok: false, statusText: "down", lastCheckedAt: new Date().toISOString() });
      setHealthError(e?.message ? String(e.message) : "Backend unreachable");
    }
  }

  async function refreshEvents() {
    try {
      // Fetch raw stream (filters are applied client-side in the UI).
      const data = await fetchPosEvents({ limit: clamp(limit, 50, 1000) });
      // Always newest first.
      data.sort((a, b) => (toIsoSafe(b.createdAt) > toIsoSafe(a.createdAt) ? 1 : -1));
      setEvents(data);
      setEventsError("");
      setLastRefreshAt(new Date().toISOString());
    } catch (e: any) {
      setEventsError(e?.message ? String(e.message) : "Failed to fetch events");
      setLastRefreshAt(new Date().toISOString());
    }
  }

  useEffect(() => {
    // Pre-fill token UI from storage/env (do not expose full token; user can overwrite).
    const existing = getAdminToken();
    setAdminTokenInput(existing ? "********" : "");

    refreshHealth();
    refreshEvents();

    const id = setInterval(() => {
      refreshHealth();
      refreshEvents();
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // If user changes limit, refresh immediately.
  useEffect(() => {
    refreshEvents();
    setPage(0);
  }, [limit]);

  useEffect(() => {
    setPage(0);
  }, [deviceIdFilter, storeIdFilter, eventTypeFilter]);

  const filteredEvents = useMemo(() => {
    const d = deviceIdFilter.trim();
    const s = storeIdFilter.trim();
    const t = eventTypeFilter.trim();
    return events.filter((e) => {
      if (d && !includesInsensitive(e.deviceId, d)) return false;
      if (s && !includesInsensitive(e.storeId, s)) return false;
      if (t && !includesInsensitive(e.eventType, t)) return false;
      return true;
    });
  }, [events, deviceIdFilter, storeIdFilter, eventTypeFilter]);

  const devices = useMemo(() => {
    const byDevice = new Map<
      string,
      { deviceId: string; lastSeen: string; lastEventType: string; storeId: string; eventCount: number }
    >();
    for (const e of events) {
      const prev = byDevice.get(e.deviceId);
      const createdAtIso = toIsoSafe(e.createdAt);
      if (!prev || createdAtIso > prev.lastSeen) {
        byDevice.set(e.deviceId, {
          deviceId: e.deviceId,
          lastSeen: createdAtIso,
          lastEventType: e.eventType,
          storeId: e.storeId,
          eventCount: (prev?.eventCount ?? 0) + 1
        });
      } else {
        prev.eventCount += 1;
      }
    }
    return Array.from(byDevice.values()).sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
  }, [events]);

  const stores = useMemo(() => {
    const byStore = new Map<string, { storeId: string; eventCount: number; lastSeen: string }>();
    for (const e of events) {
      const prev = byStore.get(e.storeId) ?? { storeId: e.storeId, eventCount: 0, lastSeen: toIsoSafe(e.createdAt) };
      prev.eventCount += 1;
      const createdAtIso = toIsoSafe(e.createdAt);
      if (createdAtIso > prev.lastSeen) prev.lastSeen = createdAtIso;
      byStore.set(e.storeId, prev);
    }
    return Array.from(byStore.values()).sort((a, b) => b.eventCount - a.eventCount);
  }, [events]);

  const paymentEvents = useMemo(() => {
    return filteredEvents.filter((e) => e.eventType.toUpperCase().startsWith("PAYMENT_"));
  }, [filteredEvents]);

  const pageEvents = useMemo(() => {
    const start = page * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, page, pageSize]);

  function extractKey(e: PosEvent, key: GroupKey): string | null {
    if (key === "none") return null;
    const p: any = e.payload;
    if (!p || typeof p !== "object") return null;
    const raw = key === "transactionId" ? p.transactionId : p.billId;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }

  const grouped = useMemo(() => {
    if (groupBy === "none") return [] as Array<{ key: string; count: number; lastSeen: string; lastEventType: string }>;
    const map = new Map<string, { key: string; count: number; lastSeen: string; lastEventType: string }>();
    for (const e of filteredEvents) {
      const k = extractKey(e, groupBy);
      if (!k) continue;
      const iso = toIsoSafe(e.createdAt);
      const prev = map.get(k);
      if (!prev) {
        map.set(k, { key: k, count: 1, lastSeen: iso, lastEventType: e.eventType });
      } else {
        prev.count += 1;
        if (iso > prev.lastSeen) {
          prev.lastSeen = iso;
          prev.lastEventType = e.eventType;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
  }, [filteredEvents, groupBy]);

  function exportCsv(rows: PosEvent[]) {
    const header = ["createdAt", "deviceId", "storeId", "eventType", "payload"].join(",");
    const escape = (v: unknown) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      const safe = (s ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
      return `"${safe}"`;
    };

    const body = rows
      .map((r) => [r.createdAt, r.deviceId, r.storeId, r.eventType, escape(r.payload)].join(","))
      .join("\n");
    const csv = `${header}\n${body}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supermandi_pos_events_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">SuperMandi SuperAdmin</div>
          <div className="subtitle">Cloud POS operational dashboard</div>
        </div>

        <div className="health">
          <div className="muted" style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            <span>Admin token:</span>
            <input
              type="password"
              value={adminTokenInput}
              onChange={(e) => setAdminTokenInput(e.target.value)}
              placeholder="Set token (required for Admin APIs)"
              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #d0d5dd", width: 220 }}
            />
            <button
              className="tab"
              onClick={() => {
                try {
                  const v = adminTokenInput.trim();
                  if (!v || v === "********") {
                    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
                  } else {
                    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, v);
                  }
                } catch {
                  // ignore
                }
                refreshHealth();
                refreshEvents();
              }}
            >
              Save
            </button>
          </div>
          <div className="healthRow">
            <span className={health.ok ? "dot dotOk" : "dot dotBad"} />
            <span className="healthText">Backend: {health.ok ? "healthy" : "unreachable"}</span>
          </div>
          <div className="muted">
            {health.lastCheckedAt ? `Health checked: ${new Date(health.lastCheckedAt).toLocaleTimeString()}` : ""}
          </div>
        </div>
      </header>

      {(healthError || eventsError) && (
        <div className="banner" role="alert">
          <strong>Backend warning:</strong>
          <div className="bannerDetails">
            {healthError && <div>Health: {healthError}</div>}
            {eventsError && <div>Events: {eventsError}</div>}
          </div>
          <div className="muted">UI will keep retrying every 5 seconds.</div>
        </div>
      )}

      <nav className="tabs">
        <button className={tab === "events" ? "tab tabActive" : "tab"} onClick={() => setTab("events")}>
          Events
        </button>
        <button className={tab === "devices" ? "tab tabActive" : "tab"} onClick={() => setTab("devices")}>
          Devices
        </button>
        <button className={tab === "stores" ? "tab tabActive" : "tab"} onClick={() => setTab("stores")}>
          Stores
        </button>
        <button className={tab === "payments" ? "tab tabActive" : "tab"} onClick={() => setTab("payments")}>
          Payments
        </button>
        <button className={tab === "ai" ? "tab tabActive" : "tab"} onClick={() => setTab("ai")}>
          SuperMandi AI
        </button>

        <div className="tabsRight muted">
          {lastRefreshAt ? `Last refresh: ${new Date(lastRefreshAt).toLocaleTimeString()}` : ""}
        </div>
      </nav>

      <section className="controls">
        <div className="control">
          <label>Device ID</label>
          <input value={deviceIdFilter} onChange={(e) => setDeviceIdFilter(e.target.value)} placeholder="e.g. dev-1" />
        </div>
        <div className="control">
          <label>Store ID</label>
          <input value={storeIdFilter} onChange={(e) => setStoreIdFilter(e.target.value)} placeholder="e.g. store-1" />
        </div>
        <div className="control">
          <label>Event Type</label>
          <input value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)} placeholder="e.g. PAYMENT_" />
        </div>
        <div className="control">
          <label>Limit</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>

        <div className="control">
          <label>Page size</label>
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
        </div>

        <div className="control">
          <label>Group by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupKey)}>
            <option value="none">None</option>
            <option value="transactionId">transactionId</option>
            <option value="billId">billId</option>
          </select>
        </div>

        <div className="control">
          <label>&nbsp;</label>
          <button onClick={() => {
            refreshHealth();
            refreshEvents();
          }}>
            Refresh now
          </button>
        </div>

        <div className="control">
          <label>&nbsp;</label>
          <button onClick={() => exportCsv(filteredEvents)}>
            Export CSV
          </button>
        </div>
      </section>

      {tab === "events" && (
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
                      <td className="mono">{new Date(g.lastSeen).toLocaleString()}</td>
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
                      <td className="mono">{new Date(e.createdAt).toLocaleString()}</td>
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
      )}

      {tab === "devices" && (
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Devices</div>
            <div className="muted">Unique devices in last {limit} events: {devices.length}</div>
          </div>

          {devices.length === 0 ? (
            <div className="empty">No devices seen yet.</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Device ID</th>
                    <th>Store ID (last)</th>
                    <th>Last seen</th>
                    <th>Last event</th>
                    <th>Events (window)</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr key={d.deviceId}>
                      <td className="mono">{d.deviceId}</td>
                      <td className="mono">{d.storeId}</td>
                      <td className="mono">{new Date(d.lastSeen).toLocaleString()}</td>
                      <td className="mono">{d.lastEventType}</td>
                      <td className="mono">{d.eventCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "stores" && (
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Stores</div>
            <div className="muted">Activity summary in last {limit} events</div>
          </div>

          {stores.length === 0 ? (
            <div className="empty">No stores seen yet.</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Store ID</th>
                    <th>Event count</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.storeId}>
                      <td className="mono">{s.storeId}</td>
                      <td className="mono">{s.eventCount}</td>
                      <td className="mono">{new Date(s.lastSeen).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "payments" && (
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
                      <td className="mono">{new Date(e.createdAt).toLocaleString()}</td>
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
      )}

      {tab === "ai" && (
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">SuperMandi AI (Ops Copilot)</div>
            <div className="muted">Read-only • Uses last ~150 events as context</div>
          </div>

          <div className="tableWrap">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="tab"
                  onClick={() => setAiQuestion("Explain the last hour of POS activity. Focus on issues and anomalies.")}
                >
                  Explain last hour
                </button>
                <button
                  className="tab"
                  onClick={() => setAiQuestion("Why did payments fail? List likely causes from events and next steps.")}
                >
                  Why did payments fail?
                </button>
                <button
                  className="tab"
                  onClick={() => setAiQuestion("Summarize today: devices active, stores active, and any printer/network problems.")}
                >
                  Summarize today
                </button>
              </div>

              <textarea
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                rows={4}
                placeholder="Ask a question about POS activity…"
                style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #d0d5dd" }}
              />

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={async () => {
                    setAiLoading(true);
                    setAiError("");
                    setAiAnswer("");
                    try {
                      const res = await askAi(aiQuestion);
                      setAiAnswer(res.answer);
                    } catch (e: any) {
                      setAiError(e?.message ? String(e.message) : "AI request failed");
                    } finally {
                      setAiLoading(false);
                    }
                  }}
                  disabled={aiLoading}
                >
                  {aiLoading ? "Asking…" : "Ask"}
                </button>

                <button
                  className="tab"
                  onClick={() => {
                    setAiQuestion("");
                    setAiAnswer("");
                    setAiError("");
                  }}
                >
                  Clear
                </button>

                {aiError && <span style={{ color: "#b42318" }}>{aiError}</span>}
              </div>

              {aiAnswer && (
                <pre className="json" style={{ whiteSpace: "pre-wrap" }}>
                  {aiAnswer}
                </pre>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="footer muted">
        Tip: this dashboard is static-deployable. Set <span className="mono">VITE_API_BASE_URL</span> in hosting env.
      </footer>
    </div>
  );
}
