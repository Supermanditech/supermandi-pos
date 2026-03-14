// ReorderPoliciesScreen - V3.0.9 compliant
// List and manage reorder policies for all products

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { theme, useThemeColors } from "../theme";
import { PolicyRow } from "../components/reorder/PolicyRow";
import { EditPolicyModal } from "../components/reorder/EditPolicyModal";
import * as reorderApi from "../services/api/reorderApi";
import type { ReorderPolicy, UpdatePolicyRequest, BulkUpdatePoliciesRequest } from "../services/api/reorderApi";
import { getDeviceStoreId } from "../services/deviceSession";

// =============================================================================
// TYPES
// =============================================================================

export interface ReorderPoliciesScreenProps {
  onBack?: () => void;
}

type FilterOption = "all" | "enabled" | "disabled" | "low_stock";

// =============================================================================
// COMPONENT
// =============================================================================

export default function ReorderPoliciesScreen({
  onBack,
}: ReorderPoliciesScreenProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [policies, setPolicies] = useState<ReorderPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterOption>("all");

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<ReorderPolicy | null>(null);

  // STG-440: Bulk selection state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Load store ID on mount
  useEffect(() => {
    getDeviceStoreId().then(setStoreId);
  }, []);

  // Load policies
  const loadPolicies = useCallback(
    async (showLoading = true) => {
      if (!storeId) return;

      if (showLoading) setLoading(true);
      setError(null);

      try {
        const response = await reorderApi.listReorderPolicies(storeId, {
          limit: 200,
        });
        setPolicies(response.data);
      } catch (err) {
        if (__DEV__) console.error("[ReorderPoliciesScreen] Failed to load policies:", err);
        setError(t("reorderPolicy.loadFailed"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [storeId]
  );

  // Initial load
  useEffect(() => {
    if (storeId) {
      loadPolicies();
    }
  }, [storeId, loadPolicies]);

  // Pull to refresh
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadPolicies(false);
  }, [loadPolicies]);

  // Filter policies
  const filteredPolicies = useMemo(() => {
    let result = policies;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.productName.toLowerCase().includes(query) ||
          (p.barcode && p.barcode.toLowerCase().includes(query))
      );
    }

    // Apply status filter
    switch (filter) {
      case "enabled":
        result = result.filter((p) => p.isEnabled);
        break;
      case "disabled":
        result = result.filter((p) => !p.isEnabled);
        break;
      case "low_stock":
        result = result.filter((p) => p.currentStock < p.minThreshold);
        break;
    }

    return result;
  }, [policies, searchQuery, filter]);

  // Stats
  const stats = useMemo(() => {
    const enabled = policies.filter((p) => p.isEnabled).length;
    const lowStock = policies.filter((p) => p.currentStock < p.minThreshold).length;
    return { total: policies.length, enabled, lowStock };
  }, [policies]);

  // Open edit modal
  const handleEdit = useCallback((policy: ReorderPolicy) => {
    setEditingPolicy(policy);
    setEditModalVisible(true);
  }, []);

  // Close edit modal
  const handleCloseEdit = useCallback(() => {
    setEditModalVisible(false);
    setEditingPolicy(null);
  }, []);

  // Save policy changes
  const handleSavePolicy = useCallback(
    async (productId: string, updates: UpdatePolicyRequest) => {
      if (!storeId) return;

      const updated = await reorderApi.updateReorderPolicy(storeId, productId, updates);

      // Update local state
      setPolicies((prev) =>
        prev.map((p) => (p.productId === productId ? updated : p))
      );
    },
    [storeId]
  );

  // Toggle policy enabled
  const handleToggleEnabled = useCallback(
    async (policy: ReorderPolicy, enabled: boolean) => {
      if (!storeId) return;

      // Optimistic update
      setPolicies((prev) =>
        prev.map((p) => (p.id === policy.id ? { ...p, isEnabled: enabled } : p))
      );

      try {
        await reorderApi.updateReorderPolicy(storeId, policy.productId, {
          isEnabled: enabled,
        });
      } catch (err) {
        if (__DEV__) console.error("[ReorderPoliciesScreen] Failed to toggle:", err);
        // Revert on error
        setPolicies((prev) =>
          prev.map((p) => (p.id === policy.id ? { ...p, isEnabled: !enabled } : p))
        );
        Alert.alert(t("common.error"), t("reorderPolicy.updateFailed"));
      }
    },
    [storeId]
  );

  // STG-440: Bulk selection handlers
  const handleToggleBulkMode = useCallback(() => {
    setBulkMode((prev) => {
      if (prev) setSelectedPolicyIds(new Set());
      return !prev;
    });
  }, []);

  const handleTogglePolicySelect = useCallback((policyId: string) => {
    setSelectedPolicyIds((prev) => {
      const next = new Set(prev);
      if (next.has(policyId)) {
        next.delete(policyId);
      } else {
        next.add(policyId);
      }
      return next;
    });
  }, []);

  const handleSelectAllFiltered = useCallback(() => {
    setSelectedPolicyIds(new Set(filteredPolicies.map((p) => p.id)));
  }, [filteredPolicies]);

  const handleDeselectAllBulk = useCallback(() => {
    setSelectedPolicyIds(new Set());
  }, []);

  // STG-440: Bulk enable/disable
  const handleBulkToggleEnabled = useCallback(
    async (enabled: boolean) => {
      if (!storeId || selectedPolicyIds.size === 0) return;

      setBulkUpdating(true);
      try {
        const selectedPolicies = policies.filter((p) => selectedPolicyIds.has(p.id));
        const request: BulkUpdatePoliciesRequest = {
          policies: selectedPolicies.map((p) => ({
            productId: p.productId,
            isEnabled: enabled,
          })),
        };
        const result = await reorderApi.bulkUpdatePolicies(storeId, request);
        // Update local state
        const updatedMap = new Map(result.data.policies.map((p) => [p.productId, p]));
        setPolicies((prev) =>
          prev.map((p) => updatedMap.get(p.productId) ?? p)
        );
        setSelectedPolicyIds(new Set());
        setBulkMode(false);
        Alert.alert(
          t("reorderPolicy.bulkUpdateSuccess"),
          t("reorderPolicy.bulkUpdateMessage", { count: result.data.updatedCount })
        );
      } catch (err) {
        if (__DEV__) console.error("[ReorderPoliciesScreen] Bulk update failed:", err);
        Alert.alert(t("common.error"), t("reorderPolicy.bulkUpdateFailed"));
      } finally {
        setBulkUpdating(false);
      }
    },
    [storeId, selectedPolicyIds, policies, t]
  );

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: ReorderPolicy }) => (
      <PolicyRow
        policy={item}
        onEdit={bulkMode ? undefined as any : handleEdit}
        onToggleEnabled={handleToggleEnabled}
        disabled={bulkMode}
        selected={bulkMode ? selectedPolicyIds.has(item.id) : undefined}
        onToggleSelect={bulkMode ? () => handleTogglePolicySelect(item.id) : undefined}
      />
    ),
    [handleEdit, handleToggleEnabled, bulkMode, selectedPolicyIds, handleTogglePolicySelect]
  );

  // Key extractor
  const keyExtractor = useCallback((item: ReorderPolicy) => item.id, []);

  // Styles
  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      marginRight: theme.spacing.sm,
      padding: theme.spacing.xs,
    },
    headerText: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    searchContainer: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.backgroundSecondary,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      gap: theme.spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      paddingVertical: theme.spacing.xs,
    },
    filterContainer: {
      flexDirection: "row",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: theme.spacing.sm,
    },
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.md,
    },
    loadingText: {
      fontSize: 14,
      color: colors.textTertiary,
    },
    listContent: {
      flexGrow: 1,
    },
    emptyContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.xxxl,
      paddingHorizontal: theme.spacing.xl,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.textPrimary,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: "center",
    },
    retryButton: {
      marginTop: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.md,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
    bulkModeButton: {
      padding: theme.spacing.xs,
      borderRadius: theme.borderRadius.md,
      marginLeft: theme.spacing.sm,
    },
    bulkModeButtonActive: {
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.full,
    },
    bulkActionBar: {
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    bulkSelectRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.sm,
    },
    bulkSelectAllBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    bulkSelectAllText: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: "500",
    },
    bulkSelectedCount: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    bulkActions: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    bulkActionBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
    },
    bulkEnableBtn: {
      backgroundColor: colors.success,
    },
    bulkDisableBtn: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bulkActionBtnDisabled: {
      opacity: 0.5,
    },
    bulkActionBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textInverse,
    },
    bulkDisableBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
  }), [colors]);

  // Empty state
  const ListEmpty = useMemo(() => {
    if (loading) return null;

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={colors.error}
          />
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => loadPolicies()}>
            <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      );
    }

    if (searchQuery || filter !== "all") {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="filter-off"
            size={48}
            color={colors.textTertiary}
          />
          <Text style={styles.emptyTitle}>{t("reorderPolicy.noMatchingPolicies")}</Text>
          <Text style={styles.emptyText}>
            {t("reorderPolicy.adjustSearchOrFilter")}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="format-list-bulleted"
          size={48}
          color={colors.textTertiary}
        />
        <Text style={styles.emptyTitle}>{t("reorderPolicy.noPoliciesYet")}</Text>
        <Text style={styles.emptyText}>
          {t("reorderPolicy.noPoliciesDescription")}
        </Text>
      </View>
    );
  }, [loading, error, searchQuery, filter, loadPolicies, styles, colors]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable accessibilityRole="button" style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={colors.textPrimary}
            />
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t("reorderPolicy.title")}</Text>
          <Text style={styles.headerSubtitle}>
            {t("reorderPolicy.statsSubtitle", { total: stats.total, enabled: stats.enabled, lowStock: stats.lowStock })}
          </Text>
        </View>
        {/* STG-440: Bulk mode toggle */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={bulkMode ? t("reorderPolicy.exitBulkMode") : t("reorderPolicy.bulkEdit")}
          style={[styles.bulkModeButton, bulkMode && styles.bulkModeButtonActive]}
          onPress={handleToggleBulkMode}
        >
          <MaterialCommunityIcons
            name={bulkMode ? "close" : "checkbox-multiple-marked-outline"}
            size={20}
            color={bulkMode ? colors.textInverse : colors.primary}
          />
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={colors.textTertiary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={t("reorderPolicy.searchPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable accessibilityRole="button" onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={colors.textTertiary}
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <FilterChip
          label={t("reorderPolicy.filterAll")}
          selected={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <FilterChip
          label={t("reorderPolicy.filterEnabled")}
          selected={filter === "enabled"}
          onPress={() => setFilter("enabled")}
          count={stats.enabled}
        />
        <FilterChip
          label={t("reorderPolicy.filterDisabled")}
          selected={filter === "disabled"}
          onPress={() => setFilter("disabled")}
          count={stats.total - stats.enabled}
        />
        <FilterChip
          label={t("reorderPolicy.filterLowStock")}
          selected={filter === "low_stock"}
          onPress={() => setFilter("low_stock")}
          count={stats.lowStock}
          warning={stats.lowStock > 0}
        />
      </View>

      {/* STG-440: Bulk Action Bar */}
      {bulkMode && (
        <View style={styles.bulkActionBar}>
          <View style={styles.bulkSelectRow}>
            <Pressable
              accessibilityRole="button"
              style={styles.bulkSelectAllBtn}
              onPress={selectedPolicyIds.size === filteredPolicies.length ? handleDeselectAllBulk : handleSelectAllFiltered}
            >
              <MaterialCommunityIcons
                name={selectedPolicyIds.size === filteredPolicies.length ? "checkbox-marked" : "checkbox-blank-outline"}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.bulkSelectAllText}>
                {selectedPolicyIds.size === filteredPolicies.length
                  ? t("reorderPolicy.deselectAll")
                  : t("reorderPolicy.selectAll")}
              </Text>
            </Pressable>
            <Text style={styles.bulkSelectedCount}>
              {t("reorderPolicy.selectedCount", { count: selectedPolicyIds.size })}
            </Text>
          </View>
          <View style={styles.bulkActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("reorderPolicy.bulkEnable")}
              style={[styles.bulkActionBtn, styles.bulkEnableBtn, (selectedPolicyIds.size === 0 || bulkUpdating) && styles.bulkActionBtnDisabled]}
              onPress={() => handleBulkToggleEnabled(true)}
              disabled={selectedPolicyIds.size === 0 || bulkUpdating}
            >
              {bulkUpdating ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.bulkActionBtnText}>{t("reorderPolicy.bulkEnable")}</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("reorderPolicy.bulkDisable")}
              style={[styles.bulkActionBtn, styles.bulkDisableBtn, (selectedPolicyIds.size === 0 || bulkUpdating) && styles.bulkActionBtnDisabled]}
              onPress={() => handleBulkToggleEnabled(false)}
              disabled={selectedPolicyIds.size === 0 || bulkUpdating}
            >
              <Text style={styles.bulkDisableBtnText}>{t("reorderPolicy.bulkDisable")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t("reorderPolicy.loadingPolicies")}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPolicies}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Edit Modal */}
      <EditPolicyModal
        visible={editModalVisible}
        policy={editingPolicy}
        onSave={handleSavePolicy}
        onClose={handleCloseEdit}
      />
    </View>
  );
}

// =============================================================================
// FILTER CHIP COMPONENT
// =============================================================================

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
  warning?: boolean;
}

