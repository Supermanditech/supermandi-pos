// WA-002: SuperAdmin WhatsApp Dashboard
// Message log viewer, stats, send form, broadcast
import { useState, useEffect, useCallback } from "react";
import {
  fetchWhatsAppStatus,
  fetchWhatsAppStats,
  fetchWhatsAppLogs,
  sendWhatsAppMessage,
  sendWhatsAppBroadcast,
  type WhatsAppLogEntry,
  type WhatsAppStats,
} from "../api/whatsapp";
import { formatDateTime } from "../lib/formatters";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  sent:      { bg: "#dbeafe", color: "#1e40af" },
  delivered: { bg: "#dcfce7", color: "#166534" },
  read:      { bg: "#f0fdf4", color: "#15803d" },
  failed:    { bg: "#fee2e2", color: "#991b1b" },
  queued:    { bg: "#f3f4f6", color: "#6b7280" },
};

export function WhatsAppTab() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [stats, setStats] = useState<WhatsAppStats | null>(null);
  const [logs, setLogs] = useState<WhatsAppLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterSender, setFilterSender] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterContext, setFilterContext] = useState("");

  // Send form
  const [sendPhone, setSendPhone] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendType, setSendType] = useState<"retailer" | "supplier">("retailer");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  // Broadcast form
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastPhones, setBroadcastPhones] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastType, setBroadcastType] = useState<"retailer" | "supplier">("retailer");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  const limit = 25;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, statsRes, logsRes] = await Promise.all([
        fetchWhatsAppStatus(),
        fetchWhatsAppStats(),
        fetchWhatsAppLogs({
          limit,
          offset,
          senderType: filterSender || undefined,
          deliveryStatus: filterStatus || undefined,
          contextType: filterContext || undefined,
        }),
      ]);
      setConfigured(statusRes.configured);
      setStats(statsRes);
      setLogs(logsRes.data);
      setTotal(logsRes.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load WhatsApp data");
    } finally {
      setLoading(false);
    }
  }, [offset, filterSender, filterStatus, filterContext]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSend = async () => {
    if (!sendPhone.trim() || !sendMessage.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const result = await sendWhatsAppMessage({
        recipientPhone: sendPhone.trim(),
        message: sendMessage.trim(),
        recipientType: sendType,
      });
      if (result.sent) {
        setSendResult("Message sent successfully");
        setSendPhone("");
        setSendMessage("");
        loadData();
      } else {
        setSendResult(`Failed: ${result.error || "Unknown error"}`);
      }
    } catch (err) {
      setSendResult(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  const handleBroadcast = async () => {
    const phones = broadcastPhones.split(/[,\n]/).map(p => p.trim()).filter(Boolean);
    if (phones.length === 0 || !broadcastMessage.trim()) return;
    if (phones.length > 50) { setBroadcastResult("Max 50 recipients"); return; }
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const result = await sendWhatsAppBroadcast({
        phones,
        message: broadcastMessage.trim(),
        recipientType: broadcastType,
      });
      setBroadcastResult(`Sent: ${result.sent}, Failed: ${result.failed}${result.errors.length > 0 ? ` — ${result.errors.join("; ")}` : ""}`);
      if (result.sent > 0) loadData();
    } catch (err) {
      setBroadcastResult(err instanceof Error ? err.message : "Broadcast failed");
    } finally {
      setBroadcasting(false);
    }
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div style={{ padding: "0.5rem 0" }}>
      {/* Status Banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem",
        padding: "0.75rem 1rem", background: configured ? "#f0fdf4" : "#fef3c7",
        borderRadius: 8, border: `1px solid ${configured ? "#bbf7d0" : "#fde68a"}`,
      }}>
        <span style={{ fontSize: "1.25rem" }}>{configured ? "\u2705" : "\u26A0\uFE0F"}</span>
        <span style={{ fontWeight: 600, color: configured ? "#166534" : "#92400e" }}>
          {configured === null ? "Checking..." : configured ? "WhatsApp Cloud API Connected" : "WhatsApp Not Configured"}
        </span>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {[
            { label: "Total", value: stats.totalMessages, bg: "#f1f5f9" },
            { label: "Sent", value: stats.sent, bg: "#dbeafe" },
            { label: "Delivered", value: stats.delivered, bg: "#dcfce7" },
            { label: "Read", value: stats.read, bg: "#f0fdf4" },
            { label: "Failed", value: stats.failed, bg: "#fee2e2" },
            { label: "Last 24h", value: stats.last24h, bg: "#fef3c7" },
            { label: "Last 7d", value: stats.last7d, bg: "#e0e7ff" },
          ].map(card => (
            <div key={card.label} style={{
              padding: "0.75rem", background: card.bg, borderRadius: 8,
              textAlign: "center",
            }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{card.value}</div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Send Message Form */}
      <div style={{
        padding: "1rem", background: "#fff", border: "1px solid #e2e8f0",
        borderRadius: 8, marginBottom: "1rem",
      }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Send Message</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 2 }}>Recipient Phone</label>
            <input
              type="tel"
              value={sendPhone}
              onChange={e => setSendPhone(e.target.value)}
              placeholder="+91 98765 43210"
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.85rem", width: 180 }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 2 }}>Type</label>
            <select value={sendType} onChange={e => setSendType(e.target.value as "retailer" | "supplier")}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.85rem" }}>
              <option value="retailer">Retailer</option>
              <option value="supplier">Supplier</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 2 }}>Message</label>
            <input
              type="text"
              value={sendMessage}
              onChange={e => setSendMessage(e.target.value)}
              placeholder="Type your message..."
              maxLength={4096}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.85rem", width: "100%" }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={sending || !sendPhone.trim() || !sendMessage.trim()}
            style={{
              padding: "6px 16px", background: "#25D366", color: "#fff", border: "none",
              borderRadius: 4, cursor: sending ? "default" : "pointer", fontSize: "0.85rem",
              fontWeight: 600, opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? "Sending..." : "Send"}
          </button>
          <button
            onClick={() => setShowBroadcast(!showBroadcast)}
            style={{
              padding: "6px 12px", background: "#f1f5f9", border: "1px solid #d1d5db",
              borderRadius: 4, cursor: "pointer", fontSize: "0.85rem",
            }}
          >
            {showBroadcast ? "Hide Broadcast" : "Broadcast"}
          </button>
        </div>
        {sendResult && (
          <div style={{
            marginTop: "0.5rem", fontSize: "0.8rem", padding: "4px 8px", borderRadius: 4,
            background: sendResult.startsWith("Failed") ? "#fee2e2" : "#dcfce7",
            color: sendResult.startsWith("Failed") ? "#991b1b" : "#166534",
          }}>{sendResult}</div>
        )}
      </div>

      {/* Broadcast Form (expandable) */}
      {showBroadcast && (
        <div style={{
          padding: "1rem", background: "#fffbeb", border: "1px solid #fde68a",
          borderRadius: 8, marginBottom: "1rem",
        }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem" }}>Broadcast Message (max 50 recipients)</h3>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 2 }}>Phone Numbers (comma or newline separated)</label>
              <textarea
                value={broadcastPhones}
                onChange={e => setBroadcastPhones(e.target.value)}
                placeholder={"9876543210\n9123456789"}
                rows={3}
                style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.85rem", width: "100%", resize: "vertical" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 2 }}>Message</label>
              <textarea
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                placeholder="Type broadcast message..."
                rows={3}
                maxLength={4096}
                style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.85rem", width: "100%", resize: "vertical" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "center" }}>
            <select value={broadcastType} onChange={e => setBroadcastType(e.target.value as "retailer" | "supplier")}
              style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.85rem" }}>
              <option value="retailer">Retailer</option>
              <option value="supplier">Supplier</option>
            </select>
            <button
              onClick={handleBroadcast}
              disabled={broadcasting}
              style={{
                padding: "6px 16px", background: "#f59e0b", color: "#fff", border: "none",
                borderRadius: 4, cursor: broadcasting ? "default" : "pointer", fontSize: "0.85rem",
                fontWeight: 600, opacity: broadcasting ? 0.6 : 1,
              }}
            >
              {broadcasting ? "Sending..." : "Send Broadcast"}
            </button>
          </div>
          {broadcastResult && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", padding: "4px 8px", borderRadius: 4, background: "#fef3c7" }}>
              {broadcastResult}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterSender} onChange={e => { setFilterSender(e.target.value); setOffset(0); }}
          style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.8rem" }}>
          <option value="">All Senders</option>
          <option value="pos">POS</option>
          <option value="superadmin">SuperAdmin</option>
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setOffset(0); }}
          style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.8rem" }}>
          <option value="">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="read">Read</option>
          <option value="failed">Failed</option>
        </select>
        <select value={filterContext} onChange={e => { setFilterContext(e.target.value); setOffset(0); }}
          style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.8rem" }}>
          <option value="">All Types</option>
          <option value="bill_receipt">Bill Receipt</option>
          <option value="order_update">Order Update</option>
          <option value="broadcast">Broadcast</option>
          <option value="support">Support</option>
        </select>
        <span style={{ fontSize: "0.8rem", color: "#64748b" }}>{total} message{total !== 1 ? "s" : ""}</span>
        <button onClick={loadData} style={{
          padding: "4px 10px", border: "1px solid #d1d5db", borderRadius: 4,
          background: "#fff", cursor: "pointer", fontSize: "0.8rem",
        }}>Refresh</button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "0.5rem", background: "#fee2e2", color: "#991b1b", borderRadius: 4, marginBottom: "0.75rem", fontSize: "0.85rem" }}>
          {error} <button onClick={loadData} style={{ marginLeft: 8, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "#991b1b" }}>Retry</button>
        </div>
      )}

      {/* Message Log Table */}
      <div style={{ overflow: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 }}>
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Loading messages...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>No messages found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f8fafc" }}>
                <th style={{ padding: "8px", textAlign: "left" }}>Time</th>
                <th style={{ padding: "8px", textAlign: "left" }}>From</th>
                <th style={{ padding: "8px", textAlign: "left" }}>To</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Phone</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Preview</th>
                <th style={{ padding: "8px", textAlign: "center" }}>Status</th>
                <th style={{ padding: "8px", textAlign: "left" }}>Context</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const sc = STATUS_COLORS[log.deliveryStatus] || STATUS_COLORS.queued;
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatDateTime(log.createdAt)}</td>
                    <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{log.senderType}</td>
                    <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{log.recipientType}</td>
                    <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: "0.75rem" }}>{log.recipientPhone}</td>
                    <td style={{ padding: "6px 8px", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.contentPreview || ""}>
                      {log.contentPreview || "—"}
                    </td>
                    <td style={{ padding: "6px 8px", textAlign: "center" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: "0.7rem", fontWeight: 600,
                        background: sc.bg, color: sc.color,
                      }}>
                        {log.deliveryStatus}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: "0.75rem", color: "#64748b" }}>{log.contextType || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "0.75rem", alignItems: "center" }}>
          <button disabled={currentPage <= 1} onClick={() => setOffset(offset - limit)}
            style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 4, cursor: currentPage <= 1 ? "default" : "pointer", opacity: currentPage <= 1 ? 0.5 : 1 }}>
            Prev
          </button>
          <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Page {currentPage} of {totalPages}</span>
          <button disabled={currentPage >= totalPages} onClick={() => setOffset(offset + limit)}
            style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 4, cursor: currentPage >= totalPages ? "default" : "pointer", opacity: currentPage >= totalPages ? 0.5 : 1 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
