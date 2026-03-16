import React, { useMemo } from "react";
import { View, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";

// STG-565: Purchase cart summary — GST per HSN, trade discounts, supplier grouping, case/unit totals

export interface PurchaseCartItem {
  name: string;
  supplierName: string;
  qtyCases: number;
  caseSize: number;
  unit: string;
  ptrMinor: number;      // price per unit in paise
  hsnCode: string;
  gstPct: number;
  tradeDiscountPct?: number;
  creditDays?: number;
}

type PurchaseCartSummaryV3Props = {
  items: PurchaseCartItem[];
};

export default function PurchaseCartSummaryV3({ items }: PurchaseCartSummaryV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const totalUnits = items.reduce((s, i) => s + i.qtyCases * i.caseSize, 0);
  const totalCases = items.reduce((s, i) => s + i.qtyCases, 0);
  const subtotal = items.reduce((s, i) => s + i.qtyCases * i.caseSize * i.ptrMinor, 0);

  // Trade discounts
  const tradeDiscount = items.reduce((s, i) => {
    const disc = i.tradeDiscountPct ?? 0;
    return s + Math.round(i.qtyCases * i.caseSize * i.ptrMinor * disc / 100);
  }, 0);

  // GST grouped by rate
  const gstByRate: Record<number, number> = {};
  items.forEach((i) => {
    const taxableAmount = i.qtyCases * i.caseSize * i.ptrMinor - Math.round(i.qtyCases * i.caseSize * i.ptrMinor * (i.tradeDiscountPct ?? 0) / 100);
    const gst = Math.round(taxableAmount * i.gstPct / 100);
    gstByRate[i.gstPct] = (gstByRate[i.gstPct] ?? 0) + gst;
  });
  const totalGst = Object.values(gstByRate).reduce((s, v) => s + v, 0);
  const grandTotal = subtotal - tradeDiscount + totalGst;

  // Suppliers
  const suppliers = [...new Set(items.map((i) => i.supplierName))];

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Meta line */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{items.length} items · {totalCases} cases · {totalUnits} units · {suppliers.length} supplier{suppliers.length > 1 ? "s" : ""}</Text>
      </View>

      {/* Subtotal */}
      <View style={styles.row}>
        <Text style={styles.label}>Subtotal</Text>
        <Text style={styles.value}>₹{Math.round(subtotal / 100).toLocaleString("en-IN")}</Text>
      </View>

      {/* Trade discount */}
      {tradeDiscount > 0 ? (
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.success }]}>Trade Discounts</Text>
          <Text style={[styles.value, { color: colors.success }]}>-₹{Math.round(tradeDiscount / 100).toLocaleString("en-IN")}</Text>
        </View>
      ) : null}

      {/* GST breakdown by rate */}
      {Object.entries(gstByRate).map(([rate, amount]) => (
        <View key={rate} style={styles.row}>
          <Text style={styles.gstLabel}>GST {rate}% (CGST {Number(rate) / 2}% + SGST {Number(rate) / 2}%)</Text>
          <Text style={styles.gstValue}>₹{Math.round(amount / 100).toLocaleString("en-IN")}</Text>
        </View>
      ))}

      {/* Grand total */}
      <View style={[styles.row, styles.totalRow]}>
        <Text style={styles.totalLabel}>Grand Total (incl. GST)</Text>
        <Text style={styles.totalValue}>₹{Math.round(grandTotal / 100).toLocaleString("en-IN")}</Text>
      </View>

      {/* Credit terms */}
      {items.some((i) => i.creditDays) ? (
        <Text style={styles.creditLine}>Payment: {items[0].creditDays ?? 0} days credit</Text>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    metaRow: { marginBottom: 6 },
    metaText: { fontSize: 11, color: colors.textTertiary, fontWeight: "500" },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    label: { fontSize: 12, color: colors.textTertiary },
    value: { fontSize: 12, fontWeight: "700", color: colors.textPrimary },
    gstLabel: { fontSize: 10, color: colors.textTertiary },
    gstValue: { fontSize: 10, color: colors.textTertiary },
    totalRow: { borderTopWidth: 2, borderTopColor: colors.textPrimary, paddingTop: 6, marginTop: 4 },
    totalLabel: { fontSize: 17, fontWeight: "900", color: colors.textPrimary, letterSpacing: -0.3 },
    totalValue: { fontSize: 17, fontWeight: "900", color: colors.textPrimary, letterSpacing: -0.3 },
    creditLine: { fontSize: 10, color: colors.textTertiary, marginTop: 4, textAlign: "right" },
  });
}
