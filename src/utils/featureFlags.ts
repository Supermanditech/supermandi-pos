// Feature Flags Utility - UI-AUDIT-003
// Centralized feature flag checking for consistent gating

import { useSettingsStore } from "../stores/settingsStore";

/**
 * Feature flag keys available in the app.
 * Maps to settingsStore state and backend ui-status response.
 */
export type FeatureKey =
  | "buy"               // BUY tab, Purchase Orders, GRN
  | "reorder"           // REORDER tab, Reorder Settings/Policies
  | "category_browsing" // CAT-005: Category rail in SELL screen
  | "voice"             // VOICE-009: Voice assistant feature
  | "qa_menu";          // UI Showcase (QA/dev only)

/**
 * Check if a feature is enabled.
 * Uses the current settingsStore state.
 *
 * @param key - The feature key to check
 * @returns true if the feature is enabled
 *
 * @example
 * if (isFeatureEnabled("buy")) {
 *   navigation.navigate("OrderHistory");
 * }
 */
export function isFeatureEnabled(key: FeatureKey): boolean {
  const state = useSettingsStore.getState();

  switch (key) {
    case "buy":
      return state.buyEnabled;
    case "reorder":
      return state.reorderEnabled;
    case "category_browsing":
      return state.categoryBrowsingEnabled;
    case "voice":
      return state.voiceEnabled;
    case "qa_menu":
      // QA menu has its own check in UiShowcaseScreen
      return __DEV__ || Boolean(process.env.EXPO_PUBLIC_QA_ENABLED);
    default:
      return false;
  }
}

/**
 * React hook to check feature flag status.
 * Re-renders when the flag changes.
 *
 * @param key - The feature key to check
 * @returns true if the feature is enabled
 *
 * @example
 * const buyEnabled = useFeatureEnabled("buy");
 * if (!buyEnabled) return <FeatureDisabledScreen />;
 */
export function useFeatureEnabled(key: FeatureKey): boolean {
  const buyEnabled = useSettingsStore((s) => s.buyEnabled);
  const reorderEnabled = useSettingsStore((s) => s.reorderEnabled);
  const categoryBrowsingEnabled = useSettingsStore((s) => s.categoryBrowsingEnabled);
  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);

  switch (key) {
    case "buy":
      return buyEnabled;
    case "reorder":
      return reorderEnabled;
    case "category_browsing":
      return categoryBrowsingEnabled;
    case "voice":
      return voiceEnabled;
    case "qa_menu":
      return __DEV__ || Boolean(process.env.EXPO_PUBLIC_QA_ENABLED);
    default:
      return false;
  }
}

/**
 * Feature flag to screen/route mapping.
 * Used for route guarding and navigation gating.
 */
export const FEATURE_GATED_SCREENS: Record<FeatureKey, string[]> = {
  buy: [
    "OrderHistory",
    "OrderDetail",
    "GRN",
  ],
  reorder: [
    "ReorderSettings",
    "ReorderPolicies",
  ],
  category_browsing: [], // CAT-005: UI feature toggle, not route-gated
  voice: [], // VOICE-009: UI feature toggle (mic button), not route-gated
  qa_menu: [
    "UiShowcase",
  ],
};

/**
 * Get the feature flag required for a given route.
 * Returns null if the route is always accessible.
 *
 * @param routeName - The route/screen name
 * @returns The feature key required, or null if always accessible
 */
export function getRouteFeatureRequirement(routeName: string): FeatureKey | null {
  for (const [key, screens] of Object.entries(FEATURE_GATED_SCREENS)) {
    if (screens.includes(routeName)) {
      return key as FeatureKey;
    }
  }
  return null;
}

/**
 * Check if a route is accessible based on current feature flags.
 *
 * @param routeName - The route/screen name
 * @returns true if the route is accessible
 */
export function isRouteAccessible(routeName: string): boolean {
  const requirement = getRouteFeatureRequirement(routeName);
  if (!requirement) return true; // No gating required
  return isFeatureEnabled(requirement);
}
