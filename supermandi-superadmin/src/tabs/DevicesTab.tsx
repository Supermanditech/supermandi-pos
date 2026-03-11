// SA-001: Devices tab extracted from App.tsx
import { useState } from "react";
import type { DeviceRecord, ConfigPushRecord } from "../api/devices";
import type { DeviceEnrollmentResponse } from "../api/deviceEnrollments";
import { type DeviceType, DEVICE_TYPE_OPTIONS, DEVICE_TYPE_LABELS, PRINTING_MODE_LABELS } from "../types";
import { EnrollmentCountdown } from "../components/EnrollmentCountdown";
import { isDeviceOnline, composeDeviceMessage, getDeviceTone } from "../ui/status";
import { formatDateTime } from "../lib/formatters";
import { QRCodeSVG } from "qrcode.react";
// R1-FIX: Confirmation dialog for device config save
import { ConfirmDialog, type ConfirmDialogConfig } from "../components/ConfirmDialog";
// SA-P2-009: Device Hardware Whitelist
import { DeviceWhitelistSection } from "../components/DeviceWhitelistSection";

const DEVICE_PAGE_SIZE = 50;

// SA-P2-002: Config key options for push config
const CONFIG_KEY_OPTIONS = [
  { value: "FORCE_UPDATE", label: "Force Update" },
  { value: "MAINTENANCE_MODE", label: "Maintenance Mode" },
  { value: "SCAN_LOOKUP_V2", label: "Scan Lookup V2" },
  { value: "PRINTING_MODE", label: "Printing Mode" },
  { value: "SYNC_INTERVAL_MS", label: "Sync Interval (ms)" },
  { value: "CUSTOM", label: "Custom Key" },
] as const;

interface DevicesTabProps {
  enrollStoreId: string;
  setEnrollStoreId: (v: string) => void;
  handleCreateEnrollment: () => void;
  enrollLoading: boolean;
  enrollError: string;
  enrollment: DeviceEnrollmentResponse | null;
  deviceActionError: string;
  devicesError: string;
  filteredDeviceRecords: DeviceRecord[];
  deviceEdits: Record<string, { label: string; deviceType: DeviceType; printingMode: string; scanLookupV2Enabled: boolean; active: boolean }>;
  updateDeviceDraft: (deviceId: string, patch: Partial<{ label: string; deviceType: DeviceType; printingMode: string; scanLookupV2Enabled: boolean; active: boolean }>) => void;
  deviceSaving: Record<string, boolean>;
  requestDeviceSave: (deviceId: string) => void;
  requestDeviceReset: (deviceId: string) => void;
  requestForceReEnroll: (deviceId: string) => void;
  // SA-P1-013: Revoke token
  requestRevokeToken: (deviceId: string) => void;
  revokingTokenDevices: Record<string, boolean>;
  // SA-P2-005: Force sync
  requestForceSync: (deviceId: string) => void;
  forceSyncingDevices: Record<string, boolean>;
  // SA-P2-002: Config push
  handlePushConfig: (deviceId: string, config: { configKey: string; configValue: string; message?: string }) => Promise<void>;
  handleBroadcastConfig: (config: { configKey: string; configValue: string; message?: string }) => Promise<void>;
  configPushHistory: ConfigPushRecord[];
  configPushLoading: boolean;
  refreshConfigPushHistory: () => void;
  devicePage: number;
  setDevicePage: (p: number) => void;
  devicesLoading: boolean;
  deviceTotal: number;
  refreshDevices: (page: number) => void;
  limit: number;
  devices: Array<{ deviceId: string; storeId: string; lastSeen: string; lastEventType: string; eventCount: number }>;
  // SA-ENROLL-UX G1: Store picker dropdown
  storeDirectory: Array<{ id: string; name?: string | null; storeName?: string | null }>;
  // SA-ENROLL-UX G2: Code revocation
  handleRevokeEnrollment: (code: string) => void;
  revokeLoading: string | null;
}

