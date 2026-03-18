import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Pressable, ScrollView, TextInput, StyleSheet, Text, ActivityIndicator } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";
import { listPendingReorders, getStockDeficit, isCriticallyLow, getEstimatedTotal, approvePendingReorders } from "../../services/api/reorderApi";
import type { PendingReorder } from "../../services/api/reorderApi";
import { getDeviceStoreId } from "../../services/deviceSession";
import { isOnline } from "../../services/networkStatus";

// V3-043: Reorder v3 — wire real listPendingReorders API

type ReorderItem = { name: string; stock: number; dailySales: number; daysLeft: number; orderQty: number; cost: number; supplier: string; urgency: "critical" | "low" | "normal"; id: string };

type Props = { onClose: () => void };

export default function ReorderScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const handleQtyEdit = useCallback((idx: number, newQty: string) => {
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty < 1) return;
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, orderQty: qty, cost: qty * (it.cost / (it.orderQty || 1)) } : it));
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const sid = await getDeviceStoreId();
        if (!sid) { setLoading(false); return; }
        const res = await listPendingReorders(sid, { status: "pending", limit: 50 });
        const mapped: ReorderItem[] = (res.data ?? []).map((p: PendingReorder) => {
          const deficit = getStockDeficit(p);
          const dailySales = deficit > 0 ? Math.ceil(deficit / 7) : 1;
          const daysLeft = dailySales > 0 ? Math.round(p.currentStock / dailySales) : 99;
          return {
            id: p.id,
            name: p.productName,
            stock: p.currentStock,
            dailySales,
            daysLeft,
            orderQty: p.suggestedQuantity,
            cost: getEstimatedTotal(p),
            supplier: p.suggestedSupplierName ?? "Unknown",
            urgency: isCriticallyLow(p) ? "critical" as const : daysLeft <= 3 ? "low" as const : "normal" as const,
          };
        });
        setItems(mapped);
      } catch (err) {
        setLoadError(true);
        showToast("Could not load reorder suggestions");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const total = items.reduce((s, i) => s + i.cost, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Reorder Suggestions</Text><View style={{ width: 30 }} /></View>
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />}
        {!loading && loadError && (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>⚠</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.error }}>Could not load suggestions</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Check connection and try again</Text>
          </View>
        )}
        {!loading && !loadError && items.length === 0 && (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>✅</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>All stock levels healthy</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>No reorder suggestions right now</Text>
          </View>
        )}
        {items.map((item, i) => (
          <View key={i} style={[styles.card, { borderLeftColor: item.urgency === "critical" ? colors.error : item.urgency === "low" ? colors.warning : colors.border }]}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemMeta}>Stock: {item.stock} · Sells ~{item.dailySales}/day</Text>
                <Text style={[styles.urgencyText, { color: item.urgency === "critical" ? colors.error : item.urgency === "low" ? colors.warning : colors.textTertiary }]}>
                  {item.urgency === "critical" ? "Runs out today!" : item.urgency === "low" ? `${item.daysLeft} days left` : `${item.daysLeft} days`}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.orderQty}>Order {item.orderQty}</Text>
                <Text style={styles.orderCost}>₹{item.cost} · {item.supplier}</Text>
              </View>
            </View>
            <View style={styles.cardActions}>
              <Pressable style={[styles.approveBtn, approvedIds.has(item.id) && { opacity: 0.5 }]} disabled={approvedIds.has(item.id)} onPress={async () => {
                const online = await isOnline();
                if (!online) { showToast("Approve requires connection"); return; }
                const sid = await getDeviceStoreId();
                if (!sid) return;
                try {
                  await approvePendingReorders(sid, [item.id]);
                  setApprovedIds((prev) => new Set(prev).add(item.id));
                  showToast(`${item.name} approved — order will be placed`);
                } catch { showToast("Failed to approve"); }
              }}><Text style={styles.approveBtnText}>{approvedIds.has(item.id) ? "✓ Approved" : "✓ Approve"}</Text></Pressable>
              <Pressable style={styles.editBtn} onPress={() => setEditingIdx(editingIdx === i ? null : i)}><Text style={styles.editBtnText}>{editingIdx === i ? "Done" : "Edit"}</Text></Pressable>
              <Pressable style={styles.dismissBtn} onPress={() => setItems((prev) => prev.filter((_, j) => j !== i))}><Text style={styles.dismissBtnText}>✕</Text></Pressable>
            </View>
            {editingIdx === i ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, padding: 8, backgroundColor: colors.primaryLight, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary }}>Order Qty:</Text>
                <TextInput style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1.5, borderColor: colors.primary, fontSize: 14, fontWeight: "700", textAlign: "center", backgroundColor: colors.surface }} defaultValue={String(item.orderQty)} onEndEditing={(e) => handleQtyEdit(i, e.nativeEvent.text)} keyboardType="numeric" />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        {/* V3-FIX-080: Real WhatsApp send with order summary */}
        <Pressable style={styles.waBtn} onPress={() => {
          if (items.length === 0) { showToast("No items to send"); return; }
          const itemLines = items.map((it) => `• ${it.name} ×${it.orderQty} (${it.supplier})`).join("\n");
          const msg = encodeURIComponent(`*Reorder Request*\n${itemLines}\n\n*Total: ₹${total}*`);
          const { Linking } = require("react-native");
          Linking.openURL(`whatsapp://send?text=${msg}`).catch(() => showToast("WhatsApp not installed"));
        }}><Svg width={14} height={14} viewBox="0 0 24 24" fill="#fff"><Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><Path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.72-1.391A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" /></Svg><Text style={styles.waBtnText}>Send to Suppliers</Text></Pressable>
        <Pressable style={styles.approveAllBtn} onPress={async () => {
          const online = await isOnline();
          if (!online) { showToast("Approve requires connection"); return; }
          const sid = await getDeviceStoreId();
          if (!sid) return;
          const unapproved = items.filter((it) => !approvedIds.has(it.id)).map((it) => it.id);
          if (unapproved.length === 0) { showToast("All already approved"); return; }
          try {
            await approvePendingReorders(sid, unapproved);
            setApprovedIds(new Set(items.map((it) => it.id)));
            showToast(`${unapproved.length} items approved`);
          } catch { showToast("Failed to approve all"); }
        }}><Text style={styles.approveAllText}>Approve All (₹{total})</Text></Pressable>
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
    body: { flex: 1, padding: 14 },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, marginBottom: 8 },
    cardTop: { flexDirection: "row" },
    itemName: { fontSize: 14, fontWeight: "800" },
    itemMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
    urgencyText: { fontSize: 11, fontWeight: "700", marginTop: 2 },
    orderQty: { fontSize: 13, fontWeight: "800" },
    orderCost: { fontSize: 11, color: colors.textTertiary },
    cardActions: { flexDirection: "row", gap: 6, marginTop: 10 },
    approveBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" },
    approveBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
    editBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    editBtnText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    dismissBtn: { paddingVertical: 10, paddingHorizontal: 14, alignItems: "center" },
    dismissBtnText: { fontSize: 14, color: colors.textTertiary },
    footer: { flexDirection: "row", gap: 8, padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    waBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: "#25D366" },
    waBtnText: { fontSize: 11, fontWeight: "700", color: "#fff" },
    approveAllBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" },
    approveAllText: { fontSize: 14, fontWeight: "800", color: "#fff" },
  });
}
