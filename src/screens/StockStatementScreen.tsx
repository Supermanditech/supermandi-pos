// StockStatementScreen - Stock Statement Report
// GO-LIVE-008: Shows current stock levels with valuation

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  BackHandler,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getStockStatusLabel, getStockStatusColor, type StockStatus } from "../services/api/catalogApi";
import { getStockStatement, type StockStatementItem } from "../services/api/inventoryApi";
import { formatMoney } from "../utils/money";
import { theme, useThemeColors } from "../theme";
import type { ColorPalette } from "../theme";
// T-109: Branded empty state
import EmptyState from "../components/ui/EmptyState";

interface StockStatementScreenProps {
  onBack: () => void;
}

interface StockItem {
  id: string;
  name: string;
  barcode: string;
  category: string;
  stockStatus: string;
  stockQty: number;
  unitPrice: number;
  stockValue: number;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    refreshButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    summaryBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    summaryItem: {
      flex: 1,
      alignItems: "center",
    },
    summaryValue: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.primaryDark,
    },
    summaryValueWarning: {
      color: colors.warning,
    },
    summaryValueSmall: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.primaryDark,
    },
    summaryLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 2,
    },
    summaryDivider: {
      width: 1,
      height: 32,
      backgroundColor: colors.border,
      marginHorizontal: 12,
    },
    centerContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    errorText: {
      fontSize: 14,
      color: colors.error,
      marginTop: 12,
      textAlign: "center",
    },
    retryButton: {
      marginTop: 16,
      paddingVertical: 10,
      paddingHorizontal: 24,
      backgroundColor: colors.primary,
      borderRadius: 8,
    },
    retryText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      marginTop: 16,
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: "center",
    },
    listContent: {
      padding: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 12,
    },
    cardHeader: {
      marginBottom: 12,
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      flex: 1,
    },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontSize: 10,
      fontWeight: "700",
    },
    cardBarcode: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 4,
    },
    cardBody: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 16,
    },
    cardStat: {
      gap: 2,
    },
    cardStatRight: {
      flex: 1,
      alignItems: "flex-end",
    },
    cardStatLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    cardStatValue: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    cardStatValueHighlight: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.primaryDark,
    },
  });
}

function StockCard({ item }: { item: StockItem }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // R6.POS.006: Remove unnecessary 'as any' — StockStatus is string
  const statusColor = getStockStatusColor(item.stockStatus as StockStatus);
  const statusLabel = getStockStatusLabel(item.stockStatus as StockStatus);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.cardBarcode}>{item.barcode}</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardStat}>
          <Text style={styles.cardStatValue}>{item.stockQty}</Text>
          <Text style={styles.cardStatLabel}>In Stock</Text>
        </View>
        <View style={styles.cardStat}>
          <Text style={styles.cardStatValue}>{formatMoney(item.unitPrice, "INR")}</Text>
          <Text style={styles.cardStatLabel}>Unit Price</Text>
        </View>
        <View style={[styles.cardStat, styles.cardStatRight]}>
          <Text style={styles.cardStatValueHighlight}>{formatMoney(item.stockValue, "INR")}</Text>
          <Text style={styles.cardStatLabel}>Stock Value</Text>
        </View>
      </View>
    </View>
  );
}

export default function StockStatementScreen({ onBack }: StockStatementScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  // UIUX-POS-004: Android hardware back button support
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // AUD-074-B FIX: Use getStockStatement to get ACTUAL inventory from inventory.stock_balances
      // This returns real transactional inventory, not cached/supplier stock
      // STG-131: Increased limit from 200 to 500 (max supported by API)
      const response = await getStockStatement(500, true);

      // UIUX-POS-016: Show offline indicator instead of error when offline
      if (!response.success && response.meta?.source === 'offline') {
        setError("You are offline. Stock data will appear when connected.");
        return;
      }
      if (!response.success && response.data.length === 0) {
        throw new Error("Failed to load inventory data");
      }

      // Compute stock status from actual currentStock
      const computeStockStatus = (qty: number): StockStatus => {
        if (qty <= 0) return "out_of_stock";
        if (qty < 10) return "low_stock";
        return "in_stock";
      };

      const items: StockItem[] = response.data.map((product: StockStatementItem) => {
        const stockQty = product.currentStock ?? 0;
        const unitPrice = product.sellPrice ?? 0;
        return {
          id: product.id,
          name: product.displayName,
          barcode: product.barcode || product.productId || product.id,
          category: "Uncategorized",
          stockStatus: computeStockStatus(stockQty),
          stockQty,
          unitPrice,
          stockValue: product.stockValue ?? (stockQty * unitPrice),
        };
      });

      // Sort by stock status (out_of_stock first, then low_stock)
      items.sort((a, b) => {
        const order = { out_of_stock: 0, low_stock: 1, in_stock: 2 };
        return (order[a.stockStatus as keyof typeof order] ?? 2) -
               (order[b.stockStatus as keyof typeof order] ?? 2);
      });

      setStockItems(items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load data";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalProducts = stockItems.length;
  const totalStockValue = stockItems.reduce((sum, item) => sum + item.stockValue, 0);
  const lowStockCount = stockItems.filter((item) => item.stockStatus !== "in_stock").length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Pressable accessibilityRole="button" style={styles.backButton} onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Stock Statement</Text>
        <Pressable accessibilityRole="button" style={styles.refreshButton} onPress={() => loadData(true)}>
          <MaterialCommunityIcons name="refresh" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalProducts}</Text>
          <Text style={styles.summaryLabel}>Products</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, lowStockCount > 0 && styles.summaryValueWarning]}>
            {lowStockCount}
          </Text>
          <Text style={styles.summaryLabel}>Low/Out</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValueSmall}>{formatMoney(totalStockValue, "INR")}</Text>
          <Text style={styles.summaryLabel}>Total Value</Text>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" style={styles.retryButton} onPress={() => loadData()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : stockItems.length === 0 ? (
        /* T-109: Branded empty state */
        <EmptyState
          icon="package-variant"
          title="No stock data"
          description="Products will appear here once added to the catalog."
        />
      ) : (
        <FlatList
          data={stockItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <StockCard item={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}
