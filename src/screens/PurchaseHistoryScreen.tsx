// PurchaseHistoryScreen - Purchase History Report
// GO-LIVE-006: Shows all purchase transactions from ledger

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useProductsStore } from "../stores/productsStore";

import { getPurchaseHistory, type LedgerEntry } from "../services/api/inventoryApi";
import { formatMoney } from "../utils/money";
import { formatDate, formatTime } from "../i18n/formatters";
import { theme, useThemeColors } from "../theme";
import { usePurchaseCartStore, type DraftPOItem } from "../stores/purchaseCartStore";
import { useTranslation } from "react-i18next";

interface PurchaseHistoryScreenProps {
  onBack: () => void;
  onNavigateToInward?: () => void;
  onNavigateToBuy?: () => void;
}

interface GroupedPurchase {
  date: string;
  referenceId: string;
  entries: LedgerEntry[];
  totalQty: number;
  totalValue: number;
}

function groupEntriesByReference(entries: LedgerEntry[]): GroupedPurchase[] {
  const groups = new Map<string, GroupedPurchase>();

  for (const entry of entries) {
    const refId = entry.referenceId ?? entry.id;
    const existing = groups.get(refId);

    if (existing) {
      existing.entries.push(entry);
      existing.totalQty += entry.deltaQty;
      // T-201: Use unitCost from ledger API (paise). deltaQty * unitCost = total value in paise.
      existing.totalValue += Math.abs(entry.deltaQty) * (entry.unitCost ?? 0);
    } else {
      groups.set(refId, {
        date: entry.createdAt,
        referenceId: refId,
        entries: [entry],
        totalQty: entry.deltaQty,
        totalValue: Math.abs(entry.deltaQty) * (entry.unitCost ?? 0),
      });
    }
  }

  // Sort by date descending
  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

function PurchaseCard({ purchase, onQuickReorder }: { purchase: GroupedPurchase; onQuickReorder?: (purchase: GroupedPurchase) => void }) {
  const colors = useThemeColors();
  // AUDIT-POS-025: Look up product names from store instead of showing truncated UUIDs
  const products = useProductsStore((s) => s.products);
  const { t } = useTranslation();
  const isManual = purchase.referenceId.startsWith("INWARD-") || purchase.referenceId.startsWith("OPEN-");
  const referenceLabel = isManual ? "Manual Inward" : purchase.referenceId;

  const styles = useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 12,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flex: 1,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      flex: 1,
    },
    cardMeta: {
      alignItems: "flex-end",
    },
    cardDate: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    cardTime: {
      fontSize: 11,
      color: colors.textSecondary,
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
      fontSize: 13,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    quickReorderButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 12,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.accentSoft,
    },
    quickReorderText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
    },
  }), [colors]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <MaterialCommunityIcons
            name={isManual ? "package-down" : "truck-delivery"}
            size={18}
            color={colors.primary}
          />
          <Text style={styles.cardTitle} numberOfLines={1}>
            {referenceLabel}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.cardDate}>{formatDate(purchase.date)}</Text>
          <Text style={styles.cardTime}>{formatTime(purchase.date)}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardStat}>
          <Text style={styles.cardStatLabel}>Items</Text>
          <Text style={styles.cardStatValue}>{purchase.entries.length}</Text>
        </View>
        <View style={styles.cardStat}>
          <Text style={styles.cardStatLabel}>Total Qty</Text>
          <Text style={styles.cardStatValue}>{purchase.totalQty}</Text>
        </View>
        {/* T-201: Show total value from unitCost */}
        <View style={styles.cardStat}>
          <Text style={styles.cardStatLabel}>Value</Text>
          <Text style={[styles.cardStatValue, { color: colors.primary }]}>
            {formatMoney(purchase.totalValue)}
          </Text>
        </View>
        <View style={[styles.cardStat, styles.cardStatRight]}>
          <Text style={styles.cardStatLabel}>Products</Text>
          <Text style={styles.cardStatValue} numberOfLines={2}>
            {purchase.entries.map((e) => {
              const p = products.find((prod) => prod.id === e.productId);
              return p?.name || e.productId.slice(0, 8);
            }).join(", ")}
          </Text>
        </View>
      </View>

      {/* T-241: Quick Reorder Button */}
      {onQuickReorder && (
        <Pressable
          style={styles.quickReorderButton}
          onPress={() => onQuickReorder(purchase)}
        >
          <MaterialCommunityIcons name="cart-plus" size={16} color={colors.primary} />
          <Text style={styles.quickReorderText}>{t("reorder.quickReorder")}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function PurchaseHistoryScreen({ onBack, onNavigateToInward, onNavigateToBuy }: PurchaseHistoryScreenProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const products = useProductsStore((s) => s.products);
  const loadDraftPOs = usePurchaseCartStore((s) => s.loadDraftPOs);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchases, setPurchases] = useState<GroupedPurchase[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // STG-130: Use paginated response
      const result = await getPurchaseHistory();
      const grouped = groupEntriesByReference(result.entries);
      setPurchases(grouped);
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

  // T-241: Quick Reorder handler
  const handleQuickReorder = useCallback((purchase: GroupedPurchase) => {
    const draftItems: DraftPOItem[] = purchase.entries
      .filter((e) => e.deltaQty > 0) // Only positive (inward) entries
      .map((e) => {
        const product = products.find((p) => p.id === e.productId);
        return {
          supplierProductId: e.productId,
          productId: e.productId,
          supplierId: "reorder",
          supplierName: "From Purchase History",
          productName: product?.name || e.productId.slice(0, 8),
          suggestedQuantity: Math.abs(e.deltaQty),
          unitPrice: e.unitCost ?? 0,
          moq: 1,
        };
      });

    if (draftItems.length === 0) return;

    loadDraftPOs(draftItems);
    onNavigateToBuy?.();
  }, [products, loadDraftPOs, onNavigateToBuy]);

  const totalPurchases = purchases.length;
  const totalItems = purchases.reduce((sum, p) => sum + p.entries.length, 0);

  const styles = useMemo(() => StyleSheet.create({
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
    summaryLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    summaryDivider: {
      width: 1,
      height: 32,
      backgroundColor: colors.border,
      marginHorizontal: 16,
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
    ctaButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 20,
      paddingVertical: 12,
      paddingHorizontal: 24,
      backgroundColor: colors.primary,
      borderRadius: 10,
    },
    ctaButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textInverse,
    },
    listContent: {
      padding: 16,
    },
  }), [colors]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Purchase History</Text>
        <Pressable style={styles.refreshButton} onPress={() => loadData(true)}>
          <MaterialCommunityIcons name="refresh" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalPurchases}</Text>
          <Text style={styles.summaryLabel}>Purchases</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalItems}</Text>
          <Text style={styles.summaryLabel}>Line Items</Text>
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
          <Pressable style={styles.retryButton} onPress={() => loadData()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : purchases.length === 0 ? (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="package-variant" size={48} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No purchase history</Text>
          <Text style={styles.emptyText}>
            Stock inward transactions will appear here.
          </Text>
          {onNavigateToInward && (
            <Pressable style={styles.ctaButton} onPress={onNavigateToInward}>
              <MaterialCommunityIcons name="package-down" size={18} color={colors.textInverse} />
              <Text style={styles.ctaButtonText}>Add Stock Inward</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={purchases}
          keyExtractor={(item) => item.referenceId}
          renderItem={({ item }) => <PurchaseCard purchase={item} onQuickReorder={onNavigateToBuy ? handleQuickReorder : undefined} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              colors={[colors.primary]}
            />
          }
        />
      )}
    </View>
  );
}
