// PurchaseHistoryScreen - Purchase History Report
// GO-LIVE-006: Shows all purchase transactions from ledger

import React, { useCallback, useEffect, useState } from "react";
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

import { getPurchaseHistory, type LedgerEntry } from "../services/api/inventoryApi";
import { formatMoney } from "../utils/money";
import { theme } from "../theme";

interface PurchaseHistoryScreenProps {
  onBack: () => void;
}

interface GroupedPurchase {
  date: string;
  referenceId: string;
  entries: LedgerEntry[];
  totalQty: number;
  totalValue: number;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupEntriesByReference(entries: LedgerEntry[]): GroupedPurchase[] {
  const groups = new Map<string, GroupedPurchase>();

  for (const entry of entries) {
    const refId = entry.referenceId ?? entry.id;
    const existing = groups.get(refId);

    if (existing) {
      existing.entries.push(entry);
      existing.totalQty += entry.deltaQty;
      // Estimate value: deltaQty * some default price (we don't have unitCost in ledger response)
      existing.totalValue += entry.deltaQty * 10000; // placeholder
    } else {
      groups.set(refId, {
        date: entry.createdAt,
        referenceId: refId,
        entries: [entry],
        totalQty: entry.deltaQty,
        totalValue: entry.deltaQty * 10000, // placeholder
      });
    }
  }

  // Sort by date descending
  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

function PurchaseCard({ purchase }: { purchase: GroupedPurchase }) {
  const isManual = purchase.referenceId.startsWith("INWARD-") || purchase.referenceId.startsWith("OPEN-");
  const referenceLabel = isManual ? "Manual Inward" : purchase.referenceId;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <MaterialCommunityIcons
            name={isManual ? "package-down" : "truck-delivery"}
            size={18}
            color={theme.colors.primary}
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
        <View style={[styles.cardStat, styles.cardStatRight]}>
          <Text style={styles.cardStatLabel}>Products</Text>
          <Text style={styles.cardStatValue}>
            {purchase.entries.map((e) => e.productId.slice(0, 8)).join(", ")}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function PurchaseHistoryScreen({ onBack }: PurchaseHistoryScreenProps) {
  const insets = useSafeAreaInsets();
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
      const entries = await getPurchaseHistory();
      const grouped = groupEntriesByReference(entries);
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

  const totalPurchases = purchases.length;
  const totalItems = purchases.reduce((sum, p) => sum + p.entries.length, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Purchase History</Text>
        <Pressable style={styles.refreshButton} onPress={() => loadData(true)}>
          <MaterialCommunityIcons name="refresh" size={22} color={theme.colors.textSecondary} />
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
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="alert-circle" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadData()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : purchases.length === 0 ? (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="package-variant" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>No purchase history</Text>
          <Text style={styles.emptyText}>
            Stock inward transactions will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={purchases}
          keyExtractor={(item) => item.referenceId}
          renderItem={({ item }) => <PurchaseCard purchase={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              colors={[theme.colors.primary]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.primaryDark,
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.border,
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
    color: theme.colors.error,
    marginTop: 12,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  listContent: {
    padding: 16,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    color: theme.colors.textPrimary,
    flex: 1,
  },
  cardMeta: {
    alignItems: "flex-end",
  },
  cardDate: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  cardTime: {
    fontSize: 11,
    color: theme.colors.textSecondary,
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
    color: theme.colors.textSecondary,
  },
  cardStatValue: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
});
