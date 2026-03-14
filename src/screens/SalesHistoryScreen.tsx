import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";

import { theme, useThemeColors } from "../theme";
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
import { asError } from "../utils/errorUtils";

type RootStackParamList = {
  SalesHistory: undefined;
  BillDetail: { saleId: string; billRef?: string };
  SellScan: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "SalesHistory">;

// STG-127: Added pagination support with infinite scroll
const PAGE_SIZE = 50;

export default function SalesHistoryScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  // GL-CRIT-0095: Use i18n for error messages
  const { t } = useTranslation();
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(true);
  // T-125: Pull-to-refresh state
  const [refreshing, setRefreshing] = useState(false);

  const loadBills = async (offset = 0, isRefresh = false) => {
    if (offset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError("");
    try {
      const result = await listBills(PAGE_SIZE, offset);
      if (offset === 0 || isRefresh) {
        setBills(result.bills);
      } else {
        setBills(prev => [...prev, ...result.bills]);
      }
      setHasMore(result.hasMore);
    } catch (_e: unknown) {
    const e = asError(_e);
      // GL-CRIT-0095: Use i18n for error messages
      setError(e?.message ? String(e.message) : t('salesHistory.loadError', 'Failed to load bills.'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  // T-125: Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadBills(0, true);
  }, []);

  // STG-127: Load more on scroll end
  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      void loadBills(bills.length);
    }
  }, [loadingMore, hasMore, loading, bills.length]);

  useEffect(() => {
    if (isFocused) {
      void loadBills();
    }
  }, [isFocused]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      color: colors.primary,
      fontWeight: "700"
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary
    },
    refresh: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    refreshText: {
      color: colors.primary,
      fontWeight: "700"
    },
    error: {
      color: colors.error,
      marginBottom: 8
    },
    list: {
      paddingBottom: 20
    },
    billRow: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.textPrimary
    },
    billMeta: {
      fontSize: 12,
      color: colors.textSecondary,
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
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border
    },
    badgeText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary
    },
    badgeWarning: {
      backgroundColor: colors.warningSoft,
      borderColor: colors.warning
    },
    badgeWarningText: {
      color: colors.warning
    },
    billRight: {
      alignItems: "flex-end",
      gap: 4
    },
    billAmount: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primaryDark
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
      color: colors.textPrimary,
      marginTop: 16
    },
    emptyText: {
      color: colors.textSecondary,
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
      backgroundColor: colors.primary,
      borderRadius: 10
    },
    ctaButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textInverse
    }
  }), [colors]);

  const renderItem = ({ item }: { item: BillSummary }) => (
    <Pressable
      accessibilityRole="button"
      style={styles.billRow}
      onPress={() => navigation.navigate("BillDetail", { saleId: item.saleId, billRef: item.billRef })}
    >
      <View style={styles.billMain}>
        <Text style={styles.billRef}>{t('salesHistory.billRef', 'Bill #{{ref}}', { ref: item.billRef })}</Text>
        <Text style={styles.billMeta}>{formatDateTime(new Date(item.createdAt))}</Text>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.paymentMode}</Text>
          </View>
          {item.source === "local" && (
            <View style={[styles.badge, styles.badgeWarning]}>
              <Text style={[styles.badgeText, styles.badgeWarningText]}>{t('salesHistory.offline', 'OFFLINE')}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.billRight}>
        <Text style={styles.billAmount}>{formatMoney(item.totalMinor, item.currency)}</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textSecondary} />
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* T-122: Standardized back header with Android BackHandler */}
      <BackHeader title={t('salesHistory.title', 'Bills')} />

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
          title={t('salesHistory.noBills', 'No sales yet')}
          description={t('salesHistory.noBillsHint', 'Bills will appear here after you make sales.')}
        >
          <Pressable
            accessibilityRole="button"
            style={styles.ctaButton}
            onPress={() => (navigation as any).navigate("SellScan")}
          >
            <MaterialCommunityIcons name="cart-outline" size={18} color={colors.textInverse} />
            <Text style={styles.ctaButtonText}>{t('salesHistory.makeFirstSale', 'Make Your First Sale')}</Text>
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
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: 16, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null}
        />
      )}
    </View>
  );
}
