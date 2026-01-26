// FeatureGate - UI-AUDIT-003
// Guard component for feature-gated screens

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../theme";
import { useFeatureEnabled, type FeatureKey } from "../utils/featureFlags";

// =============================================================================
// TYPES
// =============================================================================

export interface FeatureGateProps {
  /**
   * The feature key required to access this content.
   */
  feature: FeatureKey;

  /**
   * The content to render when the feature is enabled.
   */
  children: React.ReactNode;

  /**
   * Optional callback when back button is pressed.
   * If not provided, the back button won't be shown.
   */
  onBack?: () => void;

  /**
   * Optional custom message when the feature is disabled.
   */
  disabledMessage?: string;

  /**
   * Optional custom title for the disabled state.
   */
  disabledTitle?: string;
}

// =============================================================================
// FEATURE DISPLAY NAMES
// =============================================================================

const FEATURE_DISPLAY_NAMES: Record<FeatureKey, { title: string; description: string }> = {
  buy: {
    title: "Purchasing",
    description: "Purchase orders and goods receiving features are not enabled for this store.",
  },
  reorder: {
    title: "Auto-Reorder",
    description: "Automatic reorder suggestions are not enabled for this store.",
  },
  category_browsing: {
    title: "Category Browsing",
    description: "Category browsing in the SELL screen is not enabled for this store.",
  },
  voice: {
    title: "Voice Assistant",
    description: "Voice assistant features are not enabled for this store.",
  },
  qa_menu: {
    title: "QA Tools",
    description: "Developer/QA features are only available in development builds.",
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * FeatureGate - Wraps content that requires a specific feature flag.
 *
 * When the feature is disabled, shows a friendly "Feature Disabled" screen
 * instead of the gated content. This prevents accidental access via deep links
 * or direct navigation.
 *
 * @example
 * <FeatureGate feature="buy" onBack={navigation.goBack}>
 *   <OrderHistoryScreen {...props} />
 * </FeatureGate>
 *
 * @example
 * // In a wrapper component:
 * function OrderHistoryWrapper() {
 *   const navigation = useNavigation();
 *   return (
 *     <FeatureGate feature="buy" onBack={() => navigation.goBack()}>
 *       <OrderHistoryScreen onSelectOrder={...} onBack={...} />
 *     </FeatureGate>
 *   );
 * }
 */
export function FeatureGate({
  feature,
  children,
  onBack,
  disabledMessage,
  disabledTitle,
}: FeatureGateProps) {
  const isEnabled = useFeatureEnabled(feature);

  if (isEnabled) {
    return <>{children}</>;
  }

  return (
    <FeatureDisabledScreen
      feature={feature}
      onBack={onBack}
      customTitle={disabledTitle}
      customMessage={disabledMessage}
    />
  );
}

// =============================================================================
// DISABLED SCREEN COMPONENT
// =============================================================================

interface FeatureDisabledScreenProps {
  feature: FeatureKey;
  onBack?: () => void;
  customTitle?: string;
  customMessage?: string;
}

/**
 * FeatureDisabledScreen - Shows when a feature is not available.
 * Can be used standalone or via the FeatureGate wrapper.
 */
export function FeatureDisabledScreen({
  feature,
  onBack,
  customTitle,
  customMessage,
}: FeatureDisabledScreenProps) {
  const insets = useSafeAreaInsets();
  const featureInfo = FEATURE_DISPLAY_NAMES[feature];

  const title = customTitle ?? `${featureInfo.title} Not Available`;
  const message = customMessage ?? featureInfo.description;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      {onBack && (
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
          <Text style={styles.headerTitle}>Feature Disabled</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons
            name="lock-outline"
            size={64}
            color={theme.colors.textTertiary}
          />
        </View>

        <Text style={styles.title}>{title}</Text>

        <Text style={styles.message}>{message}</Text>

        <View style={styles.infoBox}>
          <MaterialCommunityIcons
            name="information-outline"
            size={18}
            color={theme.colors.primary}
          />
          <Text style={styles.infoText}>
            Contact support to enable this feature for your store.
          </Text>
        </View>

        {onBack && (
          <Pressable style={styles.backButtonLarge} onPress={onBack}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    marginRight: theme.spacing.sm,
    padding: theme.spacing.xs,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.colors.surfaceAlt,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    maxWidth: 300,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  backButtonLarge: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
});

export default FeatureGate;
