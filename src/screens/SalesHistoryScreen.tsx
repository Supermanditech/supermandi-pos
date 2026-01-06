import React, { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { theme } from "../theme";
import { formatMoney } from "../utils/money";
import { listBills } from "../services/api/billingApi";
import type { BillSummary } from "../services/billing/billTypes";

type RootStackParamList = {
  SalesHistory: undefined;
  BillDetail: { saleId: string; billRef?: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList, "SalesHistory">;

export default function SalesHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const [bills, setBills] = useState<BillSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadBills = async () => {
    setLoading(true);
    setError("");
    try {
      const results = await listBills();
      setBills(results);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Failed to load bills.");
    } finally {
      setLoading(false);
    }
  };

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
        <Text style={styles.billMeta}>{new Date(item.createdAt).toLocaleString()}</Text>
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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.primary} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Bills</Text>
        </View>
        <Pressable style={styles.refresh} onPress={loadBills} disabled={loading}>
          <MaterialCommunityIcons name="refresh" size={18} color={theme.colors.primary} />
          <Text style={styles.refreshText}>{loading ? "Loading..." : "Refresh"}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {bills.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No bills yet.</Text>
        </View>
      ) : (
        <FlatList
          data={bills}
          keyExtractor={(item) => item.saleId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
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
    justifyContent: "center"
  },
  emptyText: {
    color: theme.colors.textSecondary
  }
});
