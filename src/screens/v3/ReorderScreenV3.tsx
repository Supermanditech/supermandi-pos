import React, { useMemo } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";

// STG-569: Reorder v3 — stock runout prediction, approve/edit/dismiss, WhatsApp send

type ReorderItem = { name: string; stock: number; dailySales: number; daysLeft: number; orderQty: number; cost: number; supplier: string; urgency: "critical" | "low" | "normal" };

const DEMO: ReorderItem[] = [
  { name: "Amul Milk 500ml", stock: 5, dailySales: 8, daysLeft: 1, orderQty: 30, cost: 420, supplier: "Fresh Dairy", urgency: "critical" },
  { name: "Parle-G 100g", stock: 12, dailySales: 6, daysLeft: 2, orderQty: 50, cost: 260, supplier: "ABC Dist.", urgency: "low" },
  { name: "Tata Salt 1kg", stock: 8, dailySales: 2, daysLeft: 4, orderQty: 24, cost: 384, supplier: "ABC Dist.", urgency: "normal" },
];

type Props = { onClose: () => void };

export default function ReorderScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const total = DEMO.reduce((s, i) => s + i.cost, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Reorder Suggestions</Text><View style={{ width: 30 }} /></View>
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {DEMO.map((item, i) => (
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
              <Pressable style={styles.approveBtn} onPress={() => showToast(`${item.name} approved`)}><Text style={styles.approveBtnText}>✓ Approve</Text></Pressable>
              <Pressable style={styles.editBtn}><Text style={styles.editBtnText}>Edit</Text></Pressable>
              <Pressable style={styles.dismissBtn}><Text style={styles.dismissBtnText}>✕</Text></Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable style={styles.waBtn} onPress={() => showToast("Reorder list sent to suppliers")}><Svg width={14} height={14} viewBox="0 0 24 24" fill="#fff"><Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><Path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.72-1.391A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" /></Svg><Text style={styles.waBtnText}>Send to Suppliers</Text></Pressable>
        <Pressable style={styles.approveAllBtn} onPress={() => showToast("All approved")}><Text style={styles.approveAllText}>Approve All (₹{total})</Text></Pressable>
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
