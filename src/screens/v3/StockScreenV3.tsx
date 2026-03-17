import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, TextInput, FlatList, StyleSheet, Text, ActivityIndicator, Alert } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getStockStatement } from "../../services/api/inventoryApi";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";

// V3-044: Stock screen v3 — wire real getStockStatement API

type StockItem = { name: string; costMinor: number; sellMinor: number; stock: number; status: "in" | "low" | "out" };

type Props = { onClose: () => void };

export default function StockScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<"current" | "unsold" | "movement">("current");
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const online = await isOnline();
        if (!online) { showToast("Offline — stock data unavailable"); setLoading(false); return; }
        const res = await getStockStatement(200, true);
        const mapped: StockItem[] = (res.data ?? []).map((p: any) => ({
          name: p.name ?? "Unknown",
          costMinor: p.unitCostMinor ?? 0,
          sellMinor: p.unitPriceMinor ?? p.priceMinor ?? 0,
          stock: p.quantity ?? 0,
          status: (p.quantity ?? 0) <= 0 ? "out" as const : (p.quantity ?? 0) <= (p.lowStockThreshold ?? 5) ? "low" as const : "in" as const,
        }));
        setItems(mapped);
      } catch (err) {
        showToast("Could not load stock data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalProducts = items.length;
  const lowCount = items.filter(i => i.status === "low").length;
  const outCount = items.filter(i => i.status === "out").length;

  const statusColor = (s: string) => s === "in" ? colors.success : s === "low" ? colors.warning : colors.error;
  const statusLabel = (s: string) => s === "in" ? "In stock" : s === "low" ? "Low" : "Out";

  return (
    <View style={styles.container}>
      <View style={styles.header}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Stock & Inventory</Text><View style={{ width: 30 }} /></View>

      <View style={styles.tabs}>
        {(["current", "unsold", "movement"] as const).map(t => (
          <Pressable key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t === "current" ? "Current" : t === "unsold" ? "Unsold" : "Movement"}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}><Text style={styles.statLabel}>Products</Text><Text style={styles.statVal}>{totalProducts}</Text></View>
        <View style={[styles.stat, { borderColor: colors.warning }]}><Text style={styles.statLabel}>Low</Text><Text style={[styles.statVal, { color: colors.warning }]}>{lowCount}</Text></View>
        <View style={[styles.stat, { borderColor: colors.error }]}><Text style={styles.statLabel}>Out</Text><Text style={[styles.statVal, { color: colors.error }]}>{outCount}</Text></View>
      </View>

      <View style={styles.searchBar}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth={2}><Circle cx={11} cy={11} r={8} /><Path d="M21 21l-4.35-4.35" /></Svg>
        <TextInput style={styles.searchInput} placeholder="Search product..." placeholderTextColor={colors.textTertiary} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(_, i) => String(i)}
        ListEmptyComponent={!loading ? <View style={{ padding: 32, alignItems: "center" }}><Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text><Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No inventory</Text><Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Add products to see stock levels here</Text></View> : null}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={styles.itemImg}><Text style={{ fontSize: 18 }}>📦</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>Cost ₹{(item.costMinor / 100).toFixed(0)} · Sell ₹{(item.sellMinor / 100).toFixed(0)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.stockQty, { color: statusColor(item.status) }]}>{item.stock}</Text>
              <Text style={[styles.stockLabel, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
            </View>
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.footer}>
        <Pressable style={styles.footerBtn} onPress={() => {
          Alert.alert("Opening Stock", "Scan barcodes and enter opening quantities for initial inventory setup.", [
            { text: "Cancel", style: "cancel" },
            { text: "Start Scanning", onPress: () => showToast("Navigate to scan screen for opening stock") },
          ]);
        }}><Text style={styles.footerBtnText}>Opening Stock</Text></Pressable>
        <Pressable style={styles.footerBtn} onPress={() => {
          if (items.length === 0) { showToast("Add products first to print barcode labels"); return; }
          Alert.alert("Barcode Labels", `Print barcode labels for ${items.length} products?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Print", onPress: () => showToast(`Printing labels for ${items.length} products...`) },
          ]);
        }}><Text style={styles.footerBtnText}>Barcode Labels</Text></Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    tabs: { flexDirection: "row", backgroundColor: colors.surface },
    tab: { flex: 1, padding: 10, alignItems: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 12, fontWeight: "700", color: colors.textTertiary },
    tabTextActive: { color: colors.primary },
    statsRow: { flexDirection: "row", gap: 6, padding: 10, paddingHorizontal: 14 },
    stat: { flex: 1, padding: 10, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    statLabel: { fontSize: 10, fontWeight: "700", color: colors.textTertiary },
    statVal: { fontSize: 18, fontWeight: "900", marginTop: 2 },
    searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 14, marginBottom: 8, padding: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border },
    searchInput: { flex: 1, fontSize: 13, fontWeight: "500", color: colors.textPrimary },
    itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.backgroundSecondary },
    itemImg: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" },
    itemName: { fontSize: 14, fontWeight: "700" },
    itemMeta: { fontSize: 11, color: colors.textTertiary },
    stockQty: { fontSize: 15, fontWeight: "900" },
    stockLabel: { fontSize: 10, fontWeight: "600" },
    footer: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    footerBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    footerBtnText: { fontSize: 12, fontWeight: "700", color: colors.primary },
  });
}
