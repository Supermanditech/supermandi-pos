export type DeviceStatus = {
  active: boolean;
  lastSeenOnline?: string | null;
  pendingOutboxCount?: number | null;
};

export type StatusTone = "success" | "warning" | "error" | "neutral";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isDeviceOnline(lastSeenOnline?: string | null): boolean {
  if (!lastSeenOnline) return false;
  const last = new Date(lastSeenOnline).getTime();
  if (!Number.isFinite(last)) return false;
  return Date.now() - last <= ONLINE_WINDOW_MS;
}

export function getDeviceTone(status: DeviceStatus): StatusTone {
  if (!status.active) return "error";
  if (!isDeviceOnline(status.lastSeenOnline)) return "warning";
  if ((status.pendingOutboxCount ?? 0) > 0) return "warning";
  return "success";
}

export function composeDeviceMessage(status: DeviceStatus): string {
  if (!status.active) {
    return "Device is disabled. Enable it in Superadmin to resume billing.";
  }
  if (!isDeviceOnline(status.lastSeenOnline)) {
    return "Device is offline. Ask staff to reconnect so bills can sync.";
  }
  if ((status.pendingOutboxCount ?? 0) > 0) {
    return `Sync pending: ${status.pendingOutboxCount} bills. Keep the POS online to sync.`;
  }
  return "All good. Device is online and ready.";
}
