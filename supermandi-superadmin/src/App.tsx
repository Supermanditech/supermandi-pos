import { useEffect, useMemo, useRef, useState } from "react";
import { fetchHealth } from "./api/health";
import { fetchPosEvents, type PosEvent } from "./api/posEvents";
import { askAi, fetchAiHealth } from "./api/ai";
import { ADMIN_TOKEN_STORAGE_KEY, getAdminToken } from "./api/authToken";
import { createStore, fetchStore, fetchStores, updateStore, type StoreRecord } from "./api/stores";
import { fetchDevices, patchDevice, type DeviceRecord } from "./api/devices";
import { createDeviceEnrollment, type DeviceEnrollmentResponse } from "./api/deviceEnrollments";
import {
  fetchAnalyticsOverview,
  fetchAnalyticsDevices,
  fetchAnalyticsProducts,
  fetchAnalyticsPurchases,
  fetchAnalyticsConsumerSales
} from "./api/analytics";
import { fetchBarcodeSheetPdf } from "./api/barcodeSheets";
import { QRCodeSVG } from "qrcode.react";
import { composeDeviceMessage, getDeviceTone, isDeviceOnline } from "./ui/status";
import "./App.css";

type TabKey = "events" | "devices" | "stores" | "payments" | "analytics" | "ai";
type GroupKey = "none" | "transactionId" | "billId";
type AnalyticsTabKey = "overview" | "devices" | "products" | "payments" | "purchases" | "consumer";

type DeviceType = "OEM_HANDHELD" | "SUPMANDI_PHONE" | "RETAILER_PHONE";

const DEVICE_TYPE_OPTIONS: Array<{ value: DeviceType; label: string }> = [
  { value: "OEM_HANDHELD", label: "OEM Handheld" },
  { value: "SUPMANDI_PHONE", label: "SuperMandi Phone" },
  { value: "RETAILER_PHONE", label: "Retailer Phone" }
];

const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  OEM_HANDHELD: "OEM Handheld",
  SUPMANDI_PHONE: "SuperMandi Phone",
  RETAILER_PHONE: "Retailer Phone"
};

const PRINTING_MODE_LABELS: Record<string, string> = {
  DIRECT_ESC_POS: "Direct ESC/POS",
  SHARE_TO_PRINTER_APP: "Share to Printer App",
  NONE: "None"
};

const ADMIN_POLL_MS = 60000;
const RATE_LIMIT_BACKOFF_MS = 60000;
const UPI_VPA_PATTERN = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;

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

function formatMoneyMinor(minor: number): string {
  const safe = Number.isFinite(minor) ? minor : 0;
  return `INR ${(safe / 100).toFixed(2)}`;
}

