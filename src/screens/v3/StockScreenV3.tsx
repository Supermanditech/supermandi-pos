import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Pressable, TextInput, FlatList, StyleSheet, Text, ActivityIndicator, Alert, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding, getChipFontSize } from "../../theme/responsive";
import { getStockStatement, getStockBatches } from "../../services/api/inventoryApi";
import type { StockBatch } from "../../services/api/inventoryApi";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";

// V3-044: Stock screen v3 — wire real getStockStatement API

// V3-FIX-080: Carry barcode for label printing
// GCP-STG-0392: Added productId for batch lookup
type StockItem = { productId: string; name: string; barcode: string; costMinor: number; sellMinor: number; stock: number; status: "in" | "low" | "out" };

type Props = { onClose: () => void; onOpeningStock?: () => void };

export default function StockScreenV3({ onClose, onOpeningStock }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<"current" | "unsold" | "movement">("current");
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadStock = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const online = await isOnline();
      if (!online) { showToast("Offline — stock data unavailable"); setLoading(false); return; }
      const res = await getStockStatement(200, true);
      // GCP-STG-0057 FIX: Map real API fields (displayName, currentStock, sellPrice, purchasePrice)
      const LOW_STOCK_THRESHOLD = 10;
      const mapped: StockItem[] = (res.data ?? []).map((p: any) => {
        const stock = Number(p.currentStock ?? 0);
        return {
          productId: p.productId ?? p.id ?? "",
          name: p.displayName ?? p.name ?? "Unknown",
          barcode: p.barcode ?? p.primaryBarcode ?? "",
          costMinor: Math.round((p.purchasePrice ?? 0) * 100),
          sellMinor: Math.round((p.sellPrice ?? 0) * 100),
          stock,
          status: stock <= 0 ? "out" as const : stock <= LOW_STOCK_THRESHOLD ? "low" as const : "in" as const,
        };
      });
      setItems(mapped);
    } catch (err) {
      setLoadError(true);
      showToast("Could not load stock data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStock(); }, [loadStock]);

  const [searchQuery, setSearchQuery] = useState("");
  const filteredItems = useMemo(() => {
    // GCP-STG-0057: Tab-specific filtering
    let tabFiltered = items;
    if (activeTab === "unsold") {
      // Unsold = zero stock (dead SKUs sitting in catalog)
      tabFiltered = items.filter((i) => i.stock <= 0);
    } else if (activeTab === "movement") {
      // Movement = low/out items sorted by stock ascending (most critical first)
      tabFiltered = [...items].filter((i) => i.status === "low" || i.status === "out")
        .sort((a, b) => a.stock - b.stock);
    }
    if (!searchQuery.trim()) return tabFiltered;
    const q = searchQuery.toLowerCase();
    return tabFiltered.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, searchQuery, activeTab]);

  const totalProducts = items.length;
  const lowCount = items.filter(i => i.status === "low").length;
  const outCount = items.filter(i => i.status === "out").length;

  const statusColor = (s: string) => s === "in" ? colors.success : s === "low" ? colors.warning : colors.error;
  const statusLabel = (s: string) => s === "in" ? "In stock" : s === "low" ? "Low" : "Out";

  // GCP-STG-0392: Batch breakdown modal state
  const [batchModalItem, setBatchModalItem] = useState<StockItem | null>(null);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  const openBatchModal = useCallback(async (item: StockItem) => {
    setBatchModalItem(item);
    setBatches([]);
    setBatchLoading(true);
    try {
      const res = await getStockBatches(item.productId);
      setBatches(res.batches ?? []);
    } catch {
      showToast("Could not load batch data");
    } finally {
      setBatchLoading(false);
    }
  }, []);

  const formatExpiryDate = (d: string | null) => {
    if (!d) return "N/A";
    const date = new Date(d);
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const formatted = `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;
    if (diffDays < 0) return `${formatted} (EXPIRED)`;
    if (diffDays <= 30) return `${formatted} (${diffDays}d)`;
    return formatted;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Stock & Inventory</Text><View style={{ width: 30 }} /></View>

      <View style={styles.tabs}>
        {(["current", "unsold", "movement"] as const).map(t => (
          <Pressable key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t === "current" ? "Current" : t === "unsold" ? "Unsold" : "Movement"}</Text>
          </Pressable>
        ))}
      </View>

      {/* GCP-STG-0057 FIX: Error state with retry button */}
      {!loading && loadError ? (
        <View style={{ padding: 32, alignItems: "center" }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>⚠</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.error }}>Could not load stock data</Text>
          <Pressable onPress={loadStock} style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <View style={styles.stat}><Text style={styles.statLabel}>Products</Text><Text style={styles.statVal}>{totalProducts}</Text></View>
        <View style={[styles.stat, { borderColor: colors.warning }]}><Text style={styles.statLabel}>Low</Text><Text style={[styles.statVal, { color: colors.warning }]}>{lowCount}</Text></View>
        <View style={[styles.stat, { borderColor: colors.error }]}><Text style={styles.statLabel}>Out</Text><Text style={[styles.statVal, { color: colors.error }]}>{outCount}</Text></View>
      </View>

      <View style={styles.searchBar}>
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth={2}><Circle cx={11} cy={11} r={8} /><Path d="M21 21l-4.35-4.35" /></Svg>
        <TextInput style={styles.searchInput} placeholder="Search product..." placeholderTextColor={colors.textTertiary} value={searchQuery} onChangeText={setSearchQuery} />
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(_, i) => String(i)}
        ListEmptyComponent={!loading ? <View style={{ padding: 32, alignItems: "center" }}><Text style={{ fontSize: 36, marginBottom: 8 }}>{searchQuery.trim() ? "🔍" : activeTab === "unsold" ? "✅" : activeTab === "movement" ? "📊" : "📦"}</Text><Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>{searchQuery.trim() ? `No results for '${searchQuery.trim()}'` : activeTab === "unsold" ? "No dead stock" : activeTab === "movement" ? "No stock alerts" : "No inventory"}</Text><Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>{searchQuery.trim() ? "Try a different search term" : activeTab === "unsold" ? "All products have stock — great!" : activeTab === "movement" ? "All stock levels are healthy" : "Add products to see stock levels here"}</Text></View> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.itemRow} onPress={() => {
            // GCP-STG-0392: Open batch breakdown modal (replaces simple Alert)
            void openBatchModal(item);
          }}>
            <View style={styles.itemImg}><Text style={{ fontSize: 18 }}>📦</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>Cost ₹{(item.costMinor / 100).toFixed(0)} · Sell ₹{(item.sellMinor / 100).toFixed(0)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.stockQty, { color: statusColor(item.status) }]}>{item.stock}</Text>
              <Text style={[styles.stockLabel, { color: statusColor(item.status) }]}>{statusLabel(item.status)}</Text>
            </View>
          </Pressable>
        )}
        showsVerticalScrollIndicator={false}
      />

      {/* GCP-STG-0392: Batch breakdown modal */}
      <Modal visible={!!batchModalItem} transparent animationType="slide" onRequestClose={() => setBatchModalItem(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%", padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.textPrimary, flex: 1 }}>{batchModalItem?.name ?? ""}</Text>
              <Pressable onPress={() => setBatchModalItem(null)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 18, color: colors.textTertiary }}>X</Text>
              </Pressable>
            </View>
            {batchModalItem ? (
              <View style={{ marginBottom: 12, padding: 10, backgroundColor: colors.surface, borderRadius: 10 }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  Total Stock: {batchModalItem.stock} | Cost: Rs.{(batchModalItem.costMinor / 100).toFixed(0)} | Sell: Rs.{(batchModalItem.sellMinor / 100).toFixed(0)}
                </Text>
                {batchModalItem.barcode ? <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 2 }}>Barcode: {batchModalItem.barcode}</Text> : null}
              </View>
            ) : null}
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 }}>Batch Breakdown</Text>
            {batchLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
            ) : batches.length === 0 ? (
              <View style={{ padding: 20, alignItems: "center" }}>
                <Text style={{ fontSize: 13, color: colors.textTertiary }}>No batch records found</Text>
                <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Batch data is recorded when goods are received with batch/expiry info</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {batches.map((b, idx) => {
                  const isExpired = b.expiryDate ? new Date(b.expiryDate) < new Date() : false;
                  return (
                    <View key={b.id || idx} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: isExpired ? "rgba(255,0,0,0.05)" : "transparent" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.textPrimary }}>{b.batchNumber || "No batch #"}</Text>
                        <Text style={{ fontSize: 12, color: isExpired ? colors.error : colors.textTertiary, marginTop: 2 }}>
                          Expiry: {formatExpiryDate(b.expiryDate)}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
                          Received: {b.receivedAt ? new Date(b.receivedAt).toLocaleDateString() : "N/A"}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 16, fontWeight: "900", color: isExpired ? colors.error : colors.textPrimary }}>{b.currentQty}</Text>
                        <Text style={{ fontSize: 10, color: colors.textTertiary }}>qty</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* V3-FIX-080: Real actions instead of placeholder alerts */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable style={styles.footerBtn} onPress={() => {
          // V3-FIX-080: Navigate to scan in stock_in context via wrapper
          if (onOpeningStock) { onOpeningStock(); }
          else { showToast("Opening stock — navigate to scan screen"); }
        }} accessibilityLabel="Opening stock entry">
          <Text style={styles.footerBtnText}>Opening Stock</Text>
        </Pressable>
        <Pressable style={styles.footerBtn} onPress={async () => {
          if (items.length === 0) { showToast("Add products first to print barcode labels"); return; }
          try {
            const { printerService } = require("../../services/printerService");
            // V3-FIX-080: Use real barcode + sellMinor from StockItem
            const labels = items.map((p) => `${p.name}\n${p.barcode || "—"}\n₹${Math.round(p.sellMinor / 100)}`).join("\n\n");
            const ok = await printerService.printReceipt(labels);
            showToast(ok ? `${items.length} barcode labels sent to printer` : "Print failed — check printer connection");
          } catch { showToast("Printer not available"); }
        }} accessibilityLabel="Print barcode labels">
          <Text style={styles.footerBtnText}>Barcode Labels</Text>
        </Pressable>
      </View>
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
    tabs: { flexDirection: "row", backgroundColor: colors.surface },
    tab: { flex: 1, padding: 10, alignItems: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: getChipFontSize(), fontWeight: "700", color: colors.textTertiary },
    tabTextActive: { color: colors.primary },
    statsRow: { flexDirection: "row", gap: 6, padding: 10, paddingHorizontal: getScreenPadding() },
    stat: { flex: 1, padding: 10, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
    statLabel: { fontSize: 10, fontWeight: "700", color: colors.textTertiary },
    statVal: { fontSize: 18, fontWeight: "900", marginTop: 2 },
    searchBar: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: getScreenPadding(), marginBottom: 8, padding: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border },
    searchInput: { flex: 1, fontSize: 13, fontWeight: "500", color: colors.textPrimary },
    itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: getScreenPadding(), paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.backgroundSecondary },
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
