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
import BillDetailScreenV3 from "./BillDetailScreenV3";

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
  // GCP-STG-0070: Date range filter
  const [dateFilter, setDateFilter] = useState<"today" | "week" | "month" | "all">("today");
  const [selectedBill, setSelectedBill] = useState<{
    billRef: string; date: string; method: string; totalMinor: number;
    items: { name: string; qty: number; priceMinor: number }[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const online = await isOnline();
        if (!online) { showToast("Offline — sales history unavailable"); setLoading(false); return; }
        // GCP-STG-0070: Build date range query params
        let dateParam = "";
        const now = new Date();
        if (dateFilter === "today") {
          dateParam = `&from=${now.toISOString().slice(0, 10)}`;
        } else if (dateFilter === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 86400000);
          dateParam = `&from=${weekAgo.toISOString().slice(0, 10)}`;
        } else if (dateFilter === "month") {
          const monthAgo = new Date(now.getTime() - 30 * 86400000);
          dateParam = `&from=${monthAgo.toISOString().slice(0, 10)}`;
        }
        const res = await apiClient.get<any>(`/api/v1/pos/sales?limit=100&sort=created_at_desc${dateParam}`);
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
  }, [dateFilter]);

  const handleBillTap = async (sale: SaleRow) => {
    try {
      setLoadingDetail(true);
      const online = await isOnline();
      if (!online) {
        // Offline: show basic detail without line items
        setSelectedBill({
          billRef: sale.billRef, date: formatTime(sale.createdAt),
          method: sale.paymentMode, totalMinor: sale.totalMinor, items: [],
        });
        return;
      }
      const res = await apiClient.get<any>(`/api/v1/pos/sales/${sale.id}`);
      const saleData = res?.sale ?? res;
      const items = (saleData?.items ?? saleData?.sale_items ?? []).map((i: any) => ({
        name: i.productName ?? i.product_name ?? i.name ?? "Item",
        qty: i.quantity ?? i.qty ?? 1,
        priceMinor: i.priceMinor ?? i.price_minor ?? i.total_minor ?? 0,
      }));
      setSelectedBill({
        billRef: sale.billRef, date: formatTime(sale.createdAt),
        method: sale.paymentMode, totalMinor: sale.totalMinor, items,
      });
    } catch { showToast("Could not load bill details"); }
    finally { setLoadingDetail(false); }
  };

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

      {/* GCP-STG-0070: Date range filter tabs */}
      <View style={styles.filterRow}>
        {(["today", "week", "month", "all"] as const).map((f) => (
          <Pressable key={f} style={[styles.filterTab, dateFilter === f && styles.filterTabActive]} onPress={() => setDateFilter(f)}>
            <Text style={[styles.filterText, dateFilter === f && styles.filterTextActive]}>{f === "today" ? "Today" : f === "week" ? "This Week" : f === "month" ? "This Month" : "All"}</Text>
          </Pressable>
        ))}
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
          <Pressable style={styles.row} onPress={() => handleBillTap(item)}>
            <Text style={styles.modeIcon}>{modeIcon(item.paymentMode)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.billRef}>{item.billRef}</Text>
              <Text style={styles.meta}>{item.itemCount} item{item.itemCount !== 1 ? "s" : ""} · {formatTime(item.createdAt)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.amount}>₹{Math.round(item.totalMinor / 100).toLocaleString("en-IN")}</Text>
              <Text style={styles.mode}>{modeLabel(item.paymentMode)}</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginLeft: 4 }}>›</Text>
          </Pressable>
        )}
      />

      {loadingDetail ? <ActivityIndicator size="large" color={colors.primary} style={{ position: "absolute", top: "50%", alignSelf: "center" }} /> : null}

      {selectedBill ? (
        <View style={StyleSheet.absoluteFill}>
          <BillDetailScreenV3
            billRef={selectedBill.billRef}
            date={selectedBill.date}
            method={selectedBill.method}
            totalMinor={selectedBill.totalMinor}
            items={selectedBill.items}
            onClose={() => setSelectedBill(null)}
          />
        </View>
      ) : null}
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
    // GCP-STG-0070: Date filter tabs
    filterRow: { flexDirection: "row", gap: 6, paddingHorizontal: getScreenPadding(), paddingVertical: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    filterTab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: colors.backgroundSecondary },
    filterTabActive: { backgroundColor: colors.primary },
    filterText: { fontSize: 11, fontWeight: "600", color: colors.textSecondary },
    filterTextActive: { color: "#fff" },
    row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: colors.surface, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    modeIcon: { fontSize: 20 },
    billRef: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    meta: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
    amount: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
    mode: { fontSize: 10, color: colors.textTertiary, fontWeight: "600", marginTop: 1 },
  });
}
