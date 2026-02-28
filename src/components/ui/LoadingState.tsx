/**
 * GL-CRIT-0083, GL-CRIT-0084, GL-CRIT-0085: Unified Loading States
 * STG-275: Converted to useThemeColors() for dark mode support
 *
 * Provides consistent loading UX across the app:
 * - LoadingState: Full-screen or inline loading indicator
 * - SkeletonLoader: Content placeholder with shimmer effect
 * - useLoadingCoordinator: Coordinates multiple async operations
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";

import { useThemeColors } from "../../theme";

// =============================================================================
// TYPES
// =============================================================================

export interface LoadingStateProps {
  /** Whether loading is active */
  loading: boolean;
  /** Loading message to display */
  message?: string;
  /** Size of the loading indicator */
  size?: "small" | "large";
  /** Full screen overlay vs inline */
  fullScreen?: boolean;
  /** Custom styles */
  style?: ViewStyle;
  /** Minimum display time in ms to prevent flash (GL-CRIT-0086) */
  minDisplayMs?: number;
}

export interface SkeletonProps {
  /** Width of skeleton (number or percentage string) */
  width?: number | string;
  /** Height of skeleton */
  height?: number;
  /** Border radius */
  borderRadius?: number;
  /** Custom styles */
  style?: ViewStyle;
}

export interface SkeletonListProps {
  /** Number of skeleton items to show */
  count?: number;
  /** Height of each item */
  itemHeight?: number;
  /** Spacing between items */
  spacing?: number;
  /** Show thumbnail placeholder */
  showThumbnail?: boolean;
}

export interface LoadingCoordinatorState {
  /** Overall loading state - true if any operation is loading */
  isLoading: boolean;
  /** Map of individual loading states */
  states: Record<string, boolean>;
  /** Error from any operation */
  error: string | null;
}

// =============================================================================
// LOADING STATE COMPONENT
// =============================================================================

/**
 * Unified loading indicator with minimum display time support.
 */
export function LoadingState({
  loading,
  message,
  size = "large",
  fullScreen = false,
  style,
  minDisplayMs = 0,
}: LoadingStateProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [shouldShow, setShouldShow] = useState(loading);
  const loadStartRef = useRef<number>(0);

  useEffect(() => {
    if (loading) {
      // Start loading
      loadStartRef.current = Date.now();
      setShouldShow(true);
    } else if (shouldShow && minDisplayMs > 0) {
      // End loading with minimum display time
      const elapsed = Date.now() - loadStartRef.current;
      const remaining = minDisplayMs - elapsed;

      if (remaining > 0) {
        const timer = setTimeout(() => setShouldShow(false), remaining);
        return () => clearTimeout(timer);
      } else {
        setShouldShow(false);
      }
    } else {
      setShouldShow(false);
    }
  }, [loading, minDisplayMs, shouldShow]);

  if (!shouldShow) return null;

  const displayMessage = message || t("common.loading", "Loading...");

  if (fullScreen) {
    return (
      <View style={[styles.fullScreenContainer, style]}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size={size} color={colors.primary} />
          <Text style={styles.loadingText}>{displayMessage}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.inlineContainer, style]}>
      <ActivityIndicator size={size} color={colors.primary} />
      {message !== "" && <Text style={styles.loadingText}>{displayMessage}</Text>}
    </View>
  );
}

// =============================================================================
// SKELETON LOADER COMPONENT
// =============================================================================

/**
 * Skeleton placeholder with shimmer animation effect.
 */
export function Skeleton({
  width = "100%",
  height = 20,
  borderRadius = 4,
  style,
}: SkeletonProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const opacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width as number | `${number}%`,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * GL-CRIT-0085: Skeleton list for SalesHistory and similar screens.
 */
export function SkeletonList({
  count = 5,
  itemHeight = 72,
  spacing = 8,
  showThumbnail = false,
}: SkeletonListProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.skeletonItem,
            { height: itemHeight, marginBottom: spacing },
          ]}
        >
          {showThumbnail && (
            <Skeleton width={48} height={48} borderRadius={8} style={styles.skeletonThumbnail} />
          )}
          <View style={styles.skeletonContent}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="40%" height={12} style={styles.skeletonSubtitle} />
          </View>
          <Skeleton width={60} height={20} />
        </View>
      ))}
    </View>
  );
}

/**
 * GL-CRIT-0084: Skeleton grid for BuyScreen catalog.
 */
export function SkeletonGrid({ count = 6 }: { count?: number }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.skeletonGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.skeletonGridItem}>
          <Skeleton width="100%" height={120} borderRadius={8} />
          <Skeleton width="80%" height={14} style={styles.skeletonGridTitle} />
          <Skeleton width="50%" height={12} />
        </View>
      ))}
    </View>
  );
}

// =============================================================================
// LOADING COORDINATOR HOOK
// =============================================================================

/**
 * GL-CRIT-0083: Coordinates multiple loading states into a single unified state.
 *
 * Usage:
 * ```tsx
 * const { isLoading, setLoading, error, setError } = useLoadingCoordinator([
 *   'products',
 *   'categories',
 *   'stock'
 * ]);
 *
 * // In your effects:
 * setLoading('products', true);
 * try {
 *   await loadProducts();
 * } finally {
 *   setLoading('products', false);
 * }
 *
 * // isLoading is true if ANY of the operations are loading
 * ```
 */
export function useLoadingCoordinator(
  keys: string[]
): {
  isLoading: boolean;
  states: Record<string, boolean>;
  error: string | null;
  setLoading: (key: string, loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
} {
  const initialStates = keys.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as Record<string, boolean>);

  const [states, setStates] = useState<Record<string, boolean>>(initialStates);
  const [error, setErrorState] = useState<string | null>(null);

  const setLoading = useCallback((key: string, loading: boolean) => {
    setStates((prev) => ({ ...prev, [key]: loading }));
  }, []);

  const setError = useCallback((err: string | null) => {
    setErrorState(err);
  }, []);

  const reset = useCallback(() => {
    setStates(initialStates);
    setErrorState(null);
  }, [initialStates]);

  const isLoading = Object.values(states).some(Boolean);

  return {
    isLoading,
    states,
    error,
    setLoading,
    setError,
    reset,
  };
}

// =============================================================================
// STYLES
// =============================================================================

function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  fullScreenContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  loadingCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    minWidth: 150,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  inlineContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  skeleton: {
    backgroundColor: colors.border,
  },
  skeletonList: {
    padding: 16,
  },
  skeletonItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
  },
  skeletonThumbnail: {
    marginRight: 12,
  },
  skeletonContent: {
    flex: 1,
    marginRight: 12,
  },
  skeletonSubtitle: {
    marginTop: 8,
  },
  skeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
  },
  skeletonGridItem: {
    width: "50%",
    padding: 8,
  },
  skeletonGridTitle: {
    marginTop: 8,
    marginBottom: 4,
  },
}); }

export default LoadingState;
