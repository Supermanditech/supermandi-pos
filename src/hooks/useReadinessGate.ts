// GATE-000: React Hook for ReadinessGate
// Provides reactive access to endpoint readiness state.

import { useEffect, useState, useCallback } from "react";
import {
  probeReadiness,
  getReadinessState,
  isCacheStale,
  isFeatureReady,
  getFeatureBlocker,
  clearFeatureCache,
  subscribeToReadiness,
  type ReadinessState,
  type ReadinessFeature,
} from "../services/api/readinessGate";

// =============================================================================
// MAIN HOOK
// =============================================================================

/**
 * Hook to access the full ReadinessGate state.
 * Automatically probes on mount if cache is stale.
 *
 * @example
 * const { state, isProbing, refresh } = useReadinessGate();
 * if (state?.suppliers.exists) {
 *   // Suppliers API is available
 * }
 */
export function useReadinessGate() {
  const [state, setState] = useState<ReadinessState | null>(getReadinessState);
  const [isProbing, setIsProbing] = useState(false);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = subscribeToReadiness((newState) => {
      setState(newState);
      setIsProbing(newState.isProbing);
    });

    // Probe if cache is stale
    if (isCacheStale()) {
      void probeReadiness();
    }

    return unsubscribe;
  }, []);

  const refresh = useCallback(async () => {
    setIsProbing(true);
    await probeReadiness();
    setIsProbing(false);
  }, []);

  return {
    state,
    isProbing,
    refresh,
    isCacheStale: isCacheStale(),
  };
}

// =============================================================================
// FEATURE-SPECIFIC HOOK
// =============================================================================

/**
 * Hook to check if a specific feature is ready.
 * Returns readiness status and blocker reason.
 *
 * @example
 * const { isReady, blocker, retry, isChecking } = useFeatureReadiness("liveSuppliers");
 * if (!isReady) {
 *   return <FeatureBlockedView reason={blocker} onRetry={retry} />;
 * }
 */
export function useFeatureReadiness(feature: ReadinessFeature) {
  const { state, isProbing, refresh } = useReadinessGate();

  const isReady = isFeatureReady(feature);
  const blocker = getFeatureBlocker(feature);

  const retry = useCallback(async () => {
    clearFeatureCache(feature);
    await refresh();
  }, [feature, refresh]);

  return {
    isReady,
    blocker,
    isChecking: isProbing,
    retry,
    state,
  };
}

// =============================================================================
// PROBE ON FOCUS HOOK
// =============================================================================

/**
 * Hook that triggers a readiness probe when screen/tab is focused.
 * Use this on screens that depend on API readiness.
 *
 * @example
 * // In PurchaseScreen
 * useProbeOnFocus();
 */
export function useProbeOnFocus(enabled = true) {
  useEffect(() => {
    if (enabled && isCacheStale()) {
      void probeReadiness();
    }
  }, [enabled]);
}

// =============================================================================
// RE-EXPORTS FOR CONVENIENCE
// =============================================================================

export {
  probeReadiness,
  isFeatureReady,
  getFeatureBlocker,
  clearFeatureCache,
  type ReadinessState,
  type ReadinessFeature,
} from "../services/api/readinessGate";
