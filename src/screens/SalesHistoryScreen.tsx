import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import { theme } from "../theme";
import { formatMoney } from "../utils/money";
import { formatDateTime } from "../i18n/formatters";
import { listBills } from "../services/api/billingApi";
import type { BillSummary } from "../services/billing/billTypes";
// GL-CRIT-0085: Import skeleton loader component
import { SkeletonList } from "../components/ui/LoadingState";
// T-109: Branded empty state
import EmptyState from "../components/ui/EmptyState";
// T-122: Standardized back header
import { BackHeader } from "../components/ui/BackHeader";

type RootStackParamList = {
  SalesHistory: undefined;
  BillDetail: { saleId: string; billRef?: string };
  SellScan: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "SalesHistory">;

export default function SalesHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  // GL-CRIT-0095: Use i18n for error messages
  const { t } = useTranslation();
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // T-125: Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);

  const loadBills = async () => {
    setLoading(true);
    setError("");
    try {
      const results = await listBills();
      setBills(results);
    } catch (e: any) {
      // GL-CRIT-0095: Use i18n for error messages
      setError(e?.message ? String(e.message) : t('history.loadError', 'Failed to load bills.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // T-125: Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadBills();
  }, []);

  useEffect(() => {
    if (isFocused) {
      void loadBills();
    }
  }, [isFocused]);

  const renderItem = ({ item }: { item: BillSummary }) => (
    <Pressable
      style={styles.billRow}
      onPress={() => navigation.navigate("BillDetail", { saleId: item.saleId, billRef: item.billRef })}
    >
      <View style={styles.billMain}>
        <Text style={styles.billRef}>Bill #{item.billRef}</Text>
        <Text style={styles.billMeta}>{formatDateTime(new Date(item.createdAt))}</Text>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.paymentMode}</Text>
          </View>
          {item.source === "local" && (
            <View style={[styles.badge, styles.badgeWarning]}>
              <Text style={[styles.badgeText, styles.badgeWarningText]}>OFFLINE</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.billRight}>
        <Text style={styles.billAmount}>{formatMoney(item.totalMinor, item.currency)}</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* T-122: Standardized back header with Android BackHandler */}
      <BackHeader title="Bills" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* GL-CRIT-0085: Show skeleton loader during initial load */}
      {loading && bills.length === 0 ? (
        <View style={styles.list}>
          <SkeletonList count={5} itemHeight={80} />
        </View>
      ) : bills.length === 0 ? (
        /* T-109: Branded empty state */
        <EmptyState
          icon="receipt"
          title={t('history.noBills', 'No sales yet')}
          description={t('history.noBillsHint', 'Bills will appear here after you make sales.')}
        >
          <Pressable
            style={styles.ctaButton}
            onPress={() => (navigation as any).navigate("SellScan")}
          >
            <MaterialCommunityIcons name="cart-outline" size={18} color={theme.colors.textInverse} />
            <Text style={styles.ctaButtonText}>{t('history.makeFirstSale', 'Make Your First Sale')}</Text>
          </Pressable>
        </EmptyState>
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(item) => item.saleId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#2563EB"]}
              tintColor="#2563EB"
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
    padding: 16
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  backText: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary
  },
  refresh: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  refreshText: {
    color: theme.colors.primary,
    fontWeight: "700"
  },
  error: {
    color: theme.colors.error,
    marginBottom: 8
  },
  list: {
    paddingBottom: 20
  },
  billRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  billMain: {
    flex: 1
  },
  billRef: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary
  },
  billMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary
  },
  badgeWarning: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: theme.colors.warning
  },
  badgeWarningText: {
    color: theme.colors.warning
  },
  billRight: {
    alignItems: "flex-end",
    gap: 4
  },
  billAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primaryDark
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginTop: 16
  },
  emptyText: {
    color: theme.colors.textSecondary,
    marginTop: 4,
    textAlign: "center"
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 10
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textInverse
  }
});
