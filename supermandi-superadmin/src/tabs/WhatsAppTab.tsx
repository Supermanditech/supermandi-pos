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
  delivered: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  read:      { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  failed:    { bg: "var(--color-error-soft)", color: "var(--color-error)" },
  queued:    { bg: "var(--color-surface-alt)", color: "var(--color-text-secondary)" },
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
    <div className="sa-py-8">
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} loading={ctaSaving || broadcasting} />}

      {/* REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001: Landing Page CTA Config */}
      <div className="sa-section">
        <div className="sa-flex-between" style={{ marginBottom: ctaEditing ? "0.75rem" : 0 }}>
          <h3 className="sa-text-base sa-fw-600" style={{ margin: 0 }}>
            Landing Page WhatsApp CTA Config
          </h3>
          <div className="sa-flex sa-gap-8">
            {ctaConfig && !ctaEditing && (
              <span className={ctaConfig.enabled ? "sa-badge-ok" : "sa-badge-muted"}>
                {ctaConfig.enabled ? "Enabled" : "Disabled"}
              </span>
            )}
            <button
              className="sa-btn-ghost-sm"
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
            >
              {ctaEditing ? "Cancel" : "Edit"}
            </button>
          </div>
        </div>

        {ctaLoading && <div className="sa-text-sm sa-text-muted">Loading config...</div>}
        {ctaError && !ctaLoading && (
          <div className="sa-text-sm sa-text-danger sa-mt-8">
            {ctaError} <button onClick={loadCtaConfig} className="sa-btn-text" style={{ marginLeft: 8, textDecoration: "underline", color: "var(--color-error)" }}>Retry</button>
          </div>
        )}

        {!ctaLoading && !ctaError && ctaConfig && !ctaEditing && (
          <div className="sa-grid-2 sa-mt-8 sa-text-sm" style={{ gap: "0.5rem 1.5rem" }}>
            <div>
              <span className="sa-text-muted">Superadmin number: </span>
              <strong className="mono">{ctaConfig.superadminNumber}</strong>
            </div>
            <div>
              <span className="sa-text-muted">Company number: </span>
              <strong className="mono">{ctaConfig.companyNumber}</strong>
            </div>
            <div className="sa-text-muted sa-text-sm" style={{ gridColumn: "1 / -1" }}>
              Superadmin msg: <em>{ctaConfig.superadminMessage}</em>
            </div>
            <div className="sa-text-muted sa-text-sm" style={{ gridColumn: "1 / -1" }}>
              Company msg: <em>{ctaConfig.companyMessage}</em>
            </div>
            {ctaConfig.updatedAt && (
              <div className="sa-text-muted sa-text-xs sa-mt-4" style={{ gridColumn: "1 / -1" }}>
                Last updated {formatDateTime(ctaConfig.updatedAt)}{ctaConfig.updatedBy ? ` by ${ctaConfig.updatedBy}` : ""}
              </div>
            )}
          </div>
        )}

        {!ctaLoading && ctaEditing && (
          <div style={{ display: "grid", gap: "0.6rem" }}>
            <div className="sa-flex sa-gap-8">
              <label className="sa-text-sm sa-fw-600">
                <input
                  type="checkbox"
                  checked={ctaDraft.enabled}
                  onChange={e => setCtaDraft(d => ({ ...d, enabled: e.target.checked }))}
                  style={{ marginRight: "0.4rem" }}
                />
                Widget Enabled
              </label>
              <span className="sa-text-xs sa-text-muted">(uncheck to hide the floating button from the landing page)</span>
            </div>
            <div className="sa-grid-2" style={{ gap: "0.5rem 1rem" }}>
              <div>
                <label className="sa-form-label">
                  Superadmin Number <span className="sa-text-muted">(E.164 digits, e.g. 919251893684)</span>
                </label>
                <input
                  type="tel"
                  className="sa-input mono sa-w-full"
                  value={ctaDraft.superadminNumber}
                  onChange={e => setCtaDraft(d => ({ ...d, superadminNumber: e.target.value }))}
                  placeholder="919251893684"
                />
              </div>
              <div>
                <label className="sa-form-label">
                  Company Number <span className="sa-text-muted">(E.164 digits)</span>
                </label>
                <input
                  type="tel"
                  className="sa-input mono sa-w-full"
                  value={ctaDraft.companyNumber}
                  onChange={e => setCtaDraft(d => ({ ...d, companyNumber: e.target.value }))}
                  placeholder="919251893684"
                />
              </div>
              <div>
                <label className="sa-form-label">Superadmin WhatsApp Pre-fill Message</label>
                <input
                  type="text"
                  className="sa-input sa-w-full"
                  value={ctaDraft.superadminMessage}
                  onChange={e => setCtaDraft(d => ({ ...d, superadminMessage: e.target.value }))}
                  maxLength={1000}
                />
              </div>
              <div>
                <label className="sa-form-label">Company WhatsApp Pre-fill Message</label>
                <input
                  type="text"
                  className="sa-input sa-w-full"
                  value={ctaDraft.companyMessage}
                  onChange={e => setCtaDraft(d => ({ ...d, companyMessage: e.target.value }))}
                  maxLength={1000}
                />
              </div>
            </div>
            <div className="sa-flex sa-gap-8">
              <button
                className="sa-btn-success-sm sa-fw-600"
                onClick={handleSaveCtaConfig}
                disabled={ctaSaving}
                style={{ padding: "6px 18px", opacity: ctaSaving ? 0.6 : 1 }}
              >
                {ctaSaving ? "Saving..." : "Save & Apply Live"}
              </button>
              {ctaSaveResult && (
                <span className={ctaSaveResult.startsWith("Error") ? "sa-badge-error" : "sa-badge-ok"}>
                  {ctaSaveResult}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Banner */}
      <div
        className="sa-flex sa-gap-12 sa-mb-16 sa-radius-8"
        style={{
          padding: "0.75rem 1rem",
          background: configured ? "var(--color-success-soft)" : "var(--color-warning-soft)",
          border: `1px solid ${configured ? "var(--color-success-soft)" : "var(--color-warning-soft)"}`,
        }}
      >
        <span className="sa-text-xl">{configured ? "\u2705" : "\u26A0\uFE0F"}</span>
        <span className="sa-fw-600" style={{ color: configured ? "var(--color-success)" : "var(--color-warning)" }}>
          {configured === null ? "Checking..." : configured ? "WhatsApp Cloud API Connected" : "WhatsApp Not Configured"}
        </span>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="sa-grid-auto sa-gap-12 sa-mb-20">
          {[
            { label: "Total", value: stats.totalMessages, bg: "var(--color-surface-alt)" },
            { label: "Sent", value: stats.sent, bg: "#dbeafe" },
            { label: "Delivered", value: stats.delivered, bg: "var(--color-success-soft)" },
            { label: "Read", value: stats.read, bg: "var(--color-success-soft)" },
            { label: "Failed", value: stats.failed, bg: "var(--color-error-soft)" },
            { label: "Last 24h", value: stats.last24h, bg: "var(--color-warning-soft)" },
            { label: "Last 7d", value: stats.last7d, bg: "#e0e7ff" },
          ].map(card => (
            <div key={card.label} className="sa-radius-8 sa-text-center sa-p-12" style={{ background: card.bg }}>
              <div className="sa-text-xl sa-fw-700">{card.value}</div>
              <div className="sa-text-sm sa-text-muted">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Send Message Form */}
      <div className="sa-section">
        <h3 className="sa-text-base sa-fw-600 sa-mb-12" style={{ margin: 0 }}>Send Message</h3>
        <div className="sa-flex sa-gap-8" style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="sa-form-label">Recipient Phone</label>
            <input
              type="tel"
              className="sa-input"
              value={sendPhone}
              onChange={e => setSendPhone(e.target.value)}
              placeholder="+91 98765 43210"
              style={{ width: 180 }}
            />
          </div>
          <div>
            <label className="sa-form-label">Type</label>
            <select className="sa-select" value={sendType} onChange={e => setSendType(e.target.value as "retailer" | "supplier")}>
              <option value="retailer">Retailer</option>
              <option value="supplier">Supplier</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="sa-form-label">Message</label>
            <input
              type="text"
              className="sa-input sa-w-full"
              value={sendMessage}
              onChange={e => setSendMessage(e.target.value)}
              placeholder="Type your message..."
              maxLength={4096}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={sending || !sendPhone.trim() || !sendMessage.trim()}
            className="sa-fw-600"
            style={{
              padding: "6px 16px", background: "#25D366", color: "#fff", border: "none",
              borderRadius: 4, fontSize: "0.85rem",
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? "Sending..." : "Send"}
          </button>
          <button
            className="sa-btn-ghost-sm"
            onClick={() => setShowBroadcast(!showBroadcast)}
          >
            {showBroadcast ? "Hide Broadcast" : "Broadcast"}
          </button>
        </div>
        {sendResult && (
          <div className={`sa-mt-8 ${sendResult.startsWith("Failed") ? "sa-badge-error" : "sa-badge-ok"}`}>
            {sendResult}
          </div>
        )}
      </div>

      {/* Broadcast Form (expandable) */}
      {showBroadcast && (
        <div className="sa-alert-warning sa-mb-16">
          <h3 className="sa-text-base sa-fw-600 sa-mb-12" style={{ margin: 0 }}>Broadcast Message (max 50 recipients)</h3>
          <div className="sa-flex sa-gap-12" style={{ flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="sa-form-label">Phone Numbers (comma or newline separated)</label>
              <textarea
                className="sa-textarea"
                value={broadcastPhones}
                onChange={e => setBroadcastPhones(e.target.value)}
                placeholder={"9876543210\n9123456789"}
                rows={3}
              />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label className="sa-form-label">Message</label>
              <textarea
                className="sa-textarea"
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                placeholder="Type broadcast message..."
                rows={3}
                maxLength={4096}
              />
            </div>
          </div>
          <div className="sa-flex sa-gap-8 sa-mt-8">
            <select className="sa-select" value={broadcastType} onChange={e => setBroadcastType(e.target.value as "retailer" | "supplier")}>
              <option value="retailer">Retailer</option>
              <option value="supplier">Supplier</option>
            </select>
            <button
              onClick={handleBroadcast}
              disabled={broadcasting || !broadcastPhones.trim() || !broadcastMessage.trim()}
              className="sa-fw-600"
              style={{
                padding: "6px 16px", background: "var(--color-warning)", color: "#fff", border: "none",
                borderRadius: 4, fontSize: "0.85rem",
                opacity: (broadcasting || !broadcastPhones.trim() || !broadcastMessage.trim()) ? 0.6 : 1,
              }}
            >
              {broadcasting ? "Sending..." : "Send Broadcast"}
            </button>
          </div>
          {broadcastResult && (
            <div className="sa-badge-warn sa-mt-8">
              {broadcastResult}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="sa-flex sa-gap-8 sa-mb-12" style={{ flexWrap: "wrap" }}>
        <select className="sa-select sa-input--sm" value={filterSender} onChange={e => { setFilterSender(e.target.value); setOffset(0); }}>
          <option value="">All Senders</option>
          <option value="pos">POS</option>
          <option value="superadmin">SuperAdmin</option>
        </select>
        <select className="sa-select sa-input--sm" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setOffset(0); }}>
          <option value="">All Statuses</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
          <option value="read">Read</option>
          <option value="failed">Failed</option>
        </select>
        <select className="sa-select sa-input--sm" value={filterContext} onChange={e => { setFilterContext(e.target.value); setOffset(0); }}>
          <option value="">All Types</option>
          <option value="bill_receipt">Bill Receipt</option>
          <option value="order_update">Order Update</option>
          <option value="broadcast">Broadcast</option>
          <option value="support">Support</option>
        </select>
        <span className="sa-text-sm sa-text-muted">{total} message{total !== 1 ? "s" : ""}</span>
        <button className="sa-btn-ghost-sm" onClick={loadData}>Refresh</button>
      </div>

      {/* Error */}
      {error && (
        <div className="sa-alert-error sa-mb-12">
          {error} <button onClick={loadData} className="sa-btn-text" style={{ marginLeft: 8, textDecoration: "underline", color: "var(--color-error)" }}>Retry</button>
        </div>
      )}

      {/* Message Log Table */}
      <div className="sa-overflow-auto sa-bg-surface sa-border sa-radius-8">
        {loading ? (
          <div className="sa-p-24 sa-text-center sa-text-muted">Loading messages...</div>
        ) : logs.length === 0 ? (
          <div className="sa-p-24 sa-text-center sa-text-muted">No messages found</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="sa-th">Time</th>
                <th className="sa-th">From</th>
                <th className="sa-th">To</th>
                <th className="sa-th">Phone</th>
                <th className="sa-th">Preview</th>
                <th className="sa-th" style={{ textAlign: "center" }}>Status</th>
                <th className="sa-th">Context</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const sc = STATUS_COLORS[log.deliveryStatus] || STATUS_COLORS.queued;
                return (
                  <tr key={log.id}>
                    <td className="sa-td sa-td--nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="sa-td" style={{ textTransform: "capitalize" }}>{log.senderType}</td>
                    <td className="sa-td" style={{ textTransform: "capitalize" }}>{log.recipientType}</td>
                    <td className="sa-td sa-td--mono">{log.recipientPhone}</td>
                    <td className="sa-td" style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.contentPreview || ""}>
                      {log.contentPreview || "—"}
                    </td>
                    <td className="sa-td" style={{ textAlign: "center" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: "0.7rem", fontWeight: 600,
                        background: sc.bg, color: sc.color,
                      }} title={log.deliveryErrorCode || undefined}>
                        {log.deliveryStatus}{log.deliveryStatus === "failed" && log.deliveryErrorCode ? ` (${log.deliveryErrorCode})` : ""}
                      </span>
                    </td>
                    <td className="sa-td sa-text-sm sa-text-muted">{log.contextType || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="sa-pagination" style={{ justifyContent: "center" }}>
          <button className="sa-btn-ghost-sm" disabled={currentPage <= 1} onClick={() => setOffset(offset - limit)}
            style={{ opacity: currentPage <= 1 ? 0.5 : 1 }}>
            Prev
          </button>
          <span className="sa-page-info">Page {currentPage} of {totalPages}</span>
          <button className="sa-btn-ghost-sm" disabled={currentPage >= totalPages} onClick={() => setOffset(offset + limit)}
            style={{ opacity: currentPage >= totalPages ? 0.5 : 1 }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
