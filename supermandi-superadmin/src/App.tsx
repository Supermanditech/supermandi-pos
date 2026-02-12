import { useEffect, useMemo, useRef, useState } from "react";
// ISSUE-MICRO-105: Global error boundary
import { ErrorBoundary } from "./components/ErrorBoundary";
import { fetchHealth } from "./api/health";
import { fetchPosEvents, type PosEvent } from "./api/posEvents";
import { fetchAiHealth } from "./api/ai";
import { hasValidSession, logout, refreshSession, startIdleTimeout, stopIdleTimeout, abortActiveRequests } from "./api/authToken";
import { createStore, fetchStore, fetchStores, updateStore, changeStoreStatus, type StoreRecord } from "./api/stores";
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
  type OverviewResponse,
  type DevicesResponse,
  type ProductsResponse,
  type PurchasesResponse,
  type ConsumerSalesResponse,
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
  changeSupplierStatus,
  fetchBankChanges,
  verifyBankDetails,
  type PendingSupplierRequest,
  type VerifiedSupplier,
  type PendingProduct,
  type ProductEditInput,
  type BankChangeEntry
} from "./api/suppliers";
import { fetchUsers, patchUser, createUser, type UserRecord, type UserCreateInput } from "./api/users";
import { fetchSettings, fetchSystemStats, type SystemSettings, type SystemStats } from "./api/settings";
import {
  logAdminAction,
  logAdminActionError,
  fetchAuditLogs,
  type AuditLogRecord
} from "./api/audit";
import {
  fetchPendingDocuments,
  approveDocument,
  rejectDocument,
  type DocumentRecord
} from "./api/documents";
import { fetchRegistrationEvents, type RegistrationEvent } from "./api/registrationEvents";
import { fetchStoreStaff, createStaff, updateStaff, resetStaffPin, type StaffMember } from "./api/staff";
import { fetchGrnAlerts, updateGrnAlert, type GrnExcessAlert } from "./api/grnAlerts";
import { fetchGlobalFlags, toggleGlobalFlag, fetchStoreFeatureFlags, setStoreOverride, removeStoreOverride, bulkSetOverride, type GlobalFeatureFlag, type StoreFeatureFlag } from "./api/featureFlags";
import { fetchApplications, approveApplication, rejectApplication, type Application } from "./api/applications";
import { BuildStamp } from "./components/BuildStamp";
import { formatCurrency } from "./lib/formatters";
// SA-001: Shared types and constants
import { type TabKey, type GroupKey, type AnalyticsTabKey, type DeviceType, ADMIN_POLL_MS, UPI_VPA_PATTERN, clamp, toIsoSafe, includesInsensitive, toIsoStart, toIsoEnd } from "./types";
// SA-001: Extracted components
import { LoginGate } from "./components/LoginGate";
import { ConfirmationModals } from "./components/ConfirmationModals";
import { AiPanel } from "./components/AiPanel";
// SA-001: Extracted tab components
import { EventsTab } from "./tabs/EventsTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { StoresTab } from "./tabs/StoresTab";
import { SuppliersTab } from "./tabs/SuppliersTab";
import { ApplicationsTab } from "./tabs/ApplicationsTab";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { PaymentsTab } from "./tabs/PaymentsTab";
import { UsersTab } from "./tabs/UsersTab";
import { SettingsTab } from "./tabs/SettingsTab";
import { DocumentsTab } from "./tabs/DocumentsTab";
import { AuditTab } from "./tabs/AuditTab";
import { RegistrationsTab } from "./tabs/RegistrationsTab";
import { StaffTab } from "./tabs/StaffTab";
import { GrnAlertsTab } from "./tabs/GrnAlertsTab";
import "./App.css";

// SA-001: PayloadDetails, LoginGate, EnrollmentCountdown extracted to ./components/

