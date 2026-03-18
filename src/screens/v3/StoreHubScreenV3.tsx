import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, ScrollView, ActivityIndicator, StyleSheet, Text } from "react-native";
import Svg, { Rect, Path, Circle, Line } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getPurchaseHistory } from "../../services/api/inventoryApi";
import { isOnline } from "../../services/networkStatus";
import { logger } from "../../services/logger";

// V3-019: Store hub with real purchase history

type StoreHubScreenV3Props = {
  onNavigate: (screen: "grn" | "reorder" | "stock" | "barcode") => void;
};

type RecentOrder = { supplier: string; daysAgo: number; items: number; total: number; status: "Delivered" | "In Transit" };

export default function StoreHubScreenV3({ onNavigate }: StoreHubScreenV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [orderError, setOrderError] = useState(false);
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);

  // V3-019: Fetch real purchase history
  useEffect(() => {
    const fetch = async () => {
      try {
        const online = await isOnline();
        if (!online) { setLoadingOrders(false); return; }
        const result = await getPurchaseHistory(undefined, undefined, 5);
        const orders: RecentOrder[] = (result.entries ?? []).map((e: any) => {
          const daysAgo = Math.max(1, Math.round((Date.now() - new Date(e.created_at ?? e.createdAt ?? Date.now()).getTime()) / 86400000));
          return {
            supplier: e.supplier_name ?? e.supplierName ?? "Supplier",
            daysAgo,
            items: e.item_count ?? e.itemCount ?? 0,
            total: Math.round((e.total_minor ?? e.totalMinor ?? 0) / 100),
            status: (e.status === "delivered" ? "Delivered" : "In Transit") as "Delivered" | "In Transit",
          };
        });
        setRecentOrders(orders);

        // V3-FIX-079: Fetch real low-stock count instead of hardcoded "5 items low"
        try {
          const { apiClient } = require("../../services/api/apiClient");
          const stockRes = await apiClient.get("/api/v1/pos/inventory/low-stock-count");
          if (typeof stockRes?.count === "number") setLowStockCount(stockRes.count);
        } catch { /* non-critical */ }
      } catch (err) {
        logger.debug("StoreHubV3", `fetch_failed:${String(err)}`);
        setOrderError(true);
      }
      setLoadingOrders(false);
    };
    void fetch();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        </Svg>
        <Text style={styles.headerTitle}>Store</Text>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          <Pressable style={styles.card} onPress={() => onNavigate("grn")} accessibilityRole="button">
            <Svg width={36} height={36} viewBox="0 0 48 48" fill="none"><Rect x="8" y="16" width="32" height="24" rx="3" fill={colors.backgroundSecondary} stroke={colors.textTertiary} strokeWidth="1.5" /><Rect x="14" y="8" width="20" height="10" rx="2" fill={colors.primary} /><Path d="M18 12h12" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /><Circle cx="38" cy="36" r="6" fill={colors.success} /><Path d="M35 36l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></Svg>
            <Text style={styles.cardTitle}>Receive Stock</Text>
            <Text style={styles.cardSub}>Scan & receive goods</Text>
          </Pressable>

          {/* V3-FIX-079: Real low-stock count instead of hardcoded "5 items low" */}
          <Pressable style={[styles.card, lowStockCount && lowStockCount > 0 ? styles.cardWarning : null]} onPress={() => onNavigate("reorder")} accessibilityRole="button">
            <Svg width={36} height={36} viewBox="0 0 48 48" fill="none"><Rect x="10" y="6" width="28" height="36" rx="3" fill={colors.primaryLight} stroke={colors.primary} strokeWidth="1.5" /><Path d="M16 14h16M16 20h12M16 26h14" stroke={colors.primary} strokeWidth="1.5" strokeLinecap="round" opacity=".5" /><Circle cx="36" cy="36" r="8" fill={colors.warning} /><Path d="M36 32v4h-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>
            <Text style={styles.cardTitle}>Reorder</Text>
            <Text style={[styles.cardSub, lowStockCount && lowStockCount > 0 ? { color: colors.warning, fontWeight: "700" } : null]}>
              {lowStockCount != null ? `${lowStockCount} item${lowStockCount !== 1 ? "s" : ""} low` : "Smart reorder"}
            </Text>
          </Pressable>

          <Pressable style={styles.card} onPress={() => onNavigate("stock")} accessibilityRole="button">
            <Svg width={36} height={36} viewBox="0 0 48 48" fill="none"><Rect x="6" y="8" width="36" height="32" rx="3" fill={colors.primaryLight} stroke={colors.primary} strokeWidth="1.5" /><Rect x="12" y="26" width="6" height="10" rx="1.5" fill={colors.primary} /><Rect x="21" y="20" width="6" height="16" rx="1.5" fill={colors.primary} opacity=".7" /><Rect x="30" y="14" width="6" height="22" rx="1.5" fill={colors.primary} opacity=".4" /></Svg>
            <Text style={styles.cardTitle}>Stock Report</Text>
            <Text style={styles.cardSub}>Inventory levels</Text>
          </Pressable>

          <Pressable style={styles.card} onPress={() => onNavigate("barcode")} accessibilityRole="button">
            <Svg width={36} height={36} viewBox="0 0 48 48" fill="none"><Rect x="10" y="4" width="28" height="40" rx="3" fill="#fff" stroke={colors.border} strokeWidth="1.5" /><Rect x="14" y="10" width="20" height="4" rx="1" fill={colors.textPrimary} /><Rect x="14" y="16" width="20" height="2" rx="1" fill={colors.textPrimary} opacity=".8" /><Rect x="14" y="20" width="20" height="4" rx="1" fill={colors.textPrimary} /><Circle cx="38" cy="38" r="7" fill={colors.primary} /><Path d="M35 38h6M38 35v6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></Svg>
            <Text style={styles.cardTitle}>Barcode Labels</Text>
            <Text style={styles.cardSub}>Print barcode sheets</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>RECENT ORDERS</Text>
        {loadingOrders ? <ActivityIndicator size="small" color={colors.primary} style={{ padding: 20 }} /> : null}
        {!loadingOrders && orderError ? (
          <View style={{ padding: 20, alignItems: "center" }}>
            <Text style={{ fontSize: 28, marginBottom: 6 }}>⚠</Text>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.error }}>Could not load orders</Text>
            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>Check your connection and try again</Text>
          </View>
        ) : null}
        {!loadingOrders && !orderError && recentOrders.length === 0 ? (
          <View style={{ padding: 20, alignItems: "center" }}>
            <Text style={{ fontSize: 28, marginBottom: 6 }}>📦</Text>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textSecondary }}>No recent orders</Text>
            <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>Place a purchase order to see it here</Text>
          </View>
        ) : null}
        {recentOrders.map((order, i) => (
          <View key={i} style={styles.orderCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderSupplier}>{order.supplier}</Text>
              <Text style={styles.orderMeta}>{order.daysAgo} days ago · {order.items} items</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.orderTotal}>₹{order.total.toLocaleString("en-IN")}</Text>
              <Text style={[styles.orderStatus, { color: order.status === "Delivered" ? colors.success : colors.warning }]}>{order.status} {order.status === "Delivered" ? "✓" : ""}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 8 },
    headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
    body: { flex: 1 },
    grid: { flexDirection: "row", flexWrap: "wrap", padding: 14, gap: 12 },
    card: { width: "47%", backgroundColor: colors.surface, borderRadius: 18, padding: 20, alignItems: "center", borderWidth: 1.5, borderColor: colors.border },
    cardWarning: { borderColor: colors.warning },
    cardTitle: { fontSize: 15, fontWeight: "800", color: colors.textPrimary, marginTop: 8, letterSpacing: -0.3 },
    cardSub: { fontSize: 11, color: colors.textTertiary, marginTop: 4 },
    sectionTitle: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.8, paddingHorizontal: 14, marginTop: 8, marginBottom: 8 },
    orderCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginBottom: 8, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
    orderSupplier: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
    orderMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
    orderTotal: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
    orderStatus: { fontSize: 10, fontWeight: "600", marginTop: 1 },
  });
}
