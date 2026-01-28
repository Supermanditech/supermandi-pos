import React, { useEffect, useMemo, useRef, useState } from "react";
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
  fetchAnalyticsConsumerSales,
  fetchAnalyticsActivity,
  fetchAnalyticsDues,
  type ActivityResponse,
  type DuesResponse
} from "./api/analytics";
import { fetchBarcodeSheetPdf } from "./api/barcodeSheets";
import {
  fetchPendingSuppliers,
  fetchVerifiedSuppliers,
  verifySupplierRequest,
  rejectSupplierRequest,
  fetchPendingProducts,
  approveProduct,
  rejectProduct,
  editProduct,
  type PendingSupplierRequest,
  type VerifiedSupplier,
  type PendingProduct,
  type ProductEditInput
} from "./api/suppliers";
import { fetchUsers, patchUser, createUser, type UserRecord, type UserCreateInput } from "./api/users";
import { fetchSettings, fetchSystemStats, type SystemSettings, type SystemStats } from "./api/settings";
import { QRCodeSVG } from "qrcode.react";
import { composeDeviceMessage, getDeviceTone, isDeviceOnline } from "./ui/status";
import "./App.css";

type TabKey = "events" | "devices" | "stores" | "suppliers" | "payments" | "analytics" | "ai" | "users" | "settings";
type GroupKey = "none" | "transactionId" | "billId";
type AnalyticsTabKey = "overview" | "devices" | "products" | "payments" | "purchases" | "consumer" | "activity" | "dues";

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
  // P1-SADM-002: Store contact fields
  const [storeContactEdits, setStoreContactEdits] = useState<Record<string, { address: string; contactName: string; contactPhone: string; contactEmail: string }>>({});
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);

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
  const [deviceEdits, setDeviceEdits] = useState<Record<string, { label: string; deviceType: DeviceType; printingMode: string; scanLookupV2Enabled: boolean; active: boolean }>>({});
  const [deviceSaving, setDeviceSaving] = useState<Record<string, boolean>>({});
  const [deviceActionError, setDeviceActionError] = useState<string>("");
  // GL-CRIT-0022 & GL-CRIT-0052: Device action confirmation states
  const [pendingDeviceAction, setPendingDeviceAction] = useState<{
    deviceId: string;
    deviceLabel?: string;
    action: "deactivate" | "resetToken";
  } | null>(null);
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
  const [analyticsActivity, setAnalyticsActivity] = useState<ActivityResponse["activity"] | null>(null);
  const [analyticsDues, setAnalyticsDues] = useState<DuesResponse["dues"] | null>(null);
  const [productsGroupBy, setProductsGroupBy] = useState<string>("day");

  // Suppliers state
  const [pendingSuppliers, setPendingSuppliers] = useState<PendingSupplierRequest[]>([]);
  const [verifiedSuppliers, setVerifiedSuppliers] = useState<VerifiedSupplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState<boolean>(false);
  const [suppliersError, setSuppliersError] = useState<string>("");
  const [supplierSearch, setSupplierSearch] = useState<string>("");
  const [supplierActionLoading, setSupplierActionLoading] = useState<Record<string, boolean>>({});
  const [supplierActionError, setSupplierActionError] = useState<string>("");
  const [selectedSupplierForLink, setSelectedSupplierForLink] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const suppliersInFlightRef = useRef(false);

  // SA-1.3-001 to SA-1.3-003: Product Approval State
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [productActionLoading, setProductActionLoading] = useState<Record<string, boolean>>({});
  const [productActionError, setProductActionError] = useState<string>("");
  const [productRejectReason, setProductRejectReason] = useState<Record<string, string>>({});
  const [editingProduct, setEditingProduct] = useState<PendingProduct | null>(null);
  const [editProductForm, setEditProductForm] = useState<{
    editedName: string;
    marginType: "fixed" | "percent";
    fixedMargin: string;
    percentMargin: string;
    bnplEligible: boolean;
    bnplMaxDays: string;
  }>({ editedName: "", marginType: "fixed", fixedMargin: "", percentMargin: "", bnplEligible: false, bnplMaxDays: "7" });
  const [editProductLoading, setEditProductLoading] = useState<boolean>(false);
  const [editProductError, setEditProductError] = useState<string>("");
  const [editProductSuccess, setEditProductSuccess] = useState<string>("");

  // Users state (ADM-SCR-002)
  const [userRecords, setUserRecords] = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState<boolean>(false);
  const [usersError, setUsersError] = useState<string>("");
  const [userSearch, setUserSearch] = useState<string>("");
  const [userStatusSaving, setUserStatusSaving] = useState<Record<string, boolean>>({});
  const [userActionError, setUserActionError] = useState<string>("");
  const usersInFlightRef = useRef(false);

  // SA-1.3-004: User creation state
  const [showCreateUser, setShowCreateUser] = useState<boolean>(false);
  const [createUserForm, setCreateUserForm] = useState<{ name: string; email: string; phone: string; actor_type: string }>({
    name: "", email: "", phone: "", actor_type: "store"
  });
  const [createUserLoading, setCreateUserLoading] = useState<boolean>(false);
  const [createUserError, setCreateUserError] = useState<string>("");
  const [createUserSuccess, setCreateUserSuccess] = useState<string>("");
  // GL-CRIT-0053: Admin user verification state
  const [pendingAdminUser, setPendingAdminUser] = useState<{
    name: string;
    email?: string;
    phone?: string;
    actor_type: string;
  } | null>(null);
  const [adminVerificationReason, setAdminVerificationReason] = useState<string>("");

  // Settings state (ADM-SCR-003)
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [settingsLoading, setSettingsLoading] = useState<boolean>(false);
  const [settingsError, setSettingsError] = useState<string>("");
  const settingsInFlightRef = useRef(false);

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

  async function refreshSuppliers() {
    if (isRateLimited() || suppliersInFlightRef.current) return;
    suppliersInFlightRef.current = true;
    setSuppliersLoading(true);
    setSuppliersError("");
    try {
      const [pending, verified, products] = await Promise.all([
        fetchPendingSuppliers(),
        fetchVerifiedSuppliers(supplierSearch || undefined),
        fetchPendingProducts()
      ]);
      setPendingSuppliers(pending);
      setVerifiedSuppliers(verified);
      setPendingProducts(products);
      if (rateLimitedUntilRef.current) {
        setRateLimit(null);
      }
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch suppliers";
      if (isRateLimitMessage(message)) {
        setRateLimit(Date.now() + RATE_LIMIT_BACKOFF_MS);
      }
      setSuppliersError(message);
    } finally {
      suppliersInFlightRef.current = false;
      setSuppliersLoading(false);
    }
  }

  // ADM-SCR-002: Fetch users
  async function refreshUsers() {
    if (isRateLimited() || usersInFlightRef.current) return;
    usersInFlightRef.current = true;
    setUsersLoading(true);
    setUsersError("");
    try {
      const users = await fetchUsers();
      setUserRecords(users);
      if (rateLimitedUntilRef.current) {
        setRateLimit(null);
      }
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch users";
      if (isRateLimitMessage(message)) {
        setRateLimit(Date.now() + RATE_LIMIT_BACKOFF_MS);
      }
      setUsersError(message);
    } finally {
      usersInFlightRef.current = false;
      setUsersLoading(false);
    }
  }

  // GL-CRIT-0021: Pending status change requiring confirmation
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    userId: string;
    newStatus: "active" | "inactive" | "suspended";
    userName?: string;
  } | null>(null);

  // ADM-SCR-002: Handle user status change with GL-CRIT-0021 confirmation
  function requestUserStatusChange(userId: string, newStatus: "active" | "inactive" | "suspended") {
    // GL-CRIT-0021: Require confirmation for suspension
    if (newStatus === "suspended") {
      const user = userRecords.find((u) => u.id === userId);
      setPendingStatusChange({ userId, newStatus, userName: user?.name });
      return;
    }
    // Non-critical status changes proceed immediately
    executeUserStatusChange(userId, newStatus);
  }

  async function executeUserStatusChange(userId: string, newStatus: "active" | "inactive" | "suspended") {
    setPendingStatusChange(null);
    setUserActionError("");
    setUserStatusSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      const updated = await patchUser(userId, { status: newStatus });
      setUserRecords((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (e: any) {
      setUserActionError(e?.message ? String(e.message) : "Failed to update user");
    } finally {
      setUserStatusSaving((prev) => ({ ...prev, [userId]: false }));
    }
  }

  // SA-1.3-004: Handle user creation
  // GL-CRIT-0053: Require verification for platform admin user creation
  function requestCreateUser() {
    setCreateUserError("");
    setCreateUserSuccess("");

    const { name, email, phone, actor_type } = createUserForm;
    if (!name.trim()) {
      setCreateUserError("Name is required");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setCreateUserError("Either email or phone is required");
      return;
    }

    // GL-CRIT-0053: Platform users require verification
    if (actor_type === "platform") {
      setPendingAdminUser({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        actor_type: "platform"
      });
      setAdminVerificationReason("");
      return;
    }

    // Non-platform users can be created immediately
    executeCreateUser({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      actor_type: actor_type || "store"
    });
  }

  async function executeCreateUser(input: UserCreateInput) {
    setPendingAdminUser(null);
    setCreateUserLoading(true);
    try {
      const newUser = await createUser(input);
      setUserRecords((prev) => [newUser, ...prev]);
      setCreateUserSuccess(`User "${newUser.name}" created successfully!`);
      setCreateUserForm({ name: "", email: "", phone: "", actor_type: "store" });
      setAdminVerificationReason("");
      // Auto-close form after short delay
      setTimeout(() => {
        setShowCreateUser(false);
        setCreateUserSuccess("");
      }, 2000);
    } catch (e: any) {
      setCreateUserError(e?.message ? String(e.message) : "Failed to create user");
    } finally {
      setCreateUserLoading(false);
    }
  }

  function confirmAdminUserCreation() {
    if (!pendingAdminUser) return;
    if (adminVerificationReason.trim().length < 10) {
      setCreateUserError("Reason must be at least 10 characters");
      return;
    }
    executeCreateUser({
      ...pendingAdminUser,
      admin_verification: {
        reason: adminVerificationReason.trim(),
        confirmed: true
      }
    });
  }

  // ADM-SCR-003: Fetch settings
  async function refreshSettings() {
    if (isRateLimited() || settingsInFlightRef.current) return;
    settingsInFlightRef.current = true;
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const [settings, stats] = await Promise.all([
        fetchSettings(),
        fetchSystemStats()
      ]);
      setSystemSettings(settings);
      setSystemStats(stats);
      if (rateLimitedUntilRef.current) {
        setRateLimit(null);
      }
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch settings";
      if (isRateLimitMessage(message)) {
        setRateLimit(Date.now() + RATE_LIMIT_BACKOFF_MS);
      }
      setSettingsError(message);
    } finally {
      settingsInFlightRef.current = false;
      setSettingsLoading(false);
    }
  }

  async function handleVerifySupplier(requestId: string) {
    const supplierId = selectedSupplierForLink[requestId];
    if (!supplierId) {
      setSupplierActionError("Please select a verified supplier to link");
      return;
    }
    setSupplierActionError("");
    setSupplierActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await verifySupplierRequest(requestId, { supplierId });
      setPendingSuppliers((prev) => prev.filter((r) => r.id !== requestId));
      setSelectedSupplierForLink((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    } catch (e: any) {
      setSupplierActionError(e?.message ? String(e.message) : "Failed to verify supplier");
    } finally {
      setSupplierActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }

  // Verify the retailer-created supplier directly (no linking to another supplier)
  async function handleVerifySupplierDirectly(requestId: string) {
    setSupplierActionError("");
    setSupplierActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await verifySupplierRequest(requestId, { verifySupplier: true });
      setPendingSuppliers((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e: any) {
      setSupplierActionError(e?.message ? String(e.message) : "Failed to verify supplier");
    } finally {
      setSupplierActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }

  async function handleRejectSupplier(requestId: string) {
    const reason = rejectReason[requestId] || "";
    setSupplierActionError("");
    setSupplierActionLoading((prev) => ({ ...prev, [requestId]: true }));
    try {
      await rejectSupplierRequest(requestId, { reason });
      setPendingSuppliers((prev) => prev.filter((r) => r.id !== requestId));
      setRejectReason((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    } catch (e: any) {
      setSupplierActionError(e?.message ? String(e.message) : "Failed to reject supplier");
    } finally {
      setSupplierActionLoading((prev) => ({ ...prev, [requestId]: false }));
    }
  }

  // SA-1.3-002: Approve a pending product
  async function handleApproveProduct(productId: string) {
    setProductActionError("");
    setProductActionLoading((prev) => ({ ...prev, [productId]: true }));
    try {
      await approveProduct(productId);
      setPendingProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (e: any) {
      setProductActionError(e?.message ? String(e.message) : "Failed to approve product");
    } finally {
      setProductActionLoading((prev) => ({ ...prev, [productId]: false }));
    }
  }

  // SA-1.3-002: Reject a pending product
  async function handleRejectProduct(productId: string) {
    const reason = productRejectReason[productId] || "";
    if (!reason || reason.length < 10) {
      setProductActionError("Rejection reason must be at least 10 characters");
      return;
    }
    setProductActionError("");
    setProductActionLoading((prev) => ({ ...prev, [productId]: true }));
    try {
      await rejectProduct(productId, reason);
      setPendingProducts((prev) => prev.filter((p) => p.id !== productId));
      setProductRejectReason((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    } catch (e: any) {
      setProductActionError(e?.message ? String(e.message) : "Failed to reject product");
    } finally {
      setProductActionLoading((prev) => ({ ...prev, [productId]: false }));
    }
  }

  // SA-1.3-003: Open edit modal for a product
  function handleOpenEditProduct(product: PendingProduct) {
    setEditingProduct(product);
    setEditProductForm({
      editedName: product.productName,
      marginType: "fixed",
      fixedMargin: "",
      percentMargin: "",
      bnplEligible: false,
      bnplMaxDays: "7"
    });
    setEditProductError("");
    setEditProductSuccess("");
  }

  // SA-1.3-003: Submit product edit
  async function handleSubmitEditProduct() {
    if (!editingProduct) return;
    setEditProductLoading(true);
    setEditProductError("");
    setEditProductSuccess("");

    try {
      const input: ProductEditInput = {
        editedName: editProductForm.editedName || undefined,
        bnplEligible: editProductForm.bnplEligible,
        bnplMaxDays: parseInt(editProductForm.bnplMaxDays) || 7
      };

      if (editProductForm.marginType === "fixed" && editProductForm.fixedMargin) {
        input.superMandiMarginMinor = Math.round(parseFloat(editProductForm.fixedMargin) * 100);
      } else if (editProductForm.marginType === "percent" && editProductForm.percentMargin) {
        input.marginPercent = parseFloat(editProductForm.percentMargin);
      }

      const result = await editProduct(editingProduct.id, input);
      setEditProductSuccess(`Saved! Retailer Price: INR ${(result.retailerPrice / 100).toFixed(2)}`);

      // Update local state
      setPendingProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? { ...p, productName: result.editedName || p.productName }
            : p
        )
      );
    } catch (e: any) {
      setEditProductError(e?.message ? String(e.message) : "Failed to save product");
    } finally {
      setEditProductLoading(false);
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
      if (activeTab === "activity") {
        const res = await fetchAnalyticsActivity({ storeId, from, to });
        setAnalyticsActivity(res.activity);
      }
      if (activeTab === "dues") {
        const res = await fetchAnalyticsDues({ storeId, from, to });
        setAnalyticsDues(res.dues);
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

    const shouldRefreshEvents = tab === "events" || tab === "devices" || tab === "payments"; // P0-DEPLOY-002: Include payments
    const shouldRefreshDevices = tab === "devices";
    const shouldRefreshStores = tab === "stores";
    const shouldRefreshSuppliers = tab === "suppliers";
    const shouldRefreshUsers = tab === "users";
    const shouldRefreshSettings = tab === "settings";
    const shouldRefreshAi = tab === "ai";

    refreshHealth();
    if (shouldRefreshEvents) refreshEvents();
    if (shouldRefreshDevices) refreshDevices();
    if (shouldRefreshStores) refreshStores();
    if (shouldRefreshSuppliers) refreshSuppliers();
    if (shouldRefreshUsers) refreshUsers();
    if (shouldRefreshSettings) refreshSettings();
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
      if (shouldRefreshSuppliers) refreshSuppliers();
      if (shouldRefreshUsers) refreshUsers();
      if (shouldRefreshSettings) refreshSettings();
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
            printingMode: device.printing_mode ?? "NONE",
            scanLookupV2Enabled: device.scan_lookup_v2_enabled ?? false,
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

  function updateDeviceDraft(deviceId: string, patch: Partial<{ label: string; deviceType: DeviceType; printingMode: string; scanLookupV2Enabled: boolean; active: boolean }>) {
    setDeviceEdits((prev) => ({
      ...prev,
      [deviceId]: { ...(prev[deviceId] ?? { label: "", deviceType: "RETAILER_PHONE", printingMode: "NONE", scanLookupV2Enabled: false, active: true }), ...patch }
    }));
  }

  function updateStoreNameDraft(storeId: string, name: string) {
    setStoreNameEdits((prev) => ({ ...prev, [storeId]: name }));
  }

  // P1-SADM-002: Store contact editing
  function updateStoreContactDraft(storeId: string, patch: Partial<{ address: string; contactName: string; contactPhone: string; contactEmail: string }>) {
    setStoreContactEdits((prev) => {
      const existing = prev[storeId] ?? { address: "", contactName: "", contactPhone: "", contactEmail: "" };
      return { ...prev, [storeId]: { ...existing, ...patch } };
    });
  }

  function getStoreContactDraft(s: StoreRecord) {
    return storeContactEdits[s.id] ?? {
      address: s.address ?? "",
      contactName: s.contact_name ?? "",
      contactPhone: s.contact_phone ?? "",
      contactEmail: s.contact_email ?? ""
    };
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
      // P1-SADM-002: Include contact fields in update
      const contactDraft = storeContactEdits[storeId];
      const updated = await updateStore(storeId, {
        storeName: nextName,
        ...(contactDraft ? {
          address: contactDraft.address,
          contactName: contactDraft.contactName,
          contactPhone: contactDraft.contactPhone,
          contactEmail: contactDraft.contactEmail
        } : {})
      });
      setStoreDirectory((prev) => prev.map((s) => (s.id === storeId ? updated : s)));
      setStoreNameEdits((prev) => ({ ...prev, [storeId]: updated.name ?? updated.storeName ?? nextName }));
    } catch (e: any) {
      setStoreNameError(e?.message ? String(e.message) : "Failed to update store.");
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

  // GL-CRIT-0022: Request device save with deactivation confirmation
  function requestDeviceSave(deviceId: string) {
    const draft = deviceEdits[deviceId];
    const currentDevice = deviceRecords.find((d) => d.id === deviceId);
    if (!draft) return;

    // GL-CRIT-0054: Validate label length (1-50 characters)
    const trimmedLabel = draft.label.trim();
    if (!trimmedLabel) {
      setDeviceActionError("Device label is required.");
      return;
    }
    if (trimmedLabel.length > 50) {
      setDeviceActionError("Device label must be 50 characters or less.");
      return;
    }

    // GL-CRIT-0022: Require confirmation when deactivating an active device
    if (currentDevice?.active && !draft.active) {
      setPendingDeviceAction({
        deviceId,
        deviceLabel: currentDevice.label ?? deviceId,
        action: "deactivate"
      });
      return;
    }

    executeDeviceSave(deviceId);
  }

  async function executeDeviceSave(deviceId: string) {
    setPendingDeviceAction(null);
    const draft = deviceEdits[deviceId];
    if (!draft) return;
    setDeviceActionError("");
    setDeviceSaving((prev) => ({ ...prev, [deviceId]: true }));
    try {
      const updated = await patchDevice(deviceId, {
        label: draft.label.trim(),
        deviceType: draft.deviceType,
        printingMode: draft.printingMode,
        scanLookupV2Enabled: draft.scanLookupV2Enabled,
        active: draft.active
      });
      setDeviceRecords((prev) => prev.map((d) => (d.id === deviceId ? updated : d)));
      setDeviceEdits((prev) => ({
        ...prev,
        [deviceId]: {
          label: updated.label ?? "",
          deviceType: (updated.device_type as DeviceType) ?? draft.deviceType,
          printingMode: updated.printing_mode ?? draft.printingMode,
          scanLookupV2Enabled: updated.scan_lookup_v2_enabled ?? draft.scanLookupV2Enabled,
          active: Boolean(updated.active)
        }
      }));
    } catch (e: any) {
      setDeviceActionError(e?.message ? String(e.message) : "Failed to update device.");
    } finally {
      setDeviceSaving((prev) => ({ ...prev, [deviceId]: false }));
    }
  }

  // GL-CRIT-0052: Request device reset with confirmation
  function requestDeviceReset(deviceId: string) {
    const device = deviceRecords.find((d) => d.id === deviceId);
    setPendingDeviceAction({
      deviceId,
      deviceLabel: device?.label ?? deviceId,
      action: "resetToken"
    });
  }

  async function executeDeviceReset(deviceId: string) {
    setPendingDeviceAction(null);
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
                  // GL-CRIT-0020: Use sessionStorage instead of localStorage
                  if (!v || v === "********") {
                    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
                  } else {
                    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, v);
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

      {/* GO-LIVE-REVEAL-001: Prominent warning when admin token is missing */}
      {!getAdminToken() && (
        <div className="banner" role="alert" style={{ background: "#fef3c7", borderColor: "#f59e0b" }}>
          <strong style={{ color: "#92400e" }}>Admin Token Required</strong>
          <div className="bannerDetails" style={{ color: "#78350f" }}>
            <div>Enter your admin token in the input field above to access dashboard data.</div>
            <div style={{ marginTop: 8, fontSize: "0.9em" }}>
              The token must match the <code>ADMIN_TOKEN</code> environment variable set in the backend.
            </div>
          </div>
        </div>
      )}

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
        <button className={tab === "suppliers" ? "tab tabActive" : "tab"} onClick={() => setTab("suppliers")}>
          Suppliers
          {(pendingSuppliers.filter(s => s.status === "pending").length + pendingProducts.length) > 0 && (
            <span className="badge badgeWarn" style={{ marginLeft: 6 }}>
              {pendingSuppliers.filter(s => s.status === "pending").length + pendingProducts.length}
            </span>
          )}
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
        <button className={tab === "users" ? "tab tabActive" : "tab"} onClick={() => setTab("users")}>
          Users
        </button>
        <button className={tab === "settings" ? "tab tabActive" : "tab"} onClick={() => setTab("settings")}>
          Settings
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
          <input value={storeIdFilter} onChange={(e) => setStoreIdFilter(e.target.value)} placeholder="UUID or store code" />
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
                  placeholder="UUID or store code"
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
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {storeDirectory.map((s) => {
                    const contactDraft = getStoreContactDraft(s);
                    const isExpanded = expandedStoreId === s.id;
                    return (
                      <React.Fragment key={s.id}>
                        <tr>
                          <td className="mono">{s.id}</td>
                          <td>
                            <input
                              className="tableInput"
                              value={storeNameEdits[s.id] ?? s.name ?? s.storeName ?? ""}
                              onChange={(e) => updateStoreNameDraft(s.id, e.target.value)}
                              placeholder="Store name"
                            />
                          </td>
                          <td>
                            <button
                              className="btnGhost"
                              onClick={() => setExpandedStoreId(isExpanded ? null : s.id)}
                              title={isExpanded ? "Hide contact info" : "Edit contact info"}
                            >
                              {s.contact_name || s.contact_phone ? `${s.contact_name ?? ""}` : "(none)"}
                              {isExpanded ? " ▲" : " ▼"}
                            </button>
                          </td>
                          <td className="mono">{s.active ? "active" : "inactive"}</td>
                          <td>
                            <button onClick={() => handleStoreNameSave(s.id)} disabled={storeNameSaving[s.id]}>
                              {storeNameSaving[s.id] ? "Saving..." : "Save"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} style={{ background: "#f9fafb", padding: "12px" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", maxWidth: "600px" }}>
                                <div>
                                  <label style={{ fontSize: "12px", color: "#666" }}>Contact Name</label>
                                  <input
                                    className="tableInput"
                                    value={contactDraft.contactName}
                                    onChange={(e) => updateStoreContactDraft(s.id, { contactName: e.target.value })}
                                    placeholder="Contact name"
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "12px", color: "#666" }}>Phone</label>
                                  <input
                                    className="tableInput"
                                    value={contactDraft.contactPhone}
                                    onChange={(e) => updateStoreContactDraft(s.id, { contactPhone: e.target.value })}
                                    placeholder="+91..."
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "12px", color: "#666" }}>Email</label>
                                  <input
                                    className="tableInput"
                                    value={contactDraft.contactEmail}
                                    onChange={(e) => updateStoreContactDraft(s.id, { contactEmail: e.target.value })}
                                    placeholder="email@example.com"
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: "12px", color: "#666" }}>Address</label>
                                  <input
                                    className="tableInput"
                                    value={contactDraft.address}
                                    onChange={(e) => updateStoreContactDraft(s.id, { address: e.target.value })}
                                    placeholder="Store address"
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
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
                  placeholder="UUID or store code"
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

      {tab === "suppliers" && (
        <section className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Pending Supplier Requests</div>
              <div className="muted">Retailers requesting to link suppliers - verify with platform suppliers or reject</div>
            </div>
            <button onClick={refreshSuppliers} disabled={suppliersLoading}>
              {suppliersLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {suppliersError && <div className="banner" style={{ margin: "0 16px 12px" }}>{suppliersError}</div>}
          {supplierActionError && <div className="banner" style={{ margin: "0 16px 12px" }}>{supplierActionError}</div>}

          {pendingSuppliers.filter(s => s.status === "pending").length === 0 ? (
            <div className="empty">
              {suppliersLoading ? "Loading pending requests..." : "No pending supplier requests."}
            </div>
          ) : (
            <div className="tableWrap">
              <div className="deviceGrid">
                {pendingSuppliers.filter(s => s.status === "pending").map((request) => (
                  <div className="deviceCard" key={request.id}>
                    <div className="deviceHeader">
                      <div className="deviceLabelInput" style={{ fontWeight: 600 }}>
                        {request.requestedName || "Unknown Supplier"}
                      </div>
                      <div className="badgeRow">
                        <span className="badge badgeWarn">Pending</span>
                      </div>
                    </div>

                    <div className="deviceMetaGrid">
                      <div>
                        <strong>Store:</strong> <span className="mono">{request.storeName || request.storeId}</span>
                      </div>
                      <div>
                        <strong>GSTIN:</strong> <span className="mono">{request.requestedGstin || "-"}</span>
                      </div>
                      <div>
                        <strong>Phone:</strong> <span className="mono">{request.requestedPhone || "-"}</span>
                      </div>
                      <div>
                        <strong>Email:</strong> <span className="mono">{request.requestedEmail || "-"}</span>
                      </div>
                      <div>
                        <strong>Requested:</strong> <span className="mono">{new Date(request.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Link to Verified Supplier:</label>
                      <select
                        className="selectSmall"
                        style={{ width: "100%", marginBottom: 8 }}
                        value={selectedSupplierForLink[request.id] || ""}
                        onChange={(e) => setSelectedSupplierForLink((prev) => ({ ...prev, [request.id]: e.target.value }))}
                      >
                        <option value="">-- Select verified supplier --</option>
                        {verifiedSuppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.businessName} ({s.gstin}) - {s.city || "Unknown city"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Reject Reason (optional):</label>
                      <input
                        className="tableInput"
                        style={{ width: "100%", marginBottom: 8 }}
                        placeholder="Reason for rejection..."
                        value={rejectReason[request.id] || ""}
                        onChange={(e) => setRejectReason((prev) => ({ ...prev, [request.id]: e.target.value }))}
                      />
                    </div>

                    <div className="deviceActions" style={{ flexWrap: "wrap", gap: 8 }}>
                      <button
                        onClick={() => handleVerifySupplierDirectly(request.id)}
                        disabled={supplierActionLoading[request.id]}
                        style={{ background: "#3b82f6", color: "white" }}
                        title="Verify the supplier directly without linking to another"
                      >
                        {supplierActionLoading[request.id] ? "Verifying..." : "Verify Directly"}
                      </button>
                      <button
                        onClick={() => handleVerifySupplier(request.id)}
                        disabled={supplierActionLoading[request.id] || !selectedSupplierForLink[request.id]}
                        style={{ background: "#22c55e", color: "white" }}
                        title="Link to an existing verified supplier"
                      >
                        {supplierActionLoading[request.id] ? "Linking..." : "Link to Verified"}
                      </button>
                      <button
                        className="btnGhost"
                        onClick={() => handleRejectSupplier(request.id)}
                        disabled={supplierActionLoading[request.id]}
                        style={{ color: "#ef4444" }}
                      >
                        {supplierActionLoading[request.id] ? "Rejecting..." : "Reject"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="cardHeader" style={{ paddingTop: 0 }}>
            <div>
              <div className="cardTitle">Verified Suppliers (Platform)</div>
              <div className="muted">Search platform suppliers for linking to requests</div>
            </div>
          </div>

          <div className="tableWrap" style={{ paddingTop: 0 }}>
            <div className="controls" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div className="control">
                <label>Search</label>
                <input
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="GSTIN or business name..."
                />
              </div>
              <div className="control">
                <label>&nbsp;</label>
                <button onClick={refreshSuppliers} disabled={suppliersLoading}>
                  Search
                </button>
              </div>
            </div>
          </div>

          {verifiedSuppliers.length === 0 ? (
            <div className="empty">
              {suppliersLoading ? "Loading verified suppliers..." : "No verified suppliers found. Try a different search."}
            </div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Business Name</th>
                    <th>GSTIN</th>
                    <th>Contact</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {verifiedSuppliers.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div>{s.businessName}</div>
                        {s.tradeName && <div className="muted">{s.tradeName}</div>}
                      </td>
                      <td className="mono">{s.gstin}</td>
                      <td>
                        <div className="mono">{s.primaryPhone || "-"}</div>
                        <div className="muted">{s.primaryEmail || ""}</div>
                      </td>
                      <td>{[s.city, s.state].filter(Boolean).join(", ") || "-"}</td>
                      <td>
                        <span className={`badge ${s.verificationStatus === "verified" ? "badgeOk" : "badgeWarn"}`}>
                          {s.verificationStatus}
                        </span>
                      </td>
                      <td className="mono">{typeof s.rating === "number" ? s.rating.toFixed(1) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SA-1.3-001 to SA-1.3-003: Pending Products Section */}
          <div className="cardHeader" style={{ paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
            <div>
              <div className="cardTitle">
                Pending Products
                {pendingProducts.length > 0 && (
                  <span className="badge badgeWarn" style={{ marginLeft: 8 }}>
                    {pendingProducts.length}
                  </span>
                )}
              </div>
              <div className="muted">Supplier products awaiting approval - set margin and BNPL settings</div>
            </div>
          </div>

          {productActionError && <div className="banner" style={{ margin: "0 16px 12px" }}>{productActionError}</div>}

          {pendingProducts.length === 0 ? (
            <div className="empty">
              {suppliersLoading ? "Loading pending products..." : "No products pending approval."}
            </div>
          ) : (
            <div className="tableWrap">
              <div className="deviceGrid">
                {pendingProducts.map((product) => (
                  <div className="deviceCard" key={product.id}>
                    <div className="deviceHeader">
                      <div className="deviceLabelInput" style={{ fontWeight: 600 }}>
                        {product.productName}
                      </div>
                      <div className="badgeRow">
                        <span className="badge badgeWarn">Pending</span>
                      </div>
                    </div>

                    <div className="deviceMetaGrid">
                      <div>
                        <strong>Supplier:</strong> <span>{product.supplierName}</span>
                      </div>
                      <div>
                        <strong>Barcode:</strong> <span className="mono">{product.barcode || "-"}</span>
                      </div>
                      <div>
                        <strong>Purchase Price:</strong> <span className="mono">INR {(product.purchasePrice / 100).toFixed(2)}</span>
                      </div>
                      <div>
                        <strong>MRP:</strong> <span className="mono">INR {(product.mrp / 100).toFixed(2)}</span>
                      </div>
                      <div>
                        <strong>MOQ:</strong> <span className="mono">{product.moq || 1}</span>
                      </div>
                      <div>
                        <strong>Submitted:</strong> <span className="mono">{new Date(product.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Reject Reason (min 10 chars):</label>
                      <input
                        className="tableInput"
                        style={{ width: "100%", marginBottom: 8 }}
                        placeholder="Enter reason for rejection..."
                        value={productRejectReason[product.id] || ""}
                        onChange={(e) => setProductRejectReason((prev) => ({ ...prev, [product.id]: e.target.value }))}
                      />
                    </div>

                    <div className="deviceActions" style={{ flexWrap: "wrap", gap: 8 }}>
                      <button
                        onClick={() => handleOpenEditProduct(product)}
                        style={{ background: "#6366f1", color: "white" }}
                        title="Edit product details, set margin and BNPL"
                      >
                        Edit / Set Margin
                      </button>
                      <button
                        onClick={() => handleApproveProduct(product.id)}
                        disabled={productActionLoading[product.id]}
                        style={{ background: "#22c55e", color: "white" }}
                        title="Approve this product"
                      >
                        {productActionLoading[product.id] ? "Approving..." : "Approve"}
                      </button>
                      <button
                        className="btnGhost"
                        onClick={() => handleRejectProduct(product.id)}
                        disabled={productActionLoading[product.id] || (productRejectReason[product.id]?.length || 0) < 10}
                        style={{ color: "#ef4444" }}
                        title="Reject this product"
                      >
                        {productActionLoading[product.id] ? "Rejecting..." : "Reject"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product Edit Modal (SA-1.3-003) */}
          {editingProduct && (
            <div className="modalOverlay" onClick={() => setEditingProduct(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
                <div className="modalHeader">
                  <h3 style={{ margin: 0 }}>Edit Product - Set Margin & BNPL</h3>
                  <button className="btnGhost" onClick={() => setEditingProduct(null)}>&times;</button>
                </div>

                <div className="modalBody">
                  <div style={{ marginBottom: 12 }}>
                    <strong>Original Name:</strong> {editingProduct.productName}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>Purchase Price:</strong> INR {(editingProduct.purchasePrice / 100).toFixed(2)}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong>MRP:</strong> INR {(editingProduct.mrp / 100).toFixed(2)}
                  </div>

                  <hr style={{ margin: "16px 0", borderColor: "#e5e7eb" }} />

                  <div className="control" style={{ marginBottom: 16 }}>
                    <label>Display Name (optional override)</label>
                    <input
                      value={editProductForm.editedName}
                      onChange={(e) => setEditProductForm((f) => ({ ...f, editedName: e.target.value }))}
                      placeholder={editingProduct.productName}
                    />
                  </div>

                  <div className="control" style={{ marginBottom: 16 }}>
                    <label>Margin Type</label>
                    <select
                      value={editProductForm.marginType}
                      onChange={(e) => setEditProductForm((f) => ({ ...f, marginType: e.target.value as "fixed" | "percent" }))}
                    >
                      <option value="fixed">Fixed Amount (INR)</option>
                      <option value="percent">Percentage (%)</option>
                    </select>
                  </div>

                  {editProductForm.marginType === "fixed" ? (
                    <div className="control" style={{ marginBottom: 16 }}>
                      <label>Fixed Margin (INR)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editProductForm.fixedMargin}
                        onChange={(e) => setEditProductForm((f) => ({ ...f, fixedMargin: e.target.value }))}
                        placeholder="e.g. 5.00"
                      />
                      <div className="muted" style={{ marginTop: 4 }}>
                        Retailer Price: INR {((editingProduct.purchasePrice / 100) + (parseFloat(editProductForm.fixedMargin) || 0)).toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div className="control" style={{ marginBottom: 16 }}>
                      <label>Margin Percentage (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={editProductForm.percentMargin}
                        onChange={(e) => setEditProductForm((f) => ({ ...f, percentMargin: e.target.value }))}
                        placeholder="e.g. 10"
                      />
                      <div className="muted" style={{ marginTop: 4 }}>
                        Retailer Price: INR {((editingProduct.purchasePrice / 100) * (1 + (parseFloat(editProductForm.percentMargin) || 0) / 100)).toFixed(2)}
                      </div>
                    </div>
                  )}

                  <div className="control" style={{ marginBottom: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={editProductForm.bnplEligible}
                        onChange={(e) => setEditProductForm((f) => ({ ...f, bnplEligible: e.target.checked }))}
                      />
                      BNPL Eligible (Buy Now Pay Later)
                    </label>
                  </div>

                  {editProductForm.bnplEligible && (
                    <div className="control" style={{ marginBottom: 16 }}>
                      <label>BNPL Max Days</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={editProductForm.bnplMaxDays}
                        onChange={(e) => setEditProductForm((f) => ({ ...f, bnplMaxDays: e.target.value }))}
                      />
                    </div>
                  )}

                  {editProductError && <div className="banner">{editProductError}</div>}
                  {editProductSuccess && <div className="muted" style={{ color: "#22c55e", marginTop: 8 }}>{editProductSuccess}</div>}
                </div>

                <div className="modalFooter">
                  <button className="btnGhost" onClick={() => setEditingProduct(null)}>Cancel</button>
                  <button
                    onClick={handleSubmitEditProduct}
                    disabled={editProductLoading}
                    style={{ background: "#3b82f6", color: "white" }}
                  >
                    {editProductLoading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="cardHeader" style={{ paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
            <div>
              <div className="cardTitle">Recently Processed</div>
              <div className="muted">Approved and rejected requests</div>
            </div>
          </div>

          {pendingSuppliers.filter(s => s.status !== "pending").length === 0 ? (
            <div className="empty">No processed requests yet.</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Requested Name</th>
                    <th>GSTIN</th>
                    <th>Status</th>
                    <th>Processed</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSuppliers.filter(s => s.status !== "pending").map((request) => (
                    <tr key={request.id}>
                      <td className="mono">{request.storeName || request.storeId}</td>
                      <td>{request.requestedName || "-"}</td>
                      <td className="mono">{request.requestedGstin || "-"}</td>
                      <td>
                        <span className={`badge ${request.status === "approved" ? "badgeOk" : "badgeError"}`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="mono">
                        {request.reviewedAt ? new Date(request.reviewedAt).toLocaleString() : "-"}
                      </td>
                      <td>{request.reviewNotes || "-"}</td>
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
                  placeholder="UUID or store code"
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
              {(["overview", "devices", "products", "payments", "purchases", "consumer", "activity", "dues"] as AnalyticsTabKey[]).map((key) => (
                <button
                  key={key}
                  className={analyticsTab === key ? "tab tabActive" : "tab"}
                  onClick={() => setAnalyticsTab(key)}
                >
                  {key === "consumer" ? "Consumer Sales" : key === "payments" ? "Payments & Dues" : key === "activity" ? "Activity Logs" : key === "dues" ? "Dues Tracking" : key[0].toUpperCase() + key.slice(1)}
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

            {/* P2-SADM-001: Activity Logs */}
            {analyticsTab === "activity" && analyticsActivity && (
              <div style={{ marginTop: 12 }}>
                <div className="cardHeader" style={{ paddingTop: 0 }}>
                  <div className="cardTitle">Activity Logs</div>
                  <div className="muted">
                    {analyticsActivity.range.from.slice(0, 10)} to {analyticsActivity.range.to.slice(0, 10)} (grouped by {analyticsActivity.groupBy})
                  </div>
                </div>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time Bucket</th>
                        <th>Scans</th>
                        <th>Sales</th>
                        <th>Collections</th>
                        <th>New Products</th>
                        <th>Offline Synced</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsActivity.buckets.length === 0 ? (
                        <tr><td colSpan={6} className="empty">No activity in this period.</td></tr>
                      ) : (
                        analyticsActivity.buckets.map((b) => (
                          <tr key={b.bucket}>
                            <td className="mono">{new Date(b.bucket).toLocaleString()}</td>
                            <td className="mono">{b.scans}</td>
                            <td className="mono">{b.sales}</td>
                            <td className="mono">{b.collections}</td>
                            <td className="mono">{b.new_products_created}</td>
                            <td className="mono">{b.offline_events_synced}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* P2-SADM-002: Dues Tracking */}
            {analyticsTab === "dues" && analyticsDues && (
              <div style={{ marginTop: 12 }}>
                <div className="analyticsGrid">
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Outstanding Total</div>
                    <div className="analyticsValue">{formatMoneyMinor(analyticsDues.outstanding_total_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">0-1 Days</div>
                    <div className="analyticsValue">{formatMoneyMinor(analyticsDues.aging.d0_1)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">2-7 Days</div>
                    <div className="analyticsValue">{formatMoneyMinor(analyticsDues.aging.d2_7)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">8-30 Days</div>
                    <div className="analyticsValue">{formatMoneyMinor(analyticsDues.aging.d8_30)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">30+ Days</div>
                    <div className="analyticsValue">{formatMoneyMinor(analyticsDues.aging.d30_plus)}</div>
                  </div>
                </div>
                <div className="cardHeader" style={{ paddingTop: 0 }}>
                  <div className="cardTitle">Outstanding Dues ({analyticsDues.total} records)</div>
                </div>
                <div className="tableWrap" style={{ paddingTop: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Sale ID</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Created</th>
                        <th>Age (Days)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsDues.dues.length === 0 ? (
                        <tr><td colSpan={5} className="empty">No outstanding dues.</td></tr>
                      ) : (
                        analyticsDues.dues.map((d) => (
                          <tr key={d.sale_id}>
                            <td className="mono">{d.sale_id.slice(0, 8)}</td>
                            <td>{d.customer_name ?? "-"}</td>
                            <td className="mono">{formatMoneyMinor(d.amount_minor)}</td>
                            <td className="mono">{new Date(d.created_at).toLocaleDateString()}</td>
                            <td className="mono">{d.age_days}</td>
                          </tr>
                        ))
                      )}
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

      {/* ADM-SCR-002: Users Management Tab */}
      {tab === "users" && (
        <section className="card">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Users Management</div>
              <div className="muted">Manage platform users and their access</div>
            </div>
            <button
              onClick={() => setShowCreateUser(!showCreateUser)}
              style={{ background: showCreateUser ? "#6b7280" : "#3b82f6", color: "white" }}
            >
              {showCreateUser ? "Cancel" : "+ Create User"}
            </button>
          </div>

          {/* SA-1.3-004: Create User Form */}
          {showCreateUser && (
            <div className="tableWrap" style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <div className="control">
                  <label>Name *</label>
                  <input
                    value={createUserForm.name}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div className="control">
                  <label>Email</label>
                  <input
                    type="email"
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="control">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={createUserForm.phone}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="control">
                  <label>Type</label>
                  <select
                    value={createUserForm.actor_type}
                    onChange={(e) => setCreateUserForm((f) => ({ ...f, actor_type: e.target.value }))}
                  >
                    <option value="store">Store</option>
                    <option value="supplier">Supplier</option>
                    <option value="platform">Platform Admin</option>
                  </select>
                </div>
              </div>
              {createUserForm.actor_type === "platform" && (
                <div className="muted" style={{ marginTop: 8, color: "#b45309", background: "#fef3c7", padding: 8, borderRadius: 4 }}>
                  Creating a Platform Admin grants full system access. Additional verification required.
                </div>
              )}
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={requestCreateUser}
                  disabled={createUserLoading}
                  style={{ background: "#22c55e", color: "white" }}
                >
                  {createUserLoading ? "Creating..." : "Create User"}
                </button>
                {createUserError && <span className="errorText">{createUserError}</span>}
                {createUserSuccess && <span style={{ color: "#22c55e", fontWeight: 600 }}>{createUserSuccess}</span>}
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                * Name is required. At least one of Email or Phone must be provided.
              </div>
            </div>
          )}

          <div className="tableWrap">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name, email, or phone..."
                style={{ flex: 1, minWidth: 200 }}
              />
              <button onClick={refreshUsers} disabled={usersLoading}>
                {usersLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {userActionError && <div className="errorText" style={{ marginBottom: 8 }}>{userActionError}</div>}
            {usersError && <div className="errorText" style={{ marginBottom: 8 }}>{usersError}</div>}

            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {userRecords
                  .filter((u) => {
                    if (!userSearch.trim()) return true;
                    const q = userSearch.toLowerCase().trim();
                    return (
                      u.name.toLowerCase().includes(q) ||
                      (u.email && u.email.toLowerCase().includes(q)) ||
                      (u.phone && u.phone.includes(q))
                    );
                  })
                  .map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email ?? "-"}</td>
                      <td>{user.phone ?? "-"}</td>
                      <td>
                        <span className="badge">{user.actor_type}</span>
                      </td>
                      <td>
                        <span className={`badge ${user.status === "active" ? "badgeOk" : user.status === "suspended" ? "badgeErr" : "badgeWarn"}`}>
                          {user.status}
                        </span>
                      </td>
                      <td>{new Date(user.created_at).toLocaleDateString()}</td>
                      <td>
                        <select
                          value={user.status}
                          onChange={(e) => requestUserStatusChange(user.id, e.target.value as "active" | "inactive" | "suspended")}
                          disabled={userStatusSaving[user.id]}
                          style={{ minWidth: 100 }}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                {userRecords.length === 0 && !usersLoading && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#888" }}>
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ADM-SCR-003: Settings Tab */}
      {tab === "settings" && (
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">System Settings</div>
            <div className="muted">Platform configuration and statistics</div>
          </div>

          <div className="tableWrap">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <button onClick={refreshSettings} disabled={settingsLoading}>
                {settingsLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {settingsError && <div className="errorText" style={{ marginBottom: 8 }}>{settingsError}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
              {/* System Info Card */}
              <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16 }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>System Information</h4>
                {systemSettings ? (
                  <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#666" }}>Version:</span>
                      <span className="mono">{systemSettings.version}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#666" }}>Environment:</span>
                      <span className={`badge ${systemSettings.environment === "production" ? "badgeOk" : "badgeWarn"}`}>
                        {systemSettings.environment}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#666" }}>Database:</span>
                      <span className={`badge ${systemSettings.database.connected ? "badgeOk" : "badgeErr"}`}>
                        {systemSettings.database.connected ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "#888", fontSize: 13 }}>Loading...</div>
                )}
              </div>

              {/* Features Card */}
              <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16 }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Features</h4>
                {systemSettings ? (
                  <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#666" }}>AI Assistant:</span>
                      <span className={`badge ${systemSettings.features.aiEnabled ? "badgeOk" : "badgeWarn"}`}>
                        {systemSettings.features.aiEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#666" }}>Analytics:</span>
                      <span className={`badge ${systemSettings.features.analyticsEnabled ? "badgeOk" : "badgeWarn"}`}>
                        {systemSettings.features.analyticsEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "#888", fontSize: 13 }}>Loading...</div>
                )}
              </div>

              {/* Statistics Card */}
              <div style={{ background: "#f5f5f5", borderRadius: 8, padding: 16 }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>Platform Statistics</h4>
                {systemStats ? (
                  <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#666" }}>Total Stores:</span>
                      <span style={{ fontWeight: 600 }}>{systemStats.totalStores.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#666" }}>Total Devices:</span>
                      <span style={{ fontWeight: 600 }}>{systemStats.totalDevices.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#666" }}>Total Users:</span>
                      <span style={{ fontWeight: 600 }}>{systemStats.totalUsers.toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "#888", fontSize: 13 }}>Loading...</div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* GL-CRIT-0021: User Suspension Confirmation Modal */}
      {pendingStatusChange && pendingStatusChange.newStatus === "suspended" && (
        <div className="modalOverlay" onClick={() => setPendingStatusChange(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3>Confirm User Suspension</h3>
            </div>
            <div className="modalBody">
              <p>Are you sure you want to suspend user <strong>{pendingStatusChange.userName || pendingStatusChange.userId}</strong>?</p>
              <p className="muted">This action will prevent the user from accessing the system.</p>
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => setPendingStatusChange(null)}>Cancel</button>
              <button
                className="btnDanger"
                onClick={() => executeUserStatusChange(pendingStatusChange.userId, pendingStatusChange.newStatus)}
              >
                Suspend User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GL-CRIT-0022 & GL-CRIT-0052: Device Action Confirmation Modal */}
      {pendingDeviceAction && (
        <div className="modalOverlay" onClick={() => setPendingDeviceAction(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3>
                {pendingDeviceAction.action === "deactivate"
                  ? "Confirm Device Deactivation"
                  : "Confirm Token Reset"}
              </h3>
            </div>
            <div className="modalBody">
              {pendingDeviceAction.action === "deactivate" ? (
                <>
                  <p>Are you sure you want to deactivate device <strong>{pendingDeviceAction.deviceLabel}</strong>?</p>
                  <p className="muted">This will prevent the device from accessing the system until reactivated.</p>
                </>
              ) : (
                <>
                  <p>Are you sure you want to reset the token for device <strong>{pendingDeviceAction.deviceLabel}</strong>?</p>
                  <p className="muted">The device will need to be re-enrolled with a new QR code.</p>
                </>
              )}
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => setPendingDeviceAction(null)}>Cancel</button>
              <button
                className="btnDanger"
                onClick={() => {
                  if (pendingDeviceAction.action === "deactivate") {
                    executeDeviceSave(pendingDeviceAction.deviceId);
                  } else {
                    executeDeviceReset(pendingDeviceAction.deviceId);
                  }
                }}
              >
                {pendingDeviceAction.action === "deactivate" ? "Deactivate Device" : "Reset Token"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GL-CRIT-0053: Admin User Verification Modal */}
      {pendingAdminUser && (
        <div className="modalOverlay" onClick={() => setPendingAdminUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h3>Confirm Platform Admin Creation</h3>
            </div>
            <div className="modalBody">
              <p>You are about to create a <strong>Platform Admin</strong> user:</p>
              <ul style={{ margin: "12px 0", paddingLeft: 20 }}>
                <li><strong>Name:</strong> {pendingAdminUser.name}</li>
                {pendingAdminUser.email && <li><strong>Email:</strong> {pendingAdminUser.email}</li>}
                {pendingAdminUser.phone && <li><strong>Phone:</strong> {pendingAdminUser.phone}</li>}
              </ul>
              <p className="muted" style={{ color: "#b45309" }}>
                Platform admins have full system access. This action is logged for audit compliance.
              </p>
              <div className="control" style={{ marginTop: 12 }}>
                <label>Reason for creating this admin user *</label>
                <textarea
                  value={adminVerificationReason}
                  onChange={(e) => setAdminVerificationReason(e.target.value)}
                  placeholder="Enter reason (minimum 10 characters)..."
                  rows={3}
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>
              {createUserError && <p className="errorText" style={{ marginTop: 8 }}>{createUserError}</p>}
            </div>
            <div className="modalFooter">
              <button className="btnGhost" onClick={() => { setPendingAdminUser(null); setCreateUserError(""); }}>Cancel</button>
              <button
                className="btnDanger"
                onClick={confirmAdminUserCreation}
                disabled={createUserLoading || adminVerificationReason.trim().length < 10}
              >
                {createUserLoading ? "Creating..." : "Confirm & Create Admin"}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="footer muted">
        Tip: this dashboard is static-deployable. Set <span className="mono">VITE_API_BASE_URL</span> in hosting env.
      </footer>
    </div>
  );
}
