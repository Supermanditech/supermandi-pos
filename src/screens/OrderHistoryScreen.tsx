// OrderHistoryScreen - V3.0.9 compliant
// Purchase order history list with filters

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../theme";
import { OrderCard } from "../components/orders/OrderCard";
import * as orderApi from "../services/api/orderApi";
import type { PurchaseOrder, OrderStatus } from "../services/api/orderApi";
import { getDeviceStoreId } from "../services/deviceSession";
import { shouldStopPagination } from "../config/pagination";

// =============================================================================
// TYPES
// =============================================================================

export interface OrderHistoryScreenProps {
  onSelectOrder?: (order: PurchaseOrder) => void;
  onBack?: () => void;
  onNavigateToBuy?: () => void;
}

type FilterOption = "all" | "active" | "completed" | "cancelled";

// =============================================================================
// COMPONENT
// =============================================================================

export default function OrderHistoryScreen({
  onSelectOrder,
  onBack,
  onNavigateToBuy,
}: OrderHistoryScreenProps) {
  const insets = useSafeAreaInsets();

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterOption>("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Load store ID on mount
  useEffect(() => {
    getDeviceStoreId().then(setStoreId);
  }, []);

  // Get status filter based on filter option
  const getStatusFilter = useCallback((filterOption: FilterOption): OrderStatus[] | undefined => {
    switch (filterOption) {
      case "active":
        return ["draft", "submitted", "confirmed", "shipped", "partial_received"];
      case "completed":
        return ["delivered"];
      case "cancelled":
        return ["cancelled"];
      default:
        return undefined;
    }
  }, []);

  // Load orders
  const loadOrders = useCallback(
    async (showLoading = true, pageNum = 1) => {
      if (!storeId) return;

      if (showLoading && pageNum === 1) setLoading(true);
      if (pageNum > 1) setLoadingMore(true);
      setError(null);

      try {
        const response = await orderApi.listOrders(storeId, {
          status: getStatusFilter(filter),
          page: pageNum,
          limit: 20,
        });

        if (pageNum === 1) {
          setOrders(response.data);
        } else {
          setOrders((prev) => [...prev, ...response.data]);
        }

        setPage(pageNum);
        setHasMore(pageNum < response.pagination.totalPages);
      } catch (err) {
        console.error("[OrderHistoryScreen] Failed to load orders:", err);
        setError("Failed to load orders");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [storeId, filter, getStatusFilter]
  );

  // Initial load and filter change
  useEffect(() => {
    if (storeId) {
      loadOrders(true, 1);
    }
  }, [storeId, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull to refresh
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders(false, 1);
  }, [loadOrders]);

  // Load more
  // GO-LIVE-170: Added pagination safeguard to prevent infinite loops
  const handleLoadMore = useCallback(() => {
    if (loadingMore || loading) return;
    if (shouldStopPagination(page, hasMore)) return;
    loadOrders(false, page + 1);
  }, [loadingMore, hasMore, loading, page, loadOrders]);

  // Handle order press
  const handleOrderPress = useCallback(
    (order: PurchaseOrder) => {
      onSelectOrder?.(order);
    },
    [onSelectOrder]
  );

  // Stats
  const stats = useMemo(() => {
    const active = orders.filter((o) =>
      ["draft", "submitted", "confirmed", "shipped", "partial_received"].includes(o.status)
    ).length;
    const receivable = orders.filter((o) =>
      ["shipped", "partial_received", "confirmed"].includes(o.status)
    ).length;
    return { total: orders.length, active, receivable };
  }, [orders]);

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: PurchaseOrder }) => (
      <OrderCard order={item} onPress={handleOrderPress} />
    ),
    [handleOrderPress]
  );

  // Key extractor
  const keyExtractor = useCallback((item: PurchaseOrder) => item.id, []);

  // Footer (loading more indicator)
  const ListFooter = useMemo(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  }, [loadingMore]);

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
          <Pressable style={styles.retryButton} onPress={() => loadOrders()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="clipboard-list-outline"
          size={48}
          color={theme.colors.textTertiary}
        />
        <Text style={styles.emptyTitle}>No Orders Found</Text>
        <Text style={styles.emptyText}>
          {filter === "all"
            ? "You haven't placed any orders yet."
            : `No ${filter} orders to display.`}
        </Text>
        {filter === "all" && onNavigateToBuy && (
          <Pressable style={styles.ctaButton} onPress={onNavigateToBuy}>
            <MaterialCommunityIcons name="cart-plus" size={18} color={theme.colors.textInverse} />
            <Text style={styles.ctaButtonText}>Create First Order</Text>
          </Pressable>
        )}
      </View>
    );
  }, [loading, error, filter, loadOrders, onNavigateToBuy]);

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
          <Text style={styles.headerTitle}>Order History</Text>
          <Text style={styles.headerSubtitle}>
            {stats.active} active | {stats.receivable} ready to receive
          </Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContent}
        >
          <FilterChip
            label="All"
            selected={filter === "all"}
            onPress={() => setFilter("all")}
          />
          <FilterChip
            label="Active"
            selected={filter === "active"}
            onPress={() => setFilter("active")}
            icon="progress-clock"
          />
          <FilterChip
            label="Completed"
            selected={filter === "completed"}
            onPress={() => setFilter("completed")}
            icon="check-circle"
          />
          <FilterChip
            label="Cancelled"
            selected={filter === "cancelled"}
            onPress={() => setFilter("cancelled")}
            icon="close-circle"
          />
        </ScrollView>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
          ListEmptyComponent={ListEmpty}
          ListFooterComponent={ListFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
        />
      )}
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
  icon?: string;
}

function FilterChip({ label, selected, onPress, icon }: FilterChipProps) {
  return (
    <Pressable
      style={[styles.filterChip, selected && styles.filterChipSelected]}
      onPress={onPress}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={14}
          color={selected ? theme.colors.textInverse : theme.colors.textSecondary}
        />
      )}
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
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
  filterContainer: {
    backgroundColor: theme.colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterContent: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  filterChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  filterChipTextSelected: {
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
    padding: theme.spacing.md,
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
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: theme.spacing.lg,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textInverse,
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
  footerLoader: {
    paddingVertical: theme.spacing.md,
    alignItems: "center",
  },
});
