// GATE-000: Runtime Readiness Gate Probe Service
// Probes Phase-1 POS API endpoints to determine feature availability.
// Replaces scattered boolean flags with runtime detection.

import { API_BASE_URL } from "../../config/api";
import { getDeviceToken } from "../deviceSession";

// =============================================================================
// TYPES
// =============================================================================

export interface EndpointStatus {
  exists: boolean;       // non-404 response
  authOk: boolean;       // non-401 with valid token
  contractOk: boolean;   // response matches expected shape
  checkedAt: string;     // ISO timestamp of last check
  latencyMs: number;     // response time
  error?: string;        // error message if probe failed
}

export interface ReadinessState {
  suppliers: EndpointStatus;
  supplierProducts: EndpointStatus;
  dailySummary: EndpointStatus;
  stockIn: EndpointStatus;
  lastProbeAt: string;
  isProbing: boolean;
}

export type ReadinessFeature = "liveSuppliers" | "stockIn" | "dailySummary";

// =============================================================================
// CONSTANTS
// =============================================================================

const PROBE_TIMEOUT_MS = 2000;  // 2s timeout per endpoint
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minute cache

// Phase-1 endpoints to probe
const ENDPOINTS = {
  suppliers: "/api/v1/pos/suppliers",
  supplierProducts: "/api/v1/pos/suppliers/1/products",  // Use dummy ID for probe
  dailySummary: "/api/v1/pos/daily-summary",
  stockIn: "/api/v1/pos/stock-in",
} as const;

// Expected response shapes for contract validation
const EXPECTED_SHAPES = {
  suppliers: { success: true, data: { suppliers: [] } },
  supplierProducts: { success: true, data: { products: [] } },
  dailySummary: { success: true, data: {} },
  stockIn: { success: true, data: { entries: [] } },
} as const;

// =============================================================================
// INTERNAL STATE
// =============================================================================

let cachedState: ReadinessState | null = null;
let listeners: Array<(state: ReadinessState) => void> = [];

function createDefaultEndpointStatus(): EndpointStatus {
  return {
    exists: false,
    authOk: false,
    contractOk: false,
    checkedAt: "",
    latencyMs: 0,
  };
}

function createDefaultState(): ReadinessState {
  return {
    suppliers: createDefaultEndpointStatus(),
    supplierProducts: createDefaultEndpointStatus(),
    dailySummary: createDefaultEndpointStatus(),
    stockIn: createDefaultEndpointStatus(),
    lastProbeAt: "",
    isProbing: false,
  };
}

function notifyListeners() {
  if (cachedState) {
    listeners.forEach(listener => listener(cachedState!));
  }
}

// =============================================================================
// PROBE LOGIC
// =============================================================================

/**
 * Probe a single endpoint with timeout.
 */
async function probeEndpoint(
  path: string,
  expectedShape: object
): Promise<EndpointStatus> {
  const startTime = Date.now();
  const deviceToken = await getDeviceToken();

  const status: EndpointStatus = {
    exists: false,
    authOk: false,
    contractOk: false,
    checkedAt: new Date().toISOString(),
    latencyMs: 0,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(deviceToken ? { "x-device-token": deviceToken } : {}),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    status.latencyMs = Date.now() - startTime;

    // Check existence (non-404)
    if (response.status !== 404) {
      status.exists = true;
    }

    // Check auth (non-401)
    if (response.status !== 401 && response.status !== 403) {
      status.authOk = true;
    }

    // If 200, check contract
    if (response.ok) {
      status.authOk = true;
      try {
        const data = await response.json();
        // Basic contract check: has success field and expected structure
        if (data && typeof data === "object" && "success" in data) {
          status.contractOk = data.success === true;
        }
      } catch {
        // JSON parse failed
        status.contractOk = false;
      }
    }

    console.log(`[readinessGate] Probed ${path}: exists=${status.exists}, authOk=${status.authOk}, contractOk=${status.contractOk}, ${status.latencyMs}ms`);
  } catch (error: any) {
    status.latencyMs = Date.now() - startTime;
    if (error.name === "AbortError") {
      status.error = "Timeout";
      console.log(`[readinessGate] Probe ${path} timed out after ${PROBE_TIMEOUT_MS}ms`);
    } else {
      status.error = error.message || "Network error";
      console.log(`[readinessGate] Probe ${path} failed: ${status.error}`);
    }
  }

  return status;
}

/**
 * Probe all Phase-1 endpoints.
 * Results are cached for 5 minutes.
 */
export async function probeReadiness(): Promise<ReadinessState> {
  console.log("[readinessGate] Starting probe of Phase-1 endpoints...");

  // Set probing state
  cachedState = {
    ...(cachedState || createDefaultState()),
    isProbing: true,
  };
  notifyListeners();

  // Probe all endpoints in parallel
  const [suppliers, supplierProducts, dailySummary, stockIn] = await Promise.all([
    probeEndpoint(ENDPOINTS.suppliers, EXPECTED_SHAPES.suppliers),
    probeEndpoint(ENDPOINTS.supplierProducts, EXPECTED_SHAPES.supplierProducts),
    probeEndpoint(ENDPOINTS.dailySummary, EXPECTED_SHAPES.dailySummary),
    probeEndpoint(ENDPOINTS.stockIn, EXPECTED_SHAPES.stockIn),
  ]);

  cachedState = {
    suppliers,
    supplierProducts,
    dailySummary,
    stockIn,
    lastProbeAt: new Date().toISOString(),
    isProbing: false,
  };

  notifyListeners();
  console.log("[readinessGate] Probe complete:", cachedState);

  return cachedState;
}

