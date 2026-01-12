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

import { theme } from "../theme";
import { PolicyRow } from "../components/reorder/PolicyRow";
import { EditPolicyModal } from "../components/reorder/EditPolicyModal";
import * as reorderApi from "../services/api/reorderApi";
import type { ReorderPolicy, UpdatePolicyRequest } from "../services/api/reorderApi";
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
  const insets = useSafeAreaInsets();

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
        console.error("[ReorderPoliciesScreen] Failed to load policies:", err);
        setError("Failed to load reorder policies");
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
        console.error("[ReorderPoliciesScreen] Failed to toggle:", err);
        // Revert on error
        setPolicies((prev) =>
          prev.map((p) => (p.id === policy.id ? { ...p, isEnabled: !enabled } : p))
        );
        Alert.alert("Error", "Failed to update policy. Please try again.");
      }
    },
    [storeId]
  );

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: ReorderPolicy }) => (
      <PolicyRow
        policy={item}
        onEdit={handleEdit}
        onToggleEnabled={handleToggleEnabled}
      />
    ),
    [handleEdit, handleToggleEnabled]
  );

  // Key extractor
  const keyExtractor = useCallback((item: ReorderPolicy) => item.id, []);

  // Empty state
  const ListEmpty = useMemo(() => {
    if (loading) return null;

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={theme.colors.error}
          />
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadPolicies()}>
            <Text style={styles.retryButtonText}>Retry</Text>
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
            color={theme.colors.textTertiary}
          />
          <Text style={styles.emptyTitle}>No matching policies</Text>
          <Text style={styles.emptyText}>
            Try adjusting your search or filter
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="format-list-bulleted"
          size={48}
          color={theme.colors.textTertiary}
        />
        <Text style={styles.emptyTitle}>No Policies Yet</Text>
        <Text style={styles.emptyText}>
          Reorder policies will be created automatically when products are added to your catalog.
        </Text>
      </View>
    );
  }, [loading, error, searchQuery, filter, loadPolicies]);

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
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Reorder Policies</Text>
          <Text style={styles.headerSubtitle}>
            {stats.total} products | {stats.enabled} enabled | {stats.lowStock} low stock
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={theme.colors.textTertiary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor={theme.colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={theme.colors.textTertiary}
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <FilterChip
          label="All"
          selected={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <FilterChip
          label="Enabled"
          selected={filter === "enabled"}
          onPress={() => setFilter("enabled")}
          count={stats.enabled}
        />
        <FilterChip
          label="Disabled"
          selected={filter === "disabled"}
          onPress={() => setFilter("disabled")}
          count={stats.total - stats.enabled}
        />
        <FilterChip
          label="Low Stock"
          selected={filter === "low_stock"}
          onPress={() => setFilter("low_stock")}
          count={stats.lowStock}
          warning={stats.lowStock > 0}
        />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading policies...</Text>
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
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
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
  return (
    <Pressable
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
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  searchContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    paddingVertical: theme.spacing.xs,
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4,
  },
  filterChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipWarning: {
    borderColor: theme.colors.warning,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  filterChipTextSelected: {
    color: theme.colors.textInverse,
  },
  filterChipTextWarning: {
    color: theme.colors.warning,
  },
  filterChipBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterChipBadgeSelected: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  filterChipBadgeWarning: {
    backgroundColor: theme.colors.warningSoft,
  },
  filterChipBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textTertiary,
  },
  filterChipBadgeTextSelected: {
    color: theme.colors.textInverse,
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
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: "center",
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
});