export default function App() {
  const [tab, setTabRaw] = useState<TabKey>("events");
  // ISSUE-MICRO-063: Abort in-flight requests when switching tabs
  // AUDIT-SA-016: Clear error states on tab switch to prevent stale errors
  const setTab = (newTab: TabKey) => {
    if (newTab !== tab) {
      abortActiveRequests();
      setEventsError(""); setHealthError(""); setAiError(""); setStoreError("");
      setStoreDirectoryError(""); setStoreNameError(""); setCreateStoreError("");
      setBarcodeSheetError(""); setDevicesError(""); setDeviceActionError("");
      setEnrollError(""); setAnalyticsError(""); setSuppliersError("");
      setSupplierActionError(""); setStoreSuspendError(""); setProductActionError("");
      setEditProductError(""); setUsersError(""); setUserActionError("");
      setCreateUserError(""); setSettingsError(""); setAuditLogsError("");
      setRegEventsError(""); setDocumentsError(""); setStaffError("");
      setGrnAlertsError(""); setFeatureFlagsError(""); setApplicationsError("");
    }
    setTabRaw(newTab);
  };

  // ITER4-CRIT-001: Track authentication state
  // GO-LIVE-UI-001: Use hasValidSession() to ensure valid JWT, not just any stale token
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Check if VALID session token exists on initial load (prevents 401 loop)
    return hasValidSession();
  });

  // ITER4-CRIT-001: Removed adminTokenInput state - login now handled by LoginGate component

  // STAGING-FIX-005: Listen for auth-expired event from fetchWithTimeout (auto-logout on 401)
  useEffect(() => {
    const onAuthExpired = () => {
      setIsAuthenticated(false);
    };
    window.addEventListener('supermandi-auth-expired', onAuthExpired);
    return () => window.removeEventListener('supermandi-auth-expired', onAuthExpired);
  }, []);

  // STAGING-FIX-008: Validate token server-side on startup to catch stale/invalid tokens
  // Prevents showing "Authenticated" with a token signed by a different JWT_SECRET
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const valid = await refreshSession();
      if (!cancelled && !valid) {
        await logout();
        setIsAuthenticated(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // AUTH-EXPIRY-003: Idle timeout - logout after 30 minutes of inactivity
  useEffect(() => {
    if (!isAuthenticated) {
      stopIdleTimeout();
      return;
    }
    startIdleTimeout(async () => {
      await logout();
      setIsAuthenticated(false);
    });
    return () => stopIdleTimeout();
  }, [isAuthenticated]);

  // AUTH-EXPIRY-003: Periodic token refresh (every 10 minutes)
  // STAGING-FIX-006: Increased threshold from 2→5 consecutive failures before logout
  // Prevents false logouts from transient network issues or Cloud Run cold starts
  useEffect(() => {
    if (!isAuthenticated) return;
    let consecutiveFailures = 0;
    const interval = setInterval(async () => {
      const success = await refreshSession();
      if (success) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= 5) {
          console.warn('[STAGING-FIX-006] Token refresh failed 5 times consecutively, logging out');
          await logout();
          setIsAuthenticated(false);
        }
      }
    }, 10 * 60 * 1000); // Refresh every 10 minutes
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const [health, setHealth] = useState<{ ok: boolean; statusText: string; lastCheckedAt?: string }>(
    { ok: false, statusText: "unknown" }
  );

  const [events, setEvents] = useState<PosEvent[]>([]);
  const [eventsError, setEventsError] = useState<string>("");
  // ISSUE-MICRO-060: Loading state for events fetch (visible in nav bar)
  const [eventsLoading, setEventsLoading] = useState(false);
  const [healthError, setHealthError] = useState<string>("");
  const [lastRefreshAt, setLastRefreshAt] = useState<string>("");
  const healthInFlightRef = useRef(false);
  const eventsInFlightRef = useRef(false);
  const devicesInFlightRef = useRef(false);
  const storesInFlightRef = useRef(false);
  // ISSUE-MICRO-024: Ref to hold latest refresh functions (avoids stale closure in polling)
  const refreshRef = useRef<Record<string, (...args: any[]) => void>>({});

  // AI panel
  const [aiQuestion, setAiQuestion] = useState<string>("");
  const [aiAnswer, setAiAnswer] = useState<string>("");
  const [aiError, setAiError] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(false);
  const [aiIdleSeconds, setAiIdleSeconds] = useState<number>(0);
  const aiIdleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const AI_AUTO_COLLAPSE_SECONDS = 120; // Auto-collapse after 2 minutes of inactivity

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
  // SA-P1-006: Payment method edits per store
  const [storePaymentEdits, setStorePaymentEdits] = useState<Record<string, string[]>>({});

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
  const [deviceTotal, setDeviceTotal] = useState<number>(0);
  const [devicePage, setDevicePage] = useState<number>(0);
  // ISSUE-MICRO-056: Loading state for device fetch (disables pagination buttons)
  const [devicesLoading, setDevicesLoading] = useState(false);
  const DEVICE_PAGE_SIZE = 50;
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
  // ISSUE-MICRO-086: enrollNow state removed — timer moved to EnrollmentCountdown component

  // Analytics state
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTabKey>("overview");
  const [analyticsFrom, setAnalyticsFrom] = useState<string>("");
  const [analyticsTo, setAnalyticsTo] = useState<string>("");
  const [analyticsStoreId, setAnalyticsStoreId] = useState<string>("");
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);
  const [analyticsError, setAnalyticsError] = useState<string>("");
  // GO-LIVE-010: Use proper types instead of any
  const [overviewData, setOverviewData] = useState<OverviewResponse["overview"] | null>(null);
  const [analyticsDevices, setAnalyticsDevices] = useState<DevicesResponse | null>(null);
  const [analyticsProducts, setAnalyticsProducts] = useState<ProductsResponse["products"] | null>(null);
  const [analyticsPurchases, setAnalyticsPurchases] = useState<PurchasesResponse["purchases"] | null>(null);
  const [analyticsConsumerSales, setAnalyticsConsumerSales] = useState<ConsumerSalesResponse["consumer_sales"] | null>(null);
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

  // SA-P1-008: Bank detail re-verification state
  const [bankChanges, setBankChanges] = useState<BankChangeEntry[]>([]);
  const [bankVerifyLoading, setBankVerifyLoading] = useState<Record<string, boolean>>({});
  const [bankRejectReason, setBankRejectReason] = useState<Record<string, string>>({});

  // SA-P1-005: Supplier suspension modal state
  const [pendingSupplierSuspend, setPendingSupplierSuspend] = useState<{
    supplierId: string;
    businessName: string;
    action: "suspend" | "reactivate";
  } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [supplierSuspendLoading, setSupplierSuspendLoading] = useState(false);

  // SA-P0-001: Store suspension modal state
  const [pendingStoreSuspend, setPendingStoreSuspend] = useState<{
    storeId: string;
    storeName: string;
    action: "suspend" | "reactivate";
  } | null>(null);
  const [storeSuspendReason, setStoreSuspendReason] = useState("");
  const [storeSuspendLoading, setStoreSuspendLoading] = useState(false);
  const [storeSuspendError, setStoreSuspendError] = useState("");

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

  // GO-LIVE-011: Audit logs state
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditLogsTotal, setAuditLogsTotal] = useState<number>(0);
  const [auditLogsLoading, setAuditLogsLoading] = useState<boolean>(false);
  const [auditLogsError, setAuditLogsError] = useState<string>("");
  const [auditLogsPage, setAuditLogsPage] = useState<number>(0);
  const [auditLogsFilter, setAuditLogsFilter] = useState<{
    action?: string;
    resource_type?: string;
  }>({});
  const auditLogsInFlightRef = useRef(false);

  // RO-007: Registration events state
  const [regEvents, setRegEvents] = useState<RegistrationEvent[]>([]);
  const [regEventsTotal, setRegEventsTotal] = useState<number>(0);
  const [regEventsLoading, setRegEventsLoading] = useState<boolean>(false);
  const [regEventsError, setRegEventsError] = useState<string>("");
  const [regEventsPage, setRegEventsPage] = useState<number>(0);
  const [regEventsSourceFilter, setRegEventsSourceFilter] = useState<string>("");
  const [regEventsOutcomeFilter, setRegEventsOutcomeFilter] = useState<string>("");
  const [sendingEnrollment, setSendingEnrollment] = useState<string>("");  // DRX-003: storeId being sent
  // DR-010: New registration badge
  const [regEventsLastSeenTotal, setRegEventsLastSeenTotal] = useState<number>(0);

  // DOCS-001: Document management state
  const [pendingDocuments, setPendingDocuments] = useState<DocumentRecord[]>([]);
  const [pendingDocsTotal, setPendingDocsTotal] = useState<number>(0);
  const [documentsLoading, setDocumentsLoading] = useState<boolean>(false);
  const [documentsError, setDocumentsError] = useState<string>("");
  const [documentsPage, setDocumentsPage] = useState<number>(0);
  const [documentsEntityFilter, setDocumentsEntityFilter] = useState<"" | "store" | "supplier">("");
  const [selectedDocument, setSelectedDocument] = useState<DocumentRecord | null>(null);
  const [docRejectReason, setDocRejectReason] = useState<string>("");
  const [documentActionLoading, setDocumentActionLoading] = useState<string | null>(null);
  const documentsInFlightRef = useRef(false);

  // SA-P1-001: Staff management state
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffStoreId, setStaffStoreId] = useState("");
  const [staffActionLoading, setStaffActionLoading] = useState<string | null>(null);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [newStaffPin, setNewStaffPin] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"CASHIER" | "STOCK_MANAGER" | "MANAGER">("CASHIER");
  const [resetPinStaffId, setResetPinStaffId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");

  // SA-P1-004: GRN excess alerts state
  const [grnAlerts, setGrnAlerts] = useState<GrnExcessAlert[]>([]);
  const [grnAlertsLoading, setGrnAlertsLoading] = useState(false);
  const [grnAlertsError, setGrnAlertsError] = useState("");
  const [grnAlertsFilter, setGrnAlertsFilter] = useState<"" | "OPEN" | "ACKNOWLEDGED" | "DISMISSED">("");
  const [grnAlertsTotal, setGrnAlertsTotal] = useState(0);
  const [grnAlertsOpenCount, setGrnAlertsOpenCount] = useState(0);
  const [grnAlertsOffset, setGrnAlertsOffset] = useState(0);
  const [grnAlertActionLoading, setGrnAlertActionLoading] = useState<string | null>(null);

  // SA-P0-005: Feature flags state
  const [featureFlags, setFeatureFlags] = useState<GlobalFeatureFlag[]>([]);
  const [featureFlagsLoading, setFeatureFlagsLoading] = useState(false);
  const [featureFlagSaving, setFeatureFlagSaving] = useState<Record<string, boolean>>({});
  const [featureFlagsError, setFeatureFlagsError] = useState("");

  // SA-P2-003-AUTO: Version input removed — auto-detected from MIN_APP_VERSION env var

  // SA-P1-007: Per-store feature flags state
  const [storeFeatureFlags, setStoreFeatureFlags] = useState<Record<string, StoreFeatureFlag[]>>({});
  const [storeFFLoading, setStoreFFLoading] = useState<Record<string, boolean>>({});

  // SA-P1-007: Bulk feature flag state
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
  const [bulkFlagKey, setBulkFlagKey] = useState("");
  const [bulkFlagAction, setBulkFlagAction] = useState<"enable" | "disable">("enable");
  const [bulkFlagLoading, setBulkFlagLoading] = useState(false);
  const [bulkFlagResult, setBulkFlagResult] = useState("");

  // STAGING-FIX-014: Application approval state
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationsTotal, setApplicationsTotal] = useState(0);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState("");
  const [appActionLoading, setAppActionLoading] = useState<Record<string, boolean>>({});
  const [appRejectReason, setAppRejectReason] = useState<Record<string, string>>({});
  const [appEntityFilter, setAppEntityFilter] = useState<string>("");
  const applicationsInFlightRef = useRef(false);

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
    if (healthInFlightRef.current) return;
    healthInFlightRef.current = true;
    try {
      const data = await fetchHealth();
      const ok = String(data.status).toLowerCase() === "ok";
      setHealth({ ok, statusText: data.status, lastCheckedAt: new Date().toISOString() });
      setHealthError("");
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Backend unreachable";
      setHealth({ ok: false, statusText: "down", lastCheckedAt: new Date().toISOString() });
      setHealthError(message);
    } finally {
      healthInFlightRef.current = false;
    }
  }

  async function refreshEvents() {
    if (eventsInFlightRef.current) return;
    eventsInFlightRef.current = true;
    setEventsLoading(true); // ISSUE-MICRO-060
    try {
      // Filters are applied server-side via query parameters.
      const data = await fetchPosEvents({
        limit: clamp(limit, 50, 1000),
        deviceId: deviceIdFilter || undefined,
        storeId: storeIdFilter || undefined,
        eventType: eventTypeFilter || undefined,
      });
      // Always newest first.
      data.sort((a, b) => (toIsoSafe(b.createdAt) > toIsoSafe(a.createdAt) ? 1 : -1));
      setEvents(data);
      setEventsError("");
      setLastRefreshAt(new Date().toISOString());
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch events";
      setEventsError(message);
      setLastRefreshAt(new Date().toISOString());
    } finally {
      eventsInFlightRef.current = false;
      setEventsLoading(false); // ISSUE-MICRO-060
    }
  }

  async function refreshDevices(pageOverride?: number) {
    if (devicesInFlightRef.current) return;
    devicesInFlightRef.current = true;
    setDevicesLoading(true); // ISSUE-MICRO-056
    try {
      const p = pageOverride ?? devicePage;
      const data = await fetchDevices({
        limit: DEVICE_PAGE_SIZE,
        offset: p * DEVICE_PAGE_SIZE,
        storeId: storeIdFilter || undefined,
        deviceId: deviceIdFilter || undefined,
      });
      setDeviceRecords(data.items);
      setDeviceTotal(data.total);
      setDevicesError("");
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch devices";
      setDevicesError(message);
    } finally {
      devicesInFlightRef.current = false;
      setDevicesLoading(false); // ISSUE-MICRO-056
    }
  }

  async function refreshStores() {
    if (storesInFlightRef.current) return;
    storesInFlightRef.current = true;
    setStoreDirectoryLoading(true);
    try {
      const data = await fetchStores();
      setStoreDirectory(data.items);
      setStoreDirectoryError("");
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch stores";
      setStoreDirectoryError(message);
    } finally {
      storesInFlightRef.current = false;
      setStoreDirectoryLoading(false);
    }
  }

  async function refreshSuppliers() {
    if (suppliersInFlightRef.current) return;
    suppliersInFlightRef.current = true;
    setSuppliersLoading(true);
    setSuppliersError("");
    try {
      const [pendingRes, verifiedRes, products, bankChangesRes] = await Promise.all([
        fetchPendingSuppliers(),
        fetchVerifiedSuppliers({ search: supplierSearch || undefined }),
        fetchPendingProducts(),
        fetchBankChanges()
      ]);
      setPendingSuppliers(pendingRes.items);
      setVerifiedSuppliers(verifiedRes.items);
      setPendingProducts(products);
      setBankChanges(bankChangesRes);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch suppliers";
      setSuppliersError(message);
    } finally {
      suppliersInFlightRef.current = false;
      setSuppliersLoading(false);
    }
  }

  // SA-P1-008: Handle bank detail verification
  async function handleBankVerify(supplierId: string, action: "approve" | "reject") {
    const reason = action === "reject" ? bankRejectReason[supplierId] : undefined;
    if (action === "reject" && (!reason || reason.trim().length < 5)) {
      setSuppliersError("Rejection reason must be at least 5 characters");
      return;
    }
    setBankVerifyLoading((prev) => ({ ...prev, [supplierId]: true }));
    setSuppliersError("");
    try {
      await verifyBankDetails(supplierId, action, reason);
      setBankChanges((prev) => prev.filter((b) => b.id !== supplierId));
      setBankRejectReason((prev) => {
        const next = { ...prev };
        delete next[supplierId];
        return next;
      });
    } catch (e: any) {
      setSuppliersError(e?.message ? String(e.message) : "Failed to verify bank details");
    } finally {
      setBankVerifyLoading((prev) => ({ ...prev, [supplierId]: false }));
    }
  }

  // SA-P1-005: Request supplier status change (opens confirmation modal)
  function requestSupplierStatusChange(supplierId: string, businessName: string, action: "suspend" | "reactivate") {
    setPendingSupplierSuspend({ supplierId, businessName, action });
    setSuspendReason("");
    setSupplierActionError("");
  }

  // SA-P1-005: Execute supplier status change after confirmation
  async function executeSupplierStatusChange() {
    if (!pendingSupplierSuspend) return;
    const { supplierId, action } = pendingSupplierSuspend;
    const newStatus = action === "suspend" ? "SUSPENDED" : "ACTIVE";
    setSupplierSuspendLoading(true);
    setSupplierActionError("");
    try {
      await changeSupplierStatus(supplierId, newStatus, suspendReason || undefined);
      // Update local state
      setVerifiedSuppliers((prev) =>
        prev.map((s) =>
          s.id === supplierId ? { ...s, verificationStatus: newStatus } : s
        )
      );
      setPendingSupplierSuspend(null);
      setSuspendReason("");
    } catch (e: unknown) {
      setSupplierActionError(e instanceof Error ? e.message : "Failed to update supplier status");
    } finally {
      setSupplierSuspendLoading(false);
    }
  }

  // SA-P0-001: Request store status change (opens confirmation modal)
  function requestStoreStatusChange(storeId: string, storeName: string, action: "suspend" | "reactivate") {
    setPendingStoreSuspend({ storeId, storeName, action });
    setStoreSuspendReason("");
    setStoreSuspendError("");
  }

  // SA-P0-001: Execute store status change after confirmation
  async function executeStoreStatusChange() {
    if (!pendingStoreSuspend) return;
    const { storeId, action } = pendingStoreSuspend;
    const newStatus = action === "suspend" ? "SUSPENDED" : "ACTIVE";
    setStoreSuspendLoading(true);
    setStoreSuspendError("");
    try {
      await changeStoreStatus(storeId, newStatus, storeSuspendReason || undefined);
      // Update local state
      setStoreDirectory((prev) =>
        prev.map((s) =>
          s.id === storeId ? { ...s, status: newStatus, active: newStatus === "ACTIVE" } : s
        )
      );
      setPendingStoreSuspend(null);
      setStoreSuspendReason("");
    } catch (e: unknown) {
      setStoreSuspendError(e instanceof Error ? e.message : "Failed to update store status");
    } finally {
      setStoreSuspendLoading(false);
    }
  }

  // ADM-SCR-002: Fetch users
  async function refreshUsers() {
    if (usersInFlightRef.current) return;
    usersInFlightRef.current = true;
    setUsersLoading(true);
    setUsersError("");
    try {
      const usersRes = await fetchUsers();
      setUserRecords(usersRes.items);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch users";
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
      // GL-CRIT-0049: Log successful user status change
      logAdminAction('user_status_change', 'user', userId, { newStatus, userName: updated.name });
    } catch (e: any) {
      const errorMsg = e?.message ? String(e.message) : "Failed to update user";
      setUserActionError(errorMsg);
      // GL-CRIT-0049: Log failed user status change
      logAdminActionError('user_status_change', 'user', userId, errorMsg);
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
    // AUDIT-SA-005: Email is required for all user types
    if (!email.trim()) {
      setCreateUserError("Email is required");
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
      // GL-CRIT-0049: Log successful user creation
      logAdminAction('user_create', 'user', newUser.id, {
        name: newUser.name,
        actor_type: input.actor_type,
        isPlatformAdmin: input.actor_type === 'platform'
      });
      // Auto-close form after short delay
      setTimeout(() => {
        setShowCreateUser(false);
        setCreateUserSuccess("");
      }, 2000);
    } catch (e: any) {
      const errorMsg = e?.message ? String(e.message) : "Failed to create user";
      setCreateUserError(errorMsg);
      // GL-CRIT-0049: Log failed user creation
      logAdminActionError('user_create', 'user', undefined, errorMsg);
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
    if (settingsInFlightRef.current) return;
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
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch settings";
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
        const fixedVal = parseFloat(editProductForm.fixedMargin);
        // AUDIT-SA-004: Reject negative margin values
        if (fixedVal < 0) { setEditProductError("Margin cannot be negative"); setEditProductLoading(false); return; }
        input.superMandiMarginMinor = Math.round(fixedVal * 100);
      } else if (editProductForm.marginType === "percent" && editProductForm.percentMargin) {
        const pctVal = parseFloat(editProductForm.percentMargin);
        // AUDIT-SA-004: Reject negative margin values
        if (pctVal < 0) { setEditProductError("Margin percentage cannot be negative"); setEditProductLoading(false); return; }
        input.marginPercent = pctVal;
      }

      const result = await editProduct(editingProduct.id, input);
      setEditProductSuccess(`Saved! Retailer Price: ${formatCurrency(result.retailerPrice)}`);

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

  // GO-LIVE-011: Fetch audit logs
  async function refreshAuditLogs() {
    if (auditLogsInFlightRef.current) return;
    auditLogsInFlightRef.current = true;
    setAuditLogsLoading(true);
    setAuditLogsError("");

    try {
      const res = await fetchAuditLogs({
        limit: 50,
        offset: auditLogsPage * 50,
        action: auditLogsFilter.action,
        resource_type: auditLogsFilter.resource_type,
      });
      setAuditLogs(res.logs);
      setAuditLogsTotal(res.total);
    } catch (e: any) {
      setAuditLogsError(e?.message ? String(e.message) : "Failed to fetch audit logs");
    } finally {
      setAuditLogsLoading(false);
      auditLogsInFlightRef.current = false;
    }
  }

  // RO-007: Fetch registration events
  async function refreshRegEvents() {
    setRegEventsLoading(true);
    setRegEventsError("");
    try {
      const res = await fetchRegistrationEvents({
        limit: 50,
        offset: regEventsPage * 50,
        source: regEventsSourceFilter || undefined,
        outcome: regEventsOutcomeFilter || undefined,
      });
      setRegEvents(res.events);
      setRegEventsTotal(res.pagination.total);
    } catch (e: any) {
      setRegEventsError(e?.message ? String(e.message) : "Failed to fetch registration events");
    } finally {
      setRegEventsLoading(false);
    }
  }

  // DOCS-001: Fetch pending documents
  async function refreshDocuments() {
    if (documentsInFlightRef.current) return;
    documentsInFlightRef.current = true;
    setDocumentsLoading(true);
    setDocumentsError("");

    try {
      const entityType = documentsEntityFilter || undefined;
      const res = await fetchPendingDocuments(entityType, 50, documentsPage * 50);
      setPendingDocuments(res.documents);
      setPendingDocsTotal(res.pagination.total);
    } catch (e: any) {
      setDocumentsError(e?.message ? String(e.message) : "Failed to fetch documents");
    } finally {
      setDocumentsLoading(false);
      documentsInFlightRef.current = false;
    }
  }

  // DOCS-001: Approve a document
  async function handleApproveDocument(docId: string) {
    setDocumentActionLoading(docId);
    try {
      await approveDocument(docId);
      await logAdminAction("approve", "document", docId, { status: "approved" });
      setSelectedDocument(null);
      refreshDocuments();
    } catch (e: any) {
      await logAdminActionError("approve", "document", docId, e?.message || "Unknown error");
      alert(e?.message || "Failed to approve document");
    } finally {
      setDocumentActionLoading(null);
    }
  }

  // DOCS-001: Reject a document
  async function handleRejectDocument(docId: string, reason: string) {
    // AUDIT-SA-014: Require meaningful rejection reason (min 10 chars)
    if (reason.trim().length < 10) {
      alert("Please provide a detailed rejection reason (at least 10 characters)");
      return;
    }
    setDocumentActionLoading(docId);
    try {
      await rejectDocument(docId, reason);
      await logAdminAction("reject", "document", docId, { status: "rejected", reason });
      setSelectedDocument(null);
      setDocRejectReason("");
      refreshDocuments();
    } catch (e: any) {
      await logAdminActionError("reject", "document", docId, e?.message || "Unknown error");
      alert(e?.message || "Failed to reject document");
    } finally {
      setDocumentActionLoading(null);
    }
  }

  // SA-P1-001: Staff management handlers
  async function refreshStaff() {
    if (!staffStoreId) { setStaffList([]); return; }
    setStaffLoading(true);
    setStaffError("");
    try {
      const data = await fetchStoreStaff(staffStoreId);
      setStaffList(data.staff || []);
    } catch (e: any) {
      setStaffError(e?.message || "Failed to load staff");
    } finally {
      setStaffLoading(false);
    }
  }

  async function handleAddStaff() {
    if (!staffStoreId) return;
    setStaffActionLoading("add");
    try {
      await createStaff(staffStoreId, {
        name: newStaffName.trim(),
        phone: newStaffPhone.trim(),
        pin: newStaffPin,
        role: newStaffRole,
      });
      setShowAddStaff(false);
      setNewStaffName("");
      setNewStaffPhone("");
      setNewStaffPin("");
      setNewStaffRole("CASHIER");
      refreshStaff();
    } catch (e: any) {
      alert(e?.message || "Failed to add staff");
    } finally {
      setStaffActionLoading(null);
    }
  }

  async function handleToggleStaffActive(staffId: string, currentlyActive: boolean) {
    if (!staffStoreId) return;
    setStaffActionLoading(staffId);
    try {
      await updateStaff(staffStoreId, staffId, { is_active: !currentlyActive });
      refreshStaff();
    } catch (e: any) {
      alert(e?.message || "Failed to update staff");
    } finally {
      setStaffActionLoading(null);
    }
  }

  async function handleResetPin() {
    if (!staffStoreId || !resetPinStaffId || !/^\d{4,6}$/.test(resetPinValue)) {
      alert("PIN must be 4-6 digits");
      return;
    }
    setStaffActionLoading(resetPinStaffId);
    try {
      await resetStaffPin(staffStoreId, resetPinStaffId, resetPinValue);
      setResetPinStaffId(null);
      setResetPinValue("");
      alert("PIN reset successfully");
    } catch (e: any) {
      alert(e?.message || "Failed to reset PIN");
    } finally {
      setStaffActionLoading(null);
    }
  }

  // SA-P0-005: Feature flags handlers
  async function refreshFeatureFlags() {
    setFeatureFlagsLoading(true);
    setFeatureFlagsError("");
    try {
      const flags = await fetchGlobalFlags();
      setFeatureFlags(flags);
      // SA-P2-003-AUTO: Version auto-detected from env var — no UI initialization needed
    } catch (e: unknown) {
      setFeatureFlagsError(e instanceof Error ? e.message : "Failed to fetch feature flags");
    } finally {
      setFeatureFlagsLoading(false);
    }
  }

  async function handleToggleGlobalFlag(key: string, enabled: boolean) {
    setFeatureFlagSaving((prev) => ({ ...prev, [key]: true }));
    try {
      // SA-P2-003-AUTO: Version auto-detected — no payload needed from UI
      const updated = await toggleGlobalFlag(key, enabled);
      setFeatureFlags((prev) =>
        prev.map((f) =>
          f.flag_key === key ? { ...f, ...updated } : f
        )
      );
    } catch (e: unknown) {
      setFeatureFlagsError(e instanceof Error ? e.message : "Failed to toggle flag");
    } finally {
      setFeatureFlagSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  // SA-P1-007: Per-store feature flag handlers
  async function loadStoreFeatureFlags(storeId: string) {
    if (storeFeatureFlags[storeId]) return;
    setStoreFFLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      const flags = await fetchStoreFeatureFlags(storeId);
      setStoreFeatureFlags((prev) => ({ ...prev, [storeId]: flags }));
    } catch (e: unknown) {
      console.error("[SA-P1-007] Load store flags failed:", e instanceof Error ? e.message : "unknown");
    } finally {
      setStoreFFLoading((prev) => ({ ...prev, [storeId]: false }));
    }
  }

  async function handleStoreFFToggle(storeId: string, flag: StoreFeatureFlag) {
    if (!flag.global_enabled) return;
    const newEnabled = !flag.effective;
    try {
      if (flag.store_override !== null && newEnabled === flag.global_enabled) {
        await removeStoreOverride(storeId, flag.flag_key);
      } else {
        await setStoreOverride(storeId, flag.flag_key, newEnabled);
      }
      const flags = await fetchStoreFeatureFlags(storeId);
      setStoreFeatureFlags((prev) => ({ ...prev, [storeId]: flags }));
    } catch (e: unknown) {
      console.error("[SA-P1-007] Toggle store flag failed:", e instanceof Error ? e.message : "unknown");
    }
  }

  // SA-P1-007: Bulk feature flag handlers
  function toggleStoreSelection(storeId: string) {
    setSelectedStoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId); else next.add(storeId);
      return next;
    });
  }

  async function handleBulkFF() {
    if (!selectedStoreIds.size || !bulkFlagKey) return;
    setBulkFlagLoading(true);
    setBulkFlagResult("");
    try {
      const result = await bulkSetOverride(Array.from(selectedStoreIds), bulkFlagKey, bulkFlagAction === "enable");
      setBulkFlagResult(`Updated ${result.updated} store(s)`);
      setStoreFeatureFlags((prev) => {
        const next = { ...prev };
        for (const id of selectedStoreIds) delete next[id];
        return next;
      });
      setSelectedStoreIds(new Set());
    } catch (e: unknown) {
      setBulkFlagResult(`Error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBulkFlagLoading(false);
    }
  }

  // SA-P1-004: GRN excess alerts handlers
  async function refreshGrnAlerts() {
    setGrnAlertsLoading(true);
    setGrnAlertsError("");
    try {
      const data = await fetchGrnAlerts({
        status: grnAlertsFilter || undefined,
        limit: 50,
        offset: grnAlertsOffset,
      });
      setGrnAlerts(data.alerts || []);
      setGrnAlertsTotal(data.pagination?.total || 0);
      setGrnAlertsOpenCount(data.openCount || 0);
    } catch (e: unknown) {
      setGrnAlertsError(e instanceof Error ? e.message : "Failed to load GRN alerts");
    } finally {
      setGrnAlertsLoading(false);
    }
  }

  async function handleGrnAlertAction(alertId: string, status: "ACKNOWLEDGED" | "DISMISSED") {
    setGrnAlertActionLoading(alertId);
    try {
      await updateGrnAlert(alertId, { status });
      refreshGrnAlerts();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to update alert");
    } finally {
      setGrnAlertActionLoading(null);
    }
  }

  // STAGING-FIX-014: Application approval refresh + handlers
  async function refreshApplications() {
    if (applicationsInFlightRef.current) return;
    applicationsInFlightRef.current = true;
    setApplicationsLoading(true);
    setApplicationsError("");
    try {
      const data = await fetchApplications({
        entityType: appEntityFilter || undefined,
        limit: 100,
      });
      setApplications(data.items);
      setApplicationsTotal(data.total);
    } catch (e: any) {
      setApplicationsError(e?.message ? String(e.message) : "Failed to fetch applications");
    } finally {
      applicationsInFlightRef.current = false;
      setApplicationsLoading(false);
    }
  }

  async function handleApproveApplication(appId: string) {
    setAppActionLoading((prev) => ({ ...prev, [appId]: true }));
    setApplicationsError("");
    try {
      await approveApplication(appId);
      setApplications((prev) => prev.filter((a) => a.id !== appId));
      setApplicationsTotal((prev) => Math.max(0, prev - 1));
    } catch (e: any) {
      setApplicationsError(e?.message ? String(e.message) : "Failed to approve application");
    } finally {
      setAppActionLoading((prev) => ({ ...prev, [appId]: false }));
    }
  }

  async function handleRejectApplication(appId: string) {
    const reason = appRejectReason[appId];
    if (!reason || reason.trim().length < 5) {
      setApplicationsError("Rejection reason must be at least 5 characters");
      return;
    }
    setAppActionLoading((prev) => ({ ...prev, [appId]: true }));
    setApplicationsError("");
    try {
      await rejectApplication(appId, { reason: reason.trim() });
      setApplications((prev) => prev.filter((a) => a.id !== appId));
      setApplicationsTotal((prev) => Math.max(0, prev - 1));
      setAppRejectReason((prev) => {
        const next = { ...prev };
        delete next[appId];
        return next;
      });
    } catch (e: any) {
      setApplicationsError(e?.message ? String(e.message) : "Failed to reject application");
    } finally {
      setAppActionLoading((prev) => ({ ...prev, [appId]: false }));
    }
  }

  // ISSUE-MICRO-024: Update ref each render so polling interval uses latest closures
  refreshRef.current = { refreshHealth, refreshEvents, refreshDevices, refreshStores, refreshSuppliers, refreshUsers, refreshSettings, refreshAuditLogs, refreshDocuments, refreshRegEvents, refreshStaff, refreshGrnAlerts, refreshAnalytics, refreshApplications };

  useEffect(() => {
    // ITER4-CRIT-001: Token pre-fill removed - login now handled by LoginGate component

    const shouldRefreshEvents = tab === "events" || tab === "devices" || tab === "payments"; // P0-DEPLOY-002: Include payments
    const shouldRefreshDevices = tab === "devices";
    // AUDIT-SA-033: Also load storeDirectory on staff tab (depends on store data)
    const shouldRefreshStores = tab === "stores" || tab === "staff";
    const shouldRefreshSuppliers = tab === "suppliers";
    const shouldRefreshUsers = tab === "users";
    const shouldRefreshSettings = tab === "settings";
    const shouldRefreshAi = tab === "ai";
    const shouldRefreshAudit = tab === "audit"; // GO-LIVE-011
    const shouldRefreshDocuments = tab === "documents"; // DOCS-001
    const shouldRefreshRegEvents = tab === "registrations"; // RO-007
    const shouldRefreshApplications = tab === "applications"; // STAGING-FIX-014

    // ISSUE-MICRO-024: Use refreshRef for initial calls too (consistent with polling)
    const r = refreshRef.current;
    r.refreshHealth?.();
    if (shouldRefreshEvents) r.refreshEvents?.();
    if (shouldRefreshDevices) r.refreshDevices?.();
    if (shouldRefreshStores) { r.refreshStores?.(); refreshFeatureFlags(); }
    if (shouldRefreshSuppliers) r.refreshSuppliers?.();
    if (shouldRefreshUsers) r.refreshUsers?.();
    if (shouldRefreshSettings) { r.refreshSettings?.(); refreshFeatureFlags(); }
    if (shouldRefreshAi) {
      fetchAiHealth()
        .then((res) => setAiConfigured(res.configured))
        .catch(() => setAiConfigured(null));
    }
    if (shouldRefreshAudit) r.refreshAuditLogs?.(); // GO-LIVE-011
    if (shouldRefreshDocuments) r.refreshDocuments?.(); // DOCS-001
    if (shouldRefreshRegEvents) r.refreshRegEvents?.(); // RO-007
    if (shouldRefreshApplications) r.refreshApplications?.(); // STAGING-FIX-014
    if (tab === "staff" && staffStoreId) r.refreshStaff?.(); // SA-P1-001
    if (tab === "grn-alerts") r.refreshGrnAlerts?.(); // SA-P1-004

    // ISSUE-MICRO-024: Polling uses refreshRef to avoid stale closure
    const id = setInterval(() => {
      const r = refreshRef.current;
      r.refreshHealth?.();
      if (shouldRefreshEvents) r.refreshEvents?.();
      if (shouldRefreshDevices) r.refreshDevices?.();
      if (shouldRefreshStores) r.refreshStores?.();
      if (shouldRefreshSuppliers) r.refreshSuppliers?.();
      if (shouldRefreshUsers) r.refreshUsers?.();
      if (shouldRefreshSettings) r.refreshSettings?.();
      if (shouldRefreshAi) {
        fetchAiHealth()
          .then((res) => setAiConfigured(res.configured))
          .catch(() => setAiConfigured(null));
      }
      if (shouldRefreshAudit) r.refreshAuditLogs?.();
      if (shouldRefreshDocuments) r.refreshDocuments?.();
      r.refreshRegEvents?.(); // DR-010: Always poll for badge count
    }, ADMIN_POLL_MS);
    return () => clearInterval(id);
  }, [tab, staffStoreId]);

  // If user changes limit, refresh immediately.
  useEffect(() => {
    refreshRef.current.refreshEvents?.();
    setPage(0);
  }, [limit]);

  // GO-LIVE-011: Refresh audit logs when page or filter changes
  useEffect(() => {
    if (tab === "audit") {
      refreshRef.current.refreshAuditLogs?.();
    }
  }, [auditLogsPage, auditLogsFilter, tab]);

  // DOCS-001: Refresh documents when page or filter changes
  useEffect(() => {
    if (tab === "documents") {
      refreshRef.current.refreshDocuments?.();
    }
  }, [documentsPage, documentsEntityFilter, tab]);

  // RO-007: Refresh registration events when page or filter changes
  useEffect(() => {
    if (tab === "registrations") {
      refreshRef.current.refreshRegEvents?.();
    }
  }, [regEventsPage, regEventsSourceFilter, regEventsOutcomeFilter, tab]);

  // DR-010: Clear badge when admin views the registrations tab
  useEffect(() => {
    if (tab === "registrations") {
      setRegEventsLastSeenTotal(regEventsTotal);
    }
  }, [tab, regEventsTotal]);

  // ISSUE-MICRO-059: Reset audit page to 0 when filter changes
  useEffect(() => {
    setAuditLogsPage(0);
  }, [auditLogsFilter]);

  // ISSUE-MICRO-059: Reset documents page to 0 when filter changes
  useEffect(() => {
    setDocumentsPage(0);
  }, [documentsEntityFilter]);

  // ISSUE-MICRO-086: Timer effect removed — countdown managed by EnrollmentCountdown component

  useEffect(() => {
    setPage(0);
    setDevicePage(0); // ISSUE-MICRO-023: Reset device page on filter change
  }, [deviceIdFilter, storeIdFilter, eventTypeFilter]);

  // ISSUE-MICRO-023 + ISSUE-MICRO-058: Debounce device refresh on filter change (300ms)
  useEffect(() => {
    if (tab !== "devices") return;
    const timer = setTimeout(() => {
      refreshRef.current.refreshDevices?.(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [deviceIdFilter, storeIdFilter, tab]);

  useEffect(() => {
    if (tab !== "analytics") return;
    refreshRef.current.refreshAnalytics?.(analyticsTab);
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
      // ISSUE-MICRO-057: Don't delete edits for devices not in current page
      // (preserves unsaved edits across filter/pagination changes)
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

  // AI Panel: Auto-collapse after inactivity
  useEffect(() => {
    if (aiPanelOpen) {
      setAiIdleSeconds(0);
      aiIdleTimerRef.current = setInterval(() => {
        setAiIdleSeconds((prev) => {
          const next = prev + 1;
          if (next >= AI_AUTO_COLLAPSE_SECONDS) {
            setAiPanelOpen(false);
            return 0;
          }
          return next;
        });
      }, 1000);
    }
    return () => {
      if (aiIdleTimerRef.current) {
        clearInterval(aiIdleTimerRef.current);
        aiIdleTimerRef.current = null;
      }
    };
  }, [aiPanelOpen]);

  // AI Panel: Reset idle timer on activity
  const resetAiIdleTimer = () => {
    setAiIdleSeconds(0);
  };

  // AI Panel: Fetch AI health when panel opens
  useEffect(() => {
    if (aiPanelOpen && aiConfigured === null) {
      fetchAiHealth()
        .then((res) => setAiConfigured(res.configured))
        .catch(() => setAiConfigured(null));
    }
  }, [aiPanelOpen, aiConfigured]);

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

  // Device filtering is now server-side; deviceRecords is already filtered
  const filteredDeviceRecords = deviceRecords;

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

  // SA-P1-006: Payment method editing helpers
  function getStorePaymentDraft(s: StoreRecord): string[] {
    return storePaymentEdits[s.id] ?? (s.allowed_payment_methods ?? ["CASH", "UPI", "DUE"]);
  }
  function toggleStorePaymentMethod(storeId: string, method: string, current: string[]) {
    const next = current.includes(method)
      ? current.filter((m) => m !== method)
      : [...current, method];
    if (next.length === 0) return; // at least one method required
    setStorePaymentEdits((prev) => ({ ...prev, [storeId]: next }));
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
      // SA-P1-006: Include payment methods in update
      const paymentDraft = storePaymentEdits[storeId];
      const updated = await updateStore(storeId, {
        storeName: nextName,
        ...(contactDraft ? {
          address: contactDraft.address,
          contactName: contactDraft.contactName,
          contactPhone: contactDraft.contactPhone,
          contactEmail: contactDraft.contactEmail
        } : {}),
        ...(paymentDraft ? { allowedPaymentMethods: paymentDraft } : {})
      });
      setStoreDirectory((prev) => prev.map((s) => (s.id === storeId ? updated : s)));
      setStoreNameEdits((prev) => ({ ...prev, [storeId]: updated.name ?? updated.storeName ?? nextName }));
      // SA-P1-006: Clear payment draft after successful save
      if (paymentDraft) {
        setStorePaymentEdits((prev) => { const next = { ...prev }; delete next[storeId]; return next; });
      }
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

    // GL-CRIT-0054: Validate label (1-50 characters, alphanumeric + spaces/hyphens/underscores)
    const trimmedLabel = draft.label.trim();
    if (!trimmedLabel) {
      setDeviceActionError("Device label is required.");
      return;
    }
    if (trimmedLabel.length > 50) {
      setDeviceActionError("Device label must be 50 characters or less.");
      return;
    }
    // GL-CRIT-0054: Alphanumeric validation (allow letters, numbers, spaces, hyphens, underscores)
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedLabel)) {
      setDeviceActionError("Device label can only contain letters, numbers, spaces, hyphens, and underscores.");
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
      // GL-CRIT-0049: Log successful device update
      logAdminAction('device_update', 'device', deviceId, {
        label: draft.label.trim(),
        active: draft.active,
        deviceType: draft.deviceType
      });
      // ISSUE-MICRO-064: Re-fetch devices to update total (may change if filter excludes updated device)
      void refreshDevices();
    } catch (e: any) {
      const errorMsg = e?.message ? String(e.message) : "Failed to update device.";
      setDeviceActionError(errorMsg);
      // GL-CRIT-0049: Log failed device update
      logAdminActionError('device_update', 'device', deviceId, errorMsg);
      // ISSUE-MICRO-062: Rollback draft to server state on save failure
      const original = deviceRecords.find((d) => d.id === deviceId);
      if (original) {
        setDeviceEdits((prev) => ({
          ...prev,
          [deviceId]: {
            label: original.label ?? "",
            deviceType: (original.device_type as DeviceType) ?? "RETAILER_PHONE",
            printingMode: original.printing_mode ?? "NONE",
            scanLookupV2Enabled: original.scan_lookup_v2_enabled ?? false,
            active: Boolean(original.active)
          }
        }));
      }
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
      // GL-CRIT-0049: Log successful device token reset
      logAdminAction('device_token_reset', 'device', deviceId, { label: updated.label });
      // ISSUE-MICRO-064: Re-fetch devices to update total
      void refreshDevices();
    } catch (e: any) {
      const errorMsg = e?.message ? String(e.message) : "Failed to reset device token.";
      setDeviceActionError(errorMsg);
      // GL-CRIT-0049: Log failed device token reset
      logAdminActionError('device_token_reset', 'device', deviceId, errorMsg);
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

  // ISSUE-MICRO-086: enrollmentCountdown useMemo removed — rendered by EnrollmentCountdown component

  // ITER4-CRIT-001: Show login gate if not authenticated
  if (!isAuthenticated) {
    return <LoginGate onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <ErrorBoundary>
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
            <span style={{ color: "#059669" }}>Authenticated</span>
            <button
              className="tab"
              onClick={async () => {
                // GO-LIVE-001 & GO-LIVE-002: Logout - revoke session and show login
                await logout();
                setIsAuthenticated(false);
              }}
              style={{ background: "#fee2e2", color: "#dc2626" }}
            >
              Logout
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

      {/* ITER4-CRIT-001: Warning banner removed - login gate now blocks access */}

      {(healthError || eventsError || devicesError) && (
        <div className="banner" role="alert">
          <strong>Backend warning:</strong>
          <div className="bannerDetails">
            {healthError && <div>Health: {healthError}</div>}
            {eventsError && <div>Events: {eventsError}</div>}
            {devicesError && <div>Devices: {devicesError}</div>}
          </div>
          <div className="muted">
            UI will keep retrying every {Math.round(ADMIN_POLL_MS / 1000)} seconds.
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
          {(pendingSuppliers.filter(s => s.status === "pending").length + pendingProducts.length + bankChanges.length) > 0 && (
            <span className="badge badgeWarn" style={{ marginLeft: 6 }}>
              {pendingSuppliers.filter(s => s.status === "pending").length + pendingProducts.length + bankChanges.length}
            </span>
          )}
        </button>
        {/* STAGING-FIX-014: Applications approval tab */}
        <button className={tab === "applications" ? "tab tabActive" : "tab"} onClick={() => setTab("applications")}>
          Applications
          {applicationsTotal > 0 && (
            <span className="badge badgeWarn" style={{ marginLeft: 6 }}>
              {applicationsTotal}
            </span>
          )}
        </button>
        <button className={tab === "analytics" ? "tab tabActive" : "tab"} onClick={() => setTab("analytics")}>
          Analytics
        </button>
        <button className={tab === "payments" ? "tab tabActive" : "tab"} onClick={() => setTab("payments")}>
          Payments
        </button>
        <button
          className={`tab ${aiPanelOpen ? "tabActive" : ""}`}
          onClick={() => setAiPanelOpen(true)}
          title="Open AI Assistant Panel"
        >
          <span className="brandPill">SuperMandi</span>
          AI
          {aiAnswer && <span style={{ marginLeft: 4 }}>💬</span>}
        </button>
        <button className={tab === "users" ? "tab tabActive" : "tab"} onClick={() => setTab("users")}>
          Users
        </button>
        <button className={tab === "settings" ? "tab tabActive" : "tab"} onClick={() => setTab("settings")}>
          Settings
        </button>
        {/* DOCS-001: Documents verification tab */}
        <button className={tab === "documents" ? "tab tabActive" : "tab"} onClick={() => setTab("documents")}>
          Documents
          {pendingDocuments.length > 0 && (
            <span className="badge badgeWarn" style={{ marginLeft: 6 }}>
              {pendingDocsTotal}
            </span>
          )}
        </button>
        {/* GO-LIVE-011: Audit logs tab */}
        <button className={tab === "audit" ? "tab tabActive" : "tab"} onClick={() => setTab("audit")}>
          Audit Logs
        </button>
        {/* RO-007: Registration events tab + DR-010: badge */}
        <button className={tab === "registrations" ? "tab tabActive" : "tab"} onClick={() => setTab("registrations")}>
          Registrations
          {tab !== "registrations" && regEventsTotal > regEventsLastSeenTotal && (
            <span style={{ marginLeft: 6, background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>
              {regEventsTotal - regEventsLastSeenTotal}
            </span>
          )}
        </button>

        {/* SA-P1-001: Staff management tab */}
        <button className={tab === "staff" ? "tab tabActive" : "tab"} onClick={() => setTab("staff")}>
          Staff
        </button>

        {/* SA-P1-004: GRN Alerts tab */}
        <button className={tab === "grn-alerts" ? "tab tabActive" : "tab"} onClick={() => setTab("grn-alerts")}>
          GRN Alerts
          {grnAlertsOpenCount > 0 && (
            <span style={{ marginLeft: 6, background: "#f59e0b", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>
              {grnAlertsOpenCount}
            </span>
          )}
        </button>

        <div className="tabsRight muted">
          {eventsLoading && <span style={{ marginRight: 8 }}>Refreshing…</span>}
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

      {/* SA-001: Tab content — extracted to separate components */}
      {tab === "events" && (
        <EventsTab
          filteredEvents={filteredEvents}
          pageEvents={pageEvents}
          grouped={grouped}
          groupBy={groupBy}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
        />
      )}

      {tab === "devices" && (
        <DevicesTab
          enrollStoreId={enrollStoreId}
          setEnrollStoreId={setEnrollStoreId}
          handleCreateEnrollment={handleCreateEnrollment}
          enrollLoading={enrollLoading}
          enrollError={enrollError}
          enrollment={enrollment}
          deviceActionError={deviceActionError}
          devicesError={devicesError}
          filteredDeviceRecords={filteredDeviceRecords}
          deviceEdits={deviceEdits}
          updateDeviceDraft={updateDeviceDraft}
          deviceSaving={deviceSaving}
          requestDeviceSave={requestDeviceSave}
          requestDeviceReset={requestDeviceReset}
          devicePage={devicePage}
          setDevicePage={setDevicePage}
          devicesLoading={devicesLoading}
          deviceTotal={deviceTotal}
          refreshDevices={refreshDevices}
          limit={limit}
          devices={devices}
        />
      )}

      {tab === "stores" && (
        <StoresTab
          createStoreName={createStoreName}
          setCreateStoreName={setCreateStoreName}
          createStoreId={createStoreId}
          setCreateStoreId={setCreateStoreId}
          handleCreateStore={handleCreateStore}
          createStoreLoading={createStoreLoading}
          createStoreError={createStoreError}
          createStoreSuccess={createStoreSuccess}
          storeAdminId={storeAdminId}
          setStoreAdminId={setStoreAdminId}
          storeUpiInput={storeUpiInput}
          setStoreUpiInput={setStoreUpiInput}
          storeUpiInputRef={storeUpiInputRef}
          handleStoreLoad={handleStoreLoad}
          handleStoreSave={handleStoreSave}
          storeLoading={storeLoading}
          storeError={storeError}
          storeSuccess={storeSuccess}
          storeRecord={storeRecord}
          storeDirectory={storeDirectory}
          storeDirectoryLoading={storeDirectoryLoading}
          storeDirectoryError={storeDirectoryError}
          storeNameError={storeNameError}
          storeNameEdits={storeNameEdits}
          updateStoreNameDraft={updateStoreNameDraft}
          storeNameSaving={storeNameSaving}
          handleStoreNameSave={handleStoreNameSave}
          expandedStoreId={expandedStoreId}
          setExpandedStoreId={setExpandedStoreId}
          loadStoreFeatureFlags={loadStoreFeatureFlags}
          requestStoreStatusChange={requestStoreStatusChange}
          getStoreContactDraft={getStoreContactDraft}
          updateStoreContactDraft={updateStoreContactDraft}
          getStorePaymentDraft={getStorePaymentDraft}
          toggleStorePaymentMethod={toggleStorePaymentMethod}
          storeFeatureFlags={storeFeatureFlags}
          storeFFLoading={storeFFLoading}
          handleStoreFFToggle={handleStoreFFToggle}
          selectedStoreIds={selectedStoreIds}
          setSelectedStoreIds={setSelectedStoreIds}
          toggleStoreSelection={toggleStoreSelection}
          bulkFlagKey={bulkFlagKey}
          setBulkFlagKey={setBulkFlagKey}
          bulkFlagAction={bulkFlagAction}
          setBulkFlagAction={setBulkFlagAction}
          handleBulkFF={handleBulkFF}
          bulkFlagLoading={bulkFlagLoading}
          bulkFlagResult={bulkFlagResult}
          featureFlags={featureFlags}
          barcodeSheetStoreId={barcodeSheetStoreId}
          setBarcodeSheetStoreId={setBarcodeSheetStoreId}
          barcodeSheetTier={barcodeSheetTier}
          setBarcodeSheetTier={setBarcodeSheetTier}
          barcodeSheetBusy={barcodeSheetBusy}
          barcodeSheetError={barcodeSheetError}
          barcodeSheetSuccess={barcodeSheetSuccess}
          handleBarcodeSheetDownload={handleBarcodeSheetDownload}
          handleBarcodeSheetShare={handleBarcodeSheetShare}
          stores={stores}
          limit={limit}
        />
      )}

      {tab === "suppliers" && (
        <SuppliersTab
          refreshSuppliers={refreshSuppliers}
          suppliersLoading={suppliersLoading}
          suppliersError={suppliersError}
          supplierActionError={supplierActionError}
          pendingSuppliers={pendingSuppliers}
          verifiedSuppliers={verifiedSuppliers}
          selectedSupplierForLink={selectedSupplierForLink}
          setSelectedSupplierForLink={setSelectedSupplierForLink}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          supplierActionLoading={supplierActionLoading}
          handleVerifySupplierDirectly={handleVerifySupplierDirectly}
          handleVerifySupplier={handleVerifySupplier}
          handleRejectSupplier={handleRejectSupplier}
          bankChanges={bankChanges}
          bankVerifyLoading={bankVerifyLoading}
          bankRejectReason={bankRejectReason}
          setBankRejectReason={setBankRejectReason}
          handleBankVerify={handleBankVerify}
          supplierSearch={supplierSearch}
          setSupplierSearch={setSupplierSearch}
          requestSupplierStatusChange={requestSupplierStatusChange}
          pendingProducts={pendingProducts}
          productActionError={productActionError}
          productRejectReason={productRejectReason}
          setProductRejectReason={setProductRejectReason}
          productActionLoading={productActionLoading}
          handleOpenEditProduct={handleOpenEditProduct}
          handleApproveProduct={handleApproveProduct}
          handleRejectProduct={handleRejectProduct}
          editingProduct={editingProduct}
          setEditingProduct={setEditingProduct}
          editProductForm={editProductForm}
          setEditProductForm={setEditProductForm}
          editProductError={editProductError}
          editProductSuccess={editProductSuccess}
          editProductLoading={editProductLoading}
          handleSubmitEditProduct={handleSubmitEditProduct}
        />
      )}

      {tab === "applications" && (
        <ApplicationsTab
          applications={applications}
          applicationsTotal={applicationsTotal}
          applicationsLoading={applicationsLoading}
          applicationsError={applicationsError}
          appEntityFilter={appEntityFilter}
          setAppEntityFilter={setAppEntityFilter}
          appActionLoading={appActionLoading}
          appRejectReason={appRejectReason}
          setAppRejectReason={setAppRejectReason}
          refreshApplications={refreshApplications}
          handleApproveApplication={handleApproveApplication}
          handleRejectApplication={handleRejectApplication}
        />
      )}

      {tab === "analytics" && (
        <AnalyticsTab
          analyticsStoreId={analyticsStoreId}
          setAnalyticsStoreId={setAnalyticsStoreId}
          analyticsFrom={analyticsFrom}
          setAnalyticsFrom={setAnalyticsFrom}
          analyticsTo={analyticsTo}
          setAnalyticsTo={setAnalyticsTo}
          refreshAnalytics={refreshAnalytics}
          analyticsTab={analyticsTab}
          setAnalyticsTab={setAnalyticsTab}
          analyticsLoading={analyticsLoading}
          analyticsError={analyticsError}
          overviewData={overviewData}
          analyticsDevices={analyticsDevices}
          analyticsProducts={analyticsProducts}
          analyticsPurchases={analyticsPurchases}
          analyticsConsumerSales={analyticsConsumerSales}
          analyticsActivity={analyticsActivity}
          analyticsDues={analyticsDues}
          productsGroupBy={productsGroupBy}
          setProductsGroupBy={setProductsGroupBy}
        />
      )}

      {tab === "payments" && (
        <PaymentsTab paymentEvents={paymentEvents} />
      )}

      {tab === "users" && (
        <UsersTab
          userRecords={userRecords}
          usersLoading={usersLoading}
          usersError={usersError}
          userSearch={userSearch}
          userStatusSaving={userStatusSaving}
          userActionError={userActionError}
          showCreateUser={showCreateUser}
          createUserForm={createUserForm}
          createUserLoading={createUserLoading}
          createUserError={createUserError}
          createUserSuccess={createUserSuccess}
          setUserSearch={setUserSearch}
          setShowCreateUser={setShowCreateUser}
          setCreateUserForm={setCreateUserForm}
          refreshUsers={refreshUsers}
          requestUserStatusChange={requestUserStatusChange}
          requestCreateUser={requestCreateUser}
        />
      )}

      {tab === "settings" && (
        <SettingsTab
          systemSettings={systemSettings}
          systemStats={systemStats}
          settingsLoading={settingsLoading}
          settingsError={settingsError}
          featureFlags={featureFlags}
          featureFlagsLoading={featureFlagsLoading}
          featureFlagSaving={featureFlagSaving}
          featureFlagsError={featureFlagsError}
          refreshSettings={refreshSettings}
          refreshFeatureFlags={refreshFeatureFlags}
          handleToggleGlobalFlag={handleToggleGlobalFlag}
        />
      )}

      {tab === "documents" && (
        <DocumentsTab
          pendingDocuments={pendingDocuments}
          pendingDocsTotal={pendingDocsTotal}
          documentsLoading={documentsLoading}
          documentsError={documentsError}
          documentsPage={documentsPage}
          documentsEntityFilter={documentsEntityFilter}
          selectedDocument={selectedDocument}
          docRejectReason={docRejectReason}
          documentActionLoading={documentActionLoading}
          setDocumentsPage={setDocumentsPage}
          setDocumentsEntityFilter={setDocumentsEntityFilter}
          setSelectedDocument={setSelectedDocument}
          setDocRejectReason={setDocRejectReason}
          refreshDocuments={refreshDocuments}
          handleApproveDocument={handleApproveDocument}
          handleRejectDocument={handleRejectDocument}
        />
      )}

      {tab === "audit" && (
        <AuditTab
          auditLogs={auditLogs}
          auditLogsTotal={auditLogsTotal}
          auditLogsLoading={auditLogsLoading}
          auditLogsError={auditLogsError}
          auditLogsPage={auditLogsPage}
          auditLogsFilter={auditLogsFilter}
          setAuditLogsPage={setAuditLogsPage}
          setAuditLogsFilter={setAuditLogsFilter}
          refreshAuditLogs={refreshAuditLogs}
        />
      )}

      {tab === "registrations" && (
        <RegistrationsTab
          regEvents={regEvents}
          regEventsTotal={regEventsTotal}
          regEventsLoading={regEventsLoading}
          regEventsError={regEventsError}
          regEventsPage={regEventsPage}
          regEventsSourceFilter={regEventsSourceFilter}
          regEventsOutcomeFilter={regEventsOutcomeFilter}
          sendingEnrollment={sendingEnrollment}
          setRegEventsPage={setRegEventsPage}
          setRegEventsSourceFilter={setRegEventsSourceFilter}
          setRegEventsOutcomeFilter={setRegEventsOutcomeFilter}
          setSendingEnrollment={setSendingEnrollment}
          refreshRegEvents={refreshRegEvents}
        />
      )}

      {tab === "staff" && (
        <StaffTab
          staffList={staffList}
          staffLoading={staffLoading}
          staffError={staffError}
          staffStoreId={staffStoreId}
          staffActionLoading={staffActionLoading}
          showAddStaff={showAddStaff}
          newStaffName={newStaffName}
          newStaffPhone={newStaffPhone}
          newStaffPin={newStaffPin}
          newStaffRole={newStaffRole}
          resetPinStaffId={resetPinStaffId}
          resetPinValue={resetPinValue}
          storeDirectory={storeDirectory}
          setStaffStoreId={setStaffStoreId}
          setStaffList={setStaffList}
          setShowAddStaff={setShowAddStaff}
          setNewStaffName={setNewStaffName}
          setNewStaffPhone={setNewStaffPhone}
          setNewStaffPin={setNewStaffPin}
          setNewStaffRole={setNewStaffRole}
          setResetPinStaffId={setResetPinStaffId}
          setResetPinValue={setResetPinValue}
          refreshStaff={refreshStaff}
          handleAddStaff={handleAddStaff}
          handleToggleStaffActive={handleToggleStaffActive}
          handleResetPin={handleResetPin}
        />
      )}

      {tab === "grn-alerts" && (
        <GrnAlertsTab
          grnAlerts={grnAlerts}
          grnAlertsLoading={grnAlertsLoading}
          grnAlertsError={grnAlertsError}
          grnAlertsFilter={grnAlertsFilter}
          grnAlertsTotal={grnAlertsTotal}
          grnAlertsOpenCount={grnAlertsOpenCount}
          grnAlertsOffset={grnAlertsOffset}
          grnAlertActionLoading={grnAlertActionLoading}
          setGrnAlertsFilter={setGrnAlertsFilter}
          setGrnAlertsOffset={setGrnAlertsOffset}
          refreshGrnAlerts={refreshGrnAlerts}
          handleGrnAlertAction={handleGrnAlertAction}
        />
      )}

      {/* SA-001: Confirmation modals — extracted to components/ConfirmationModals */}
      <ConfirmationModals
        pendingStatusChange={pendingStatusChange}
        setPendingStatusChange={setPendingStatusChange}
        executeUserStatusChange={executeUserStatusChange}
        pendingDeviceAction={pendingDeviceAction}
        setPendingDeviceAction={setPendingDeviceAction}
        executeDeviceSave={executeDeviceSave}
        executeDeviceReset={executeDeviceReset}
        pendingAdminUser={pendingAdminUser}
        adminVerificationReason={adminVerificationReason}
        createUserError={createUserError}
        createUserLoading={createUserLoading}
        setPendingAdminUser={setPendingAdminUser}
        setAdminVerificationReason={setAdminVerificationReason}
        setCreateUserError={setCreateUserError}
        confirmAdminUserCreation={confirmAdminUserCreation}
        pendingSupplierSuspend={pendingSupplierSuspend}
        suspendReason={suspendReason}
        supplierSuspendLoading={supplierSuspendLoading}
        supplierActionError={supplierActionError}
        setPendingSupplierSuspend={setPendingSupplierSuspend}
        setSuspendReason={setSuspendReason}
        executeSupplierStatusChange={executeSupplierStatusChange}
        pendingStoreSuspend={pendingStoreSuspend}
        storeSuspendReason={storeSuspendReason}
        storeSuspendLoading={storeSuspendLoading}
        storeSuspendError={storeSuspendError}
        setPendingStoreSuspend={setPendingStoreSuspend}
        setStoreSuspendReason={setStoreSuspendReason}
        executeStoreStatusChange={executeStoreStatusChange}
      />

      {/* SA-001: AI panel — extracted to components/AiPanel */}
      <AiPanel
        aiQuestion={aiQuestion}
        aiAnswer={aiAnswer}
        aiError={aiError}
        aiLoading={aiLoading}
        aiConfigured={aiConfigured}
        aiPanelOpen={aiPanelOpen}
        aiIdleSeconds={aiIdleSeconds}
        AI_AUTO_COLLAPSE_SECONDS={AI_AUTO_COLLAPSE_SECONDS}
        setAiQuestion={setAiQuestion}
        setAiAnswer={setAiAnswer}
        setAiError={setAiError}
        setAiLoading={setAiLoading}
        setAiPanelOpen={setAiPanelOpen}
        resetAiIdleTimer={resetAiIdleTimer}
      />

      <footer className="footer muted">
        {import.meta.env.DEV && <>Tip: this dashboard is static-deployable. Set <span className="mono">VITE_API_BASE_URL</span> in hosting env. </>}
        <BuildStamp />
      </footer>
    </div>
    </ErrorBoundary>
  );
}
