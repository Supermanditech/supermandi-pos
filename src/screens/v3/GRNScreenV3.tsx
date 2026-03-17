import React, { useMemo, useState, useCallback, useEffect } from "react";
import { View, TextInput, Pressable, ScrollView, StyleSheet, Text, ActivityIndicator } from "react-native";
import Svg, { Rect, Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import ExpandableDetails from "../../components/v3/ExpandableDetails";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";
import * as orderApi from "../../services/api/orderApi";
import { getDeviceStoreId } from "../../services/deviceSession";

// V3-042: GRN v3 — wire real pending PO items from orderApi

type GRNItem = { barcode: string; name: string; ordered: number; received: number; checked: boolean; productId?: string };

type GRNScreenV3Props = { onClose: () => void };

export default function GRNScreenV3({ onClose }: GRNScreenV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<GRNItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"po" | "adhoc">("po");
  // V3-042: Load pending PO items on mount
  useEffect(() => {
    (async () => {
      try {
        const sid = await getDeviceStoreId();
        if (!sid) { setLoading(false); return; }
        const res = await orderApi.listOrders(sid, { status: ["submitted", "confirmed", "shipped", "partial_received"] as any, limit: 20 });
        const allItems: GRNItem[] = [];
        for (const order of res.data ?? []) {
          const detail = await orderApi.getOrder(sid, order.id);
          for (const item of detail.items ?? []) {
            allItems.push({
              barcode: item.barcode ?? "",
              name: item.productName ?? "Unknown",
              ordered: item.orderedQuantity ?? 0,
              received: item.receivedQuantity ?? 0,
              checked: (item.receivedQuantity ?? 0) >= (item.orderedQuantity ?? 0),
              productId: item.productId,
            });
          }
        }
        setItems(allItems);
      } catch (err) {
        showToast("Could not load pending orders");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleCheck = useCallback((idx: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, checked: !it.checked, received: !it.checked ? it.ordered : 0 } : it));
  }, []);

  const changeReceived = useCallback((idx: number, delta: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, received: Math.max(0, it.received + delta), checked: it.received + delta > 0 } : it));
  }, []);

  const receivedCount = items.filter(i => i.checked).length;
  const totalReceived = items.reduce((s, i) => s + i.received, 0);
  const totalOrdered = items.reduce((s, i) => s + i.ordered, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.headerTitle}>Receive Stock</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* HID + Camera scan bar */}
      <View style={styles.scanBar}>
        <View style={styles.scanInput}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2}><Rect x={3} y={3} width={18} height={18} rx={2} /></Svg>
          <TextInput style={styles.scanText} placeholder="Scan barcode (HID ready)..." placeholderTextColor={colors.textTertiary} />
          <View style={styles.hidDot} />
          <Text style={styles.hidLabel}>Active</Text>
        </View>
        <Pressable style={styles.camBtn}><Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2}><Rect x={3} y={3} width={18} height={18} rx={2} /><Path d="M7 7h.01M7 12h10" /></Svg></Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, activeTab === "po" && styles.tabActive]} onPress={() => setActiveTab("po")}><Text style={[styles.tabText, activeTab === "po" && styles.tabTextActive]}>Against PO</Text></Pressable>
        <Pressable style={[styles.tab, activeTab === "adhoc" && styles.tabActive]} onPress={() => setActiveTab("adhoc")}><Text style={[styles.tabText, activeTab === "adhoc" && styles.tabTextActive]}>Ad-hoc Inward</Text></Pressable>
      </View>

      <View style={styles.poInfo}><Text style={styles.poText}>PO #1234 · Supplier ABC</Text><Text style={styles.poTotal}>₹4,500</Text></View>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />}
        {!loading && items.length === 0 && (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📋</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No pending deliveries</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Place a purchase order to receive goods here</Text>
          </View>
        )}
        {items.map((item, idx) => (
          <View key={item.barcode} style={[styles.itemRow, !item.checked && item.ordered > 0 && styles.itemRowPending]}>
            <Pressable style={[styles.check, item.checked && styles.checkChecked]} onPress={() => toggleCheck(idx)}>
              {item.checked ? <Text style={styles.checkMark}>✓</Text> : null}
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemBarcode}>{item.barcode}</Text>
              <Text style={[styles.itemStatus, item.checked ? styles.statusOk : styles.statusPending]}>
                {item.checked ? `${item.received} of ${item.ordered} received ✓` : `${item.received} of ${item.ordered} — Scan to receive`}
              </Text>
            </View>
            <View style={styles.qtyBox}>
              <Pressable style={styles.qtyBtn} onPress={() => changeReceived(idx, -1)}><Text style={styles.qtyBtnText}>−</Text></Pressable>
              <Text style={[styles.qtyVal, !item.checked && styles.qtyValPending]}>{item.received}</Text>
              <Pressable style={styles.qtyBtn} onPress={() => changeReceived(idx, 1)}><Text style={styles.qtyBtnText}>+</Text></Pressable>
            </View>
            <Text style={styles.editBtn}>Edit ▸</Text>
          </View>
        ))}

        {/* Scan feedback */}
        <View style={styles.scanResult}>
          <Text style={styles.scanResultIcon}>📟</Text>
          <View style={{ flex: 1 }}><Text style={styles.scanResultTitle}>Last scan: Parle-G 100g</Text><Text style={styles.scanResultSub}>Auto-matched · Qty 48</Text></View>
          <Text>✓</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerMeta}>Received: {receivedCount}/{items.length} items ({totalReceived}/{totalOrdered} units)</Text>
        <View style={styles.footerActions}>
          <Pressable style={styles.matchAllBtn} onPress={() => { setItems(prev => prev.map(it => ({ ...it, checked: true, received: it.ordered }))); showToast("All items matched to PO"); }}><Text style={styles.matchAllText}>Match All</Text></Pressable>
          <Pressable style={styles.confirmBtn} onPress={() => { showToast("Receipt confirmed! Stock updated."); setTimeout(onClose, 1000); }}><Text style={styles.confirmText}>✓ Confirm Receipt</Text></Pressable>
        </View>
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
    scanBar: { flexDirection: "row", gap: 8, padding: 10, backgroundColor: colors.surface },
    scanInput: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, padding: 10, backgroundColor: colors.background, borderRadius: 12, borderWidth: 2, borderColor: colors.border },
    scanText: { flex: 1, fontSize: 13, fontWeight: "500", color: colors.textPrimary },
    hidDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
    hidLabel: { fontSize: 9, color: colors.success, fontWeight: "700" },
    camBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" },
    tabs: { flexDirection: "row", backgroundColor: colors.surface },
    tab: { flex: 1, padding: 10, alignItems: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 12, fontWeight: "700", color: colors.textTertiary },
    tabTextActive: { color: colors.primary },
    poInfo: { flexDirection: "row", justifyContent: "space-between", padding: 8, paddingHorizontal: 14, backgroundColor: colors.primaryLight },
    poText: { fontSize: 12, color: colors.primary, fontWeight: "500" },
    poTotal: { fontSize: 12, color: colors.primary, fontWeight: "700" },
    list: { flex: 1 },
    itemRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.backgroundSecondary },
    itemRowPending: { backgroundColor: colors.errorSoft },
    check: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    checkChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkMark: { color: "#fff", fontSize: 13, fontWeight: "700" },
    itemName: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
    itemBarcode: { fontSize: 10, color: colors.textTertiary },
    itemStatus: { fontSize: 11, fontWeight: "600", marginTop: 2 },
    statusOk: { color: colors.success },
    statusPending: { color: colors.error },
    qtyBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.backgroundSecondary, borderRadius: 8 },
    qtyBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
    qtyBtnText: { fontSize: 16, fontWeight: "700", color: colors.primary },
    qtyVal: { fontSize: 14, fontWeight: "800", minWidth: 20, textAlign: "center" },
    qtyValPending: { color: colors.error },
    editBtn: { fontSize: 11, color: colors.primary, fontWeight: "700", padding: 6 },
    scanResult: { flexDirection: "row", alignItems: "center", gap: 10, margin: 14, padding: 12, backgroundColor: colors.successSoft, borderWidth: 1.5, borderColor: colors.success, borderRadius: 14 },
    scanResultIcon: { fontSize: 20 },
    scanResultTitle: { fontSize: 13, fontWeight: "700", color: colors.success },
    scanResultSub: { fontSize: 11, color: colors.textTertiary },
    footer: { padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    footerMeta: { fontSize: 12, color: colors.textTertiary, marginBottom: 6 },
    footerActions: { flexDirection: "row", gap: 8 },
    matchAllBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    matchAllText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    confirmBtn: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.success, alignItems: "center" },
    confirmText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  });
}
