// SA-001: Devices tab extracted from App.tsx
import type { DeviceRecord } from "../api/devices";
import type { DeviceEnrollmentResponse } from "../api/deviceEnrollments";
import { type DeviceType, DEVICE_TYPE_OPTIONS, DEVICE_TYPE_LABELS, PRINTING_MODE_LABELS } from "../types";
import { EnrollmentCountdown } from "../components/EnrollmentCountdown";
import { isDeviceOnline, composeDeviceMessage, getDeviceTone } from "../ui/status";
import { formatDateTime } from "../lib/formatters";
import { QRCodeSVG } from "qrcode.react";

const DEVICE_PAGE_SIZE = 50;

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
  devicePage: number;
  setDevicePage: (p: number) => void;
  devicesLoading: boolean;
  deviceTotal: number;
  refreshDevices: (page: number) => void;
  limit: number;
  devices: Array<{ deviceId: string; storeId: string; lastSeen: string; lastEventType: string; eventCount: number }>;
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
  devicePage,
  setDevicePage,
  devicesLoading,
  deviceTotal,
  refreshDevices,
  limit,
  devices,
}: DevicesTabProps) {
  return (
    <section className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">Add Device</div>
          <div className="muted">Scan this QR from POS {"->"} Enroll Device</div>
        </div>
      </div>

      <div className="tableWrap" style={{ paddingTop: 0 }}>
        <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div className="control">
            <label>Store ID</label>
            <input
              value={enrollStoreId}
              onChange={(e) => setEnrollStoreId(e.target.value)}
              placeholder="e.g. store-1"
            />
          </div>
          <div className="control">
            <label>&nbsp;</label>
            <button onClick={handleCreateEnrollment} disabled={enrollLoading}>
              {enrollLoading ? "Generating..." : "Create enrollment"}
            </button>
          </div>
        </div>

        {enrollError && <div className="banner" style={{ marginTop: 12 }}>{enrollError}</div>}

        {enrollment && (
          <div className="qrCard" style={{ marginTop: 16 }}>
            <div className="badgeRow">
              <span className="badge badgeInfo">Code: {enrollment.code}</span>
              <span className="badge">Expires in: {enrollment.expiresAt ? <EnrollmentCountdown expiresAt={enrollment.expiresAt} /> : "unknown"}</span>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <QRCodeSVG value={enrollment.qrPayload} size={160} />
              <div style={{ display: "grid", gap: 8 }}>
                <div className="mono qrPayload">{enrollment.qrPayload}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="tab"
                    onClick={() => {
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(enrollment.code).catch(() => undefined);
                      }
                    }}
                  >
                    Copy code
                  </button>
                  <button
                    className="btnGhost"
                    onClick={() => {
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(enrollment.qrPayload).catch(() => undefined);
                      }
                    }}
                  >
                    Copy QR payload
                  </button>
                  {/* GO-LIVE-012: QR code regenerate button */}
                  <button
                    className="btnDanger"
                    onClick={handleCreateEnrollment}
                    disabled={enrollLoading}
                    title="Regenerate QR code with new enrollment"
                  >
                    {enrollLoading ? "Regenerating..." : "Regenerate QR"}
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

      {deviceActionError && <div className="banner" style={{ marginBottom: 12 }}>{deviceActionError}</div>}
      {devicesError && <div className="banner" style={{ marginBottom: 12 }}>{devicesError}</div>}

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
                <div className="deviceCard" key={d.id}>
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

                    <button onClick={() => requestDeviceSave(d.id)} disabled={deviceSaving[d.id]}>
                      {deviceSaving[d.id] ? "Saving..." : "Save"}
                    </button>
                    <button className="btnGhost" onClick={() => requestDeviceReset(d.id)} disabled={deviceSaving[d.id]}>
                      Reset Token
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="tableWrap" style={{ paddingTop: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

      {/* ISSUE-MICRO-061: Visual separator between device registry and events-derived summary */}
      <hr style={{ margin: "16px 0", borderColor: "#e2e8f0" }} />
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
    </section>
  );
}
