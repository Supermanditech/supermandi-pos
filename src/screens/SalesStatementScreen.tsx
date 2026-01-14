// SalesStatementScreen - Sales Statement Report
// GO-LIVE-007: Shows sales summary with totals by date/period

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

import { getSalesHistory, type LedgerEntry } from "../services/api/inventoryApi";
import { formatMoney } from "../utils/money";
import { theme } from "../theme";

interface SalesStatementScreenProps {
  onBack: () => void;
}

interface DailySales {
  date: string;
  dateLabel: string;
  transactions: number;
  totalQty: number;
  totalValue: number;
  entries: LedgerEntry[];
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function groupEntriesByDate(entries: LedgerEntry[]): DailySales[] {
  const groups = new Map<string, DailySales>();

  for (const entry of entries) {
    const date = new Date(entry.createdAt);
    const dateKey = date.toISOString().split("T")[0];

    const existing = groups.get(dateKey);

    if (existing) {
      existing.transactions += 1;
      existing.totalQty += Math.abs(entry.deltaQty);
      existing.entries.push(entry);
    } else {
      groups.set(dateKey, {
        date: dateKey,
        dateLabel: formatDateLabel(entry.createdAt),
        transactions: 1,
        totalQty: Math.abs(entry.deltaQty),
        totalValue: 0, // Will calculate after
        entries: [entry],
      });
    }
  }

  // Sort by date descending
  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

function SalesDayCard({ day }: { day: DailySales }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <MaterialCommunityIcons name="calendar" size={18} color={theme.colors.primary} />
          <Text style={styles.cardTitle}>{day.dateLabel}</Text>
        </View>
        <Text style={styles.cardDate}>{day.date}</Text>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.cardStat}>
          <Text style={styles.cardStatValue}>{day.transactions}</Text>
          <Text style={styles.cardStatLabel}>Sales</Text>
        </View>
        <View style={styles.cardStat}>
          <Text style={styles.cardStatValue}>{day.totalQty}</Text>
          <Text style={styles.cardStatLabel}>Items Sold</Text>
        </View>
        <View style={[styles.cardStat, styles.cardStatRight]}>
          <Text style={styles.cardStatValue}>{day.entries.length}</Text>
          <Text style={styles.cardStatLabel}>Products</Text>
        </View>
      </View>
    </View>
  );
}

export default function SalesStatementScreen({ onBack }: SalesStatementScreenProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dailySales, setDailySales] = useState<DailySales[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const entries = await getSalesHistory();
      const grouped = groupEntriesByDate(entries);
      setDailySales(grouped);
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

  const totalDays = dailySales.length;
  const totalTransactions = dailySales.reduce((sum, d) => sum + d.transactions, 0);
  const totalQtySold = dailySales.reduce((sum, d) => sum + d.totalQty, 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Sales Statement</Text>
        <Pressable style={styles.refreshButton} onPress={() => loadData(true)}>
          <MaterialCommunityIcons name="refresh" size={22} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalTransactions}</Text>
          <Text style={styles.summaryLabel}>Total Sales</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalQtySold}</Text>
          <Text style={styles.summaryLabel}>Items Sold</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalDays}</Text>
          <Text style={styles.summaryLabel}>Days</Text>
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
      ) : dailySales.length === 0 ? (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons name="chart-line" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyTitle}>No sales data</Text>
          <Text style={styles.emptyText}>
            Sales transactions will appear here after you make sales.
          </Text>
        </View>
      ) : (
        <FlatList
          data={dailySales}
          keyExtractor={(item) => item.date}
          renderItem={({ item }) => <SalesDayCard day={item} />}
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
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.primaryDark,
  },
  summaryLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.border,
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
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cardDate: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  cardStat: {
    alignItems: "center",
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
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
});