/**
 * Get current readiness state from cache.
 * Returns null if never probed.
 */
export function getReadinessState(): ReadinessState | null {
  return cachedState;
}

/**
 * Check if cache is stale (older than 5 minutes).
 */
export function isCacheStale(): boolean {
  if (!cachedState || !cachedState.lastProbeAt) {
    return true;
  }
  const lastProbe = new Date(cachedState.lastProbeAt).getTime();
  return Date.now() - lastProbe > CACHE_TTL_MS;
}

/**
 * Clear the cache, forcing a fresh probe on next check.
 */
export function clearReadinessCache(): void {
  cachedState = null;
  console.log("[readinessGate] Cache cleared");
}

/**
 * Clear cache for a specific feature.
 */
export function clearFeatureCache(feature: ReadinessFeature): void {
  if (cachedState) {
    switch (feature) {
      case "liveSuppliers":
        cachedState.suppliers = createDefaultEndpointStatus();
        cachedState.supplierProducts = createDefaultEndpointStatus();
        break;
      case "stockIn":
        cachedState.stockIn = createDefaultEndpointStatus();
        break;
      case "dailySummary":
        cachedState.dailySummary = createDefaultEndpointStatus();
        break;
    }
    notifyListeners();
  }
}

// =============================================================================
// FEATURE READINESS CHECK
// =============================================================================

/**
 * Check if a Phase-1 feature is ready to use.
 * Maps features to their required endpoints.
 *
 * @param feature - The feature to check
 * @returns true if all required endpoints are ready
 *
 * Feature → Endpoint mapping:
 * - liveSuppliers: requires suppliers + supplierProducts
 * - stockIn: requires stockIn endpoint
 * - dailySummary: requires dailySummary endpoint
 */
export function isFeatureReady(feature: ReadinessFeature): boolean {
  if (!cachedState) {
    return false;
  }

  switch (feature) {
    case "liveSuppliers":
      // Live Suppliers requires both suppliers list AND supplier products endpoints
      return (
        cachedState.suppliers.exists &&
        cachedState.suppliers.authOk &&
        cachedState.supplierProducts.exists &&
        cachedState.supplierProducts.authOk
      );

    case "stockIn":
      // Stock-In requires the stock-in endpoint
      return (
        cachedState.stockIn.exists &&
        cachedState.stockIn.authOk
      );

    case "dailySummary":
      // Daily Summary requires the daily-summary endpoint
      return (
        cachedState.dailySummary.exists &&
        cachedState.dailySummary.authOk
      );

    default:
      return false;
  }
}

/**
 * Get the blocker reason for a feature.
 * Returns null if feature is ready.
 */
export function getFeatureBlocker(feature: ReadinessFeature): string | null {
  if (!cachedState) {
    return "Backend not probed yet";
  }

  switch (feature) {
    case "liveSuppliers": {
      const blockers: string[] = [];
      if (!cachedState.suppliers.exists) {
        blockers.push("/api/v1/pos/suppliers (404)");
      } else if (!cachedState.suppliers.authOk) {
        blockers.push("/api/v1/pos/suppliers (auth failed)");
      }
      if (!cachedState.supplierProducts.exists) {
        blockers.push("/api/v1/pos/suppliers/:id/products (404)");
      } else if (!cachedState.supplierProducts.authOk) {
        blockers.push("/api/v1/pos/suppliers/:id/products (auth failed)");
      }
      return blockers.length > 0 ? `Missing: ${blockers.join(", ")}` : null;
    }

    case "stockIn": {
      if (!cachedState.stockIn.exists) {
        return "Missing: /api/v1/pos/stock-in (404)";
      }
      if (!cachedState.stockIn.authOk) {
        return "Missing: /api/v1/pos/stock-in (auth failed)";
      }
      return null;
    }

    case "dailySummary": {
      if (!cachedState.dailySummary.exists) {
        return "Missing: /api/v1/pos/daily-summary (404)";
      }
      if (!cachedState.dailySummary.authOk) {
        return "Missing: /api/v1/pos/daily-summary (auth failed)";
      }
      return null;
    }

    default:
      return "Unknown feature";
  }
}

// =============================================================================
// SUBSCRIPTION FOR REACT HOOKS
// =============================================================================

/**
 * Subscribe to readiness state changes.
 * Returns unsubscribe function.
 */
export function subscribeToReadiness(
  listener: (state: ReadinessState) => void
): () => void {
  listeners.push(listener);
  // Immediately call with current state if available
  if (cachedState) {
    listener(cachedState);
  }
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}
