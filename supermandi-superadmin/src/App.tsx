import React, { useEffect, useMemo, useRef, useState } from "react";
// ISSUE-MICRO-105: Global error boundary
import { ErrorBoundary } from "./components/ErrorBoundary";
import { fetchHealth } from "./api/health";
import { fetchPosEvents, type PosEvent } from "./api/posEvents";
import { askAi, fetchAiHealth } from "./api/ai";
import { hasValidSession, logout, refreshSession, sendAdminOtp, verifyAdminOtp, startIdleTimeout, stopIdleTimeout, abortActiveRequests } from "./api/authToken";
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
  // GO-LIVE-010: Proper type imports for analytics data
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
  type PendingSupplierRequest,
  type VerifiedSupplier,
  type PendingProduct,
  type ProductEditInput
} from "./api/suppliers";
import { fetchUsers, patchUser, createUser, type UserRecord, type UserCreateInput } from "./api/users";
import { fetchSettings, fetchSystemStats, type SystemSettings, type SystemStats } from "./api/settings";
// GL-CRIT-0049: Import audit logging functions
// GO-LIVE-011: Added fetchAuditLogs and types for audit UI
import {
  logAdminAction,
  logAdminActionError,
  fetchAuditLogs,
  type AuditLogRecord
} from "./api/audit";
// DOCS-001: Import document management functions
import {
  fetchPendingDocuments,
  approveDocument,
  rejectDocument,
  type DocumentRecord
} from "./api/documents";
import { QRCodeSVG } from "qrcode.react";
// RO-007: Registration events visibility
import { fetchRegistrationEvents, sendEnrollmentCodeToStore, type RegistrationEvent } from "./api/registrationEvents";
import { fetchStoreStaff, createStaff, updateStaff, resetStaffPin, type StaffMember } from "./api/staff"; // SA-P1-001
import { composeDeviceMessage, getDeviceTone, isDeviceOnline } from "./ui/status";
import { BuildStamp } from "./components/BuildStamp";
import { formatDateTime, formatCurrency } from "./lib/formatters";
import "./App.css";

// GO-LIVE-011: Added "audit" tab for audit logs
// DOCS-001: Added "documents" tab for document management
type TabKey = "events" | "devices" | "stores" | "suppliers" | "payments" | "analytics" | "ai" | "users" | "settings" | "audit" | "documents" | "registrations" | "staff";
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

