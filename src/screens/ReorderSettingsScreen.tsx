// ReorderSettingsScreen - V3.0.9 compliant
// Reorder settings management with toggles and policies link

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../theme";
import * as reorderApi from "../services/api/reorderApi";
import type { ReorderSettings } from "../services/api/reorderApi";
import { getDeviceStoreId } from "../services/deviceSession";

// =============================================================================
// TYPES
// =============================================================================

export interface ReorderSettingsScreenProps {
  onNavigateToPolicies?: () => void;
  onBack?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ReorderSettingsScreen({
  onNavigateToPolicies,
  onBack,
}: ReorderSettingsScreenProps) {
  const insets = useSafeAreaInsets();

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReorderSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load store ID on mount
  useEffect(() => {
    getDeviceStoreId().then(setStoreId);
  }, []);

  // Load settings
  const loadSettings = useCallback(async () => {
    if (!storeId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await reorderApi.getReorderSettings(storeId);
      setSettings(data);
    } catch (err) {
      console.error("[ReorderSettingsScreen] Failed to load settings:", err);
      setError("Failed to load reorder settings");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  // Initial load
  useEffect(() => {
    if (storeId) {
      loadSettings();
    }
  }, [storeId, loadSettings]);

  // Toggle reorder enabled
  const handleToggleReorderEnabled = useCallback(
    async (value: boolean) => {
      if (!storeId || !settings || saving) return;

      // Optimistic update
      setSettings((prev) => (prev ? { ...prev, reorderEnabled: value } : prev));
      setSaving(true);

      try {
        const updated = await reorderApi.updateReorderSettings(storeId, {
          reorderEnabled: value,
        });
        setSettings(updated);
      } catch (err) {
        console.error("[ReorderSettingsScreen] Failed to update:", err);
        // Revert on error
        setSettings((prev) =>
          prev ? { ...prev, reorderEnabled: !value } : prev
        );
        Alert.alert("Error", "Failed to update setting. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [storeId, settings, saving]
  );

  // Toggle require approval
  const handleToggleRequireApproval = useCallback(
    async (value: boolean) => {
      if (!storeId || !settings || saving) return;

      // Optimistic update
      setSettings((prev) =>
        prev ? { ...prev, requireApproval: value } : prev
      );
      setSaving(true);

      try {
        const updated = await reorderApi.updateReorderSettings(storeId, {
          requireApproval: value,
        });
        setSettings(updated);
      } catch (err) {
        console.error("[ReorderSettingsScreen] Failed to update:", err);
        // Revert on error
        setSettings((prev) =>
          prev ? { ...prev, requireApproval: !value } : prev
        );
        Alert.alert("Error", "Failed to update setting. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [storeId, settings, saving]
  );

  // Render loading state
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {onBack && (
            <Pressable style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={theme.colors.textPrimary}
              />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>Reorder Settings</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </View>
    );
  }

  // Render error state
  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {onBack && (
            <Pressable style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={theme.colors.textPrimary}
              />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>Reorder Settings</Text>
        </View>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={theme.colors.error}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={loadSettings}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>Reorder Settings</Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>

          {/* Reorder Enabled Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <MaterialCommunityIcons
                  name="autorenew"
                  size={22}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Auto Reorder</Text>
                <Text style={styles.settingDescription}>
                  Automatically detect low stock items and create reorder suggestions
                </Text>
              </View>
            </View>
            <Switch
              value={settings?.reorderEnabled ?? false}
              onValueChange={handleToggleReorderEnabled}
              trackColor={{
                false: theme.colors.borderDark,
                true: theme.colors.primaryLight,
              }}
              thumbColor={
                settings?.reorderEnabled
                  ? theme.colors.primary
                  : theme.colors.surface
              }
              disabled={saving}
            />
          </View>

          {/* Require Approval Toggle */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <MaterialCommunityIcons
                  name="check-decagram"
                  size={22}
                  color={theme.colors.accent}
                />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Require Approval</Text>
                <Text style={styles.settingDescription}>
                  Reorder suggestions need manual approval before creating purchase orders
                </Text>
              </View>
            </View>
            <Switch
              value={settings?.requireApproval ?? true}
              onValueChange={handleToggleRequireApproval}
              trackColor={{
                false: theme.colors.borderDark,
                true: theme.colors.accentLight,
              }}
              thumbColor={
                settings?.requireApproval
                  ? theme.colors.accent
                  : theme.colors.surface
              }
              disabled={saving || !settings?.reorderEnabled}
            />
          </View>

          {/* Info box when require approval is off */}
          {settings?.reorderEnabled && !settings?.requireApproval && (
            <View style={styles.infoBox}>
              <MaterialCommunityIcons
                name="information"
                size={18}
                color={theme.colors.warning}
              />
              <Text style={styles.infoText}>
                With approval disabled, reorder suggestions will automatically create draft purchase orders.
              </Text>
            </View>
          )}
        </View>

        {/* Policies Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product Policies</Text>

          <Pressable
            style={styles.linkRow}
            onPress={onNavigateToPolicies}
          >
            <View style={styles.linkInfo}>
              <View style={styles.settingIconContainer}>
                <MaterialCommunityIcons
                  name="format-list-bulleted"
                  size={22}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Reorder Policies</Text>
                <Text style={styles.settingDescription}>
                  Set minimum stock levels and target quantities for each product
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={theme.colors.textTertiary}
            />
          </Pressable>
        </View>

        {/* Additional Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advanced</Text>

          {/* Default Lead Days */}
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <View style={styles.settingIconContainer}>
                <MaterialCommunityIcons
                  name="truck-delivery"
                  size={22}
                  color={theme.colors.textSecondary}
                />
              </View>
              <View style={styles.settingTextContainer}>
                <Text style={styles.settingLabel}>Default Lead Time</Text>
                <Text style={styles.settingDescription}>
                  Days to account for delivery when calculating reorder timing
                </Text>
              </View>
            </View>
            <View style={styles.valueContainer}>
              <Text style={styles.valueText}>
                {settings?.defaultLeadDays ?? 3} days
              </Text>
            </View>
          </View>

          {/* Auto Approve Threshold */}
          {settings?.autoApproveThreshold !== null && (
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <View style={styles.settingIconContainer}>
                  <MaterialCommunityIcons
                    name="currency-inr"
                    size={22}
                    color={theme.colors.textSecondary}
                  />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingLabel}>Auto-Approve Threshold</Text>
                  <Text style={styles.settingDescription}>
                    Orders below this amount are auto-approved
                  </Text>
                </View>
              </View>
              <View style={styles.valueContainer}>
                <Text style={styles.valueText}>
                  {settings?.autoApproveThreshold}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Status Footer */}
        {settings && (
          <View style={styles.statusFooter}>
            <Text style={styles.statusText}>
              {settings.reorderEnabled ? (
                <>
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={14}
                    color={theme.colors.success}
                  />{" "}
                  Auto-reorder is enabled
                </>
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="pause-circle"
                    size={14}
                    color={theme.colors.textTertiary}
                  />{" "}
                  Auto-reorder is disabled
                </>
              )}
            </Text>
          </View>
        )}
      </ScrollView>
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
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: "center",
    marginTop: theme.spacing.md,
  },
  retryButton: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  section: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  settingInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  settingIconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.md,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    lineHeight: 16,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  linkInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: theme.spacing.sm,
  },
  valueContainer: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
  },
  valueText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.colors.warningSoft,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.warning,
    lineHeight: 16,
  },
  statusFooter: {
    alignItems: "center",
    paddingVertical: theme.spacing.lg,
  },
  statusText: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
});
