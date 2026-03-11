// SA-P0-007: System Maintenance Mode tab for SuperAdmin
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchMaintenanceStatus, toggleMaintenanceMode, type MaintenanceStatus } from "../api/maintenance";
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
import { formatDateTime } from "../lib/formatters";

export function MaintenanceTab() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  // R4-NET-006: In-flight guard
  const refreshInFlight = useRef(false);

  const loadStatus = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMaintenanceStatus();
      setStatus(data);
      setMessage(data.message ?? "");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch maintenance status");
    } finally {
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleToggle = (newEnabled: boolean) => {
    const action = newEnabled ? "enable" : "disable";
    setConfirmDialog({
      title: `${newEnabled ? "Enable" : "Disable"} Maintenance Mode`,
      message: newEnabled
        ? "All POS devices and portals (except SuperAdmin) will see a maintenance page. Are you sure?"
        : "This will restore normal access for all users and devices.",
      detail: newEnabled && message.trim()
        ? `Message: "${message.trim()}"`
        : undefined,
      confirmLabel: newEnabled ? "Enable Maintenance" : "Disable Maintenance",
      variant: newEnabled ? "warning" : "info",
      onConfirm: async () => {
        setConfirmDialog(null);
        setSaving(true);
        setError(null);
        try {
          const result = await toggleMaintenanceMode(newEnabled, message.trim() || undefined);
          setStatus(result);
          setMessage(result.message ?? "");
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : `Failed to ${action} maintenance mode`);
        } finally {
          setSaving(false);
        }
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  return (
    <section className="tabSection" data-testid="maintenance-tab">
      <h2>System Maintenance</h2>
      <p style={{ color: "var(--text-secondary, #666)", marginBottom: 16 }}>
        Toggle maintenance mode to show a maintenance page to all POS devices and portals.
        SuperAdmin access is never blocked.
      </p>

      {loading && <div data-testid="maintenance-loading">Loading maintenance status...</div>}

      {error && (
        <div className="alert alert-error" role="alert" data-testid="maintenance-error">
          {error}
          <button className="btnSm" style={{ marginLeft: 8 }} onClick={loadStatus}>Retry</button>
        </div>
      )}

      {!loading && status && (
        <div style={{ maxWidth: 600 }}>
          {/* Current status banner */}
          <div
            data-testid="maintenance-status-banner"
            style={{
              padding: "16px 20px",
              borderRadius: 8,
              marginBottom: 20,
              background: status.enabled
                ? "var(--warning-bg, #fff3cd)"
                : "var(--success-bg, #d4edda)",
              border: `1px solid ${status.enabled ? "var(--warning-border, #ffc107)" : "var(--success-border, #28a745)"}`,
            }}
          >
            <strong style={{ fontSize: 16 }}>
              {status.enabled ? "Maintenance Mode is ACTIVE" : "System is ONLINE"}
            </strong>
            {status.enabled && status.message && (
              <div style={{ marginTop: 8, fontStyle: "italic" }}>
                {status.message}
              </div>
            )}
            {status.updated_at && (
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary, #666)" }}>
                Last updated: {formatDateTime(status.updated_at)}
              </div>
            )}
          </div>

          {/* Custom message input */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="maintenance-message" style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>
              Maintenance Message (optional)
            </label>
            <textarea
              id="maintenance-message"
              data-testid="maintenance-message-input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="System is under scheduled maintenance. Please try again later."
              maxLength={500}
              rows={3}
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid var(--border, #ccc)", resize: "vertical" }}
              disabled={saving}
            />
            <div style={{ fontSize: 12, color: "var(--text-secondary, #999)", textAlign: "right" }}>
              {message.length}/500
            </div>
          </div>

          {/* Toggle buttons */}
          <div style={{ display: "flex", gap: 12 }}>
            {!status.enabled ? (
              <button
                className="btn"
                data-testid="maintenance-enable-btn"
                onClick={() => handleToggle(true)}
                disabled={saving}
                style={{ background: "var(--warning, #ffc107)", color: "#000", fontWeight: 600 }}
              >
                {saving ? "Saving..." : "Enable Maintenance Mode"}
              </button>
            ) : (
              <button
                className="btn"
                data-testid="maintenance-disable-btn"
                onClick={() => handleToggle(false)}
                disabled={saving}
                style={{ background: "var(--success, #28a745)", color: "#fff", fontWeight: 600 }}
              >
                {saving ? "Saving..." : "Disable Maintenance Mode"}
              </button>
            )}
            <button className="btnSm" onClick={loadStatus} disabled={loading || saving}>
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Empty state: no status and not loading */}
      {!loading && !status && !error && (
        <div data-testid="maintenance-empty">
          No maintenance status available.
          <button className="btnSm" style={{ marginLeft: 8 }} onClick={loadStatus}>Retry</button>
        </div>
      )}

      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </section>
  );
}
