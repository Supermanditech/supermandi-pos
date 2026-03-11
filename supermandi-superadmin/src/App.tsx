import { useEffect, useMemo, useRef, useState } from "react";
// ISSUE-MICRO-105: Global error boundary
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ThemeToggle } from "./components/ThemeToggle";
// T-094: Standardized toast notifications
import toast, { Toaster } from "react-hot-toast";
import { fetchHealth } from "./api/health";
import { fetchPosEvents, type PosEvent } from "./api/posEvents";
import { fetchAiHealth } from "./api/ai";
import { hasValidSession, logout, refreshSession, startIdleTimeout, stopIdleTimeout, abortActiveRequests } from "./api/authToken";
import { createStore, fetchStore, fetchStores, updateStore, changeStoreStatus, fetchStoreSettings, type StoreRecord } from "./api/stores";
import { fetchDevices, patchDevice, forceReEnrollDevice, type DeviceRecord } from "./api/devices";
import { createDeviceEnrollment, revokeEnrollmentCode, fetchStoreEnrollments, resendEnrollmentCode, type DeviceEnrollmentResponse, type EnrollmentRecord } from "./api/deviceEnrollments";
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
import { formatCurrency, formatDateTime } from "./lib/formatters";
// SA-001: Shared types and constants
import { type TabKey, type GroupKey, type AnalyticsTabKey, type DeviceType, ADMIN_POLL_MS, UPI_VPA_PATTERN, clamp, toIsoSafe, includesInsensitive, toIsoStart, toIsoEnd } from "./types";
// SA-001: Extracted components
import { LoginGate } from "./components/LoginGate";
import { ConfirmationModals } from "./components/ConfirmationModals";
import { ConfirmDialog, type ConfirmDialogConfig } from "./components/ConfirmDialog";
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
import { InvoicesTab } from "./tabs/InvoicesTab";  // T-073: Invoice management
import { GstComplianceTab } from "./tabs/GstComplianceTab";  // T-235: GST compliance
import { RefundsTab } from "./tabs/RefundsTab";  // T-219: Refund management
import { MonitoringTab } from "./tabs/MonitoringTab";  // T-223: Cloud monitoring dashboard
import { QualityDashboardTab } from "./tabs/QualityDashboardTab";  // Quality testing dashboard
import { CreditProvidersTab } from "./tabs/CreditProvidersTab";  // T-289/T-290: Finance monitoring
import { SupportQueueTab } from "./tabs/SupportQueueTab";  // T-300/T-302: Support queue + templates
import { AIInsightsTab } from "./tabs/AIInsightsTab";  // T-316: AI intelligence dashboard
import { WhatsAppTab } from "./tabs/WhatsAppTab";  // WA-002: WhatsApp dashboard
// T-083: Lucide sidebar icons
import {
  Activity, Store, Smartphone, Users, AlertTriangle, Receipt,
  FileCheck, UserPlus, FileText, Truck, CreditCard, BarChart3,
  Shield, UserCog, Settings2,
  Link2, Check,  // T-118: Copy deep link button icons
  IndianRupee, ArrowLeftRight, HeartPulse, FlaskConical,  // T-235, T-219, T-223, Quality icons
  MessageSquare,  // T-300: Support queue
  Brain,  // T-316: AI Insights
  MessageCircle,  // WA-002: WhatsApp dashboard
} from "lucide-react";
import "./App.css";

// SA-001: PayloadDetails, LoginGate, EnrollmentCountdown extracted to ./components/

// T-114: Tab key → display label mapping for breadcrumb
const TAB_LABELS: Record<TabKey, string> = {
  events: "Events",
  stores: "Stores",
  devices: "Devices",
  staff: "Staff",
  "grn-alerts": "GRN Alerts",
  invoices: "Invoices",
  applications: "Applications",
  registrations: "Registrations",
  documents: "Documents",
  suppliers: "Suppliers",
  payments: "Payments",
  analytics: "Analytics",
  audit: "Audit Logs",
  users: "Users",
  settings: "Settings",
  "gst-compliance": "GST Compliance",
  refunds: "Refunds",
  monitoring: "Monitoring",
  quality: "Quality Dashboard",
  "credit-providers": "Finance",
  "support": "Support",
  "ai-insights": "AI Intelligence",
  "whatsapp": "WhatsApp",
};

// T-114: Valid tab keys for hash routing
const VALID_TABS = new Set<string>(Object.keys(TAB_LABELS));

// T-118: Parse tab name and query params from URL hash
// Supports formats like #suppliers?status=pending&search=rice
function parseHashParams(): { tab: TabKey | null; params: Record<string, string> } {
  const raw = window.location.hash.replace("#", "");
  if (!raw) return { tab: null, params: {} };
  const qIdx = raw.indexOf("?");
  const tabPart = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const paramsPart = qIdx >= 0 ? raw.slice(qIdx + 1) : "";
  const tab = VALID_TABS.has(tabPart) ? (tabPart as TabKey) : null;
  const params: Record<string, string> = {};
  if (paramsPart) {
    for (const pair of paramsPart.split("&")) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx > 0) {
        params[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1));
      }
    }
  }
  return { tab, params };
}

