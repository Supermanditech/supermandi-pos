import React, { useMemo } from "react";
import { View, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useCartStore, type CartItem, type SellMode } from "../../stores/cartStore";

// STG-555: Wholesale-aware cart summary — GST split, margin, trade savings, case count

type CartSummaryV3Props = {
  sellMode: SellMode;
};

/** Calculate GST for an item based on its gstPct, or fallback to 18% */
function itemGst(item: CartItem): number {
  const rate = item.gstPct ?? 18;
  return Math.round(item.priceMinor * item.quantity * rate / 100);
}

export default function CartSummaryV3({ sellMode }: CartSummaryV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const items = useCartStore((s) => s.items);

  const isBulk = sellMode === "bulk";
  const subtotal = items.reduce((s, i) => s + i.priceMinor * i.quantity, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  // GST calculation (only for bulk/trade)
  const totalGst = isBulk ? items.reduce((s, i) => s + itemGst(i), 0) : 0;
  const cgst = Math.round(totalGst / 2);
  const sgst = totalGst - cgst;
  const grandTotal = subtotal + totalGst;

  // Trade savings vs MRP
  const mrpTotal = items.reduce((s, i) => s + (i.mrpMinor ?? i.priceMinor) * i.quantity, 0);
  const tradeSavings = isBulk ? mrpTotal - subtotal : 0;

  // Margin (trade price vs MRP)
  const marginPct = mrpTotal > 0 ? Math.round(((mrpTotal - subtotal) / mrpTotal) * 100) : 0;

  // Case count
  const caseCount = items.reduce((s, i) => {
    const cs = i.caseSize ?? i.metadata?.caseSize;
    return s + (cs ? Math.floor(i.quantity / cs) : 0);
  }, 0);

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Subtotal ({itemCount} items{caseCount > 0 ? ` · ${caseCount} case${caseCount > 1 ? "s" : ""}` : ""})</Text>
        <Text style={styles.value}>₹{Math.round(subtotal / 100).toLocaleString("en-IN")}</Text>
      </View>

      {isBulk && tradeSavings > 0 ? (
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.success }]}>Trade Savings vs MRP</Text>
          <Text style={[styles.value, { color: colors.success }]}>-₹{Math.round(tradeSavings / 100).toLocaleString("en-IN")}</Text>
        </View>
      ) : null}

      {isBulk ? (
        <>
          <View style={styles.row}>
            <Text style={styles.gstLabel}>CGST</Text>
            <Text style={styles.gstValue}>₹{Math.round(cgst / 100).toLocaleString("en-IN")}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.gstLabel}>SGST</Text>
            <Text style={styles.gstValue}>₹{Math.round(sgst / 100).toLocaleString("en-IN")}</Text>
          </View>
        </>
      ) : null}

      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.totalLabel}>Total{isBulk ? " (incl. GST)" : ""}</Text>
        <Text style={styles.totalValue}>₹{Math.round(grandTotal / 100).toLocaleString("en-IN")}</Text>
      </View>

      {isBulk && marginPct > 0 ? (
        <View style={styles.marginRow}>
          <Text style={styles.marginText}>Expected margin: ₹{Math.round(tradeSavings / 100).toLocaleString("en-IN")} ({marginPct}%)</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 3,
    },
    label: { fontSize: 13, color: colors.textTertiary },
    value: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
    gstLabel: { fontSize: 11, color: colors.textTertiary },
    gstValue: { fontSize: 11, color: colors.textTertiary },
    totalRow: {
      borderTopWidth: 2,
      borderTopColor: colors.textPrimary,
      paddingTop: 8,
      marginTop: 4,
    },
    totalLabel: { fontSize: 18, fontWeight: "900", color: colors.textPrimary, letterSpacing: -0.3 },
    totalValue: { fontSize: 18, fontWeight: "900", color: colors.textPrimary, letterSpacing: -0.3 },
    marginRow: { marginTop: 4 },
    marginText: { fontSize: 10, color: colors.success, fontWeight: "700" },
  });
}
