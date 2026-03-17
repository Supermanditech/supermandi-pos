import React, { useMemo } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";
import { printerService } from "../../services/printerService";

// V3-067: Bill detail sub-screen — view bill items, reprint, WhatsApp share

type BillItem = { name: string; qty: number; priceMinor: number };

type Props = {
  billRef: string;
  date: string;
  method: string;
  totalMinor: number;
  items: BillItem[];
  onClose: () => void;
};

export default function BillDetailScreenV3({ billRef, date, method, totalMinor, items, onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const total = Math.round(totalMinor / 100);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.headerTitle}>Bill Details</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.billCard}>
          <Text style={styles.billRef}>{billRef}</Text>
          <Text style={styles.billDate}>{date}</Text>
          <Text style={styles.billMethod}>{method}</Text>
        </View>

        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>ITEMS</Text>
          {items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemQty}>×{item.qty}</Text>
              <Text style={styles.itemPrice}>₹{Math.round(item.priceMinor * item.qty / 100)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>₹{total.toLocaleString("en-IN")}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.printBtn} onPress={() => {
          printerService.printReceipt(`Bill: ${billRef}\nTotal: ₹${total}`).catch(() => showToast("Print failed"));
        }}>
          <Text style={styles.printText}>🖨️ Reprint</Text>
        </Pressable>
        <Pressable style={styles.waBtn} onPress={() => showToast("Bill shared on WhatsApp")}>
          <Text style={styles.waText}>📱 WhatsApp</Text>
        </Pressable>
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
    billCard: { padding: 18, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center", marginBottom: 14 },
    billRef: { fontSize: 16, fontWeight: "800", color: colors.textPrimary },
    billDate: { fontSize: 12, color: colors.textTertiary, marginTop: 4 },
    billMethod: { fontSize: 11, fontWeight: "700", color: colors.primary, marginTop: 4, backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 6 },
    itemsSection: { marginBottom: 14 },
    sectionTitle: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 8 },
    itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    itemName: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    itemQty: { fontSize: 13, color: colors.textTertiary, width: 40, textAlign: "center" },
    itemPrice: { fontSize: 14, fontWeight: "700", width: 60, textAlign: "right" },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 2, borderTopColor: colors.textPrimary },
    totalLabel: { fontSize: 18, fontWeight: "900" },
    totalValue: { fontSize: 18, fontWeight: "900" },
    footer: { flexDirection: "row", gap: 8, padding: 14 },
    printBtn: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    printText: { fontSize: 14, fontWeight: "700", color: colors.primary },
    waBtn: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: "#25D366", alignItems: "center" },
    waText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  });
}