// T-118: Build hash string with optional query params
function buildHash(tabKey: TabKey, params?: Record<string, string>): string {
  const qs = params ? Object.entries(params)
    .filter(([, v]) => v !== "" && v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&") : "";
  return qs ? `#${tabKey}?${qs}` : `#${tabKey}`;
}

// T-119: Modal state type for sessionStorage persistence
interface ModalPersistState {
  modal: string;        // modal identifier: 'editProduct' | 'viewDocument' | etc.
  id?: string;          // entity ID (product ID, document ID, etc.)
  tab: TabKey;          // which tab the modal was opened on
}
const MODAL_STORAGE_KEY = "adminModalState";

function saveModalState(state: ModalPersistState | null) {
  if (state) {
    sessionStorage.setItem(MODAL_STORAGE_KEY, JSON.stringify(state));
  } else {
    sessionStorage.removeItem(MODAL_STORAGE_KEY);
  }
}

function loadModalState(): ModalPersistState | null {
  try {
    const raw = sessionStorage.getItem(MODAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.modal === "string" && typeof parsed.tab === "string") {
      return parsed as ModalPersistState;
    }
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  // T-118: Parse initial hash params (tab + query params)
  const initialHash = parseHashParams();
  // T-114: Initialize tab from URL hash, fallback to "events"
  const [tab, setTabRaw] = useState<TabKey>(() => initialHash.tab || "events");
  // T-118: Store hash params for tab filter initialization
  const [hashParams, setHashParams] = useState<Record<string, string>>(() => initialHash.params);
  // T-118: Copy link feedback state
  const [linkCopied, setLinkCopied] = useState(false);
  // T-119: Track whether a modal form has unsaved changes
  const [modalDirty, setModalDirty] = useState(false);

  // T-119: Guard function — warns before losing unsaved modal changes
  function guardModalDirty(action: () => void) {
    if (modalDirty) {
      showConfirm("Unsaved Changes", "You have unsaved changes. Discard?", "Discard", "warning", () => {
        setModalDirty(false);
        action();
      });
      return;
    }
    setModalDirty(false);
    action();
  }

  // Helper: perform tab switch (clear errors, abort requests, update hash)
  const performTabSwitch = (newTab: TabKey) => {
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
    setStaffSuccess(""); setConfirmDialog(null);
    // R2-FIX: Clear modal/approval/suspension state on tab switch
    setApprovalResult(null);
    setPendingDeviceAction(null);
    setPendingStatusChange(null);
    setPendingSupplierSuspend(null);
    setPendingStoreSuspend(null);
    setSuspendReason("");
    setStoreSuspendReason("");
    setAnalyticsLoading(false);
    setTabRaw(newTab);
    setHashParams({});
    window.history.pushState(null, "", `#${newTab}`);
  };

  // ISSUE-MICRO-063: Abort in-flight requests when switching tabs
  // AUDIT-SA-016: Clear error states on tab switch to prevent stale errors
  const setTab = (newTab: TabKey) => {
    if (newTab !== tab) {
      // T-119: Warn if modal is open with unsaved changes
      if (modalDirty) {
        showConfirm("Unsaved Changes", "You have unsaved changes. Discard?", "Discard", "warning", () => {
          setModalDirty(false);
          performTabSwitch(newTab);
        });
        return;
      }
      performTabSwitch(newTab);
    }
  };

  // T-114: Listen for browser back/forward navigation (popstate)
  // R1-FIX: Abort in-flight requests and clear errors on popstate (same as performTabSwitch)
  useEffect(() => {
    const handlePopState = () => {
      const { tab: hashTab, params } = parseHashParams();
      if (hashTab && hashTab !== tab) {
        // T-119: Warn if modal is open with unsaved changes
        if (modalDirty) {
          showConfirm("Unsaved Changes", "You have unsaved changes. Discard?", "Discard", "warning", () => {
            setModalDirty(false);
            abortActiveRequests();
            setConfirmDialog(null);
            setTabRaw(hashTab);
            setHashParams(params);
          });
          // Re-push current state to prevent navigation until confirmed
          window.history.pushState(null, "", buildHash(tab));
          return;
        }
        // R1-FIX: Abort active requests on back/forward navigation
        abortActiveRequests();
        setConfirmDialog(null);
        setTabRaw(hashTab);
        setHashParams(params);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [tab, modalDirty]);

  // T-114: Set initial hash if not present
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, "", `#${tab}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // T-118: Copy current deep link (hash + query params) to clipboard
  function copyDeepLink() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {
      // Fallback for insecure contexts
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

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

  // R3-APP-007: Cross-tab session sync — logout in one tab logs out all tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'superadmin_token' && !e.newValue) {
        setIsAuthenticated(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
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
        // ISSUE-164: Progressive warnings before surprise logout
        if (consecutiveFailures === 3) {
          toast.error('Session refresh failed. Check your connection.', { duration: 8000 });
        } else if (consecutiveFailures === 4) {
          toast.error('Session expiring soon. Save your work — you may be logged out.', { duration: 12000 });
        } else if (consecutiveFailures >= 5) {
          toast.error('Session expired. Logging out.', { duration: 5000 });
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

  // LIVE.SUPERADMIN.EVENTS_SESSION_UNAUTHORIZED_LOOP.001: Clear stale error banners on re-authentication
  // Prevents "Session expired" banner from persisting after user logs back in
  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    if (isAuthenticated && !prevAuthRef.current) {
      setEventsError("");
      setHealthError("");
    }
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);

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
    action: "deactivate" | "resetToken" | "forceReEnroll";
  } | null>(null);
  const [enrollStoreId, setEnrollStoreId] = useState<string>("");
  const [enrollment, setEnrollment] = useState<DeviceEnrollmentResponse | null>(null);
  const [enrollError, setEnrollError] = useState<string>("");
  const [enrollLoading, setEnrollLoading] = useState<boolean>(false);
  // SA-ENROLL-UX: Enrollment revocation and per-store enrollment state
  const [revokeLoading, setRevokeLoading] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState<boolean>(false);
  const [enrollmentForStoreLoading, setEnrollmentForStoreLoading] = useState<string>("");
  const [storeEnrollments, setStoreEnrollments] = useState<Record<string, EnrollmentRecord[]>>({});
  const [storeEnrollmentsLoading, setStoreEnrollmentsLoading] = useState<Record<string, boolean>>({});
  // SA-P1-014: Store settings audit view
  const [storeSettings, setStoreSettings] = useState<Record<string, import("./api/stores").StoreSettings>>({});
  const [storeSettingsLoading, setStoreSettingsLoading] = useState<Record<string, boolean>>({});
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
    invoiceModel: "buy_resell" | "platform_fee" | "";  // T-070
    hsnCode: string;  // T-070
    gstRate: string;  // T-070
  }>({ editedName: "", marginType: "fixed", fixedMargin: "", percentMargin: "", bnplEligible: false, bnplMaxDays: "7", invoiceModel: "buy_resell", hsnCode: "", gstRate: "" });
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
  const [createUserForm, setCreateUserForm] = useState<{ name: string; email: string; phone: string; actor_type: string; actor_id: string }>({
    name: "", email: "", phone: "", actor_type: "store", actor_id: ""
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
    from_date?: string;
    to_date?: string;
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
  const regEventsInFlightRef = useRef(false);
  const grnAlertsInFlightRef = useRef(false);

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

  // STBT-186.1: Generic confirmation dialog state (replaces alert/window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogConfig | null>(null);
  function showConfirm(title: string, message: string, confirmLabel: string, variant: ConfirmDialogConfig['variant'], onConfirm: () => void, detail?: string) {
    setConfirmDialog({ title, message, detail, confirmLabel, variant, onConfirm: () => { setConfirmDialog(null); onConfirm(); } });
  }

  // STBT-186.14: Staff success state (replaces alert("PIN reset successfully"))
  const [staffSuccess, setStaffSuccess] = useState("");

  // STAGING-FIX-014: Application approval state
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationsTotal, setApplicationsTotal] = useState(0);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationsError, setApplicationsError] = useState("");
  const [appActionLoading, setAppActionLoading] = useState<Record<string, boolean>>({});
  const [appRejectReason, setAppRejectReason] = useState<Record<string, string>>({});
  const [appEntityFilter, setAppEntityFilter] = useState<string>("");
  // #331: Activation code shown after approval
  // REQ.SUPERADMIN.APPROVAL_MATRIX: entityType distinguishes retailer (activationCode) vs supplier (email confirmation)
  // REQ.REGRESSION.SUPPLIER_APPROVAL_DELIVERY_TRUTH: emailDelivered carries actual backend send outcome
  const [approvalResult, setApprovalResult] = useState<{ entityType: string; activationCode?: string; codeSentTo: string; codeSentVia: string[]; emailDelivered?: boolean } | null>(null);
  const applicationsInFlightRef = useRef(false);

  // Filters (apply to event table + payments view)
  const [deviceIdFilter, setDeviceIdFilter] = useState<string>("");
  const [storeIdFilter, setStoreIdFilter] = useState<string>("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  // #186.16: Date range filter for events (client-side)
  const [eventDateFrom, setEventDateFrom] = useState<string>("");
  const [eventDateTo, setEventDateTo] = useState<string>("");
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Backend unreachable";
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch events";
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch devices";
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch stores";
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
      const [pendingRes, verifiedRes, productsRes, bankChangesRes] = await Promise.allSettled([
        fetchPendingSuppliers(),
        fetchVerifiedSuppliers({ search: supplierSearch?.trim() || undefined }),
        fetchPendingProducts(),
        fetchBankChanges()
      ]);
      if (pendingRes.status === "fulfilled") setPendingSuppliers(pendingRes.value.items);
      if (verifiedRes.status === "fulfilled") setVerifiedSuppliers(verifiedRes.value.items);
      if (productsRes.status === "fulfilled") setPendingProducts(productsRes.value);
      if (bankChangesRes.status === "fulfilled") setBankChanges(bankChangesRes.value);
      const failures = [pendingRes, verifiedRes, productsRes, bankChangesRes].filter(r => r.status === "rejected");
      if (failures.length > 0) {
        const msgs = failures.map(f => f.status === "rejected" ? (f.reason instanceof Error ? f.reason.message : String(f.reason)) : "").filter(Boolean);
        setSuppliersError(msgs.join("; ") || "Failed to fetch suppliers");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch suppliers";
      setSuppliersError(message);
    } finally {
      suppliersInFlightRef.current = false;
      setSuppliersLoading(false);
    }
  }

  // SA-P1-008: Handle bank detail verification
  async function handleBankVerify(supplierId: string, action: "approve" | "reject") {
    const reason = action === "reject" ? bankRejectReason[supplierId] : undefined;
    // ADM-003: Consistent minimum rejection reason (10 chars, matching document rejection)
    if (action === "reject" && (!reason || reason.trim().length < 10)) {
      setSuppliersError("Rejection reason must be at least 10 characters");
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
    } catch (e: unknown) {
      setSuppliersError(e instanceof Error ? e.message : "Failed to verify bank details");
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
      // R2-FIX APP-003: Invalidate staff data for suspended store
      if (action === "suspend" && staffStoreId === storeId) {
        setStaffList([]);
        setStaffError("");
      }
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch users";
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
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : "Failed to update user";
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

    const { name, email, phone, actor_type, actor_id } = createUserForm;
    if (!name.trim()) {
      setCreateUserError("Name is required");
      return;
    }
    // AUDIT-SA-005: Email is required for all user types
    if (!email.trim()) {
      setCreateUserError("Email is required");
      return;
    }
    // USERS-PHONE-VALIDATION-MISSING: validate Indian mobile number format when provided
    if (phone.trim() && !/^(\+91|0)?[6-9]\d{9}$/.test(phone.trim())) {
      setCreateUserError("Phone must be a valid Indian mobile number (+91XXXXXXXXXX or 10-digit)");
      return;
    }
    // STG-041: actor_id is required for store/supplier user types
    if ((actor_type === "store" || actor_type === "supplier") && !actor_id.trim()) {
      setCreateUserError(`${actor_type === "store" ? "Store" : "Supplier"} ID is required for ${actor_type} users`);
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
      actor_type: actor_type || "store",
      actor_id: actor_id.trim() || undefined
    });
  }

  async function executeCreateUser(input: UserCreateInput) {
    setPendingAdminUser(null);
    setCreateUserLoading(true);
    try {
      const newUser = await createUser(input);
      setUserRecords((prev) => [newUser, ...prev]);
      setCreateUserSuccess(`User "${newUser.name}" created successfully!`);
      setCreateUserForm({ name: "", email: "", phone: "", actor_type: "store", actor_id: "" });
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
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : "Failed to create user";
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
      const [settingsRes, statsRes] = await Promise.allSettled([
        fetchSettings(),
        fetchSystemStats()
      ]);
      if (settingsRes.status === "fulfilled") setSystemSettings(settingsRes.value);
      if (statsRes.status === "fulfilled") setSystemStats(statsRes.value);
      const failures = [settingsRes, statsRes].filter(r => r.status === "rejected");
      if (failures.length > 0) {
        const msgs = failures.map(f => f.status === "rejected" ? (f.reason instanceof Error ? f.reason.message : String(f.reason)) : "").filter(Boolean);
        setSettingsError(msgs.join("; ") || "Failed to fetch settings");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch settings";
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
    } catch (e: unknown) {
      setSupplierActionError(e instanceof Error ? e.message : "Failed to verify supplier");
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
    } catch (e: unknown) {
      setSupplierActionError(e instanceof Error ? e.message : "Failed to verify supplier");
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
    } catch (e: unknown) {
      setSupplierActionError(e instanceof Error ? e.message : "Failed to reject supplier");
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
    } catch (e: unknown) {
      setProductActionError(e instanceof Error ? e.message : "Failed to approve product");
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
    } catch (e: unknown) {
      setProductActionError(e instanceof Error ? e.message : "Failed to reject product");
    } finally {
      setProductActionLoading((prev) => ({ ...prev, [productId]: false }));
    }
  }

  // SA-1.3-003: Open edit modal for a product
  // T-119: Persist modal state to sessionStorage
  function handleOpenEditProduct(product: PendingProduct) {
    setEditingProduct(product);
    setEditProductForm({
      editedName: product.productName,
      marginType: "fixed",
      fixedMargin: "",
      percentMargin: "",
      bnplEligible: false,
      bnplMaxDays: "7",
      invoiceModel: "",
      hsnCode: "",
      gstRate: "",
    });
    setEditProductError("");
    setEditProductSuccess("");
    setModalDirty(false);
    saveModalState({ modal: "editProduct", id: product.id, tab: "suppliers" });
  }

  // T-119: Close product edit modal with dirty guard
  function handleCloseEditProduct() {
    guardModalDirty(() => {
      setEditingProduct(null);
      saveModalState(null);
    });
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
        bnplMaxDays: parseInt(editProductForm.bnplMaxDays) || 7,
        // T-070: Invoice configuration
        invoiceModel: editProductForm.invoiceModel === "" ? undefined : editProductForm.invoiceModel as "buy_resell" | "platform_fee",
        hsnCode: editProductForm.hsnCode || undefined,
        gstRate: editProductForm.gstRate ? parseFloat(editProductForm.gstRate) : undefined,
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
      // T-119: Clear dirty state and modal persistence after successful save
      setModalDirty(false);
      saveModalState(null);

      // Update local state
      setPendingProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? { ...p, productName: result.editedName || p.productName }
            : p
        )
      );
    } catch (e: unknown) {
      setEditProductError(e instanceof Error ? e.message : "Failed to save product");
    } finally {
      setEditProductLoading(false);
    }
  }

  const analyticsInFlightRef = useRef(false);
  async function refreshAnalytics(activeTab: AnalyticsTabKey) {
    if (analyticsInFlightRef.current) return;
    analyticsInFlightRef.current = true;
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
    } catch (e: unknown) {
      setAnalyticsError(e instanceof Error ? e.message : "Failed to fetch analytics");
    } finally {
      setAnalyticsLoading(false);
      analyticsInFlightRef.current = false;
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
        from_date: auditLogsFilter.from_date ? toIsoStart(auditLogsFilter.from_date) : undefined,
        to_date: auditLogsFilter.to_date ? toIsoEnd(auditLogsFilter.to_date) : undefined,
      });
      setAuditLogs(res.logs);
      setAuditLogsTotal(res.total);
    } catch (e: unknown) {
      setAuditLogsError(e instanceof Error ? e.message : "Failed to fetch audit logs");
    } finally {
      setAuditLogsLoading(false);
      auditLogsInFlightRef.current = false;
    }
  }

  // RO-007: Fetch registration events
  async function refreshRegEvents() {
    if (regEventsInFlightRef.current) return;
    regEventsInFlightRef.current = true;
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
    } catch (e: unknown) {
      setRegEventsError(e instanceof Error ? e.message : "Failed to fetch registration events");
    } finally {
      setRegEventsLoading(false);
      regEventsInFlightRef.current = false;
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
    } catch (e: unknown) {
      setDocumentsError(e instanceof Error ? e.message : "Failed to fetch documents");
    } finally {
      setDocumentsLoading(false);
      documentsInFlightRef.current = false;
    }
  }

  // T-119: Open document review modal with persistence
  function handleOpenDocument(doc: DocumentRecord) {
    setSelectedDocument(doc);
    saveModalState({ modal: "viewDocument", id: doc.id, tab: "documents" });
  }

  // T-119: Close document review modal with dirty guard
  function handleCloseDocument() {
    guardModalDirty(() => {
      setSelectedDocument(null);
      setDocRejectReason("");
      setModalDirty(false);
      saveModalState(null);
    });
  }

  // DOCS-001: Approve a document
  async function handleApproveDocument(docId: string) {
    setDocumentActionLoading(docId);
    try {
      await approveDocument(docId);
      await logAdminAction("approve", "document", docId, { status: "approved" });
      // REQ.AUDIT.W5.SUPERADMIN.DOCUMENTS-STAFF-NO-SUCCESS-TOAST.001
      toast.success("Document approved successfully");
      setSelectedDocument(null);
      // T-119: Clear modal persistence on action complete
      setModalDirty(false);
      saveModalState(null);
      refreshDocuments();
    } catch (e: unknown) {
      await logAdminActionError("approve", "document", docId, (e instanceof Error ? e.message : "Unknown error"));
      toast.error(e instanceof Error ? e.message : "Failed to approve document");
    } finally {
      setDocumentActionLoading(null);
    }
  }

  // DOCS-001: Reject a document
  async function handleRejectDocument(docId: string, reason: string) {
    // AUDIT-SA-014: Require meaningful rejection reason (min 10 chars)
    if (reason.trim().length < 10) {
      setDocumentsError("Please provide a detailed rejection reason (at least 10 characters)");
      return;
    }
    setDocumentActionLoading(docId);
    try {
      await rejectDocument(docId, reason);
      await logAdminAction("reject", "document", docId, { status: "rejected", reason });
      setSelectedDocument(null);
      setDocRejectReason("");
      // T-119: Clear modal persistence on action complete
      setModalDirty(false);
      saveModalState(null);
      refreshDocuments();
    } catch (e: unknown) {
      await logAdminActionError("reject", "document", docId, (e instanceof Error ? e.message : "Unknown error"));
      // R2-FIX APP-024: Show error via toast (visible even when modal is open)
      toast.error(e instanceof Error ? e.message : "Failed to reject document");
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
    } catch (e: unknown) {
      setStaffError(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setStaffLoading(false);
    }
  }

  async function handleAddStaff() {
    if (!staffStoreId) return;
    // STBT-186.14: Validate phone and PIN before submit
    if (!newStaffName.trim()) { setStaffError("Staff name is required"); return; }
    if (!/^\d{10}$/.test(newStaffPhone.trim())) { setStaffError("Phone must be exactly 10 digits"); return; }
    if (!/^\d{4,6}$/.test(newStaffPin)) { setStaffError("PIN must be 4-6 digits"); return; }
    setStaffError("");
    setStaffSuccess("");
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
    } catch (e: unknown) {
      setStaffError(e instanceof Error ? e.message : "Failed to add staff");
    } finally {
      setStaffActionLoading(null);
    }
  }

  async function handleToggleStaffActive(staffId: string, currentlyActive: boolean) {
    if (!staffStoreId) return;
    setStaffError("");
    setStaffActionLoading(staffId);
    try {
      await updateStaff(staffStoreId, staffId, { is_active: !currentlyActive });
      refreshStaff();
    } catch (e: unknown) {
      setStaffError(e instanceof Error ? e.message : "Failed to update staff");
    } finally {
      setStaffActionLoading(null);
    }
  }

  // #186.15: Staff role change
  async function handleStaffRoleChange(staffId: string, newRole: "CASHIER" | "STOCK_MANAGER" | "MANAGER") {
    if (!staffStoreId) return;
    setStaffError("");
    setStaffActionLoading(staffId);
    try {
      await updateStaff(staffStoreId, staffId, { role: newRole });
      setStaffSuccess("Role updated successfully");
      toast.success("Role updated successfully");
      refreshStaff();
    } catch (e: unknown) {
      setStaffError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setStaffActionLoading(null);
    }
  }

  async function handleResetPin() {
    if (!staffStoreId || !resetPinStaffId || !/^\d{4,6}$/.test(resetPinValue)) {
      setStaffError("PIN must be 4-6 digits");
      return;
    }
    setStaffError("");
    setStaffSuccess("");
    setStaffActionLoading(resetPinStaffId);
    try {
      await resetStaffPin(staffStoreId, resetPinStaffId, resetPinValue);
      setResetPinStaffId(null);
      setResetPinValue("");
      setStaffSuccess("PIN reset successfully");
      toast.success("PIN reset successfully");
    } catch (e: unknown) {
      setStaffError(e instanceof Error ? e.message : "Failed to reset PIN");
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
      toast.error(e instanceof Error ? e.message : "Failed to load store flags");
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
      // R2-FIX APP-016: Surface flag toggle error to user instead of silent console.error
      toast.error(e instanceof Error ? e.message : "Failed to toggle store flag");
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
      // R2-FIX APP-017: Auto-clear after 5 seconds
      setTimeout(() => setBulkFlagResult(""), 5000);
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
    if (grnAlertsInFlightRef.current) return;
    grnAlertsInFlightRef.current = true;
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
      grnAlertsInFlightRef.current = false;
    }
  }

  async function handleGrnAlertAction(alertId: string, status: "ACKNOWLEDGED" | "DISMISSED") {
    setGrnAlertActionLoading(alertId);
    try {
      await updateGrnAlert(alertId, { status });
      refreshGrnAlerts();
    } catch (e: unknown) {
      setGrnAlertsError(e instanceof Error ? e.message : "Failed to update alert");
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
    } catch (e: unknown) {
      setApplicationsError(e instanceof Error ? e.message : "Failed to fetch applications");
    } finally {
      applicationsInFlightRef.current = false;
      setApplicationsLoading(false);
    }
  }

  // FIX-049: Load more applications (append to existing list)
  // APPLICATIONS-UNBOUNDED-LOADMORE: cap at MAX_APPLICATIONS to prevent memory bloat
  const MAX_APPLICATIONS = 500;
  async function loadMoreApplications() {
    if (applicationsInFlightRef.current) return;
    if (applications.length >= MAX_APPLICATIONS) return;
    applicationsInFlightRef.current = true;
    setApplicationsLoading(true);
    try {
      const data = await fetchApplications({
        entityType: appEntityFilter || undefined,
        limit: 100,
        offset: applications.length,
      });
      setApplications(prev => [...prev, ...data.items].slice(0, MAX_APPLICATIONS));
      setApplicationsTotal(data.total);
    } catch (e: unknown) {
      setApplicationsError(e instanceof Error ? e.message : "Failed to load more applications");
    } finally {
      applicationsInFlightRef.current = false;
      setApplicationsLoading(false);
    }
  }

  async function handleApproveApplication(appId: string) {
    setAppActionLoading((prev) => ({ ...prev, [appId]: true }));
    setApplicationsError("");
    try {
      const result = await approveApplication(appId);
      setApplications((prev) => prev.filter((a) => a.id !== appId));
      setApplicationsTotal((prev) => Math.max(0, prev - 1));
      // #331: Show activation code for retailers; show confirmation for suppliers
      // REQ.SUPERADMIN.APPROVAL_MATRIX: both entity types now get a post-approval dialog
      // REQ.REGRESSION.SUPPLIER_APPROVAL_DELIVERY_TRUTH: pass emailDelivered through to modal
      // R2-FIX APP-014: Refresh stores/suppliers after approval so new entity is visible
      if (result.entityType === 'retailer') void refreshStores();
      if (result.entityType === 'supplier') void refreshSuppliers();
      if (result.activationCode || result.entityType === 'supplier') {
        setApprovalResult({
          entityType: result.entityType || 'retailer',
          activationCode: result.activationCode,
          codeSentTo: result.codeSentTo || "",
          codeSentVia: result.codeSentVia || [],
          emailDelivered: result.emailDelivered,
        });
      }
    } catch (e: unknown) {
      setApplicationsError(e instanceof Error ? e.message : "Failed to approve application");
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
    } catch (e: unknown) {
      setApplicationsError(e instanceof Error ? e.message : "Failed to reject application");
    } finally {
      setAppActionLoading((prev) => ({ ...prev, [appId]: false }));
    }
  }

  // T-118: Apply hash params to tab filters on initial load
  // This runs once on mount to initialize filters from URL deep link params
  const hashParamsAppliedRef = useRef(false);
  useEffect(() => {
    if (hashParamsAppliedRef.current) return;
    hashParamsAppliedRef.current = true;
    const hp = hashParams;
    if (!hp || Object.keys(hp).length === 0) return;

    // Events tab: deviceId, storeId, eventType
    if (tab === "events") {
      if (hp.deviceId) setDeviceIdFilter(hp.deviceId);
      if (hp.storeId) setStoreIdFilter(hp.storeId);
      if (hp.eventType) setEventTypeFilter(hp.eventType);
    }
    // Suppliers tab: search
    if (tab === "suppliers") {
      if (hp.search) setSupplierSearch(hp.search);
    }
    // Users tab: search
    if (tab === "users") {
      if (hp.search) setUserSearch(hp.search);
    }
    // Audit tab: action, resource_type, from_date, to_date
    if (tab === "audit") {
      const filter: typeof auditLogsFilter = {};
      if (hp.action) filter.action = hp.action;
      if (hp.resource_type) filter.resource_type = hp.resource_type;
      if (hp.from_date) filter.from_date = hp.from_date;
      if (hp.to_date) filter.to_date = hp.to_date;
      if (Object.keys(filter).length > 0) setAuditLogsFilter(filter);
    }
    // Documents tab: entity filter
    if (tab === "documents") {
      if (hp.entity === "store" || hp.entity === "supplier") setDocumentsEntityFilter(hp.entity);
    }
    // Registrations tab: source, outcome
    if (tab === "registrations") {
      if (hp.source) setRegEventsSourceFilter(hp.source);
      if (hp.outcome) setRegEventsOutcomeFilter(hp.outcome);
    }
    // Analytics tab: storeId, from, to, sub-tab
    if (tab === "analytics") {
      if (hp.storeId) setAnalyticsStoreId(hp.storeId);
      if (hp.from) setAnalyticsFrom(hp.from);
      if (hp.to) setAnalyticsTo(hp.to);
      if (hp.sub) setAnalyticsTab(hp.sub as AnalyticsTabKey);
    }
    // GRN alerts tab: status filter
    if (tab === "grn-alerts") {
      if (hp.status === "OPEN" || hp.status === "ACKNOWLEDGED" || hp.status === "DISMISSED") {
        setGrnAlertsFilter(hp.status);
      }
    }
    // Applications tab: entity filter
    if (tab === "applications") {
      if (hp.entity) setAppEntityFilter(hp.entity);
    }
    // Staff tab: storeId
    if (tab === "staff") {
      if (hp.storeId) setStaffStoreId(hp.storeId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // T-119: Restore modal state from sessionStorage on mount
  // R1-FIX: Use refs to access latest data in intervals (stale closure fix)
  const pendingProductsRef = useRef(pendingProducts);
  pendingProductsRef.current = pendingProducts;
  const pendingDocumentsRef = useRef(pendingDocuments);
  pendingDocumentsRef.current = pendingDocuments;

  const modalRestoredRef = useRef(false);
  useEffect(() => {
    if (modalRestoredRef.current) return;
    modalRestoredRef.current = true;
    const saved = loadModalState();
    if (!saved) return;
    // Only restore if we're on the same tab the modal was opened on
    if (saved.tab !== tab) {
      // Clear stale modal state for wrong tab
      saveModalState(null);
      return;
    }
    // Restore product edit modal — requires products to be loaded first
    if (saved.modal === "editProduct" && saved.id) {
      const targetId = saved.id;
      const checkInterval = setInterval(() => {
        const product = pendingProductsRef.current.find((p) => p.id === targetId);
        if (product) {
          clearInterval(checkInterval);
          handleOpenEditProduct(product);
        }
      }, 500);
      // Give up after 10 seconds if product not found
      setTimeout(() => { clearInterval(checkInterval); saveModalState(null); }, 10000);
    }
    // Restore document review modal — similar approach
    if (saved.modal === "viewDocument" && saved.id) {
      const targetId = saved.id;
      const checkInterval = setInterval(() => {
        const doc = pendingDocumentsRef.current.find((d) => d.id === targetId);
        if (doc) {
          clearInterval(checkInterval);
          handleOpenDocument(doc);
        }
      }, 500);
      setTimeout(() => { clearInterval(checkInterval); saveModalState(null); }, 10000);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ISSUE-MICRO-024: Update ref each render so polling interval uses latest closures
  refreshRef.current = { refreshHealth, refreshEvents, refreshDevices, refreshStores, refreshSuppliers, refreshUsers, refreshSettings, refreshAuditLogs, refreshDocuments, refreshRegEvents, refreshStaff, refreshGrnAlerts, refreshAnalytics, refreshApplications };

  useEffect(() => {
    // LIVE.SUPERADMIN.EVENTS_SESSION_UNAUTHORIZED_LOOP.001: Don't poll when not authenticated
    // Prevents 401 storm from polling without a valid token
    if (!isAuthenticated) return;

    const shouldRefreshEvents = tab === "events" || tab === "devices" || tab === "payments"; // P0-DEPLOY-002: Include payments
    const shouldRefreshDevices = tab === "devices";
    // AUDIT-SA-033: Also load storeDirectory on staff tab (depends on store data)
    // T-234: Also load storeDirectory on settings tab (per-store flag overrides need store list)
    const shouldRefreshStores = tab === "stores" || tab === "staff" || tab === "settings";
    const shouldRefreshSuppliers = tab === "suppliers";
    const shouldRefreshUsers = tab === "users";
    const shouldRefreshSettings = tab === "settings";
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
    if (shouldRefreshAudit) r.refreshAuditLogs?.(); // GO-LIVE-011
    if (shouldRefreshDocuments) r.refreshDocuments?.(); // DOCS-001
    if (shouldRefreshRegEvents) r.refreshRegEvents?.(); // RO-007
    if (shouldRefreshApplications) r.refreshApplications?.(); // STAGING-FIX-014
    if (tab === "staff" && staffStoreId) r.refreshStaff?.(); // SA-P1-001
    if (tab === "grn-alerts") r.refreshGrnAlerts?.(); // SA-P1-004

    // ISSUE-MICRO-024: Polling uses refreshRef to avoid stale closure
    // R1-FIX: Include applications, staff, and grn-alerts in polling interval
    const id = setInterval(() => {
      const r = refreshRef.current;
      r.refreshHealth?.();
      if (shouldRefreshEvents) r.refreshEvents?.();
      if (shouldRefreshDevices) r.refreshDevices?.();
      if (shouldRefreshStores) r.refreshStores?.();
      if (shouldRefreshSuppliers) r.refreshSuppliers?.();
      if (shouldRefreshUsers) r.refreshUsers?.();
      if (shouldRefreshSettings) r.refreshSettings?.();
      if (shouldRefreshAudit) r.refreshAuditLogs?.();
      if (shouldRefreshDocuments) r.refreshDocuments?.();
      if (shouldRefreshRegEvents) r.refreshRegEvents?.();
      if (shouldRefreshApplications) r.refreshApplications?.();
      if (tab === "staff" && staffStoreId) r.refreshStaff?.();
      if (tab === "grn-alerts") r.refreshGrnAlerts?.();
    }, ADMIN_POLL_MS);
    return () => clearInterval(id);
    // LIVE.SUPERADMIN.EVENTS_SESSION_UNAUTHORIZED_LOOP.001: Added isAuthenticated dependency
    // Ensures polling stops on logout and restarts on re-authentication
  }, [tab, staffStoreId, isAuthenticated]);

  // R2-FIX APP-008: Reset staff add-form fields when store changes
  useEffect(() => {
    setShowAddStaff(false);
    setNewStaffName("");
    setNewStaffPhone("");
    setNewStaffPin("");
    setNewStaffRole("CASHIER");
    setResetPinStaffId(null);
    setResetPinValue("");
    setStaffError("");
    setStaffSuccess("");
  }, [staffStoreId]);

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

  // R4-DEP-004: Refresh GRN alerts when offset or filter changes
  useEffect(() => {
    if (tab === "grn-alerts") {
      refreshRef.current.refreshGrnAlerts?.();
    }
  }, [grnAlertsOffset, grnAlertsFilter, tab]);

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

  // STG-379: Reset page on ANY filter change, including date range
  useEffect(() => {
    setPage(0);
    setDevicePage(0); // ISSUE-MICRO-023: Reset device page on filter change
  }, [deviceIdFilter, storeIdFilter, eventTypeFilter, eventDateFrom, eventDateTo]);

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
    // #186.16: Client-side date range filtering
    const fromIso = eventDateFrom ? toIsoStart(eventDateFrom) : undefined;
    const toIso = eventDateTo ? toIsoEnd(eventDateTo) : undefined;
    return events.filter((e) => {
      if (d && !includesInsensitive(e.deviceId, d)) return false;
      if (s && !includesInsensitive(e.storeId, s)) return false;
      if (t && !includesInsensitive(e.eventType, t)) return false;
      if (fromIso && e.createdAt < fromIso) return false;
      if (toIso && e.createdAt > toIso) return false;
      return true;
    });
  }, [events, deviceIdFilter, storeIdFilter, eventTypeFilter, eventDateFrom, eventDateTo]);

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
      let safe = (s ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""');
      // R4-SANIT-001: Prevent CSV formula injection
      if (/^[=+\-@\t\r]/.test(safe)) safe = "'" + safe;
      return `"${safe}"`;
    };

    const body = rows
      .map((r) => [escape(r.createdAt), escape(r.deviceId), escape(r.storeId), escape(r.eventType), escape(r.payload)].join(","))
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
      // R2-FIX STO-004: Clear contact draft after successful save
      if (contactDraft) {
        setStoreContactEdits((prev) => { const next = { ...prev }; delete next[storeId]; return next; });
      }
    } catch (e: unknown) {
      setStoreNameError(e instanceof Error ? e.message : "Failed to update store.");
    } finally {
      setStoreNameSaving((prev) => ({ ...prev, [storeId]: false }));
    }
  }

  // ISSUE-063: Toggle credit enabled on a store
  // R2-FIX APP-018: Add per-store loading guard to prevent rapid-click races
  const [creditToggleLoading, setCreditToggleLoading] = useState<Record<string, boolean>>({});
  async function handleCreditToggle(storeId: string, enabled: boolean) {
    if (creditToggleLoading[storeId]) return;
    setCreditToggleLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      const updated = await updateStore(storeId, { creditEnabled: enabled });
      setStoreDirectory((prev) => prev.map((s) => (s.id === storeId ? updated : s)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to toggle credit.");
    } finally {
      setCreditToggleLoading((prev) => ({ ...prev, [storeId]: false }));
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
    } catch (e: unknown) {
      setBarcodeSheetError(e instanceof Error ? e.message : "Failed to download barcode sheet.");
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
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setBarcodeSheetError(e instanceof Error ? e.message : "Failed to share barcode sheet.");
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
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : "Failed to update device.";
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
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : "Failed to reset device token.";
      setDeviceActionError(errorMsg);
      // GL-CRIT-0049: Log failed device token reset
      logAdminActionError('device_token_reset', 'device', deviceId, errorMsg);
    } finally {
      setDeviceSaving((prev) => ({ ...prev, [deviceId]: false }));
    }
  }

  // SA-P2-001: Request force re-enrollment with confirmation
  function requestForceReEnroll(deviceId: string) {
    const device = deviceRecords.find((d) => d.id === deviceId);
    setPendingDeviceAction({
      deviceId,
      deviceLabel: device?.label ?? deviceId,
      action: "forceReEnroll"
    });
  }

  async function executeForceReEnroll(deviceId: string) {
    setPendingDeviceAction(null);
    setDeviceActionError("");
    setDeviceSaving((prev) => ({ ...prev, [deviceId]: true }));
    try {
      await forceReEnrollDevice(deviceId);
      // Mark device as inactive in local state
      setDeviceRecords((prev) => prev.map((d) =>
        d.id === deviceId ? { ...d, active: false } : d
      ));
      // Reset edit draft to match new state
      setDeviceEdits((prev) => {
        const draft = prev[deviceId];
        if (!draft) return prev;
        return { ...prev, [deviceId]: { ...draft, active: false } };
      });
      logAdminAction('device_force_re_enroll', 'device', deviceId, { label: deviceRecords.find((d) => d.id === deviceId)?.label });
      void refreshDevices();
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : "Failed to force re-enroll device.";
      setDeviceActionError(errorMsg);
      logAdminActionError('device_force_re_enroll', 'device', deviceId, errorMsg);
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
    } catch (e: unknown) {
      setCreateStoreError(e instanceof Error ? e.message : "Failed to create store");
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
    } catch (e: unknown) {
      setStoreRecord(null);
      setStoreError(e instanceof Error ? e.message : "Failed to fetch store");
    } finally {
      setStoreLoading(false);
    }
  }

  async function executeStoreSave(vpa: string) {
    const id = storeAdminId.trim();
    setStoreError("");
    setStoreSuccess("");
    setStoreLoading(true);
    try {
      const record = await updateStore(id, { upiVpa: vpa });
      setStoreRecord(record);
      setStoreUpiInput(record.upi_vpa ?? "");
      setStoreSuccess(record.active ? "Store activated." : "Store deactivated.");
      void refreshStores();
    } catch (e: unknown) {
      setStoreError(e instanceof Error ? e.message : "Failed to update store");
    } finally {
      setStoreLoading(false);
    }
  }

  function handleStoreSave() {
    const id = storeAdminId.trim();
    if (!id) {
      setStoreError("Store ID is required.");
      return;
    }
    const rawVpa = storeUpiInputRef.current?.value ?? storeUpiInput;
    const trimmedVpa = rawVpa.trim().toLowerCase(); // T-215: normalize to lowercase before validation
    setStoreUpiInput(rawVpa);
    if (!trimmedVpa) {
      if (!storeRecord?.upi_vpa) {
        setStoreError("UPI VPA is required to activate the store.");
        return;
      }
      // STBT-186.1: Replace window.confirm with proper modal
      showConfirm('Deactivate Store', 'Clear UPI VPA and deactivate this store?', 'Deactivate', 'danger', () => executeStoreSave(trimmedVpa), 'The store will stop accepting payments until reactivated.');
      return;
    }
    if (!UPI_VPA_PATTERN.test(trimmedVpa)) {
      setStoreError("UPI VPA format is invalid.");
      return;
    }
    executeStoreSave(trimmedVpa);
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
    } catch (e: unknown) {
      setEnrollment(null);
      setEnrollError(e instanceof Error ? e.message : "Failed to create enrollment");
    } finally {
      setEnrollLoading(false);
    }
  }

  // SA-ENROLL-UX G2: Revoke an enrollment code
  function handleRevokeEnrollment(code: string) {
    showConfirm(
      "Revoke Enrollment Code",
      `Revoke enrollment code ${code}? This cannot be undone.`,
      "Revoke Code",
      "danger",
      async () => {
        setRevokeLoading(code);
        try {
          await revokeEnrollmentCode(code);
          if (enrollment?.code === code) {
            setEnrollment(null);
          }
          // Refresh any store enrollments that contain this code
          for (const [sid, records] of Object.entries(storeEnrollments)) {
            if (records.some((r) => r.code === code)) {
              void loadStoreEnrollmentsHandler(sid);
            }
          }
        } catch (e: unknown) {
          setEnrollError(e instanceof Error ? e.message : "Failed to revoke enrollment code");
        } finally {
          setRevokeLoading(null);
        }
      },
    );
  }

  // #329-332: Resend welcome message (download links + activation instructions)
  async function handleResendCode(code: string) {
    setResendLoading(true);
    try {
      const result = await resendEnrollmentCode(code);
      if (result.sent) {
        toast.success(`Welcome message resent${result.sentTo ? ` to ${result.sentTo}` : ""} via ${result.channels.join(", ")}`);
      } else {
        toast("Resend request completed but no channels were available.", { icon: "⚠️" });
      }
    } catch (e: unknown) {
      setEnrollError(e instanceof Error ? e.message : "Failed to resend welcome message");
    } finally {
      setResendLoading(false);
    }
  }

  // SA-ENROLL-UX G3: Generate enrollment from Stores tab
  async function handleCreateEnrollmentForStore(storeId: string) {
    setEnrollmentForStoreLoading(storeId);
    try {
      await createDeviceEnrollment(storeId);
      await loadStoreEnrollmentsHandler(storeId);
    } catch (e: unknown) {
      setStoreDirectoryError(e instanceof Error ? e.message : "Failed to create enrollment");
    } finally {
      setEnrollmentForStoreLoading("");
    }
  }

  // SA-ENROLL-UX G5: Load enrollment codes for a specific store
  async function loadStoreEnrollmentsHandler(storeId: string) {
    setStoreEnrollmentsLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      const records = await fetchStoreEnrollments(storeId);
      setStoreEnrollments((prev) => ({ ...prev, [storeId]: records }));
    } catch {
      // Silently fail — enrollment codes are supplementary info
    } finally {
      setStoreEnrollmentsLoading((prev) => ({ ...prev, [storeId]: false }));
    }
  }

  // SA-P1-014: Load store settings for audit view
  async function loadStoreSettingsHandler(storeId: string) {
    setStoreSettingsLoading((prev) => ({ ...prev, [storeId]: true }));
    try {
      const settings = await fetchStoreSettings(storeId);
      setStoreSettings((prev) => ({ ...prev, [storeId]: settings }));
    } catch {
      // Silently fail — settings are supplementary audit info
    } finally {
      setStoreSettingsLoading((prev) => ({ ...prev, [storeId]: false }));
    }
  }

  // ISSUE-MICRO-086: enrollmentCountdown useMemo removed — rendered by EnrollmentCountdown component

  // =========================================================================
  // STBT-186.1: Confirmed wrappers for destructive actions
  // Each wrapper shows a ConfirmDialog before executing the actual handler.
  // =========================================================================
  const confirmedApproveProduct = (productId: string) => {
    const p = pendingProducts.find(x => x.id === productId);
    showConfirm('Approve Product', `Are you sure you want to approve "${p?.productName || productId}" for sale?`, 'Approve', 'warning', () => handleApproveProduct(productId), 'This product will become available to all linked retailers.');
  };
  const confirmedApproveDocument = (docId: string) => {
    const doc = pendingDocuments.find(x => x.id === docId);
    showConfirm('Approve Document', `Are you sure you want to approve this ${doc?.document_type || 'document'}?`, 'Approve', 'warning', () => handleApproveDocument(docId), 'This may activate the associated account.');
  };
  const confirmedRejectDocument = (docId: string, reason: string) => {
    if (reason.trim().length < 10) { setDocumentsError("Rejection reason must be at least 10 characters"); return; }
    showConfirm('Reject Document', 'Are you sure you want to reject this document?', 'Reject', 'danger', () => handleRejectDocument(docId, reason), `Reason: "${reason.substring(0, 60)}${reason.length > 60 ? '...' : ''}"`);
  };
  const confirmedApproveApplication = (appId: string) => {
    const app = applications.find(x => x.id === appId);
    showConfirm('Approve Application', `Are you sure you want to approve the application from "${app?.businessName || app?.ownerName || appId}"?`, 'Approve', 'warning', () => handleApproveApplication(appId), 'This will create the store or supplier account.');
  };
  const confirmedRejectApplication = (appId: string) => {
    const reason = appRejectReason[appId];
    if (!reason || reason.trim().length < 5) { setApplicationsError("Rejection reason must be at least 5 characters"); return; }
    showConfirm('Reject Application', `Are you sure you want to reject this application?`, 'Reject', 'danger', () => handleRejectApplication(appId), `Reason: "${reason.substring(0, 60)}${reason.length > 60 ? '...' : ''}"`);
  };
  const confirmedToggleStaffActive = (staffId: string, currentlyActive: boolean) => {
    const staff = staffList.find(x => x.id === staffId);
    const action = currentlyActive ? 'deactivate' : 'reactivate';
    showConfirm(currentlyActive ? 'Deactivate Staff' : 'Reactivate Staff', `Are you sure you want to ${action} "${staff?.name || staffId}"?`, currentlyActive ? 'Deactivate' : 'Reactivate', currentlyActive ? 'danger' : 'info', () => handleToggleStaffActive(staffId, currentlyActive), currentlyActive ? 'This staff member will be locked out immediately.' : 'This staff member will regain POS access.');
  };
  const confirmedResetPin = () => {
    if (!resetPinStaffId || !/^\d{4,6}$/.test(resetPinValue)) { setStaffError("PIN must be 4-6 digits"); return; }
    const staff = staffList.find(x => x.id === resetPinStaffId);
    showConfirm('Reset Staff PIN', `Reset PIN for "${staff?.name || resetPinStaffId}"?`, 'Reset PIN', 'warning', () => handleResetPin(), 'The staff member will need the new PIN to log in.');
  };
  const confirmedToggleGlobalFlag = (key: string, enabled: boolean) => {
    showConfirm(enabled ? 'Enable Feature Flag' : 'Disable Feature Flag', `${enabled ? 'Enable' : 'Disable'} the "${key}" flag globally?`, enabled ? 'Enable' : 'Disable', enabled ? 'info' : 'danger', () => handleToggleGlobalFlag(key, enabled), enabled ? 'This feature will be activated for all users.' : 'This feature will be disabled for all users.');
  };
  const confirmedGrnAlertAction = (alertId: string, status: "ACKNOWLEDGED" | "DISMISSED") => {
    if (status === "DISMISSED") {
      showConfirm('Dismiss GRN Alert', 'Dismiss this excess receipt alert?', 'Dismiss', 'warning', () => handleGrnAlertAction(alertId, status), 'Dismissed alerts will not appear in the active queue.');
    } else {
      handleGrnAlertAction(alertId, status);
    }
  };
  const confirmedBulkFF = () => {
    if (!selectedStoreIds.size || !bulkFlagKey) return;
    showConfirm('Bulk Feature Flag Update', `${bulkFlagAction === 'enable' ? 'Enable' : 'Disable'} "${bulkFlagKey}" for ${selectedStoreIds.size} store(s)?`, 'Apply', 'warning', () => handleBulkFF());
  };
  const confirmedVerifySupplier = (requestId: string) => {
    const req = pendingSuppliers.find(x => x.id === requestId);
    showConfirm('Verify Supplier', `Verify "${req?.requestedName || requestId}" and link to existing supplier?`, 'Verify', 'warning', () => handleVerifySupplier(requestId), 'This will activate the supplier account.');
  };
  const confirmedVerifySupplierDirectly = (requestId: string) => {
    const req = pendingSuppliers.find(x => x.id === requestId);
    showConfirm('Verify Supplier Directly', `Verify "${req?.requestedName || requestId}" as a new supplier?`, 'Verify', 'warning', () => handleVerifySupplierDirectly(requestId), 'This will create and activate a new supplier account.');
  };
  const confirmedBankApprove = (supplierId: string) => {
    const bank = bankChanges.find(x => x.id === supplierId);
    showConfirm('Approve Bank Details', `Approve bank details for "${bank?.businessName || supplierId}"?`, 'Approve', 'warning', () => handleBankVerify(supplierId, "approve"), 'This action cannot be undone.');
  };
  // =========================================================================

  // ITER4-CRIT-001: Show login gate if not authenticated
  if (!isAuthenticated) {
    return <LoginGate onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <ErrorBoundary>
    <div className="page">
      {/* T-222: Skip to content for keyboard navigation */}
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <header className="header">
        <div>
          <div className="title">
            <img src="/admin/brand/logo-shortmark.svg" alt="" width={20} height={20} className="header-brand-mark brand-mark-light" />
            <img src="/admin/brand/logo-shortmark-inverse.svg" alt="" width={20} height={20} className="header-brand-mark brand-mark-dark" />
            <span className="brandPill">SuperMandi</span>
            SuperAdmin
          </div>
          <div className="subtitle">Cloud POS operational dashboard</div>
        </div>

        <div className="health">
          <div className="muted sa-header-auth">
            <span className="sa-text-authenticated">Authenticated</span>
            <button
              className="tab sa-btn-logout"
              onClick={async () => {
                // GO-LIVE-001 & GO-LIVE-002: Logout - revoke session and show login
                await logout();
                setIsAuthenticated(false);
              }}
            >
              Logout
            </button>
            <ThemeToggle />
          </div>
          <div className="healthRow">
            <span className={health.ok ? "dot dotOk" : "dot dotBad"} />
            <span className="healthText">Backend: {health.ok ? "healthy" : "unreachable"}</span>
          </div>
          <div className="muted">
            {health.lastCheckedAt ? `Health checked: ${formatDateTime(health.lastCheckedAt)}` : ""}
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

      {/* T-015: Grouped sidebar navigation */}
      <div className="pageLayout">
        <aside className="sidebar" aria-label="SuperAdmin sidebar">
          {/* T-086: Brand header */}
          <div className="sidebarBrand">
            <div className="sidebarBrandRow">
              <img src="/admin/brand/logo-shortmark.svg" alt="" width={24} height={24} className="brand-mark-light" />
              <img src="/admin/brand/logo-shortmark-inverse.svg" alt="" width={24} height={24} className="brand-mark-dark" />
              <div className="sidebarBrandText">
                <span className="sidebarBrandTitle">SuperMandi</span>
                <span className="sidebarBrandSubtitle">SuperAdmin</span>
              </div>
            </div>
            <div className="sidebarBrandHealth">
              <span className={health.ok ? "dot dotOk" : "dot dotBad"} />
              <span className="sa-text-xs">{health.ok ? "Online" : "Offline"}</span>
            </div>
          </div>
          {/* Operations */}
          <div className="sidebarGroup">
            <div className="sidebarGroupLabel">Operations</div>
            <button aria-current={tab === "events" ? "page" : undefined} className={`sidebarItem ${tab === "events" ? "sidebarItemActive" : ""}`} onClick={() => setTab("events")}>
              <span className="sidebarItemLabel"><Activity size={18} className={`sa-nav-icon ${tab === "events" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Events</span>
            </button>
            <button aria-current={tab === "stores" ? "page" : undefined} className={`sidebarItem ${tab === "stores" ? "sidebarItemActive" : ""}`} onClick={() => setTab("stores")}>
              <span className="sidebarItemLabel"><Store size={18} className={`sa-nav-icon ${tab === "stores" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Stores</span>
            </button>
            <button aria-current={tab === "devices" ? "page" : undefined} className={`sidebarItem ${tab === "devices" ? "sidebarItemActive" : ""}`} onClick={() => setTab("devices")}>
              <span className="sidebarItemLabel"><Smartphone size={18} className={`sa-nav-icon ${tab === "devices" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Devices</span>
            </button>
            <button aria-current={tab === "staff" ? "page" : undefined} className={`sidebarItem ${tab === "staff" ? "sidebarItemActive" : ""}`} onClick={() => setTab("staff")}>
              <span className="sidebarItemLabel"><Users size={18} className={`sa-nav-icon ${tab === "staff" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Staff</span>
            </button>
            <button aria-current={tab === "grn-alerts" ? "page" : undefined} className={`sidebarItem ${tab === "grn-alerts" ? "sidebarItemActive" : ""}`} onClick={() => setTab("grn-alerts")}>
              <span className="sidebarItemLabel"><AlertTriangle size={18} className={`sa-nav-icon ${tab === "grn-alerts" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />GRN Alerts</span>
              {grnAlertsOpenCount > 0 && <span className="sidebarBadge">{grnAlertsOpenCount}</span>}
            </button>
            <button aria-current={tab === "invoices" ? "page" : undefined} className={`sidebarItem ${tab === "invoices" ? "sidebarItemActive" : ""}`} onClick={() => setTab("invoices")}>
              <span className="sidebarItemLabel"><Receipt size={18} className={`sa-nav-icon ${tab === "invoices" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Invoices</span>
            </button>
            <button aria-current={tab === "gst-compliance" ? "page" : undefined} className={`sidebarItem ${tab === "gst-compliance" ? "sidebarItemActive" : ""}`} onClick={() => setTab("gst-compliance")}>
              <span className="sidebarItemLabel"><IndianRupee size={18} className={`sa-nav-icon ${tab === "gst-compliance" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />GST Compliance</span>
            </button>
            <button aria-current={tab === "refunds" ? "page" : undefined} className={`sidebarItem ${tab === "refunds" ? "sidebarItemActive" : ""}`} onClick={() => setTab("refunds")}>
              <span className="sidebarItemLabel"><ArrowLeftRight size={18} className={`sa-nav-icon ${tab === "refunds" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Refunds</span>
            </button>
            <button aria-current={tab === "monitoring" ? "page" : undefined} className={`sidebarItem ${tab === "monitoring" ? "sidebarItemActive" : ""}`} onClick={() => setTab("monitoring")}>
              <span className="sidebarItemLabel"><HeartPulse size={18} className={`sa-nav-icon ${tab === "monitoring" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Monitoring</span>
            </button>
            <button aria-current={tab === "quality" ? "page" : undefined} className={`sidebarItem ${tab === "quality" ? "sidebarItemActive" : ""}`} onClick={() => setTab("quality")}>
              <span className="sidebarItemLabel"><FlaskConical size={18} className={`sa-nav-icon ${tab === "quality" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Quality</span>
            </button>
            <button aria-current={tab === "credit-providers" ? "page" : undefined} className={`sidebarItem ${tab === "credit-providers" ? "sidebarItemActive" : ""}`} onClick={() => setTab("credit-providers")}>
              <span className="sidebarItemLabel"><CreditCard size={18} className={`sa-nav-icon ${tab === "credit-providers" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Finance</span>
            </button>
            <button aria-current={tab === "support" ? "page" : undefined} className={`sidebarItem ${tab === "support" ? "sidebarItemActive" : ""}`} onClick={() => setTab("support")}>
              <span className="sidebarItemLabel"><MessageSquare size={18} className={`sa-nav-icon ${tab === "support" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Support</span>
            </button>
            <button aria-current={tab === "ai-insights" ? "page" : undefined} className={`sidebarItem ${tab === "ai-insights" ? "sidebarItemActive" : ""}`} onClick={() => setTab("ai-insights")}>
              <span className="sidebarItemLabel"><Brain size={18} className={`sa-nav-icon ${tab === "ai-insights" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />AI Intelligence</span>
            </button>
            <button aria-current={tab === "whatsapp" ? "page" : undefined} className={`sidebarItem ${tab === "whatsapp" ? "sidebarItemActive" : ""}`} onClick={() => setTab("whatsapp")}>
              <span className="sidebarItemLabel"><MessageCircle size={18} className={`sa-nav-icon ${tab === "whatsapp" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} style={{ color: tab === "whatsapp" ? "#25D366" : undefined }} />WhatsApp</span>
            </button>
          </div>

          {/* Onboarding */}
          <div className="sidebarGroup">
            <div className="sidebarGroupLabel">Onboarding</div>
            <button aria-current={tab === "applications" ? "page" : undefined} className={`sidebarItem ${tab === "applications" ? "sidebarItemActive" : ""}`} onClick={() => setTab("applications")}>
              <span className="sidebarItemLabel"><FileCheck size={18} className={`sa-nav-icon ${tab === "applications" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Applications</span>
              {applicationsTotal > 0 && <span className="sidebarBadge">{applicationsTotal}</span>}
            </button>
            <button aria-current={tab === "registrations" ? "page" : undefined} className={`sidebarItem ${tab === "registrations" ? "sidebarItemActive" : ""}`} onClick={() => setTab("registrations")}>
              <span className="sidebarItemLabel"><UserPlus size={18} className={`sa-nav-icon ${tab === "registrations" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Registrations</span>
              {tab !== "registrations" && regEventsTotal > regEventsLastSeenTotal && (
                <span className="sidebarBadge sidebarBadgeError">{regEventsTotal - regEventsLastSeenTotal}</span>
              )}
            </button>
            <button aria-current={tab === "documents" ? "page" : undefined} className={`sidebarItem ${tab === "documents" ? "sidebarItemActive" : ""}`} onClick={() => setTab("documents")}>
              <span className="sidebarItemLabel"><FileText size={18} className={`sa-nav-icon ${tab === "documents" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Documents</span>
              {pendingDocuments.length > 0 && <span className="sidebarBadge">{pendingDocsTotal}</span>}
            </button>
          </div>

          {/* Commerce */}
          <div className="sidebarGroup">
            <div className="sidebarGroupLabel">Commerce</div>
            <button aria-current={tab === "suppliers" ? "page" : undefined} className={`sidebarItem ${tab === "suppliers" ? "sidebarItemActive" : ""}`} onClick={() => setTab("suppliers")}>
              <span className="sidebarItemLabel"><Truck size={18} className={`sa-nav-icon ${tab === "suppliers" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Suppliers</span>
              {(pendingSuppliers.filter(s => s.status === "pending").length + pendingProducts.length + bankChanges.length) > 0 && (
                <span className="sidebarBadge">{pendingSuppliers.filter(s => s.status === "pending").length + pendingProducts.length + bankChanges.length}</span>
              )}
            </button>
            <button aria-current={tab === "payments" ? "page" : undefined} className={`sidebarItem ${tab === "payments" ? "sidebarItemActive" : ""}`} onClick={() => setTab("payments")}>
              <span className="sidebarItemLabel"><CreditCard size={18} className={`sa-nav-icon ${tab === "payments" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Payments</span>
            </button>
          </div>

          {/* Monitoring */}
          <div className="sidebarGroup">
            <div className="sidebarGroupLabel">Monitoring</div>
            <button aria-current={tab === "analytics" ? "page" : undefined} className={`sidebarItem ${tab === "analytics" ? "sidebarItemActive" : ""}`} onClick={() => setTab("analytics")}>
              <span className="sidebarItemLabel"><BarChart3 size={18} className={`sa-nav-icon ${tab === "analytics" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Analytics</span>
            </button>
            <button aria-current={tab === "audit" ? "page" : undefined} className={`sidebarItem ${tab === "audit" ? "sidebarItemActive" : ""}`} onClick={() => setTab("audit")}>
              <span className="sidebarItemLabel"><Shield size={18} className={`sa-nav-icon ${tab === "audit" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Audit Logs</span>
            </button>
          </div>

          {/* Platform */}
          <div className="sidebarGroup">
            <div className="sidebarGroupLabel">Platform</div>
            <button aria-current={tab === "users" ? "page" : undefined} className={`sidebarItem ${tab === "users" ? "sidebarItemActive" : ""}`} onClick={() => setTab("users")}>
              <span className="sidebarItemLabel"><UserCog size={18} className={`sa-nav-icon ${tab === "users" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Users</span>
            </button>
            <button aria-current={tab === "settings" ? "page" : undefined} className={`sidebarItem ${tab === "settings" ? "sidebarItemActive" : ""}`} onClick={() => setTab("settings")}>
              <span className="sidebarItemLabel"><Settings2 size={18} className={`sa-nav-icon ${tab === "settings" ? "sa-nav-icon--active" : "sa-nav-icon--inactive"}`} />Settings</span>
            </button>
            <button
              className={`sidebarItem ${aiPanelOpen ? "sidebarItemActive" : ""}`}
              onClick={() => setAiPanelOpen(true)}
            >
              <span><span className="brandPill" style={{ fontSize: 10, marginRight: 4 }}>SM</span> AI Assistant</span>
              {aiAnswer && <span>💬</span>}
            </button>
          </div>

          <div className="sidebarFooter">
            {eventsLoading && <div>Refreshing…</div>}
            {lastRefreshAt ? `Last: ${formatDateTime(lastRefreshAt)}` : ""}
          </div>
        </aside>

        {/* Mobile fallback: flat tabs */}
        <nav className="tabs sa-tabs-scroll" aria-label="Main navigation" role="tablist">
          <button role="tab" aria-selected={tab === "events"} className={tab === "events" ? "tab tabActive" : "tab"} onClick={() => setTab("events")}>Events</button>
          <button role="tab" aria-selected={tab === "stores"} className={tab === "stores" ? "tab tabActive" : "tab"} onClick={() => setTab("stores")}>Stores</button>
          <button role="tab" aria-selected={tab === "devices"} className={tab === "devices" ? "tab tabActive" : "tab"} onClick={() => setTab("devices")}>Devices</button>
          <button role="tab" aria-selected={tab === "suppliers"} className={tab === "suppliers" ? "tab tabActive" : "tab"} onClick={() => setTab("suppliers")}>Suppliers</button>
          <button role="tab" aria-selected={tab === "applications"} className={tab === "applications" ? "tab tabActive" : "tab"} onClick={() => setTab("applications")}>Applications</button>
          <button role="tab" aria-selected={tab === "analytics"} className={tab === "analytics" ? "tab tabActive" : "tab"} onClick={() => setTab("analytics")}>Analytics</button>
          <button role="tab" aria-selected={tab === "payments"} className={tab === "payments" ? "tab tabActive" : "tab"} onClick={() => setTab("payments")}>Payments</button>
          <button role="tab" aria-selected={tab === "users"} className={tab === "users" ? "tab tabActive" : "tab"} onClick={() => setTab("users")}>Users</button>
          <button role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "tab tabActive" : "tab"} onClick={() => setTab("settings")}>Settings</button>
          <button role="tab" aria-selected={tab === "documents"} className={tab === "documents" ? "tab tabActive" : "tab"} onClick={() => setTab("documents")}>Documents</button>
          <button role="tab" aria-selected={tab === "audit"} className={tab === "audit" ? "tab tabActive" : "tab"} onClick={() => setTab("audit")}>Audit</button>
          <button role="tab" aria-selected={tab === "registrations"} className={tab === "registrations" ? "tab tabActive" : "tab"} onClick={() => setTab("registrations")}>Registrations</button>
          <button role="tab" aria-selected={tab === "staff"} className={tab === "staff" ? "tab tabActive" : "tab"} onClick={() => setTab("staff")}>Staff</button>
          <button role="tab" aria-selected={tab === "grn-alerts"} className={tab === "grn-alerts" ? "tab tabActive" : "tab"} onClick={() => setTab("grn-alerts")}>GRN Alerts</button>
          <button role="tab" aria-selected={tab === "invoices"} className={tab === "invoices" ? "tab tabActive" : "tab"} onClick={() => setTab("invoices")}>Invoices</button>
          <button role="tab" aria-selected={tab === "gst-compliance"} className={tab === "gst-compliance" ? "tab tabActive" : "tab"} onClick={() => setTab("gst-compliance")}>GST</button>
          <button role="tab" aria-selected={tab === "refunds"} className={tab === "refunds" ? "tab tabActive" : "tab"} onClick={() => setTab("refunds")}>Refunds</button>
          <button role="tab" aria-selected={tab === "monitoring"} className={tab === "monitoring" ? "tab tabActive" : "tab"} onClick={() => setTab("monitoring")}>Monitoring</button>
          <button role="tab" aria-selected={tab === "quality"} className={tab === "quality" ? "tab tabActive" : "tab"} onClick={() => setTab("quality")}>Quality</button>
          <button role="tab" aria-selected={tab === "credit-providers"} className={tab === "credit-providers" ? "tab tabActive" : "tab"} onClick={() => setTab("credit-providers")}>Finance</button>
          <button role="tab" aria-selected={tab === "support"} className={tab === "support" ? "tab tabActive" : "tab"} onClick={() => setTab("support")}>Support</button>
          <button role="tab" aria-selected={tab === "ai-insights"} className={tab === "ai-insights" ? "tab tabActive" : "tab"} onClick={() => setTab("ai-insights")}>AI Intelligence</button>
          <button role="tab" aria-selected={tab === "whatsapp"} className={tab === "whatsapp" ? "tab tabActive" : "tab"} onClick={() => setTab("whatsapp")}>WhatsApp</button>
        </nav>

        <div id="main-content" className="mainContent" role="main">
      {/* T-114: Breadcrumb navigation + T-118: Copy deep link */}
      <nav aria-label="Breadcrumb" className="sa-breadcrumb">
        <span className="sa-text-muted">SuperAdmin</span>
        <span className="sa-breadcrumb-sep">&rsaquo;</span>
        <span className="sa-breadcrumb-current">{TAB_LABELS[tab]}</span>
        <button
          onClick={copyDeepLink}
          title="Copy link to this view"
          aria-label="Copy deep link"
          className={`sa-copy-link ${linkCopied ? "sa-copy-link--copied" : ""}`}
        >
          {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
          {linkCopied ? 'Copied!' : 'Copy link'}
        </button>
      </nav>
      {/* T-013: Events filter controls — only visible on Events tab */}
      {tab === "events" && <section className="controls">
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
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
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

        {/* #186.16: Date range filter for events */}
        <div className="control">
          <label>From date</label>
          <input type="date" value={eventDateFrom} onChange={(e) => setEventDateFrom(e.target.value)} />
        </div>
        <div className="control">
          <label>To date</label>
          <input type="date" value={eventDateTo} onChange={(e) => setEventDateTo(e.target.value)} />
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
      </section>}

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
          loading={eventsLoading}
          error={eventsError || undefined}
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
          requestForceReEnroll={requestForceReEnroll}
          devicePage={devicePage}
          setDevicePage={setDevicePage}
          devicesLoading={devicesLoading}
          deviceTotal={deviceTotal}
          refreshDevices={refreshDevices}
          limit={limit}
          devices={devices}
          storeDirectory={storeDirectory}
          handleRevokeEnrollment={handleRevokeEnrollment}
          revokeLoading={revokeLoading}
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
          storeSuspendLoading={storeSuspendLoading}
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
          handleBulkFF={confirmedBulkFF}
          bulkFlagLoading={bulkFlagLoading}
          bulkFlagResult={bulkFlagResult}
          featureFlags={featureFlags}
          barcodeSheetStoreId={barcodeSheetStoreId}
          setBarcodeSheetStoreId={(v: string) => { setBarcodeSheetStoreId(v); resetBarcodeSheetNotice(); }}
          barcodeSheetTier={barcodeSheetTier}
          setBarcodeSheetTier={setBarcodeSheetTier}
          barcodeSheetBusy={barcodeSheetBusy}
          barcodeSheetError={barcodeSheetError}
          barcodeSheetSuccess={barcodeSheetSuccess}
          handleBarcodeSheetDownload={handleBarcodeSheetDownload}
          handleBarcodeSheetShare={handleBarcodeSheetShare}
          stores={stores}
          limit={limit}
          handleCreateEnrollmentForStore={handleCreateEnrollmentForStore}
          enrollmentForStoreLoading={enrollmentForStoreLoading}
          storeEnrollments={storeEnrollments}
          loadStoreEnrollments={loadStoreEnrollmentsHandler}
          storeEnrollmentsLoading={storeEnrollmentsLoading}
          handleRevokeEnrollment={handleRevokeEnrollment}
          revokeLoading={revokeLoading}
          handleResendCode={handleResendCode}
          resendLoading={resendLoading}
          handleCreditToggle={handleCreditToggle}
          storeSettings={storeSettings}
          storeSettingsLoading={storeSettingsLoading}
          loadStoreSettings={loadStoreSettingsHandler}
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
          handleVerifySupplierDirectly={confirmedVerifySupplierDirectly}
          handleVerifySupplier={confirmedVerifySupplier}
          handleRejectSupplier={handleRejectSupplier}
          bankChanges={bankChanges}
          bankVerifyLoading={bankVerifyLoading}
          bankRejectReason={bankRejectReason}
          setBankRejectReason={setBankRejectReason}
          handleBankVerify={handleBankVerify}
          confirmedBankApprove={confirmedBankApprove}
          supplierSearch={supplierSearch}
          setSupplierSearch={setSupplierSearch}
          requestSupplierStatusChange={requestSupplierStatusChange}
          pendingProducts={pendingProducts}
          productActionError={productActionError}
          productRejectReason={productRejectReason}
          setProductRejectReason={setProductRejectReason}
          productActionLoading={productActionLoading}
          handleOpenEditProduct={handleOpenEditProduct}
          handleApproveProduct={confirmedApproveProduct}
          handleApproveProductDirect={handleApproveProduct}
          handleRejectProduct={handleRejectProduct}
          editingProduct={editingProduct}
          setEditingProduct={setEditingProduct}
          handleCloseEditProduct={handleCloseEditProduct}
          onModalDirty={setModalDirty}
          editProductForm={editProductForm}
          setEditProductForm={setEditProductForm}
          editProductError={editProductError}
          editProductSuccess={editProductSuccess}
          editProductLoading={editProductLoading}
          handleSubmitEditProduct={handleSubmitEditProduct}
        />
      )}

      {tab === "applications" && (
        <>
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
            handleApproveApplication={confirmedApproveApplication}
            handleRejectApplication={confirmedRejectApplication}
            onLoadMore={loadMoreApplications}
          />
          {/* #331: Approval success modal — retailer shows activation code, supplier shows email confirmation */}
          {/* REQ.SUPERADMIN.APPROVAL_MATRIX: both entity types get post-approval confirmation dialog */}
          {approvalResult && (
            <div className="sa-approval-overlay" onClick={() => setApprovalResult(null)} onKeyDown={(e) => { if (e.key === 'Escape') setApprovalResult(null); }}>
              <div className="sa-approval-card" onClick={(e) => e.stopPropagation()}>
                <div className="sa-approval-check">&#10003;</div>
                {approvalResult.entityType === 'supplier' ? (
                  <>
                    <h2 className="sa-approval-title">Supplier Approved!</h2>
                    {/* REQ.REGRESSION.SUPPLIER_APPROVAL_DELIVERY_TRUTH: branch on actual delivery signal */}
                    {approvalResult.emailDelivered === false ? (
                      <p className="sa-approval-warn">
                        The supplier has been approved but the notification email could not be sent. Please contact them directly.
                      </p>
                    ) : approvalResult.emailDelivered === true ? (
                      <>
                        <p className="sa-approval-body">
                          An approval email has been sent to the supplier. They can now log in to the Supplier Portal.
                        </p>
                        {approvalResult.codeSentTo && (
                          <p className="sa-approval-hint">
                            Email sent to: <strong>{approvalResult.codeSentTo}</strong>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="sa-approval-body">
                        The supplier has been approved. They can now log in to the Supplier Portal.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="sa-approval-title">Store Approved!</h2>
                    <p className="sa-approval-body">
                      Welcome message sent to the retailer. The POS app will auto-fetch this code when the retailer enters their phone number.
                    </p>
                    <div className="sa-activation-code-box">
                      <div className="sa-activation-label">Activation Code</div>
                      <div className="sa-activation-code">{approvalResult.activationCode}</div>
                    </div>
                    {approvalResult.codeSentTo && (
                      <p className="sa-approval-hint">
                        Sent to: <strong>{approvalResult.codeSentTo}</strong>
                        {approvalResult.codeSentVia.length > 0 && ` via ${approvalResult.codeSentVia.join(", ")}`}
                      </p>
                    )}
                  </>
                )}
                <div className="sa-approval-actions">
                  {approvalResult.entityType !== 'supplier' && approvalResult.activationCode && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(approvalResult.activationCode!).catch(() => { /* clipboard unavailable in insecure context */ }); }}
                      className="sa-btn-copy-code"
                    >
                      Copy Code
                    </button>
                  )}
                  <button
                    onClick={() => setApprovalResult(null)}
                    className="sa-btn-done"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
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
        <PaymentsTab paymentEvents={paymentEvents} loading={eventsLoading} error={eventsError || null} totalEventCount={events.length} fetchLimit={limit} />
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
          setShowCreateUser={(v: boolean) => { setShowCreateUser(v); if (v) { setCreateUserError(""); setCreateUserSuccess(""); } }}
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
          handleToggleGlobalFlag={confirmedToggleGlobalFlag}
          storeDirectory={storeDirectory}
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
          handleOpenDocument={handleOpenDocument}
          handleCloseDocument={handleCloseDocument}
          onModalDirty={setModalDirty}
          setDocRejectReason={setDocRejectReason}
          refreshDocuments={refreshDocuments}
          handleApproveDocument={confirmedApproveDocument}
          handleRejectDocument={confirmedRejectDocument}
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
          handleToggleStaffActive={confirmedToggleStaffActive}
          handleResetPin={confirmedResetPin}
          handleStaffRoleChange={handleStaffRoleChange}
          staffSuccess={staffSuccess}
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
          handleGrnAlertAction={confirmedGrnAlertAction}
        />
      )}

      {tab === "invoices" && <InvoicesTab />}

      {tab === "gst-compliance" && <GstComplianceTab />}

      {tab === "refunds" && <RefundsTab />}

      {tab === "monitoring" && <MonitoringTab />}

      {tab === "quality" && <QualityDashboardTab />}

      {tab === "credit-providers" && <CreditProvidersTab />}

      {tab === "support" && <SupportQueueTab />}

      {tab === "ai-insights" && <AIInsightsTab />}

      {tab === "whatsapp" && <WhatsAppTab />}

        </div>{/* end mainContent */}
      </div>{/* end pageLayout */}

      {/* SA-001: Confirmation modals — extracted to components/ConfirmationModals */}
      <ConfirmationModals
        pendingStatusChange={pendingStatusChange}
        setPendingStatusChange={setPendingStatusChange}
        executeUserStatusChange={executeUserStatusChange}
        userStatusSaving={userStatusSaving}
        pendingDeviceAction={pendingDeviceAction}
        deviceActionLoading={pendingDeviceAction ? deviceSaving[pendingDeviceAction.deviceId] : false}
        setPendingDeviceAction={setPendingDeviceAction}
        executeDeviceSave={executeDeviceSave}
        executeDeviceReset={executeDeviceReset}
        executeForceReEnroll={executeForceReEnroll}
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

      {/* STBT-186.1: Generic confirmation dialog */}
      {confirmDialog && (
        <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />
      )}

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

      {/* T-097: Unified footer — standard text + BuildStamp */}
      <footer className="sa-app-footer">
        <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
        <BuildStamp />
      </footer>
    </div>
    {/* T-094: Standardized toast config per DESIGN_TOKENS.md */}
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 4000,
        style: {
          background: 'var(--color-surface)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
        },
        success: {
          duration: 4000,
        },
        error: {
          duration: 6000,
        },
      }}
    />
    </ErrorBoundary>
  );
}
