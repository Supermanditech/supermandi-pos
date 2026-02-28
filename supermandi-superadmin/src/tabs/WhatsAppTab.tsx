// WA-002/REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001: SuperAdmin WhatsApp Dashboard
// Message log viewer, stats, send form, broadcast, and live CTA config editor
import { useState, useEffect, useCallback } from "react";
import {
  fetchWhatsAppStatus,
  fetchWhatsAppStats,
  fetchWhatsAppLogs,
  sendWhatsAppMessage,
  sendWhatsAppBroadcast,
  fetchWhatsAppCtaConfig,
  updateWhatsAppCtaConfig,
  type WhatsAppLogEntry,
  type WhatsAppStats,
  type WhatsAppCtaConfig,
} from "../api/whatsapp";
import { formatDateTime } from "../lib/formatters";
// UIUX-SA-012: Styled confirmation dialog for broadcast
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";

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
  // UIUX-SA-012: Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);

  // REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001: CTA config editor state
  const [ctaConfig, setCtaConfig] = useState<WhatsAppCtaConfig | null>(null);
  const [ctaLoading, setCtaLoading] = useState(true);
  const [ctaError, setCtaError] = useState<string | null>(null);
  const [ctaSaveResult, setCtaSaveResult] = useState<string | null>(null);
  const [ctaSaving, setCtaSaving] = useState(false);
  const [ctaEditing, setCtaEditing] = useState(false);
  // Draft edit state
  const [ctaDraft, setCtaDraft] = useState<Omit<WhatsAppCtaConfig, "updatedAt" | "updatedBy">>({
    enabled: true,
    superadminNumber: "",
    superadminMessage: "",
    companyNumber: "",
    companyMessage: "",
  });

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

  // REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001: Load CTA config
  const loadCtaConfig = useCallback(async () => {
    setCtaLoading(true);
    setCtaError(null);
    try {
      const cfg = await fetchWhatsAppCtaConfig();
      setCtaConfig(cfg);
      setCtaDraft({
        enabled: cfg.enabled,
        superadminNumber: cfg.superadminNumber,
        superadminMessage: cfg.superadminMessage,
        companyNumber: cfg.companyNumber,
        companyMessage: cfg.companyMessage,
      });
    } catch (err) {
      setCtaError(err instanceof Error ? err.message : "Failed to load CTA config");
    } finally {
      setCtaLoading(false);
    }
  }, []);

  useEffect(() => { loadCtaConfig(); }, [loadCtaConfig]);

  // REQ.AUDIT.W5.SUPERADMIN.WHATSAPP-PHONE-VALIDATION-WRONG.001:
  // Validate Indian phone numbers: 10 digits, optionally prefixed with 91 or +91
  const handleSaveCtaConfig = () => {
    const indianPhone = /^\d{10,15}$/;
    if (!indianPhone.test(ctaDraft.superadminNumber.trim())) {
      setCtaSaveResult("Error: Superadmin number must be 10-15 digits");
      return;
    }
    if (!indianPhone.test(ctaDraft.companyNumber.trim())) {
      setCtaSaveResult("Error: Company number must be 10-15 digits");
      return;
    }
    if (!ctaDraft.superadminMessage.trim() || !ctaDraft.companyMessage.trim()) {
      setCtaSaveResult("Error: Messages cannot be empty");
      return;
    }
    setConfirmDialog({
      title: "Update WhatsApp CTA Config",
      message: "This will immediately update the WhatsApp numbers shown on the live landing page.",
      detail: `Superadmin: ${ctaDraft.superadminNumber.trim()} | Company: ${ctaDraft.companyNumber.trim()} | Enabled: ${ctaDraft.enabled}`,
      confirmLabel: "Save & Apply",
      variant: "warning",
      onConfirm: async () => {
        setConfirmDialog(null);
        setCtaSaving(true);
        setCtaSaveResult(null);
        try {
          await updateWhatsAppCtaConfig({
            enabled: ctaDraft.enabled,
            superadminNumber: ctaDraft.superadminNumber.trim(),
            superadminMessage: ctaDraft.superadminMessage.trim(),
            companyNumber: ctaDraft.companyNumber.trim(),
            companyMessage: ctaDraft.companyMessage.trim(),
          });
          setCtaSaveResult("Saved. Landing page will reflect the new numbers on next page load.");
          setCtaEditing(false);
          await loadCtaConfig();
        } catch (err) {
          setCtaSaveResult(`Error: ${err instanceof Error ? err.message : "Save failed"}`);
        } finally {
          setCtaSaving(false);
        }
      },
    });
  };

  // R7.SA.008: Actual send — only called after user confirms in dialog
  const executeSend = async () => {
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

  // R7.SA.008: Show confirmation before single WhatsApp send (irrevocable action)
  const handleSend = () => {
    if (!sendPhone.trim() || !sendMessage.trim()) return;
    setConfirmDialog({
      title: "Send WhatsApp Message",
      message: `Send this message to ${sendPhone.trim()}? WhatsApp messages cannot be unsent.`,
      detail: `Preview: "${sendMessage.trim().slice(0, 80)}${sendMessage.trim().length > 80 ? "..." : ""}"`,
      confirmLabel: "Send",
      variant: "warning",
      onConfirm: () => {
        setConfirmDialog(null);
        executeSend();
      },
    });
  };

  const executeBroadcast = async (phones: string[]) => {
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

  // UIUX-SA-012: Show confirmation before sending broadcast (WhatsApp messages are irrevocable)
  const handleBroadcast = () => {
    const phones = broadcastPhones.split(/[,\n]/).map(p => p.trim()).filter(Boolean);
    if (phones.length === 0 || !broadcastMessage.trim()) return;
    if (phones.length > 50) { setBroadcastResult("Max 50 recipients"); return; }
    setConfirmDialog({
      title: "Send WhatsApp Broadcast",
      message: `Send this message to ${phones.length} recipient${phones.length > 1 ? "s" : ""}? WhatsApp messages cannot be unsent.`,
      detail: `Preview: "${broadcastMessage.trim().slice(0, 80)}${broadcastMessage.trim().length > 80 ? "..." : ""}"`,
      confirmLabel: `Send to ${phones.length}`,
      variant: "warning",
      onConfirm: () => {
        setConfirmDialog(null);
        executeBroadcast(phones);
      },
    });
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div style={{ padding: "0.5rem 0" }}>
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} loading={ctaSaving || broadcasting} />}

      {/* REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001: Landing Page CTA Config */}
      <div style={{
        padding: "1rem", background: "#fff", border: "1px solid #e2e8f0",
        borderRadius: 8, marginBottom: "1rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ctaEditing ? "0.75rem" : 0 }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>
            Landing Page WhatsApp CTA Config
          </h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {ctaConfig && !ctaEditing && (
              <span style={{
                fontSize: "0.75rem", padding: "2px 8px", borderRadius: 10,
                background: ctaConfig.enabled ? "#dcfce7" : "#f3f4f6",
                color: ctaConfig.enabled ? "#166534" : "#6b7280",
                fontWeight: 600,
              }}>
                {ctaConfig.enabled ? "Enabled" : "Disabled"}
              </span>
            )}
            <button
              onClick={() => {
                if (ctaEditing) {
                  // cancel — reset draft to saved config
                  if (ctaConfig) {
                    setCtaDraft({
                      enabled: ctaConfig.enabled,
                      superadminNumber: ctaConfig.superadminNumber,
                      superadminMessage: ctaConfig.superadminMessage,
                      companyNumber: ctaConfig.companyNumber,
                      companyMessage: ctaConfig.companyMessage,
                    });
                  }
                  setCtaSaveResult(null);
                }
                setCtaEditing(e => !e);
              }}
              style={{
                padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 4,
                background: ctaEditing ? "#f1f5f9" : "#fff", cursor: "pointer", fontSize: "0.8rem",
              }}
            >
              {ctaEditing ? "Cancel" : "Edit"}
            </button>
          </div>
        </div>

        {ctaLoading && <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Loading config...</div>}
        {ctaError && !ctaLoading && (
          <div style={{ fontSize: "0.8rem", color: "#991b1b", marginTop: "0.5rem" }}>
            {ctaError} <button onClick={loadCtaConfig} style={{ marginLeft: 8, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontSize: "0.8rem" }}>Retry</button>
          </div>
        )}

        {!ctaLoading && !ctaError && ctaConfig && !ctaEditing && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 1.5rem", marginTop: "0.5rem", fontSize: "0.8rem" }}>
            <div>
              <span style={{ color: "#64748b" }}>Superadmin number: </span>
              <strong style={{ fontFamily: "monospace" }}>{ctaConfig.superadminNumber}</strong>
            </div>
            <div>
              <span style={{ color: "#64748b" }}>Company number: </span>
              <strong style={{ fontFamily: "monospace" }}>{ctaConfig.companyNumber}</strong>
            </div>
            <div style={{ gridColumn: "1 / -1", color: "#64748b", fontSize: "0.75rem" }}>
              Superadmin msg: <em>{ctaConfig.superadminMessage}</em>
            </div>
            <div style={{ gridColumn: "1 / -1", color: "#64748b", fontSize: "0.75rem" }}>
              Company msg: <em>{ctaConfig.companyMessage}</em>
            </div>
            {ctaConfig.updatedAt && (
              <div style={{ gridColumn: "1 / -1", color: "#94a3b8", fontSize: "0.72rem", marginTop: "0.25rem" }}>
                Last updated {formatDateTime(ctaConfig.updatedAt)}{ctaConfig.updatedBy ? ` by ${ctaConfig.updatedBy}` : ""}
              </div>
            )}
          </div>
        )}

        {!ctaLoading && ctaEditing && (
          <div style={{ display: "grid", gap: "0.6rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label style={{ fontSize: "0.8rem", color: "#374151", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={ctaDraft.enabled}
                  onChange={e => setCtaDraft(d => ({ ...d, enabled: e.target.checked }))}
                  style={{ marginRight: "0.4rem" }}
                />
                Widget Enabled
              </label>
              <span style={{ fontSize: "0.72rem", color: "#64748b" }}>(uncheck to hide the floating button from the landing page)</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 1rem" }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 2 }}>
                  Superadmin Number <span style={{ color: "#94a3b8" }}>(E.164 digits, e.g. 919251893684)</span>
                </label>
                <input
                  type="tel"
                  value={ctaDraft.superadminNumber}
                  onChange={e => setCtaDraft(d => ({ ...d, superadminNumber: e.target.value }))}
                  placeholder="919251893684"
                  style={{ padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.85rem", width: "100%", fontFamily: "monospace" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 2 }}>
                  Company Number <span style={{ color: "#94a3b8" }}>(E.164 digits)</span>
                </label>
                <input
                  type="tel"
                  value={ctaDraft.companyNumber}
                  onChange={e => setCtaDraft(d => ({ ...d, companyNumber: e.target.value }))}
                  placeholder="919251893684"
                  style={{ padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.85rem", width: "100%", fontFamily: "monospace" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 2 }}>Superadmin WhatsApp Pre-fill Message</label>
                <input
                  type="text"
                  value={ctaDraft.superadminMessage}
                  onChange={e => setCtaDraft(d => ({ ...d, superadminMessage: e.target.value }))}
                  maxLength={1000}
                  style={{ padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.82rem", width: "100%" }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: 2 }}>Company WhatsApp Pre-fill Message</label>
                <input
                  type="text"
                  value={ctaDraft.companyMessage}
                  onChange={e => setCtaDraft(d => ({ ...d, companyMessage: e.target.value }))}
                  maxLength={1000}
                  style={{ padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: "0.82rem", width: "100%" }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                onClick={handleSaveCtaConfig}
                disabled={ctaSaving}
                style={{
                  padding: "6px 18px", background: "#16a34a", color: "#fff", border: "none",
                  borderRadius: 4, cursor: ctaSaving ? "default" : "pointer", fontSize: "0.85rem",
                  fontWeight: 600, opacity: ctaSaving ? 0.6 : 1,
                }}
              >
                {ctaSaving ? "Saving..." : "Save & Apply Live"}
              </button>
              {ctaSaveResult && (
                <span style={{
                  fontSize: "0.8rem", padding: "4px 8px", borderRadius: 4,
                  background: ctaSaveResult.startsWith("Error") ? "#fee2e2" : "#dcfce7",
                  color: ctaSaveResult.startsWith("Error") ? "#991b1b" : "#166534",
                }}>
                  {ctaSaveResult}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

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
              disabled={broadcasting || !broadcastPhones.trim() || !broadcastMessage.trim()}
              style={{
                padding: "6px 16px", background: "#f59e0b", color: "#fff", border: "none",
                borderRadius: 4, cursor: (broadcasting || !broadcastPhones.trim() || !broadcastMessage.trim()) ? "default" : "pointer", fontSize: "0.85rem",
                fontWeight: 600, opacity: (broadcasting || !broadcastPhones.trim() || !broadcastMessage.trim()) ? 0.6 : 1,
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
                      }} title={log.deliveryErrorCode || undefined}>
                        {log.deliveryStatus}{log.deliveryStatus === "failed" && log.deliveryErrorCode ? ` (${log.deliveryErrorCode})` : ""}
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
