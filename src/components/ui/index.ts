/**
 * UI Components Index - GO-LIVE-TR-002
 *
 * Common UI components with built-in i18n support and safe text handling.
 */

export { AppText, ButtonText, LabelText, PriceText } from "./AppText";
export type { AppTextVariant } from "./AppText";

// T-117: Per-screen error boundary for isolated crash recovery
export { default as ScreenErrorBoundary } from "./ScreenErrorBoundary";

// GL-CRIT-0083, GL-CRIT-0084, GL-CRIT-0085: Unified loading states
export {
  LoadingState,
  Skeleton,
  SkeletonList,
  SkeletonGrid,
  useLoadingCoordinator,
} from "./LoadingState";
export type {
  LoadingStateProps,
  SkeletonProps,
  SkeletonListProps,
  LoadingCoordinatorState,
} from "./LoadingState";