function toIsoStart(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return undefined;
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function toIsoEnd(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
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
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const rateLimitedUntilRef = useRef<number | null>(null);
  const healthInFlightRef = useRef(false);
  const eventsInFlightRef = useRef(false);
  const devicesInFlightRef = useRef(false);
  const storesInFlightRef = useRef(false);

  // AI panel
  const [aiQuestion, setAiQuestion] = useState<string>("");
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [aiError, setAiError] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  // Store admin (UPI VPA activation)
  const [storeAdminId, setStoreAdminId] = useState<string>("");
  const [storeRecord, setStoreRecord] = useState<StoreRecord | null>(null);
  const [storeUpiInput, setStoreUpiInput] = useState<string>("");
  const storeUpiInputRef = useRef<HTMLInputElement | null>(null);
  const [storeLoading, setStoreLoading] = useState<boolean>(false);
  const [storeError, setStoreError] = useState<string>("");
  const [storeSuccess, setStoreSuccess] = useState<string>("");
  const [storeDirectory, setStoreDirectory] = useState<StoreRecord[]>([]);
  const [storeDirectoryLoading, setStoreDirectoryLoading] = useState<boolean>(false);
  const [storeDirectoryError, setStoreDirectoryError] = useState<string>("");
  const [storeNameEdits, setStoreNameEdits] = useState<Record<string, string>>({});
  const [storeNameSaving, setStoreNameSaving] = useState<Record<string, boolean>>({});
  const [storeNameError, setStoreNameError] = useState<string>("");

  // Store creation
  const [createStoreName, setCreateStoreName] = useState<string>("");
  const [createStoreId, setCreateStoreId] = useState<string>("");
  const [createStoreLoading, setCreateStoreLoading] = useState<boolean>(false);
  const [createStoreError, setCreateStoreError] = useState<string>("");
  const [createStoreSuccess, setCreateStoreSuccess] = useState<string>("");

  // Barcode sheets
  const [barcodeSheetStoreId, setBarcodeSheetStoreId] = useState<string>("");
  const [barcodeSheetTier, setBarcodeSheetTier] = useState<"tier1" | "tier2">("tier1");
  const [barcodeSheetBusy, setBarcodeSheetBusy] = useState<boolean>(false);
  const [barcodeSheetError, setBarcodeSheetError] = useState<string>("");
  const [barcodeSheetSuccess, setBarcodeSheetSuccess] = useState<string>("");

  const [deviceRecords, setDeviceRecords] = useState<DeviceRecord[]>([]);
  const [devicesError, setDevicesError] = useState<string>("");
  const [deviceEdits, setDeviceEdits] = useState<Record<string, { label: string; deviceType: DeviceType; active: boolean }>>({});
  const [deviceSaving, setDeviceSaving] = useState<Record<string, boolean>>({});
  const [deviceActionError, setDeviceActionError] = useState<string>("");
  const [enrollStoreId, setEnrollStoreId] = useState<string>("");
  const [enrollment, setEnrollment] = useState<DeviceEnrollmentResponse | null>(null);
  const [enrollError, setEnrollError] = useState<string>("");
  const [enrollLoading, setEnrollLoading] = useState<boolean>(false);
  const [enrollNow, setEnrollNow] = useState<number>(Date.now());

  // Analytics state
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTabKey>("overview");
  const [analyticsFrom, setAnalyticsFrom] = useState<string>("");
  const [analyticsTo, setAnalyticsTo] = useState<string>("");
  const [analyticsStoreId, setAnalyticsStoreId] = useState<string>("");
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);
  const [analyticsError, setAnalyticsError] = useState<string>("");
  const [overviewData, setOverviewData] = useState<any>(null);
  const [analyticsDevices, setAnalyticsDevices] = useState<any>(null);
  const [analyticsProducts, setAnalyticsProducts] = useState<any>(null);
  const [analyticsPurchases, setAnalyticsPurchases] = useState<any>(null);
  const [analyticsConsumerSales, setAnalyticsConsumerSales] = useState<any>(null);
  const [productsGroupBy, setProductsGroupBy] = useState<string>("day");

  const setRateLimit = (until: number | null) => {
    rateLimitedUntilRef.current = until;
    setRateLimitedUntil(until);
  };

  const isRateLimited = (): boolean => {
    const until = rateLimitedUntilRef.current;
    return typeof until === "number" && Date.now() < until;
  };

  const isRateLimitMessage = (message: string): boolean => {
    const m = message.toLowerCase();
    return m.includes("rate limit") || m.includes("429");
  };

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
    if (isRateLimited() || healthInFlightRef.current) return;
    healthInFlightRef.current = true;
    try {
      const data = await fetchHealth();
      const ok = String(data.status).toLowerCase() === "ok";
      setHealth({ ok, statusText: data.status, lastCheckedAt: new Date().toISOString() });
      setHealthError("");
      if (rateLimitedUntilRef.current) {
        setRateLimit(null);
      }
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Backend unreachable";
      if (isRateLimitMessage(message)) {
        setRateLimit(Date.now() + RATE_LIMIT_BACKOFF_MS);
      }
      setHealth({ ok: false, statusText: "down", lastCheckedAt: new Date().toISOString() });
      setHealthError(message);
    } finally {
      healthInFlightRef.current = false;
    }
  }

  async function refreshEvents() {
    if (isRateLimited() || eventsInFlightRef.current) return;
    eventsInFlightRef.current = true;
    try {
      // Fetch raw stream (filters are applied client-side in the UI).
      const data = await fetchPosEvents({ limit: clamp(limit, 50, 1000) });
      // Always newest first.
      data.sort((a, b) => (toIsoSafe(b.createdAt) > toIsoSafe(a.createdAt) ? 1 : -1));
      setEvents(data);
      setEventsError("");
      setLastRefreshAt(new Date().toISOString());
      if (rateLimitedUntilRef.current) {
        setRateLimit(null);
      }
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch events";
      if (isRateLimitMessage(message)) {
        setRateLimit(Date.now() + RATE_LIMIT_BACKOFF_MS);
      }
      setEventsError(message);
      setLastRefreshAt(new Date().toISOString());
    } finally {
      eventsInFlightRef.current = false;
    }
  }

  async function refreshDevices() {
    if (isRateLimited() || devicesInFlightRef.current) return;
    devicesInFlightRef.current = true;
    try {
      const data = await fetchDevices();
      setDeviceRecords(data);
      setDevicesError("");
      if (rateLimitedUntilRef.current) {
        setRateLimit(null);
      }
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch devices";
      if (isRateLimitMessage(message)) {
        setRateLimit(Date.now() + RATE_LIMIT_BACKOFF_MS);
      }
      setDevicesError(message);
    } finally {
      devicesInFlightRef.current = false;
    }
  }

  async function refreshStores() {
    if (isRateLimited() || storesInFlightRef.current) return;
    storesInFlightRef.current = true;
    setStoreDirectoryLoading(true);
    try {
      const data = await fetchStores();
      setStoreDirectory(data);
      setStoreDirectoryError("");
      if (rateLimitedUntilRef.current) {
        setRateLimit(null);
      }
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch stores";
      if (isRateLimitMessage(message)) {
        setRateLimit(Date.now() + RATE_LIMIT_BACKOFF_MS);
      }
      setStoreDirectoryError(message);
    } finally {
      storesInFlightRef.current = false;
      setStoreDirectoryLoading(false);
    }
  }

  async function refreshAnalytics(activeTab: AnalyticsTabKey) {
    setAnalyticsLoading(true);
    setAnalyticsError("");
    try {
      const storeId = analyticsStoreId.trim() || undefined;
      const from = toIsoStart(analyticsFrom);
      const to = toIsoEnd(analyticsTo);

      if (activeTab === "overview" || activeTab === "payments") {
        const res = await fetchAnalyticsOverview({ storeId, from, to });
        setOverviewData(res.overview);
      }
      if (activeTab === "devices") {
        const res = await fetchAnalyticsDevices({ storeId, from, to });
        setAnalyticsDevices(res);
      }
      if (activeTab === "products") {
        const res = await fetchAnalyticsProducts({ storeId, from, to, groupBy: productsGroupBy });
        setAnalyticsProducts(res.products);
      }
      if (activeTab === "purchases") {
        const res = await fetchAnalyticsPurchases({ storeId, from, to });
        setAnalyticsPurchases(res.purchases);
      }
      if (activeTab === "consumer") {
        const res = await fetchAnalyticsConsumerSales({ storeId, from, to });
        setAnalyticsConsumerSales(res.consumer_sales);
      }
    } catch (e: any) {
      setAnalyticsError(e?.message ? String(e.message) : "Failed to fetch analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    // Pre-fill token UI from storage/env (do not expose full token; user can overwrite).
    const existing = getAdminToken();
    setAdminTokenInput(existing ? "********" : "");

    const shouldRefreshEvents = tab === "events" || tab === "devices";
    const shouldRefreshDevices = tab === "devices";
    const shouldRefreshStores = tab === "stores";
    const shouldRefreshAi = tab === "ai";

    refreshHealth();
    if (shouldRefreshEvents) refreshEvents();
    if (shouldRefreshDevices) refreshDevices();
    if (shouldRefreshStores) refreshStores();
    if (shouldRefreshAi) {
      fetchAiHealth()
        .then((res) => setAiConfigured(res.configured))
        .catch(() => setAiConfigured(null));
    }

    const id = setInterval(() => {
      if (isRateLimited()) return;
      refreshHealth();
      if (shouldRefreshEvents) refreshEvents();
      if (shouldRefreshDevices) refreshDevices();
      if (shouldRefreshStores) refreshStores();
      if (shouldRefreshAi) {
        fetchAiHealth()
          .then((res) => setAiConfigured(res.configured))
          .catch(() => setAiConfigured(null));
      }
    }, ADMIN_POLL_MS);
    return () => clearInterval(id);
  }, [tab]);

  // If user changes limit, refresh immediately.
  useEffect(() => {
    refreshEvents();
    setPage(0);
  }, [limit]);

  useEffect(() => {
    if (!enrollment) return;
    setEnrollNow(Date.now());
    const id = setInterval(() => setEnrollNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enrollment]);

  useEffect(() => {
    setPage(0);
  }, [deviceIdFilter, storeIdFilter, eventTypeFilter]);

  useEffect(() => {
    if (tab !== "analytics") return;
    refreshAnalytics(analyticsTab);
  }, [tab, analyticsTab, analyticsFrom, analyticsTo, analyticsStoreId, productsGroupBy]);

  useEffect(() => {
    setDeviceEdits((prev) => {
      const next = { ...prev };
      for (const device of deviceRecords) {
        if (!next[device.id]) {
          next[device.id] = {
            label: device.label ?? "",
            deviceType: (device.device_type as DeviceType) ?? "RETAILER_PHONE",
            active: Boolean(device.active)
          };
        }
      }
      for (const id of Object.keys(next)) {
        if (!deviceRecords.some((d) => d.id === id)) {
          delete next[id];
        }
      }
      return next;
    });
  }, [deviceRecords]);

  useEffect(() => {
    setStoreNameEdits((prev) => {
      const next = { ...prev };
      for (const store of storeDirectory) {
        if (!next[store.id]) {
          next[store.id] = store.name ?? store.storeName ?? "";
        }
      }
      for (const id of Object.keys(next)) {
        if (!storeDirectory.some((s) => s.id === id)) {
          delete next[id];
        }
      }
      return next;
    });
  }, [storeDirectory]);

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

  const filteredDeviceRecords = useMemo(() => {
    const d = deviceIdFilter.trim();
    const s = storeIdFilter.trim();
    return deviceRecords.filter((device) => {
      if (d && !includesInsensitive(device.id, d)) return false;
      if (s && !includesInsensitive(device.store_id ?? "", s)) return false;
      return true;
    });
  }, [deviceRecords, deviceIdFilter, storeIdFilter]);

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

  function updateDeviceDraft(deviceId: string, patch: Partial<{ label: string; deviceType: DeviceType; active: boolean }>) {
    setDeviceEdits((prev) => ({
      ...prev,
      [deviceId]: { ...(prev[deviceId] ?? { label: "", deviceType: "RETAILER_PHONE", active: true }), ...patch }
    }));
  }

  function updateStoreNameDraft(storeId: string, name: string) {
    setStoreNameEdits((prev) => ({ ...prev, [storeId]: name }));
  }

  async function handleStoreNameSave(storeId: string) {
    const nextName = (storeNameEdits[storeId] ?? "").trim();
    if (!nextName) {
      setStoreNameError("Store name is required.");
      return;
    }
    setStoreNameError("");
    setStoreNameSaving((prev) => ({ ...prev, [storeId]: true }));
    try {
      const updated = await updateStore(storeId, { storeName: nextName });
      setStoreDirectory((prev) => prev.map((s) => (s.id === storeId ? updated : s)));
      setStoreNameEdits((prev) => ({ ...prev, [storeId]: updated.name ?? updated.storeName ?? nextName }));
    } catch (e: any) {
      setStoreNameError(e?.message ? String(e.message) : "Failed to update store name.");
    } finally {
      setStoreNameSaving((prev) => ({ ...prev, [storeId]: false }));
    }
  }

  function resetBarcodeSheetNotice() {
    setBarcodeSheetError("");
    setBarcodeSheetSuccess("");
  }

  async function handleBarcodeSheetDownload() {
    const storeId = barcodeSheetStoreId.trim();
    resetBarcodeSheetNotice();
    if (!storeId) {
      setBarcodeSheetError("Store ID is required.");
      return;
    }

    setBarcodeSheetBusy(true);
    try {
      const blob = await fetchBarcodeSheetPdf({ storeId, tier: barcodeSheetTier });
      const filename = `supermandi-barcodes-${storeId}-${barcodeSheetTier}.pdf`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBarcodeSheetSuccess("Barcode sheet downloaded.");
    } catch (e: any) {
      setBarcodeSheetError(e?.message ? String(e.message) : "Failed to download barcode sheet.");
    } finally {
      setBarcodeSheetBusy(false);
    }
  }

  async function handleBarcodeSheetShare() {
    const storeId = barcodeSheetStoreId.trim();
    resetBarcodeSheetNotice();
    if (!storeId) {
      setBarcodeSheetError("Store ID is required.");
      return;
    }

    if (!(navigator as any).share) {
      setBarcodeSheetError("Web Share is not supported. Download the PDF instead.");
      return;
    }

    setBarcodeSheetBusy(true);
    try {
      const blob = await fetchBarcodeSheetPdf({ storeId, tier: barcodeSheetTier });
      const filename = `supermandi-barcodes-${storeId}-${barcodeSheetTier}.pdf`;
      const file = new File([blob], filename, { type: "application/pdf" });
      const canShare = typeof (navigator as any).canShare === "function"
        ? (navigator as any).canShare({ files: [file] })
        : true;

      if (!canShare) {
        setBarcodeSheetError("This device cannot share PDF files. Download the file instead.");
        return;
      }

      await (navigator as any).share({
        files: [file],
        title: "SuperMandi Barcode Sheet"
      });
      setBarcodeSheetSuccess("Share sheet opened.");
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setBarcodeSheetError(e?.message ? String(e.message) : "Failed to share barcode sheet.");
    } finally {
      setBarcodeSheetBusy(false);
    }
  }

  async function handleDeviceSave(deviceId: string) {
    const draft = deviceEdits[deviceId];
    if (!draft) return;
    if (!draft.label.trim()) {
      setDeviceActionError("Device label is required.");
      return;
    }
    setDeviceActionError("");
    setDeviceSaving((prev) => ({ ...prev, [deviceId]: true }));
    try {
      const updated = await patchDevice(deviceId, {
        label: draft.label.trim(),
        deviceType: draft.deviceType,
        active: draft.active
      });
      setDeviceRecords((prev) => prev.map((d) => (d.id === deviceId ? updated : d)));
      setDeviceEdits((prev) => ({
        ...prev,
        [deviceId]: {
          label: updated.label ?? "",
          deviceType: (updated.device_type as DeviceType) ?? draft.deviceType,
          active: Boolean(updated.active)
        }
      }));
    } catch (e: any) {
      setDeviceActionError(e?.message ? String(e.message) : "Failed to update device.");
    } finally {
      setDeviceSaving((prev) => ({ ...prev, [deviceId]: false }));
    }
  }

  async function handleDeviceReset(deviceId: string) {
    setDeviceActionError("");
    setDeviceSaving((prev) => ({ ...prev, [deviceId]: true }));
    try {
      const updated = await patchDevice(deviceId, { resetToken: true });
      setDeviceRecords((prev) => prev.map((d) => (d.id === deviceId ? updated : d)));
    } catch (e: any) {
      setDeviceActionError(e?.message ? String(e.message) : "Failed to reset device token.");
    } finally {
      setDeviceSaving((prev) => ({ ...prev, [deviceId]: false }));
    }
  }

  async function handleCreateStore() {
    const name = createStoreName.trim();
    const storeId = createStoreId.trim();
    if (!name) {
      setCreateStoreError("Store name is required.");
      return;
    }
    setCreateStoreError("");
    setCreateStoreSuccess("");
    setCreateStoreLoading(true);
    try {
      const created = await createStore({ storeName: name, storeId: storeId || undefined });
      setStoreDirectory((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      setCreateStoreSuccess(`Created ${created.id}`);
      setCreateStoreName("");
      setCreateStoreId("");
      setEnrollStoreId(created.id);
      setStoreAdminId(created.id);
      setBarcodeSheetStoreId(created.id);
    } catch (e: any) {
      setCreateStoreError(e?.message ? String(e.message) : "Failed to create store");
    } finally {
      setCreateStoreLoading(false);
    }
  }

  async function handleStoreLoad() {
    const id = storeAdminId.trim();
    if (!id) {
      setStoreError("Store ID is required.");
      return;
    }
    setStoreError("");
    setStoreSuccess("");
    setStoreLoading(true);
    try {
      const record = await fetchStore(id);
      setStoreRecord(record);
      setStoreUpiInput((prev) => (record.upi_vpa ? record.upi_vpa : prev));
    } catch (e: any) {
      setStoreRecord(null);
      setStoreError(e?.message ? String(e.message) : "Failed to fetch store");
    } finally {
      setStoreLoading(false);
    }
  }

  async function handleStoreSave() {
    const id = storeAdminId.trim();
    if (!id) {
      setStoreError("Store ID is required.");
      return;
    }
    const rawVpa = storeUpiInputRef.current?.value ?? storeUpiInput;
    const trimmedVpa = rawVpa.trim();
    setStoreUpiInput(rawVpa);
    if (!trimmedVpa) {
      if (!storeRecord?.upi_vpa) {
        setStoreError("UPI VPA is required to activate the store.");
        return;
      }
      const ok = window.confirm("Clear UPI VPA and deactivate this store?");
      if (!ok) return;
    } else if (!UPI_VPA_PATTERN.test(trimmedVpa)) {
      setStoreError("UPI VPA format is invalid.");
      return;
    }
    setStoreError("");
    setStoreSuccess("");
    setStoreLoading(true);
    try {
      const record = await updateStore(id, { upiVpa: trimmedVpa });
      setStoreRecord(record);
      setStoreUpiInput(record.upi_vpa ?? "");
      setStoreSuccess(record.active ? "Store activated." : "Store deactivated.");
      void refreshStores();
    } catch (e: any) {
      setStoreError(e?.message ? String(e.message) : "Failed to update store");
    } finally {
      setStoreLoading(false);
    }
  }

  async function handleCreateEnrollment() {
    const id = enrollStoreId.trim() || storeIdFilter.trim();
    if (!id) {
      setEnrollError("Store ID is required for enrollment.");
      return;
    }
    setEnrollError("");
    setEnrollLoading(true);
    try {
      const res = await createDeviceEnrollment(id);
      setEnrollment(res);
    } catch (e: any) {
      setEnrollment(null);
      setEnrollError(e?.message ? String(e.message) : "Failed to create enrollment");
    } finally {
      setEnrollLoading(false);
    }
  }

  const enrollmentCountdown = useMemo(() => {
    if (!enrollment?.expiresAt) return "";
    const expiresAt = new Date(enrollment.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return "unknown";
    const delta = expiresAt - enrollNow;
    if (delta <= 0) return "expired";
    const totalSeconds = Math.floor(delta / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }, [enrollment, enrollNow]);

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">
            <span className="brandPill">SuperMandi</span>
            SuperAdmin
          </div>
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
              className="tokenInput"
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
                refreshDevices();
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

      {(healthError || eventsError || devicesError) && (
        <div className="banner" role="alert">
          <strong>Backend warning:</strong>
          <div className="bannerDetails">
            {rateLimitedUntil && Date.now() < rateLimitedUntil && (
              <div>
                Rate limit exceeded. Retrying in {Math.ceil((rateLimitedUntil - Date.now()) / 1000)}s.
              </div>
            )}
            {healthError && <div>Health: {healthError}</div>}
            {eventsError && <div>Events: {eventsError}</div>}
          {devicesError && <div>Devices: {devicesError}</div>}
        </div>
        <div className="muted">
          UI will keep retrying every {Math.round(ADMIN_POLL_MS / 1000)} seconds (longer if rate limited).
        </div>
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
        <button className={tab === "analytics" ? "tab tabActive" : "tab"} onClick={() => setTab("analytics")}>
          Analytics
        </button>
        <button className={tab === "payments" ? "tab tabActive" : "tab"} onClick={() => setTab("payments")}>
          Payments
        </button>
        <button className={tab === "ai" ? "tab tabActive" : "tab"} onClick={() => setTab("ai")}>
          <span className="brandPill">SuperMandi</span>
          AI
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
            refreshDevices();
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
                  <span className="badge">Expires in: {enrollmentCountdown}</span>
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
                          {d.last_seen_online ? new Date(d.last_seen_online).toLocaleString() : "-"}
                        </div>
                        <div>
                          <strong>Last sync:</strong> {d.last_sync_at ? new Date(d.last_sync_at).toLocaleString() : "-"}
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

                        <label className="toggle">
                          Active
                          <input
                            type="checkbox"
                            checked={draft.active}
                            onChange={(e) => updateDeviceDraft(d.id, { active: e.target.checked })}
                          />
                        </label>

                        <button onClick={() => handleDeviceSave(d.id)} disabled={deviceSaving[d.id]}>
                          {deviceSaving[d.id] ? "Saving..." : "Save"}
                        </button>
                        <button className="btnGhost" onClick={() => handleDeviceReset(d.id)} disabled={deviceSaving[d.id]}>
                          Reset Token
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="cardHeader" style={{ paddingTop: 0 }}>
            <div className="cardTitle">Devices (events window)</div>
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
            <div className="cardTitle">Create Store</div>
            <div className="muted">Generate a Store ID for new device enrollment.</div>
          </div>

          <div className="tableWrap" style={{ paddingTop: 0 }}>
            <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div className="control">
                <label>Store name</label>
                <input
                  value={createStoreName}
                  onChange={(e) => setCreateStoreName(e.target.value)}
                  placeholder="Supermandi Pilot Store"
                />
              </div>
              <div className="control">
                <label>Store ID (optional)</label>
                <input
                  value={createStoreId}
                  onChange={(e) => setCreateStoreId(e.target.value)}
                  placeholder="store-1"
                />
              </div>
              <div className="control">
                <label>&nbsp;</label>
                <button onClick={handleCreateStore} disabled={createStoreLoading}>
                  {createStoreLoading ? "Creating..." : "Create store"}
                </button>
              </div>
            </div>

            {createStoreError && (
              <div className="banner" style={{ marginTop: 12 }}>{createStoreError}</div>
            )}
            {createStoreSuccess && (
              <div className="muted" style={{ marginTop: 12 }}>{createStoreSuccess}</div>
            )}
          </div>

          <div className="cardHeader">
            <div className="cardTitle">Store Activation (UPI VPA)</div>
            <div className="muted">GET prefill â†’ PATCH save + activate/deactivate</div>
          </div>

          <div className="tableWrap" style={{ paddingTop: 0 }}>
            <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div className="control">
                <label>Store ID</label>
                <input
                  value={storeAdminId}
                  onChange={(e) => setStoreAdminId(e.target.value)}
                  placeholder="e.g. store-1"
                />
              </div>
              <div className="control">
                <label>UPI VPA</label>
                <input
                  ref={storeUpiInputRef}
                  value={storeUpiInput}
                  onChange={(e) => setStoreUpiInput(e.target.value)}
                  placeholder="merchant@upi"
                />
              </div>
              <div className="control">
                <label>&nbsp;</label>
                <button onClick={handleStoreLoad} disabled={storeLoading}>
                  {storeLoading ? "Loading..." : "Load store"}
                </button>
              </div>
              <div className="control">
                <label>&nbsp;</label>
                <button onClick={handleStoreSave} disabled={storeLoading}>
                  {storeLoading ? "Saving..." : "Save VPA"}
                </button>
              </div>
            </div>

            {storeError && <div className="banner" style={{ marginTop: 12 }}>{storeError}</div>}
            {storeSuccess && <div className="muted" style={{ marginTop: 12 }}>{storeSuccess}</div>}

            {storeRecord && (
              <div className="tableWrap" style={{ paddingTop: 6 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Store ID</th>
                      <th>Name</th>
                      <th>Active</th>
                      <th>UPI VPA</th>
                      <th>UPI Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="mono">{storeRecord.id}</td>
                      <td>{storeRecord.name ?? "-"}</td>
                      <td className="mono">{storeRecord.active ? "true" : "false"}</td>
                      <td className="mono">{storeRecord.upi_vpa ?? "-"}</td>
                      <td className="mono">
                        {storeRecord.upi_vpa_updated_at
                          ? new Date(storeRecord.upi_vpa_updated_at).toLocaleString()
                          : "-"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="cardHeader" style={{ paddingTop: 0 }}>
            <div className="cardTitle">Stores (directory)</div>
            <div className="muted">Edit store names and status</div>
          </div>

          {storeDirectoryError && <div className="banner" style={{ margin: "0 16px 12px" }}>{storeDirectoryError}</div>}
          {storeNameError && <div className="banner" style={{ margin: "0 16px 12px" }}>{storeNameError}</div>}

          {storeDirectory.length === 0 ? (
            <div className="empty">
              {storeDirectoryLoading ? "Loading stores..." : "No stores found."}
            </div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Store ID</th>
                    <th>Store Name</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {storeDirectory.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.id}</td>
                      <td>
                        <input
                          className="tableInput"
                          value={storeNameEdits[s.id] ?? s.name ?? s.storeName ?? ""}
                          onChange={(e) => updateStoreNameDraft(s.id, e.target.value)}
                          placeholder="Store name"
                        />
                      </td>
                      <td className="mono">{s.active ? "active" : "inactive"}</td>
                      <td>
                        <button onClick={() => handleStoreNameSave(s.id)} disabled={storeNameSaving[s.id]}>
                          {storeNameSaving[s.id] ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="cardHeader" style={{ paddingTop: 0 }}>
            <div className="cardTitle">Barcode Sheets</div>
            <div className="muted">Generate A4 PDF sheets with existing barcodes (Tier-1 / Tier-2).</div>
          </div>

          {barcodeSheetError && <div className="banner" style={{ margin: "0 16px 12px" }}>{barcodeSheetError}</div>}
          {barcodeSheetSuccess && <div className="muted" style={{ margin: "0 16px 12px" }}>{barcodeSheetSuccess}</div>}

          <div className="tableWrap" style={{ paddingTop: 0 }}>
            <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div className="control">
                <label>Store ID</label>
                <input
                  value={barcodeSheetStoreId}
                  onChange={(e) => setBarcodeSheetStoreId(e.target.value)}
                  placeholder="store-1"
                />
              </div>
              <div className="control">
                <label>Tier</label>
                <select
                  value={barcodeSheetTier}
                  onChange={(e) => setBarcodeSheetTier(e.target.value as "tier1" | "tier2")}
                  className="selectSmall"
                >
                  <option value="tier1">Tier 1 (large)</option>
                  <option value="tier2">Tier 2 (compact)</option>
                </select>
              </div>
              <div className="control">
                <label>&nbsp;</label>
                <button onClick={handleBarcodeSheetDownload} disabled={barcodeSheetBusy}>
                  {barcodeSheetBusy ? "Working..." : "Download PDF"}
                </button>
              </div>
              <div className="control">
                <label>&nbsp;</label>
                <button onClick={handleBarcodeSheetShare} disabled={barcodeSheetBusy}>
                  {barcodeSheetBusy ? "Working..." : "Share to WhatsApp"}
                </button>
              </div>
            </div>
          </div>

          <div className="cardHeader" style={{ paddingTop: 0 }}>
            <div className="cardTitle">Stores (activity)</div>
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

      {tab === "analytics" && (
        <section className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Analytics</div>
              <div className="muted">POS + Consumer + Purchases (admin-only)</div>
            </div>
          </div>

          <div className="tableWrap" style={{ paddingTop: 0 }}>
            <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <div className="control">
                <label>Store ID (optional)</label>
                <input
                  value={analyticsStoreId}
                  onChange={(e) => setAnalyticsStoreId(e.target.value)}
                  placeholder="store-1"
                />
              </div>
              <div className="control">
                <label>From</label>
                <input type="date" value={analyticsFrom} onChange={(e) => setAnalyticsFrom(e.target.value)} />
              </div>
              <div className="control">
                <label>To</label>
                <input type="date" value={analyticsTo} onChange={(e) => setAnalyticsTo(e.target.value)} />
              </div>
              <div className="control">
                <label>&nbsp;</label>
                <button onClick={() => refreshAnalytics(analyticsTab)} disabled={analyticsLoading}>
                  {analyticsLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            <div className="subTabs" style={{ marginTop: 12 }}>
              {(["overview", "devices", "products", "payments", "purchases", "consumer"] as AnalyticsTabKey[]).map((key) => (
                <button
                  key={key}
                  className={analyticsTab === key ? "tab tabActive" : "tab"}
                  onClick={() => setAnalyticsTab(key)}
                >
                  {key === "consumer" ? "Consumer Sales" : key === "payments" ? "Payments & Dues" : key[0].toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>

            {analyticsError && <div className="banner" style={{ marginTop: 12 }}>{analyticsError}</div>}

            {analyticsTab === "overview" && overviewData && (
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <div className="analyticsGrid">
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Sales Total (POS)</div>
                    <div className="analyticsValue">{formatMoneyMinor(overviewData.sales_total.pos_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Sales Total (Consumer)</div>
                    <div className="analyticsValue">{formatMoneyMinor(overviewData.sales_total.consumer_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Sales Total (All)</div>
                    <div className="analyticsValue">{formatMoneyMinor(overviewData.sales_total.total_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Collections Total</div>
                    <div className="analyticsValue">{formatMoneyMinor(overviewData.collections_total_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">New Products (Retailer)</div>
                    <div className="analyticsValue">{overviewData.new_products_created_count}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Devices Online / Offline</div>
                    <div className="analyticsValue">
                      {overviewData.devices.online} / {overviewData.devices.offline}
                    </div>
                    <div className="muted">Pending outbox: {overviewData.devices.pending_outbox_total}</div>
                  </div>
                </div>

                <div className="analyticsGrid">
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Payment Split (Cash / UPI / Due)</div>
                    <div className="analyticsValue">
                      {formatMoneyMinor(overviewData.payment_split_minor.cash)} / {formatMoneyMinor(overviewData.payment_split_minor.upi)} / {formatMoneyMinor(overviewData.payment_split_minor.due)}
                    </div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Due Outstanding</div>
                    <div className="analyticsValue">{formatMoneyMinor(overviewData.due_outstanding.total_minor)}</div>
                    <div className="muted">
                      {overviewData.due_outstanding.buckets.map((b: any) => `${b.label}: ${formatMoneyMinor(b.total_minor)}`).join(" | ")}
                    </div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Profit (Gross)</div>
                    {overviewData.profit ? (
                      <>
                        <div className="analyticsValue">{formatMoneyMinor(overviewData.profit.gross_profit_minor)}</div>
                        <div className="muted">
                          Margin: {overviewData.profit.margin_percent ?? 0}% | Confidence: {overviewData.profit.profit_confidence}
                        </div>
                        {overviewData.profit.missing_cost_items_count > 0 && (
                          <div className="muted">Missing cost items: {overviewData.profit.missing_cost_items_count}</div>
                        )}
                      </>
                    ) : (
                      <div className="muted">
                        Profit unavailable. Missing: {(overviewData.profit_missing_fields ?? []).join(", ") || "purchase data"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {analyticsTab === "payments" && overviewData && (
              <div style={{ marginTop: 12 }}>
                <div className="analyticsGrid">
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Payment Split (Cash / UPI / Due)</div>
                    <div className="analyticsValue">
                      {formatMoneyMinor(overviewData.payment_split_minor.cash)} / {formatMoneyMinor(overviewData.payment_split_minor.upi)} / {formatMoneyMinor(overviewData.payment_split_minor.due)}
                    </div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Due Outstanding</div>
                    <div className="analyticsValue">{formatMoneyMinor(overviewData.due_outstanding.total_minor)}</div>
                  </div>
                </div>
                <div className="cardHeader" style={{ paddingTop: 0 }}>
                  <div className="cardTitle">Due aging buckets</div>
                </div>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Bucket</th>
                        <th>Total</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overviewData.due_outstanding.buckets.map((b: any) => (
                        <tr key={b.label}>
                          <td>{b.label}</td>
                          <td className="mono">{formatMoneyMinor(b.total_minor)}</td>
                          <td className="mono">{b.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {analyticsTab === "devices" && analyticsDevices && (
              <div style={{ marginTop: 12 }}>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Label</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Pending Outbox</th>
                        <th>Sales (count/value)</th>
                        <th>Collections (count/value)</th>
                        <th>Offline Sales</th>
                        <th>Last Seen</th>
                        <th>Last Sync</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsDevices.devices.map((d: any) => {
                        const online = isDeviceOnline(d.last_seen_online);
                        return (
                          <tr key={d.device_id}>
                            <td>{d.label ?? d.device_id}</td>
                            <td>{d.device_type ?? "Unknown"}</td>
                            <td>{online ? "Online" : "Offline"} / {d.active ? "Active" : "Inactive"}</td>
                            <td className="mono">{d.pending_outbox_count}</td>
                            <td className="mono">{d.sales_count} / {formatMoneyMinor(d.sales_total_minor)}</td>
                            <td className="mono">{d.collections_count} / {formatMoneyMinor(d.collections_total_minor)}</td>
                            <td className="mono">{d.offline_sales_count}</td>
                            <td className="mono">{d.last_seen_online ? new Date(d.last_seen_online).toLocaleString() : "-"}</td>
                            <td className="mono">{d.last_sync_at ? new Date(d.last_sync_at).toLocaleString() : "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {analyticsTab === "products" && analyticsProducts && (
              <div style={{ marginTop: 12 }}>
                <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  <div className="control">
                    <label>Group By</label>
                    <select value={productsGroupBy} onChange={(e) => setProductsGroupBy(e.target.value)} className="selectSmall">
                      <option value="day">Day</option>
                      <option value="hour">Hour</option>
                      <option value="category">Category</option>
                    </select>
                  </div>
                </div>

                <div className="cardHeader" style={{ paddingTop: 0 }}>
                  <div className="cardTitle">Top Products</div>
                </div>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Barcode</th>
                        <th>Source</th>
                        <th>Qty</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsProducts.top_products.map((p: any) => (
                        <tr key={p.product_id}>
                          <td>{p.name}</td>
                          <td className="mono">{p.barcode}</td>
                          <td>{p.source}</td>
                          <td className="mono">{p.quantity}</td>
                          <td className="mono">{formatMoneyMinor(p.total_minor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="cardHeader" style={{ paddingTop: 0 }}>
                  <div className="cardTitle">New Products (Retailer)</div>
                  <div className="muted">Count: {analyticsProducts.new_products_created_count}</div>
                </div>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Barcode</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsProducts.new_products_created.map((p: any) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td className="mono">{p.barcode}</td>
                          <td className="mono">{p.created_at ? new Date(p.created_at).toLocaleString() : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {analyticsTab === "purchases" && analyticsPurchases && (
              <div style={{ marginTop: 12 }}>
                <div className="analyticsGrid">
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Purchases Total</div>
                    <div className="analyticsValue">{formatMoneyMinor(analyticsPurchases.total_minor)}</div>
                  </div>
                </div>

                <div className="cardHeader" style={{ paddingTop: 0 }}>
                  <div className="cardTitle">Vendor Breakdown</div>
                </div>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Supplier</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsPurchases.vendor_breakdown.map((v: any) => (
                        <tr key={v.supplier}>
                          <td>{v.supplier}</td>
                          <td className="mono">{formatMoneyMinor(v.total_minor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="cardHeader" style={{ paddingTop: 0 }}>
                  <div className="cardTitle">SKU Cost Summary</div>
                </div>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>SKU/Product</th>
                        <th>Qty</th>
                        <th>Avg Cost</th>
                        <th>Last Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsPurchases.sku_cost_summary.map((s: any, idx: number) => (
                        <tr key={`${s.product_id ?? s.sku ?? "sku"}-${idx}`}>
                          <td className="mono">{s.sku ?? s.product_id ?? "unknown"}</td>
                          <td className="mono">{s.quantity}</td>
                          <td className="mono">{formatMoneyMinor(s.avg_cost_minor)}</td>
                          <td className="mono">{s.last_cost_minor ? formatMoneyMinor(s.last_cost_minor) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {analyticsTab === "consumer" && analyticsConsumerSales && (
              <div style={{ marginTop: 12 }}>
                <div className="analyticsGrid">
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Consumer Sales Total</div>
                    <div className="analyticsValue">{formatMoneyMinor(analyticsConsumerSales.total_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Payment Split (Cash / UPI / Due)</div>
                    <div className="analyticsValue">
                      {formatMoneyMinor(analyticsConsumerSales.payment_split_minor.cash)} / {formatMoneyMinor(analyticsConsumerSales.payment_split_minor.upi)} / {formatMoneyMinor(analyticsConsumerSales.payment_split_minor.due)}
                    </div>
                  </div>
                </div>
                <div className="cardHeader" style={{ paddingTop: 0 }}>
                  <div className="cardTitle">Order Status</div>
                </div>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsConsumerSales.status_counts.map((s: any) => (
                        <tr key={s.status}>
                          <td>{s.status}</td>
                          <td className="mono">{s.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
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
            <div className="cardTitle">
              <span className="brandPill">SuperMandi</span>
              AI (Ops Copilot)
            </div>
            <div className="muted">Read-only - Uses analytics endpoints for context</div>
          </div>

          <div className="tableWrap">
            <div style={{ display: "grid", gap: 10 }}>
              <div className="badgeRow">
                <span className={`badge ${aiConfigured ? "badgeOk" : "badgeWarn"}`}>
                  {aiConfigured ? "AI configured" : "AI not configured"}
                </span>
              </div>
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
                placeholder="Ask a question about POS activityâ€¦"
                className="textArea"
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
                  {aiLoading ? "Askingâ€¦" : "Ask"}
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

                {aiError && <span className="errorText">{aiError}</span>}
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