// GO-LIVE-LOGIN-004: Email OTP login gate component
function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  // AUTH-OTP-001: OTP expiry countdown
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);

  // AUTH-OTP-001: OTP expiry countdown
  useEffect(() => {
    if (otpExpirySeconds > 0) {
      const timer = setTimeout(() => setOtpExpirySeconds(otpExpirySeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpExpirySeconds]);

  // Admin email allowlist (for instant client-side feedback)
  const ADMIN_EMAILS = ['supermanditech@gmail.com'];

  const handleSendOtp = async () => {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail) {
      setError("Please enter your email address");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    // Client-side allowlist check for instant feedback
    if (!ADMIN_EMAILS.includes(normalizedEmail)) {
      setError("This email is not authorized for admin access");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    const result = await sendAdminOtp(normalizedEmail);

    if (!result.success) {
      setError(result.error || "Failed to send verification code");
      setLoading(false);
      return;
    }

    setSuccess("Verification code sent to your email");
    setStep('otp');
    // AUTH-OTP-001: Use expiresIn from API (default 600s / 10 min)
    setOtpExpirySeconds(result.expiresIn || 600);
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    const normalizedEmail = email.toLowerCase().trim();
    const otpTrimmed = otp.trim();

    if (!otpTrimmed) {
      setError("Please enter the verification code");
      return;
    }

    if (otpTrimmed.length !== 6 || !/^\d+$/.test(otpTrimmed)) {
      setError("Verification code must be 6 digits");
      return;
    }

    setLoading(true);
    setError("");

    const result = await verifyAdminOtp(normalizedEmail, otpTrimmed);

    if (!result.success) {
      setError(result.error || "Invalid verification code");
      setLoading(false);
      return;
    }

    // Login successful
    onLogin();
  };

  const handleBack = () => {
    setStep('email');
    setOtp("");
    setError("");
    setSuccess("");
    setOtpExpirySeconds(0); // AUTH-OTP-001: Clear countdown
  };

  // UI-SPEC-003: Stripe-level calm infrastructure design for admin portal
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "#F7F9FC",
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header Bar - 64px height per spec */}
      <header style={{
        background: "white",
        borderBottom: "1px solid #e2e8f0",
        height: "64px",
        display: "flex",
        alignItems: "center"
      }}>
        <div style={{
          maxWidth: "1152px",
          width: "100%",
          margin: "0 auto",
          padding: "0 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "#2563eb"
            }}>SuperManditech</span>
            <span style={{ color: "#94a3b8" }}>|</span>
            <span style={{ color: "#475569", fontSize: "0.875rem", fontWeight: 500 }}>SuperAdmin</span>
          </div>
          <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
            Cloud POS Dashboard
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem"
      }}>
        <div style={{ width: "100%", maxWidth: "448px" }}>
          <div style={{
            background: "#fff",
            padding: "2rem",
            borderRadius: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
            border: "1px solid #e2e8f0"
          }}>
            <h2 style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              color: "#0F172A",
              marginBottom: "0.5rem"
            }}>
              Admin Sign In
            </h2>
            <p style={{
              color: "#64748b",
              fontSize: "0.875rem",
              marginBottom: "1.5rem"
            }}>
              {step === 'email' ? 'Enter your admin email to continue' : `Enter the 6-digit code sent to ${email}`}
            </p>

            {step === 'email' ? (
              <>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: "#0F172A",
                    marginBottom: "0.5rem"
                  }}>
                    Admin Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                    placeholder="admin@example.com"
                    style={{
                      width: "100%",
                      height: "42px",
                      padding: "0 1rem",
                      fontSize: "0.9375rem",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                    autoFocus
                  />
                </div>

                {error && (
                  <div style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    padding: "0.875rem 1rem",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    marginBottom: "1rem"
                  }}>
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSendOtp}
                  disabled={loading}
                  style={{
                    width: "100%",
                    height: "46px",
                    padding: "0 1.5rem",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                    color: "white",
                    background: loading ? "#93c5fd" : "#2563eb",
                    border: "none",
                    borderRadius: "6px",
                    cursor: loading ? "not-allowed" : "pointer",
                    marginBottom: "1rem"
                  }}
                >
                  {loading ? "Sending..." : "Send Verification Code"}
                </button>
              </>
            ) : (
              <>
                {success && (
                  <div style={{
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    color: "#065f46",
                    padding: "0.875rem 1rem",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    marginBottom: "1rem"
                  }}>
                    {success}
                  </div>
                )}

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    color: "#0F172A",
                    marginBottom: "0.5rem"
                  }}>
                    Verification Code
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                    placeholder="------"
                    maxLength={6}
                    style={{
                      width: "100%",
                      height: "48px",
                      padding: "0 1rem",
                      fontSize: "1.25rem",
                      letterSpacing: "0.5rem",
                      textAlign: "center",
                      fontFamily: "monospace",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      outline: "none",
                      boxSizing: "border-box"
                    }}
                    autoFocus
                  />
                </div>

                {/* AUTH-OTP-001: OTP expiry countdown */}
                {otpExpirySeconds > 0 && (
                  <p style={{
                    fontSize: "0.8125rem",
                    color: otpExpirySeconds <= 60 ? "#dc2626" : "#64748b",
                    textAlign: "center",
                    marginBottom: "1rem",
                  }}>
                    Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
                  </p>
                )}
                {otpExpirySeconds === 0 && step === 'otp' && (
                  <p style={{
                    fontSize: "0.8125rem",
                    color: "#dc2626",
                    textAlign: "center",
                    marginBottom: "1rem",
                  }}>
                    Code expired. Please request a new one.
                  </p>
                )}

                {error && (
                  <div style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    padding: "0.875rem 1rem",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    marginBottom: "1rem"
                  }}>
                    {error}
                  </div>
                )}

                <button
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  style={{
                    width: "100%",
                    height: "46px",
                    padding: "0 1.5rem",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                    color: "white",
                    background: loading ? "#93c5fd" : "#2563eb",
                    border: "none",
                    borderRadius: "6px",
                    cursor: loading ? "not-allowed" : "pointer",
                    marginBottom: "0.75rem"
                  }}
                >
                  {loading ? "Verifying..." : "Verify & Login"}
                </button>

                <button
                  onClick={handleBack}
                  disabled={loading}
                  style={{
                    width: "100%",
                    height: "46px",
                    padding: "0 1.5rem",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                    color: "#0F172A",
                    background: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    cursor: loading ? "not-allowed" : "pointer"
                  }}
                >
                  Back to Email
                </button>
              </>
            )}

            <div style={{
              marginTop: "1.5rem",
              paddingTop: "1rem",
              borderTop: "1px solid #e5e7eb",
              fontSize: "0.75rem",
              color: "#64748b",
              textAlign: "center"
            }}>
              Only authorized administrators can access this portal.
            </div>
          </div>
        </div>
      </main>

      {/* Footer - minimal, muted per spec */}
      <footer style={{
        background: "white",
        borderTop: "1px solid #e2e8f0"
      }}>
        <div style={{
          maxWidth: "1152px",
          margin: "0 auto",
          padding: "1rem 1.5rem",
          textAlign: "center",
          fontSize: "0.8125rem",
          color: "#64748b"
        }}>
          &copy; 2026 SuperManditech. All rights reserved.
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}

// ISSUE-MICRO-086: Extracted countdown to prevent QR code re-rendering every 1s
function EnrollmentCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return <>unknown</>;
  const delta = expiresAtMs - now;
  if (delta <= 0) return <>expired</>;
  const totalSeconds = Math.floor(delta / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return <>{minutes}m {String(seconds).padStart(2, "0")}s</>;
}

