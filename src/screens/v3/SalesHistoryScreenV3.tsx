/**
 * V3-FIX-093: Dedicated Sales History screen
 * Prototype: bill rows with payment type, amount, item/time metadata
 */
import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, FlatList, ActivityIndicator, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { apiClient } from "../../services/api/apiClient";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";

type SaleRow = {
  id: string;
  billRef: string;
  totalMinor: number;
  itemCount: number;
  paymentMode: string;
  createdAt: string;
};

type Props = { onClose: () => void };

export default function SalesHistoryScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const online = await isOnline();
        if (!online) { showToast("Offline — sales history unavailable"); setLoading(false); return; }
        const res = await apiClient.get<any>("/api/v1/pos/sales?limit=50&sort=created_at_desc");
        const rows: SaleRow[] = (res?.sales ?? res?.data ?? []).map((s: any) => ({
          id: s.id,
          billRef: s.billRef ?? s.bill_ref ?? s.id?.substring(0, 8),
          totalMinor: s.totalMinor ?? s.total_minor ?? 0,
          itemCount: s.itemCount ?? s.item_count ?? 0,
          paymentMode: s.paymentMode ?? s.payment_mode ?? "—",
          createdAt: s.createdAt ?? s.created_at ?? "",
        }));
        setSales(rows);
      } catch { showToast("Could not load sales history"); }
      finally { setLoading(false); }
    })();
  }, []);

  const modeIcon = (m: string) => m === "CASH" ? "💵" : m === "UPI" ? "📱" : m === "DUE" ? "📋" : "💰";
  const modeLabel = (m: string) => m === "CASH" ? "Cash" : m === "UPI" ? "UPI" : m === "DUE" ? "Udhar" : m;

  const formatTime = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) + " · " + d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.headerTitle}>Sales History</Text>
        <View style={{ width: 30 }} />
      </View>

      {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : null}

      <FlatList
        data={sales}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 14 }}
        ListEmptyComponent={!loading ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🧾</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No sales yet</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Complete a sale to see it here</Text>
          </View>
        ) : null}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.modeIcon}>{modeIcon(item.paymentMode)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.billRef}>{item.billRef}</Text>
              <Text style={styles.meta}>{item.itemCount} item{item.itemCount !== 1 ? "s" : ""} · {formatTime(item.createdAt)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.amount}>₹{Math.round(item.totalMinor / 100).toLocaleString("en-IN")}</Text>
              <Text style={styles.mode}>{modeLabel(item.paymentMode)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: getScreenPadding(), paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: colors.surface, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    modeIcon: { fontSize: 20 },
    billRef: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    meta: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
    amount: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
    mode: { fontSize: 10, color: colors.textTertiary, fontWeight: "600", marginTop: 1 },
  });
}
