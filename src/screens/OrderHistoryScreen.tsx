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

import { theme, useThemeColors } from "../theme";
import type { ColorPalette } from "../theme";
import { OrderCard } from "../components/orders/OrderCard";
import * as orderApi from "../services/api/orderApi";
import type { PurchaseOrder, OrderStatus } from "../services/api/orderApi";
import { getDeviceStoreId } from "../services/deviceSession";
import { shouldStopPagination } from "../config/pagination";
// T-109: Branded empty state
import EmptyState from "../components/ui/EmptyState";

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
// STYLES FACTORY
// =============================================================================

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
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
    filterContainer: {
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: theme.spacing.xs,
    },
    filterChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterChipText: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.textSecondary,
    },
    filterChipTextSelected: {
      color: colors.textInverse,
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
      color: colors.textPrimary,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: "center",
    },
    ctaButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: theme.spacing.lg,
      paddingVertical: 12,
      paddingHorizontal: 24,
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.md,
    },
    ctaButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textInverse,
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
    footerLoader: {
      paddingVertical: theme.spacing.md,
      alignItems: "center",
    },
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function OrderHistoryScreen({
  onSelectOrder,
  onBack,
  onNavigateToBuy,
}: OrderHistoryScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
        if (__DEV__) console.error("[OrderHistoryScreen] Failed to load orders:", err);
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

  // STG-128: Stats from visible orders only, with note when paginated
  // These are approximate counts from loaded data; full counts would require backend aggregation
  const stats = useMemo(() => {
    const active = orders.filter((o) =>
      ["draft", "submitted", "confirmed", "shipped", "partial_received"].includes(o.status)
    ).length;
    const receivable = orders.filter((o) =>
      ["shipped", "partial_received", "confirmed"].includes(o.status)
    ).length;
    return { total: orders.length, active, receivable, hasMore };
  }, [orders, hasMore]);

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
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingMore, styles, colors]);

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
          <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => loadOrders()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    /* T-109: Branded empty state */
    return (
      <EmptyState
        icon="clipboard-list-outline"
        title="No orders yet"
        description={
          filter === "all"
            ? "You haven't placed any orders yet."
            : `No ${filter} orders to display.`
        }
      >
        {filter === "all" && onNavigateToBuy && (
          <Pressable accessibilityRole="button" style={styles.ctaButton} onPress={onNavigateToBuy}>
            <MaterialCommunityIcons name="cart-plus" size={18} color={colors.textInverse} />
            <Text style={styles.ctaButtonText}>Create First Order</Text>
          </Pressable>
        )}
      </EmptyState>
    );
  }, [loading, error, filter, loadOrders, onNavigateToBuy, styles, colors]);

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
          <Text style={styles.headerTitle}>Order History</Text>
          <Text style={styles.headerSubtitle}>
            {stats.active} active | {stats.receivable} ready to receive{stats.hasMore ? '+' : ''}
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
          <ActivityIndicator size="large" color={colors.primary} />
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
              colors={[colors.primary]}
              tintColor={colors.primary}
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
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.filterChip, selected && styles.filterChipSelected]}
      onPress={onPress}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon as keyof typeof MaterialCommunityIcons.glyphMap}
          size={14}
          color={selected ? colors.textInverse : colors.textSecondary}
        />
      )}
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}