export default function App() {
  const [tab, setTabRaw] = useState<TabKey>("events");
  // ISSUE-MICRO-063: Abort in-flight requests when switching tabs
  const setTab = (newTab: TabKey) => {
    if (newTab !== tab) abortActiveRequests();
    setTabRaw(newTab);
  };

  // ITER4-CRIT-001: Track authentication state
  // GO-LIVE-UI-001: Use hasValidSession() to ensure valid JWT, not just any stale token
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Check if VALID session token exists on initial load (prevents 401 loop)
    return hasValidSession();
  });

  // ITER4-CRIT-001: Removed adminTokenInput state - login now handled by LoginGate component

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
  // POST-BATCH-018-FIX-002: Retry once before logging out (transient failure resilience)
  useEffect(() => {
    if (!isAuthenticated) return;
    let consecutiveFailures = 0;
    const interval = setInterval(async () => {
      const success = await refreshSession();
      if (success) {
        consecutiveFailures = 0;
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= 2) {
          console.warn('[FIX-002] Token refresh failed twice consecutively, logging out');
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
      const [pendingRes, verifiedRes, products] = await Promise.all([
        fetchPendingSuppliers(),
        fetchVerifiedSuppliers({ search: supplierSearch || undefined }),
        fetchPendingProducts()
      ]);
      setPendingSuppliers(pendingRes.items);
      setVerifiedSuppliers(verifiedRes.items);
      setPendingProducts(products);
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "Failed to fetch suppliers";
      setSuppliersError(message);
    } finally {
      suppliersInFlightRef.current = false;
      setSuppliersLoading(false);
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
        input.superMandiMarginMinor = Math.round(parseFloat(editProductForm.fixedMargin) * 100);
      } else if (editProductForm.marginType === "percent" && editProductForm.percentMargin) {
        input.marginPercent = parseFloat(editProductForm.percentMargin);
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
    if (!reason.trim()) {
      alert("Please provide a rejection reason");
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

  // ISSUE-MICRO-024: Update ref each render so polling interval uses latest closures
  refreshRef.current = { refreshHealth, refreshEvents, refreshDevices, refreshStores, refreshSuppliers, refreshUsers, refreshSettings, refreshAuditLogs, refreshDocuments, refreshRegEvents };

  useEffect(() => {
    // ITER4-CRIT-001: Token pre-fill removed - login now handled by LoginGate component

    const shouldRefreshEvents = tab === "events" || tab === "devices" || tab === "payments"; // P0-DEPLOY-002: Include payments
    const shouldRefreshDevices = tab === "devices";
    const shouldRefreshStores = tab === "stores";
    const shouldRefreshSuppliers = tab === "suppliers";
    const shouldRefreshUsers = tab === "users";
    const shouldRefreshSettings = tab === "settings";
    const shouldRefreshAi = tab === "ai";
    const shouldRefreshAudit = tab === "audit"; // GO-LIVE-011
    const shouldRefreshDocuments = tab === "documents"; // DOCS-001
    const shouldRefreshRegEvents = tab === "registrations"; // RO-007

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
    if (shouldRefreshAudit) refreshAuditLogs(); // GO-LIVE-011
    if (shouldRefreshDocuments) refreshDocuments(); // DOCS-001
    if (shouldRefreshRegEvents) refreshRegEvents(); // RO-007
    if (tab === "staff" && staffStoreId) refreshStaff(); // SA-P1-001

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
  }, [tab]);

  // If user changes limit, refresh immediately.
  useEffect(() => {
    refreshEvents();
    setPage(0);
  }, [limit]);

  // GO-LIVE-011: Refresh audit logs when page or filter changes
  useEffect(() => {
    if (tab === "audit") {
      refreshAuditLogs();
    }
  }, [auditLogsPage, auditLogsFilter]);

  // DOCS-001: Refresh documents when page or filter changes
  useEffect(() => {
    if (tab === "documents") {
      refreshDocuments();
    }
  }, [documentsPage, documentsEntityFilter]);

  // RO-007: Refresh registration events when page or filter changes
  useEffect(() => {
    if (tab === "registrations") {
      refreshRegEvents();
    }
  }, [regEventsPage, regEventsSourceFilter, regEventsOutcomeFilter]);

  // DR-010: Clear badge when admin views the registrations tab
  useEffect(() => {
    if (tab === "registrations") {
      setRegEventsLastSeenTotal(regEventsTotal);
    }
  }, [tab]);

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
      refreshDevices(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [deviceIdFilter, storeIdFilter]);

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
  }, [aiPanelOpen]);

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
                      <td className="mono">{formatDateTime(g.lastSeen)}</td>
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
                      <td className="mono">{formatDateTime(e.createdAt)}</td>
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
                          ? formatDateTime(storeRecord.upi_vpa_updated_at)
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
                      <td className="mono">{formatDateTime(s.lastSeen)}</td>
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
                        <strong>Requested:</strong> <span className="mono">{formatDateTime(request.createdAt)}</span>
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
                        <strong>Submitted:</strong> <span className="mono">{formatDateTime(product.createdAt)}</span>
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
                        {request.reviewedAt ? formatDateTime(request.reviewedAt) : "-"}
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
                    <div className="analyticsValue">{formatCurrency(overviewData.sales_total.pos_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Sales Total (Consumer)</div>
                    <div className="analyticsValue">{formatCurrency(overviewData.sales_total.consumer_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Sales Total (All)</div>
                    <div className="analyticsValue">{formatCurrency(overviewData.sales_total.total_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Collections Total</div>
                    <div className="analyticsValue">{formatCurrency(overviewData.collections_total_minor)}</div>
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
                      {formatCurrency(overviewData.payment_split_minor.cash)} / {formatCurrency(overviewData.payment_split_minor.upi)} / {formatCurrency(overviewData.payment_split_minor.due)}
                    </div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Due Outstanding</div>
                    <div className="analyticsValue">{formatCurrency(overviewData.due_outstanding.total_minor)}</div>
                    <div className="muted">
                      {overviewData.due_outstanding.buckets.map((b: any) => `${b.label}: ${formatCurrency(b.total_minor)}`).join(" | ")}
                    </div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Profit (Gross)</div>
                    {overviewData.profit ? (
                      <>
                        <div className="analyticsValue">{formatCurrency(overviewData.profit.gross_profit_minor)}</div>
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
                      {formatCurrency(overviewData.payment_split_minor.cash)} / {formatCurrency(overviewData.payment_split_minor.upi)} / {formatCurrency(overviewData.payment_split_minor.due)}
                    </div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Due Outstanding</div>
                    <div className="analyticsValue">{formatCurrency(overviewData.due_outstanding.total_minor)}</div>
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
                          <td className="mono">{formatCurrency(b.total_minor)}</td>
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
                      {analyticsDevices.devices.map((d) => {
                        const online = isDeviceOnline(d.last_seen_online);
                        return (
                          <tr key={d.device_id}>
                            <td>{d.label ?? d.device_id}</td>
                            <td>{d.device_type ?? "Unknown"}</td>
                            <td>{online ? "Online" : "Offline"} / {d.active ? "Active" : "Inactive"}</td>
                            <td className="mono">{d.pending_outbox_count}</td>
                            <td className="mono">{d.sales_count} / {formatCurrency(d.sales_total_minor)}</td>
                            <td className="mono">{d.collections_count} / {formatCurrency(d.collections_total_minor)}</td>
                            <td className="mono">{d.offline_sales_count}</td>
                            <td className="mono">{d.last_seen_online ? formatDateTime(d.last_seen_online) : "-"}</td>
                            <td className="mono">{d.last_sync_at ? formatDateTime(d.last_sync_at) : "-"}</td>
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
                      {analyticsProducts.top_products.map((p) => (
                        <tr key={p.product_id}>
                          <td>{p.name}</td>
                          <td className="mono">{p.barcode}</td>
                          <td>{p.source}</td>
                          <td className="mono">{p.quantity}</td>
                          <td className="mono">{formatCurrency(p.total_minor)}</td>
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
                      {analyticsProducts.new_products_created.map((p) => (
                        <tr key={p.id}>
                          <td>{p.name}</td>
                          <td className="mono">{p.barcode}</td>
                          <td className="mono">{p.created_at ? formatDateTime(p.created_at) : "-"}</td>
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
                    <div className="analyticsValue">{formatCurrency(analyticsPurchases.total_minor)}</div>
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
                      {analyticsPurchases.vendor_breakdown.map((v) => (
                        <tr key={v.supplier}>
                          <td>{v.supplier}</td>
                          <td className="mono">{formatCurrency(v.total_minor)}</td>
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
                      {analyticsPurchases.sku_cost_summary.map((s, idx) => (
                        <tr key={`${s.product_id ?? s.sku ?? "sku"}-${idx}`}>
                          <td className="mono">{s.sku ?? s.product_id ?? "unknown"}</td>
                          <td className="mono">{s.quantity}</td>
                          <td className="mono">{formatCurrency(s.avg_cost_minor)}</td>
                          <td className="mono">{s.last_cost_minor ? formatCurrency(s.last_cost_minor) : "-"}</td>
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
                    <div className="analyticsValue">{formatCurrency(analyticsConsumerSales.total_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">Payment Split (Cash / UPI / Due)</div>
                    <div className="analyticsValue">
                      {formatCurrency(analyticsConsumerSales.payment_split_minor.cash)} / {formatCurrency(analyticsConsumerSales.payment_split_minor.upi)} / {formatCurrency(analyticsConsumerSales.payment_split_minor.due)}
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
                      {analyticsConsumerSales.status_counts.map((s) => (
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
                            <td className="mono">{formatDateTime(b.bucket)}</td>
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
                    <div className="analyticsValue">{formatCurrency(analyticsDues.outstanding_total_minor)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">0-1 Days</div>
                    <div className="analyticsValue">{formatCurrency(analyticsDues.aging.d0_1)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">2-7 Days</div>
                    <div className="analyticsValue">{formatCurrency(analyticsDues.aging.d2_7)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">8-30 Days</div>
                    <div className="analyticsValue">{formatCurrency(analyticsDues.aging.d8_30)}</div>
                  </div>
                  <div className="analyticsCard">
                    <div className="analyticsLabel">30+ Days</div>
                    <div className="analyticsValue">{formatCurrency(analyticsDues.aging.d30_plus)}</div>
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
                            <td className="mono">{formatCurrency(d.amount_minor)}</td>
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
                      <td className="mono">{formatDateTime(e.createdAt)}</td>
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

      {/* DOCS-001: Documents Verification Tab */}
      {tab === "documents" && (
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Document Verification Queue</div>
            <div className="muted">Review and approve/reject KYC documents ({pendingDocsTotal} pending)</div>
          </div>

          <div className="tableWrap">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <button onClick={() => refreshDocuments()} disabled={documentsLoading}>
                {documentsLoading ? "Loading..." : "Refresh"}
              </button>

              <select
                value={documentsEntityFilter}
                onChange={(e) => {
                  setDocumentsEntityFilter(e.target.value as "" | "store" | "supplier");
                  setDocumentsPage(0);
                }}
                style={{ padding: "6px 10px" }}
              >
                <option value="">All Entities</option>
                <option value="store">Stores</option>
                <option value="supplier">Suppliers</option>
              </select>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  disabled={documentsPage === 0}
                  onClick={() => setDocumentsPage(prev => Math.max(0, prev - 1))}
                >
                  ← Prev
                </button>
                <span className="muted">Page {documentsPage + 1} of {Math.max(1, Math.ceil(pendingDocsTotal / 50))}</span>
                <button
                  disabled={(documentsPage + 1) * 50 >= pendingDocsTotal}
                  onClick={() => setDocumentsPage(prev => prev + 1)}
                >
                  Next →
                </button>
              </div>
            </div>

            {documentsError && <div className="errorText" style={{ marginBottom: 8 }}>{documentsError}</div>}

            {pendingDocuments.length === 0 ? (
              <div className="empty">No pending documents to review.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Document Type</th>
                    <th>File</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingDocuments.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase" }}>{doc.entity_type}</div>
                        <div className="mono" style={{ fontSize: 11 }}>{doc.entity_name || doc.entity_id.slice(0, 8)}</div>
                        {doc.owner_name && <div style={{ fontSize: 11, color: "#666" }}>{doc.owner_name}</div>}
                      </td>
                      <td>{doc.document_type}</td>
                      <td>
                        <div>{doc.file_name}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{(doc.file_size / 1024).toFixed(1)} KB • {doc.content_type}</div>
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{formatDateTime(doc.uploaded_at)}</td>
                      <td>
                        <span className={`badge ${doc.status === "pending" ? "badgeWarn" : doc.status === "approved" ? "badgeGood" : "badgeBad"}`}>
                          {doc.status}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => setSelectedDocument(doc)}
                          style={{ padding: "4px 8px", fontSize: 12 }}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Document Review Modal */}
          {selectedDocument && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={() => setSelectedDocument(null)}
            >
              <div
                style={{
                  backgroundColor: "#1a1a2e",
                  borderRadius: 8,
                  padding: 24,
                  maxWidth: "90vw",
                  maxHeight: "90vh",
                  overflow: "auto",
                  minWidth: 400,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0 }}>Review Document</h3>
                  <button onClick={() => setSelectedDocument(null)} style={{ padding: "4px 8px" }}>✕</button>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Entity:</strong> {selectedDocument.entity_type} - {selectedDocument.entity_name || selectedDocument.entity_id}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Document Type:</strong> {selectedDocument.document_type}
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>File:</strong> {selectedDocument.file_name} ({(selectedDocument.file_size / 1024).toFixed(1)} KB)
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Uploaded:</strong> {formatDateTime(selectedDocument.uploaded_at)}
                  </div>
                </div>

                {/* Document Preview */}
                <div style={{ marginBottom: 16, textAlign: "center", backgroundColor: "#0f0f23", padding: 16, borderRadius: 4 }}>
                  {selectedDocument.content_type.startsWith("image/") ? (
                    <img
                      src={selectedDocument.view_url}
                      alt={selectedDocument.file_name}
                      style={{ maxWidth: "100%", maxHeight: 400 }}
                    />
                  ) : selectedDocument.content_type === "application/pdf" ? (
                    <iframe
                      src={selectedDocument.view_url}
                      title={selectedDocument.file_name}
                      style={{ width: "100%", height: 400, border: "none" }}
                    />
                  ) : (
                    <div>
                      <a href={selectedDocument.view_url} target="_blank" rel="noopener noreferrer" style={{ color: "#7c3aed" }}>
                        Download {selectedDocument.file_name}
                      </a>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                  <button
                    onClick={() => handleApproveDocument(selectedDocument.id)}
                    disabled={documentActionLoading === selectedDocument.id}
                    style={{
                      padding: "10px 20px",
                      backgroundColor: "#22c55e",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: documentActionLoading ? "wait" : "pointer",
                    }}
                  >
                    {documentActionLoading === selectedDocument.id ? "Processing..." : "✓ Approve Document"}
                  </button>

                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Rejection reason (required)"
                      value={docRejectReason}
                      onChange={(e) => setDocRejectReason(e.target.value)}
                      style={{ flex: 1, padding: "8px 12px" }}
                    />
                    <button
                      onClick={() => handleRejectDocument(selectedDocument.id, docRejectReason)}
                      disabled={documentActionLoading === selectedDocument.id || !docRejectReason.trim()}
                      style={{
                        padding: "10px 20px",
                        backgroundColor: "#ef4444",
                        color: "white",
                        border: "none",
                        borderRadius: 4,
                        cursor: documentActionLoading || !docRejectReason.trim() ? "not-allowed" : "pointer",
                        opacity: !docRejectReason.trim() ? 0.5 : 1,
                      }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* GO-LIVE-011: Audit Logs Tab */}
      {tab === "audit" && (
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Audit Logs</div>
            <div className="muted">System activity and admin actions ({auditLogsTotal} total)</div>
          </div>

          <div className="tableWrap">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <button onClick={() => refreshAuditLogs()} disabled={auditLogsLoading}>
                {auditLogsLoading ? "Loading..." : "Refresh"}
              </button>

              <select
                value={auditLogsFilter.action || ""}
                onChange={(e) => {
                  setAuditLogsFilter(prev => ({ ...prev, action: e.target.value || undefined }));
                  setAuditLogsPage(0);
                }}
                style={{ padding: "6px 10px" }}
              >
                <option value="">All Actions</option>
                <option value="create">Create</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
                <option value="approve">Approve</option>
                <option value="reject">Reject</option>
                <option value="login">Login</option>
              </select>

              <select
                value={auditLogsFilter.resource_type || ""}
                onChange={(e) => {
                  setAuditLogsFilter(prev => ({ ...prev, resource_type: e.target.value || undefined }));
                  setAuditLogsPage(0);
                }}
                style={{ padding: "6px 10px" }}
              >
                <option value="">All Resources</option>
                <option value="store">Store</option>
                <option value="device">Device</option>
                <option value="user">User</option>
                <option value="supplier">Supplier</option>
                <option value="product">Product</option>
              </select>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  disabled={auditLogsPage === 0}
                  onClick={() => setAuditLogsPage(prev => Math.max(0, prev - 1))}
                >
                  ← Prev
                </button>
                <span className="muted">Page {auditLogsPage + 1} of {Math.max(1, Math.ceil(auditLogsTotal / 50))}</span>
                <button
                  disabled={(auditLogsPage + 1) * 50 >= auditLogsTotal}
                  onClick={() => setAuditLogsPage(prev => prev + 1)}
                >
                  Next →
                </button>
              </div>
            </div>

            {auditLogsError && <div className="errorText" style={{ marginBottom: 8 }}>{auditLogsError}</div>}

            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Resource ID</th>
                  <th>Actor</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {formatDateTime(log.created_at)}
                    </td>
                    <td>
                      <span style={{
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: log.action === "delete" ? "#ffebee" :
                                   log.action === "create" ? "#e8f5e9" :
                                   log.action === "approve" ? "#e3f2fd" :
                                   log.action === "reject" ? "#fff3e0" : "#f5f5f5",
                        color: log.action === "delete" ? "#c62828" :
                               log.action === "create" ? "#2e7d32" :
                               log.action === "approve" ? "#1565c0" :
                               log.action === "reject" ? "#e65100" : "#666"
                      }}>
                        {log.action.toUpperCase()}
                      </span>
                    </td>
                    <td>{log.resource_type}</td>
                    <td className="mono" style={{ fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {log.resource_id || "-"}
                    </td>
                    <td className="mono" style={{ fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {log.actor_user_id || log.actor_ip || "system"}
                    </td>
                    <td>
                      {log.response_status ? (
                        <span style={{
                          color: log.response_status >= 400 ? "#c62828" : "#2e7d32"
                        }}>
                          {log.response_status}
                        </span>
                      ) : "-"}
                    </td>
                    <td>
                      {log.error_message && (
                        <span style={{ color: "#c62828", fontSize: 12 }}>{log.error_message}</span>
                      )}
                      {log.request_body && !log.error_message && (
                        <PayloadDetails payload={log.request_body} />
                      )}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && !auditLogsLoading && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", color: "#888", padding: 24 }}>
                      No audit logs found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* RO-007: Registration Events Tab */}
      {tab === "registrations" && (
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Registration Events</div>
            <div className="muted">Store registrations across all surfaces ({regEventsTotal} total)</div>
          </div>

          <div className="tableWrap">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <button onClick={() => refreshRegEvents()} disabled={regEventsLoading}>
                {regEventsLoading ? "Loading..." : "Refresh"}
              </button>

              <select
                value={regEventsSourceFilter}
                onChange={(e) => { setRegEventsSourceFilter(e.target.value); setRegEventsPage(0); }}
                style={{ padding: "6px 10px" }}
              >
                <option value="">All Sources</option>
                <option value="PORTAL">Portal</option>
                <option value="POS_DEVICE">POS Device</option>
                <option value="POS_MOBILE">POS Mobile</option>
                <option value="ADMIN">Admin</option>
              </select>

              <select
                value={regEventsOutcomeFilter}
                onChange={(e) => { setRegEventsOutcomeFilter(e.target.value); setRegEventsPage(0); }}
                style={{ padding: "6px 10px" }}
              >
                <option value="">All Outcomes</option>
                <option value="SUCCESS">Success</option>
                <option value="IDEMPOTENT">Idempotent</option>
                <option value="BLOCKED">Blocked</option>
                <option value="ERROR">Error</option>
              </select>

              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  disabled={regEventsPage === 0}
                  onClick={() => setRegEventsPage(prev => Math.max(0, prev - 1))}
                >
                  &larr; Prev
                </button>
                <span className="muted">Page {regEventsPage + 1} of {Math.max(1, Math.ceil(regEventsTotal / 50))}</span>
                <button
                  disabled={(regEventsPage + 1) * 50 >= regEventsTotal}
                  onClick={() => setRegEventsPage(prev => prev + 1)}
                >
                  Next &rarr;
                </button>
              </div>
            </div>

            {regEventsError && <div className="errorText" style={{ marginBottom: 8 }}>{regEventsError}</div>}

            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Outcome</th>
                  <th>Phone</th>
                  <th>Business Name</th>
                  <th>Store</th>
                  <th>GSTIN</th>
                  <th>IP</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {regEvents.map((evt) => (
                  <tr key={evt.id}>
                    <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                      {new Date(evt.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: evt.source === "PORTAL" ? "#eff6ff" : evt.source === "POS_MOBILE" ? "#ecfdf5" : "#f5f3ff",
                        color: evt.source === "PORTAL" ? "#1d4ed8" : evt.source === "POS_MOBILE" ? "#16a34a" : "#7c3aed",
                      }}>
                        {evt.source}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: evt.outcome === "SUCCESS" ? "#dcfce7" : evt.outcome === "IDEMPOTENT" ? "#fef9c3" : evt.outcome === "ERROR" ? "#fecaca" : "#fee2e2",
                        color: evt.outcome === "SUCCESS" ? "#166534" : evt.outcome === "IDEMPOTENT" ? "#854d0e" : "#991b1b",
                      }}>
                        {evt.outcome}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{evt.phone}</td>
                    <td>{evt.businessName}</td>
                    <td>
                      {evt.storeName ? (
                        <span>
                          {evt.storeName}
                          {evt.storeCode && <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>({evt.storeCode})</span>}
                        </span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>{evt.gstin || "-"}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{evt.ipAddress || "-"}</td>
                    <td>
                      {evt.storeId && (evt.outcome === "SUCCESS" || evt.outcome === "IDEMPOTENT") ? (
                        <button
                          style={{
                            fontSize: 11,
                            padding: "3px 10px",
                            borderRadius: 4,
                            border: "1px solid #10b981",
                            background: sendingEnrollment === evt.storeId ? "#d1fae5" : "#ecfdf5",
                            color: "#059669",
                            cursor: sendingEnrollment === evt.storeId ? "wait" : "pointer",
                            fontWeight: 600,
                          }}
                          disabled={!!sendingEnrollment}
                          onClick={async () => {
                            setSendingEnrollment(evt.storeId!);
                            try {
                              const resp = await sendEnrollmentCodeToStore(evt.storeId!);
                              alert(`Enrollment code: ${resp.enrollmentCode}\nExpires: ${new Date(resp.expiresAt).toLocaleTimeString()}\nSMS: ${resp.notification.smsSent ? "Sent" : "Skipped"}\nEmail: ${resp.notification.emailSent ? "Sent" : "Skipped"}`);
                            } catch (err: any) {
                              alert(`Failed: ${err?.message || "Unknown error"}`);
                            } finally {
                              setSendingEnrollment("");
                            }
                          }}
                        >
                          {sendingEnrollment === evt.storeId ? "Sending..." : "Send Code"}
                        </button>
                      ) : (
                        <span className="muted" style={{ fontSize: 11 }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {regEvents.length === 0 && !regEventsLoading && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "#888", padding: 24 }}>
                      No registration events found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SA-P1-001: Staff Management Tab */}
      {tab === "staff" && (
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Store Staff Management</div>
            <div className="muted">Add, edit, and manage POS staff per store</div>
          </div>

          {/* Store selector */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
            <select
              value={staffStoreId}
              onChange={(e) => { setStaffStoreId(e.target.value); setStaffList([]); }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
            >
              <option value="">Select a store...</option>
              {storeDirectory.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.id.slice(0, 8)})</option>
              ))}
            </select>
            <button className="btn" onClick={() => refreshStaff()} disabled={!staffStoreId || staffLoading}>
              {staffLoading ? "Loading..." : "Load Staff"}
            </button>
            {staffStoreId && (
              <button className="btnSuccess" onClick={() => setShowAddStaff(true)}>
                + Add Staff
              </button>
            )}
          </div>

          {staffError && <div className="alertDanger" style={{ marginBottom: 12 }}>{staffError}</div>}

          {/* Add Staff Form */}
          {showAddStaff && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Add New Staff Member</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>Name</label>
                  <input
                    type="text"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="Staff name"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>Phone (10 digits)</label>
                  <input
                    type="text"
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    placeholder="9876543210"
                    maxLength={10}
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>PIN (4-6 digits)</label>
                  <input
                    type="password"
                    value={newStaffPin}
                    onChange={(e) => setNewStaffPin(e.target.value)}
                    placeholder="1234"
                    maxLength={6}
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>Role</label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as any)}
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }}
                  >
                    <option value="CASHIER">CASHIER (sell only)</option>
                    <option value="STOCK_MANAGER">STOCK_MANAGER (sell + stock-in)</option>
                    <option value="MANAGER">MANAGER (all operations)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btnSuccess" onClick={handleAddStaff} disabled={staffActionLoading === "add"}>
                  {staffActionLoading === "add" ? "Adding..." : "Add Staff"}
                </button>
                <button className="btnGhost" onClick={() => setShowAddStaff(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Staff List */}
          {staffList.length > 0 && (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Sales</th>
                    <th>Stock-Ins</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td>{s.phone}</td>
                      <td>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: s.role === "MANAGER" ? "#dbeafe" : s.role === "STOCK_MANAGER" ? "#fef3c7" : "#f1f5f9",
                          color: s.role === "MANAGER" ? "#1e40af" : s.role === "STOCK_MANAGER" ? "#92400e" : "#475569",
                        }}>
                          {s.role}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: s.is_active ? "#dcfce7" : "#fee2e2",
                          color: s.is_active ? "#166534" : "#991b1b",
                        }}>
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>{s.sales_count}</td>
                      <td>{s.stock_in_count}</td>
                      <td style={{ fontSize: 12 }}>{formatDateTime(s.created_at)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className={s.is_active ? "btnDanger btnSm" : "btnSuccess btnSm"}
                            onClick={() => handleToggleStaffActive(s.id, s.is_active)}
                            disabled={staffActionLoading === s.id}
                            style={{ fontSize: 11, padding: "2px 8px" }}
                          >
                            {s.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            className="btn btnSm"
                            onClick={() => { setResetPinStaffId(s.id); setResetPinValue(""); }}
                            disabled={staffActionLoading === s.id}
                            style={{ fontSize: 11, padding: "2px 8px" }}
                          >
                            Reset PIN
                          </button>
                        </div>
                        {resetPinStaffId === s.id && (
                          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                            <input
                              type="password"
                              value={resetPinValue}
                              onChange={(e) => setResetPinValue(e.target.value)}
                              placeholder="New PIN"
                              maxLength={6}
                              style={{ width: 80, padding: "2px 6px", borderRadius: 4, border: "1px solid #d1d5db", fontSize: 12 }}
                            />
                            <button className="btnSuccess btnSm" onClick={handleResetPin} style={{ fontSize: 11, padding: "2px 6px" }}>
                              Save
                            </button>
                            <button className="btnGhost btnSm" onClick={() => setResetPinStaffId(null)} style={{ fontSize: 11, padding: "2px 6px" }}>
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {staffStoreId && !staffLoading && staffList.length === 0 && !staffError && (
            <div className="muted" style={{ textAlign: "center", padding: 32 }}>
              No staff members found for this store. Click "Add Staff" to create one.
            </div>
          )}
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

      {/* AI Floating Button */}
      {!aiPanelOpen && (
        <button
          className={`aiPanelToggle ${aiAnswer ? "hasAnswer" : ""}`}
          onClick={() => setAiPanelOpen(true)}
          title="Open AI Assistant"
        >
          🤖
        </button>
      )}

      {/* AI Side Panel */}
      <div className={`aiPanel ${aiPanelOpen ? "open" : ""}`}>
        <div className="aiPanelHeader">
          <div className="aiPanelTitle">
            <span className="brandPill">SuperMandi</span>
            AI Copilot
          </div>
          <button className="aiPanelClose" onClick={() => setAiPanelOpen(false)} title="Close">
            ✕
          </button>
        </div>

        <div className="aiPanelBody" onClick={resetAiIdleTimer}>
          <div className="badgeRow">
            <span className={`badge ${aiConfigured ? "badgeOk" : "badgeWarn"}`}>
              {aiConfigured ? "AI configured" : "AI not configured"}
            </span>
          </div>

          <div className="aiQuickActions">
            <button
              className="aiQuickBtn"
              onClick={() => {
                setAiQuestion("Explain the last hour of POS activity. Focus on issues and anomalies.");
                resetAiIdleTimer();
              }}
            >
              📊 Explain last hour
            </button>
            <button
              className="aiQuickBtn"
              onClick={() => {
                setAiQuestion("Why did payments fail? List likely causes from events and next steps.");
                resetAiIdleTimer();
              }}
            >
              💳 Payment issues?
            </button>
            <button
              className="aiQuickBtn"
              onClick={() => {
                setAiQuestion("Summarize today: devices active, stores active, and any printer/network problems.");
                resetAiIdleTimer();
              }}
            >
              📋 Summarize today
            </button>
          </div>

          <textarea
            className="aiTextarea"
            value={aiQuestion}
            onChange={(e) => {
              setAiQuestion(e.target.value);
              resetAiIdleTimer();
            }}
            placeholder="Ask about POS activity, devices, payments..."
            rows={3}
          />

          <div className="aiActions">
            <button
              className="aiAskBtn"
              onClick={async () => {
                resetAiIdleTimer();
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
              disabled={aiLoading || !aiQuestion.trim()}
            >
              {aiLoading ? "Thinking..." : "Ask AI"}
            </button>
            <button
              className="aiClearBtn"
              onClick={() => {
                setAiQuestion("");
                setAiAnswer("");
                setAiError("");
                resetAiIdleTimer();
              }}
            >
              Clear
            </button>
            {aiError && <span className="errorText" style={{ fontSize: 12 }}>{aiError}</span>}
          </div>

          {aiAnswer && (
            <div className="aiResponse">
              <div className="aiResponseContent">{aiAnswer}</div>
            </div>
          )}
        </div>

        {aiPanelOpen && (
          <div className="aiIdleTimer">
            Auto-closes in {AI_AUTO_COLLAPSE_SECONDS - aiIdleSeconds}s of inactivity
          </div>
        )}
      </div>

      <footer className="footer muted">
        Tip: this dashboard is static-deployable. Set <span className="mono">VITE_API_BASE_URL</span> in hosting env.
        <BuildStamp />
      </footer>
    </div>
    </ErrorBoundary>
  );
}