export function DevicesTab({
  enrollStoreId,
  setEnrollStoreId,
  handleCreateEnrollment,
  enrollLoading,
  enrollError,
  enrollment,
  deviceActionError,
  devicesError,
  filteredDeviceRecords,
  deviceEdits,
  updateDeviceDraft,
  deviceSaving,
  requestDeviceSave,
  requestDeviceReset,
  requestForceReEnroll,
  // SA-P1-013
  requestRevokeToken,
  revokingTokenDevices,
  // SA-P2-005
  requestForceSync,
  forceSyncingDevices,
  // SA-P2-002
  handlePushConfig,
  handleBroadcastConfig,
  configPushHistory,
  configPushLoading,
  refreshConfigPushHistory,
  devicePage,
  setDevicePage,
  devicesLoading,
  deviceTotal,
  refreshDevices,
  limit,
  devices,
  // SA-ENROLL-UX G1 + G2
  storeDirectory,
  handleRevokeEnrollment,
  revokeLoading,
}: DevicesTabProps) {
  // R1-FIX: Confirm dialog state for device config save
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  // R3-DEV-002: Clipboard copy feedback
  const [copiedField, setCopiedField] = useState<string | null>(null);
  // R3-DEV-008: Reset token loading indicator
  const [resettingDevices, setResettingDevices] = useState<Record<string, boolean>>({});
  // SA-P2-002: Push Config modal state
  const [pushConfigTarget, setPushConfigTarget] = useState<string | null>(null); // deviceId or "broadcast"
  const [pushConfigKey, setPushConfigKey] = useState("FORCE_UPDATE");
  const [pushConfigValue, setPushConfigValue] = useState("");
  const [pushConfigMessage, setPushConfigMessage] = useState("");
  const [pushConfigSending, setPushConfigSending] = useState(false);
  const [pushConfigResult, setPushConfigResult] = useState<string | null>(null);

  return (
    <section className="card">
      {confirmDialog && <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />}
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Add Device</div>
          <div className="muted">Scan this QR from POS {"->"} Enroll Device</div>
        </div>
      </div>

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {/* SA-ENROLL-UX G1: Store picker dropdown */}
          <div className="control">
            <label>Store</label>
            <select
              value={enrollStoreId}
              onChange={(e) => setEnrollStoreId(e.target.value)}
              className="sa-select sa-radius-4" style={{ minWidth: 260 }}
              aria-label="Select store for enrollment"
            >
              <option value="">-- Select a store --</option>
              {storeDirectory.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.storeName || s.id}
                </option>
              ))}
            </select>
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={handleCreateEnrollment} disabled={enrollLoading}>
              {enrollLoading ? "Generating..." : "Create enrollment"}
            </button>
          </div>
        </div>

        {enrollError && <div className="banner sa-mt-12" role="alert">{enrollError}</div>}

        {enrollment && (
          <div className="qrCard sa-mt-16">
            <div className="badgeRow">
              <span className="badge badgeInfo">Code: {enrollment.code}</span>
              <span className="badge">Expires in: {enrollment.expiresAt ? <EnrollmentCountdown expiresAt={enrollment.expiresAt} /> : "unknown"}</span>
            </div>
            <div className="sa-flex sa-gap-20 sa-flex-wrap">
              <QRCodeSVG value={enrollment.qrPayload} size={160} />
              <div className="sa-gap-8" style={{ display: "grid" }}>
                <div className="mono qrPayload">{enrollment.qrPayload}</div>
                <div className="sa-flex sa-gap-8 sa-flex-wrap">
                  <button
                    className="tab"
                    onClick={() => {
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(enrollment.code).then(() => {
                          setCopiedField("code");
                          setTimeout(() => setCopiedField((v) => v === "code" ? null : v), 1500);
                        }).catch(() => { /* clipboard unavailable */ });
                      }
                    }}
                  >
                    {copiedField === "code" ? "Copied!" : "Copy code"}
                  </button>
                  <button
                    className="btnGhost"
                    onClick={() => {
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(enrollment.qrPayload).then(() => {
                          setCopiedField("qr");
                          setTimeout(() => setCopiedField((v) => v === "qr" ? null : v), 1500);
                        }).catch(() => { /* clipboard unavailable */ });
                      }
                    }}
                  >
                    {copiedField === "qr" ? "Copied!" : "Copy QR payload"}
                  </button>
                  {/* GO-LIVE-012: QR code regenerate button */}
                  {/* R3-DEV-003: Confirmation dialog before regenerating */}
                  <button
                    className="btnDanger"
                    onClick={() => {
                      setConfirmDialog({
                        title: "Regenerate QR Code",
                        message: "This will invalidate the current enrollment code and generate a new one. Any device using the current code will no longer be able to enroll.",
                        confirmLabel: "Regenerate",
                        variant: "danger",
                        onConfirm: () => { setConfirmDialog(null); handleCreateEnrollment(); },
                      });
                    }}
                    disabled={enrollLoading}
                    title="Regenerate QR code with new enrollment"
                  >
                    {enrollLoading ? "Regenerating..." : "Regenerate QR"}
                  </button>
                  {/* SA-ENROLL-UX G2: Revoke enrollment code */}
                  <button
                    className="btnGhost sa-text-danger"
                    onClick={() => handleRevokeEnrollment(enrollment.code)}
                    disabled={revokeLoading === enrollment.code}
                    title="Revoke this enrollment code so it can no longer be used"
                  >
                    {revokeLoading === enrollment.code ? "Revoking..." : "Revoke Code"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="cardHeader">
        <div className="cardTitle">Devices (status)</div>
        <div className="muted">Live heartbeat + sync status</div>
      </div>

      {deviceActionError && <div className="banner sa-mb-12" role="alert">{deviceActionError}</div>}
      {devicesError && <div className="banner sa-mb-12" role="alert">{devicesError}</div>}

      {filteredDeviceRecords.length === 0 ? (
        <div className="empty">No devices synced yet.</div>
      ) : (
        <div className="tableWrap">
          <div className="deviceGrid">
            {filteredDeviceRecords.map((d) => {
              const draft = deviceEdits[d.id] ?? {
                label: d.label ?? "",
                deviceType: (d.device_type as DeviceType) ?? "RETAILER_PHONE",
                printingMode: d.printing_mode ?? "NONE",
                scanLookupV2Enabled: d.scan_lookup_v2_enabled ?? false,
                active: Boolean(d.active)
              };
              const pending = d.pending_outbox_count ?? 0;
              const online = isDeviceOnline(d.last_seen_online);
              const tone = getDeviceTone({
                active: Boolean(d.active),
                lastSeenOnline: d.last_seen_online,
                pendingOutboxCount: pending
              });
              const toneClass =
                tone === "error"
                  ? "deviceMessageError"
                  : tone === "warning"
                  ? "deviceMessageWarning"
                  : tone === "success"
                  ? "deviceMessageSuccess"
                  : "";
              const deviceTypeLabel = d.device_type
                ? DEVICE_TYPE_LABELS[d.device_type as DeviceType] ?? d.device_type
                : "Unknown";
              const printingLabel = d.printing_mode ? PRINTING_MODE_LABELS[d.printing_mode] ?? d.printing_mode : "None";
              const storeLabel = d.store_name ?? (d.store_id ? d.store_id : "Not Activated");
              const statusMessage = composeDeviceMessage({
                active: Boolean(d.active),
                lastSeenOnline: d.last_seen_online,
                pendingOutboxCount: pending
              });
              return (
                <div className="deviceCard" key={d.id} style={!d.active ? { opacity: 0.55, borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' } : undefined}>
                  <div className="deviceHeader">
                    <input
                      className="deviceLabelInput"
                      value={draft.label}
                      onChange={(e) => updateDeviceDraft(d.id, { label: e.target.value })}
                      placeholder="Device label"
                    />
                    <div className="badgeRow">
                      <span className={`badge ${online ? "badgeOk" : "badgeWarn"}`}>
                        {online ? "Online" : "Offline"}
                      </span>
                      <span className={`badge ${d.active ? "badgeOk" : "badgeError"}`}>
                        {d.active ? "Active" : "Inactive"}
                      </span>
                      <span className="badge badgeInfo">{deviceTypeLabel}</span>
                      <span className={`badge ${pending > 0 ? "badgeWarn" : ""}`}>Sync {pending}</span>
                    </div>
                  </div>

                  <div className={`deviceMessage ${toneClass}`}>{statusMessage}</div>

                  <div className="deviceMetaGrid">
                    <div>
                      <strong>Store:</strong> <span className="mono">{storeLabel}</span>
                    </div>
                    <div>
                      <strong>Device:</strong> <span className="mono">{d.id}</span>
                    </div>
                    <div>
                      <strong>Last seen:</strong>{" "}
                      {d.last_seen_online ? formatDateTime(d.last_seen_online) : "-"}
                    </div>
                    <div>
                      <strong>Last sync:</strong> {d.last_sync_at ? formatDateTime(d.last_sync_at) : "-"}
                    </div>
                    <div>
                      <strong>Model:</strong> {[d.manufacturer, d.model].filter(Boolean).join(" ") || "-"}
                    </div>
                    <div>
                      <strong>Android:</strong> {d.android_version ?? "-"}
                    </div>
                    <div>
                      <strong>App:</strong> {d.app_version ?? "-"}
                    </div>
                    <div>
                      <strong>Printing:</strong> {printingLabel}
                    </div>
                  </div>

                  <div className="deviceActions">
                    <select
                      className="selectSmall"
                      value={draft.deviceType}
                      onChange={(e) => updateDeviceDraft(d.id, { deviceType: e.target.value as DeviceType })}
                      aria-label="Device type"
                    >
                      {DEVICE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <select
                      className="selectSmall"
                      value={draft.printingMode}
                      onChange={(e) => updateDeviceDraft(d.id, { printingMode: e.target.value })}
                      title="Printing Mode"
                      aria-label="Printing mode"
                    >
                      <option value="DIRECT_ESC_POS">Direct ESC/POS</option>
                      <option value="SHARE_TO_PRINTER_APP">Printer App</option>
                      <option value="NONE">None</option>
                    </select>

                    <label className="toggle" title="Enable V2 Scan Lookup (faster barcode resolution)">
                      V2 Scan
                      <input
                        type="checkbox"
                        checked={draft.scanLookupV2Enabled}
                        onChange={(e) => updateDeviceDraft(d.id, { scanLookupV2Enabled: e.target.checked })}
                      />
                    </label>

                    <label className="toggle">
                      Active
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) => updateDeviceDraft(d.id, { active: e.target.checked })}
                      />
                    </label>

                    <button onClick={() => {
                      // R1-FIX: Confirm if deactivating device or changing device type
                      const activeChanged = draft.active !== Boolean(d.active);
                      if (activeChanged && !draft.active) {
                        setConfirmDialog({
                          title: "Confirm Device Deactivation",
                          message: `Deactivate device "${draft.label || d.id}"? The device will no longer be able to access the POS system.`,
                          confirmLabel: "Deactivate & Save",
                          variant: "danger",
                          onConfirm: () => { setConfirmDialog(null); requestDeviceSave(d.id); },
                        });
                      } else {
                        requestDeviceSave(d.id);
                      }
                    }} disabled={deviceSaving[d.id]}>
                      {deviceSaving[d.id] ? "Saving..." : "Save"}
                    </button>
                    <button className="btnGhost" onClick={() => {
                      setResettingDevices((prev) => ({ ...prev, [d.id]: true }));
                      requestDeviceReset(d.id);
                      // Clear loading after a delay since parent doesn't signal completion
                      setTimeout(() => setResettingDevices((prev) => ({ ...prev, [d.id]: false })), 3000);
                    }} disabled={deviceSaving[d.id] || resettingDevices[d.id]}>
                      {resettingDevices[d.id] ? "Resetting…" : "Reset Token"}
                    </button>
                    {/* SA-P2-005: Force Sync button */}
                    <button
                      className="btnGhost btnSm"
                      onClick={() => requestForceSync(d.id)}
                      disabled={deviceSaving[d.id] || forceSyncingDevices[d.id]}
                      title="Queue a force sync command. The device will perform a full sync on its next check-in."
                    >
                      {forceSyncingDevices[d.id] ? "Syncing…" : "Force Sync"}
                    </button>
                    {/* SA-P2-002: Push Config button */}
                    <button
                      className="btnGhost btnSm"
                      onClick={() => {
                        setPushConfigTarget(d.id);
                        setPushConfigKey("FORCE_UPDATE");
                        setPushConfigValue("");
                        setPushConfigMessage("");
                        setPushConfigResult(null);
                      }}
                      disabled={deviceSaving[d.id]}
                      title="Push a config update to this device via FCM or poll"
                    >
                      Push Config
                    </button>
                    {/* SA-P1-013: Revoke Token button */}
                    <button
                      className="btnGhost btnSm sa-text-danger"
                      onClick={() => {
                        setConfirmDialog({
                          title: "Revoke Device Token",
                          message: `Revoke the authentication token for device "${draft.label || d.id}"? The device will need to re-authenticate on its next API call, but will NOT need to re-enroll.`,
                          confirmLabel: "Revoke Token",
                          variant: "danger",
                          onConfirm: () => { setConfirmDialog(null); requestRevokeToken(d.id); },
                        });
                      }}
                      disabled={deviceSaving[d.id] || revokingTokenDevices[d.id]}
                      title="Revoke the device's current authentication token. The device will need to re-authenticate but not re-enroll."
                    >
                      {revokingTokenDevices[d.id] ? "Revoking…" : "Revoke Token"}
                    </button>
                    {/* SA-P2-001: Force Re-Enroll button */}
                    <button
                      className="btnDanger btnSm"
                      onClick={() => requestForceReEnroll(d.id)}
                      disabled={deviceSaving[d.id]}
                      title="Force this device to re-enroll. The device will be deregistered and must scan a new QR code."
                    >
                      {deviceSaving[d.id] ? "Processing…" : "Force Re-Enroll"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="tableWrap sa-py-8">
            <div className="sa-flex sa-gap-8 sa-flex-wrap">
              <button className="tab" disabled={devicePage === 0 || devicesLoading} onClick={() => { const p = devicePage - 1; setDevicePage(p); refreshDevices(p); }}>
                {devicesLoading ? "Loading…" : "Prev"}
              </button>
              <button className="tab" disabled={(devicePage + 1) * DEVICE_PAGE_SIZE >= deviceTotal || devicesLoading} onClick={() => { const p = devicePage + 1; setDevicePage(p); refreshDevices(p); }}>
                {devicesLoading ? "Loading…" : "Next"}
              </button>
              <span className="muted">
                Page {devicePage + 1} / {Math.max(1, Math.ceil(deviceTotal / DEVICE_PAGE_SIZE))} ({deviceTotal} devices)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SA-P2-002: Push Config Modal */}
      {pushConfigTarget && (
        <div className="modalOverlay" onClick={() => { if (!pushConfigSending) { setPushConfigTarget(null); setPushConfigResult(null); } }} onKeyDown={(e) => { if (e.key === "Escape" && !pushConfigSending) { setPushConfigTarget(null); setPushConfigResult(null); } }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Push Config" onClick={(e) => e.stopPropagation()} style={{ minWidth: 400 }}>
            <div className="modalHeader">
              <h3>{pushConfigTarget === "broadcast" ? "Broadcast Config to All Devices" : `Push Config to Device`}</h3>
            </div>
            <div className="modalBody">
              {pushConfigTarget !== "broadcast" && (
                <p className="muted sa-mb-8">Target: <span className="mono">{pushConfigTarget}</span></p>
              )}
              <div className="sa-gap-12" style={{ display: "grid" }}>
                <div className="control">
                  <label>Config Key</label>
                  <select
                    value={pushConfigKey}
                    onChange={(e) => setPushConfigKey(e.target.value)}
                    className="sa-select sa-radius-4"
                    aria-label="Config key"
                  >
                    {CONFIG_KEY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="control">
                  <label>Config Value</label>
                  <input
                    type="text"
                    value={pushConfigValue}
                    onChange={(e) => setPushConfigValue(e.target.value)}
                    placeholder="e.g. true, 30000, DIRECT_ESC_POS"
                    className="sa-radius-4"
                    aria-label="Config value"
                  />
                </div>
                <div className="control">
                  <label>Message (optional)</label>
                  <input
                    type="text"
                    value={pushConfigMessage}
                    onChange={(e) => setPushConfigMessage(e.target.value)}
                    placeholder="Human-readable note"
                    className="sa-radius-4"
                    aria-label="Push config message"
                  />
                </div>
              </div>
              {pushConfigResult && (
                <div className="banner sa-mt-12" role="status">{pushConfigResult}</div>
              )}
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => { setPushConfigTarget(null); setPushConfigResult(null); }} disabled={pushConfigSending}>Cancel</button>
              <button
                onClick={async () => {
                  if (!pushConfigValue.trim()) return;
                  setPushConfigSending(true);
                  setPushConfigResult(null);
                  try {
                    if (pushConfigTarget === "broadcast") {
                      await handleBroadcastConfig({ configKey: pushConfigKey, configValue: pushConfigValue.trim(), message: pushConfigMessage.trim() || undefined });
                      setPushConfigResult("Broadcast queued successfully.");
                    } else {
                      await handlePushConfig(pushConfigTarget, { configKey: pushConfigKey, configValue: pushConfigValue.trim(), message: pushConfigMessage.trim() || undefined });
                      setPushConfigResult("Config push queued successfully.");
                    }
                    refreshConfigPushHistory();
                  } catch (err) {
                    setPushConfigResult(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
                  } finally {
                    setPushConfigSending(false);
                  }
                }}
                disabled={pushConfigSending || !pushConfigValue.trim()}
              >
                {pushConfigSending ? "Sending..." : pushConfigTarget === "broadcast" ? "Broadcast to All" : "Push Config"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SA-P2-002: Config Push section */}
      <hr className="sa-border-b" style={{ margin: "16px 0" }} />
      <div className="cardHeader" style={{ paddingTop: 0 }}>
        <div>
          <div className="cardTitle">Config Push</div>
          <div className="muted">Push configuration updates to devices via FCM or poll</div>
        </div>
        <div className="sa-flex sa-gap-8">
          <button
            className="btnGhost btnSm"
            onClick={() => refreshConfigPushHistory()}
            disabled={configPushLoading}
          >
            {configPushLoading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={() => {
              setPushConfigTarget("broadcast");
              setPushConfigKey("FORCE_UPDATE");
              setPushConfigValue("");
              setPushConfigMessage("");
              setPushConfigResult(null);
            }}
            title="Broadcast a config update to all active devices"
          >
            Broadcast to All
          </button>
        </div>
      </div>

      {configPushHistory.length === 0 ? (
        <div className="empty">No config pushes yet.</div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Device</th>
                <th>Key</th>
                <th>Value</th>
                <th>Method</th>
                <th>Status</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {configPushHistory.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.created_at ? formatDateTime(p.created_at) : "-"}</td>
                  <td className="mono">{p.device_id ?? "all"}</td>
                  <td className="mono">{p.config_key}</td>
                  <td className="mono" style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{p.config_value}</td>
                  <td><span className={`badge ${p.method === "fcm" ? "badgeOk" : "badgeWarn"}`}>{p.method}</span></td>
                  <td><span className={`badge ${p.status === "delivered" ? "badgeOk" : p.status === "failed" ? "badgeError" : "badgeWarn"}`}>{p.status}</span></td>
                  <td className="muted">{p.message ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ISSUE-MICRO-061: Visual separator between device registry and events-derived summary */}
      <hr className="sa-border-b" style={{ margin: "16px 0" }} />
      <div className="cardHeader" style={{ paddingTop: 0 }}>
        <div className="cardTitle">Device Activity (from events)</div>
        <div className="muted">Unique devices in last {limit} events: {devices.length} — derived from event log, independent of device registry above</div>
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
                  <td className="mono">{formatDateTime(d.lastSeen)}</td>
                  <td className="mono">{d.lastEventType}</td>
                  <td className="mono">{d.eventCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SA-P2-009: Device Hardware Whitelist */}
      <DeviceWhitelistSection />
    </section>
  );
}
