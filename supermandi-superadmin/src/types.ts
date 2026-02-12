// SA-001: Shared types and constants extracted from App.tsx monolith

export type TabKey = "events" | "devices" | "stores" | "suppliers" | "payments" | "analytics" | "ai" | "users" | "settings" | "audit" | "documents" | "registrations" | "staff" | "grn-alerts" | "applications";
export type GroupKey = "none" | "transactionId" | "billId";
export type AnalyticsTabKey = "overview" | "devices" | "products" | "payments" | "purchases" | "consumer" | "activity" | "dues";
export type DeviceType = "OEM_HANDHELD" | "SUPMANDI_PHONE" | "RETAILER_PHONE";

export const DEVICE_TYPE_OPTIONS: Array<{ value: DeviceType; label: string }> = [
  { value: "OEM_HANDHELD", label: "OEM Handheld" },
  { value: "SUPMANDI_PHONE", label: "SuperMandi Phone" },
  { value: "RETAILER_PHONE", label: "Retailer Phone" }
];

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  OEM_HANDHELD: "OEM Handheld",
  SUPMANDI_PHONE: "SuperMandi Phone",
  RETAILER_PHONE: "Retailer Phone"
};

export const PRINTING_MODE_LABELS: Record<string, string> = {
  DIRECT_ESC_POS: "Direct ESC/POS",
  SHARE_TO_PRINTER_APP: "Share to Printer App",
  NONE: "None"
};

export const ADMIN_POLL_MS = 60000;
export const UPI_VPA_PATTERN = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function toIsoSafe(v: string): string {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
}

export function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

export function toIsoStart(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return undefined;
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function toIsoEnd(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