function FilterChip({ label, selected, onPress, count, warning }: FilterChipProps) {
  const colors = useThemeColors();

  const styles = useMemo(() => StyleSheet.create({
    filterChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.borderRadius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    filterChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterChipWarning: {
      borderColor: colors.warning,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.textSecondary,
    },
    filterChipTextSelected: {
      color: colors.textInverse,
    },
    filterChipTextWarning: {
      color: colors.warning,
    },
    filterChipBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.backgroundSecondary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    filterChipBadgeSelected: {
      backgroundColor: colors.overlayInverse,
    },
    filterChipBadgeWarning: {
      backgroundColor: colors.warningSoft,
    },
    filterChipBadgeText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.textTertiary,
    },
    filterChipBadgeTextSelected: {
      color: colors.textInverse,
    },
  }), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      style={[
        styles.filterChip,
        selected && styles.filterChipSelected,
        warning && !selected && styles.filterChipWarning,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterChipText,
          selected && styles.filterChipTextSelected,
          warning && !selected && styles.filterChipTextWarning,
        ]}
      >
        {label}
      </Text>
      {count !== undefined && count > 0 && (
        <View
          style={[
            styles.filterChipBadge,
            selected && styles.filterChipBadgeSelected,
            warning && !selected && styles.filterChipBadgeWarning,
          ]}
        >
          <Text
            style={[
              styles.filterChipBadgeText,
              selected && styles.filterChipBadgeTextSelected,
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

