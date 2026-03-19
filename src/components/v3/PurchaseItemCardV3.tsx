import React, { useMemo } from "react";
import { View, TextInput, Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import ExpandableDetails from "./ExpandableDetails";

// STG-563: Purchase item card — 3 states: repeat (blue), existing (green), new (yellow)

export type PurchaseItemState = "repeat" | "existing" | "new";

export interface PurchaseItemData {
  barcode: string;
  name?: string;
  brand?: string;
  category?: string;
  packSize?: string;
  hsnCode?: string;
  gstPct?: number;
  state: PurchaseItemState;
  // Repeat purchase reference
  lastPurchasePrice?: number;
  lastPurchaseQty?: number;
  lastPurchaseDate?: string;
  lastSupplier?: string;
  // Current values
  qtyCases: number;
  purchasePrice: string;
  sellPrice: string;
  caseSize?: number;
  // V3-FIX-170: Conversion-aware procurement context
  procurementUnit?: string;
  procurementPackQty?: number;
  baseStockUnit?: string;
  conversionConfirmed?: boolean;
}

type PurchaseItemCardV3Props = {
  item: PurchaseItemData;
  onQtyChange: (qty: number) => void;
  onPriceChange: (price: string) => void;
  onSameAsLast: () => void;
  onFieldChange?: (field: keyof PurchaseItemData, value: string) => void;
};

const BORDER_COLORS: Record<PurchaseItemState, string> = { repeat: "#2563EB", existing: "#16A34A", new: "#F59E0B" };
const STATE_LABELS: Record<PurchaseItemState, string> = { repeat: "Repeat", existing: "In Store", new: "First Time" };
const STATE_BG: Record<PurchaseItemState, string> = { repeat: "#EFF6FF", existing: "#ECFDF5", new: "#FFF7ED" };
const STATE_FG: Record<PurchaseItemState, string> = { repeat: "#2563EB", existing: "#16A34A", new: "#92400E" };

export default function PurchaseItemCardV3({ item, onQtyChange, onPriceChange, onSameAsLast, onFieldChange }: PurchaseItemCardV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const totalUnits = item.qtyCases * (item.caseSize ?? 24);
  const priceNum = parseFloat(item.purchasePrice) || 0;
  const totalAmount = totalUnits * priceNum;

  return (
    <View style={[styles.card, { borderLeftColor: BORDER_COLORS[item.state] }]}>
      <View style={styles.topRow}>
        <View style={styles.imgBox}><Text style={styles.emoji}>{item.state === "new" ? "➕" : "📦"}</Text></View>
        <View style={styles.info}>
          {/* Name + state badge */}
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.name ?? "New Product"}</Text>
            <View style={[styles.stateBadge, { backgroundColor: STATE_BG[item.state] }]}>
              <Text style={[styles.stateText, { color: STATE_FG[item.state] }]}>{STATE_LABELS[item.state]}</Text>
            </View>
          </View>
          <Text style={styles.barcode}>Barcode: {item.barcode}{item.brand ? ` · ${item.brand}` : ""}{item.hsnCode ? ` · HSN ${item.hsnCode}` : ""}</Text>

          {/* Repeat: last purchase reference */}
          {item.state === "repeat" && item.lastPurchasePrice ? (
            <View style={styles.lastPurchaseRow}>
              <Text style={styles.lastPurchaseText}>
                Last: {item.lastPurchaseQty} cases @ ₹{item.lastPurchasePrice}/u · {item.lastPurchaseDate}
              </Text>
              <Pressable style={styles.sameBtn} onPress={onSameAsLast} accessibilityLabel="Same as last order">
                <Text style={styles.sameBtnText}>Same ↺</Text>
              </Pressable>
            </View>
          ) : null}

          {/* New product: required fields warning */}
          {item.state === "new" ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⚠ Add details for ledger sync, stock tracking & GST</Text>
            </View>
          ) : null}

          {/* Existing but no purchase history */}
          {item.state === "existing" ? (
            <Text style={styles.noPrevText}>No previous purchase — enter price below</Text>
          ) : null}

          {/* New product: name + brand inputs */}
          {item.state === "new" ? (
            <View style={styles.newFields}>
              <TextInput style={styles.fieldInput} placeholder="Product name *" placeholderTextColor={colors.textTertiary} value={item.name ?? ""} onChangeText={(v) => onFieldChange?.("name", v)} />
              <View style={styles.fieldRow}>
                <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="Brand *" placeholderTextColor={colors.textTertiary} value={item.brand ?? ""} onChangeText={(v) => onFieldChange?.("brand", v)} />
                <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="Category" placeholderTextColor={colors.textTertiary} value={item.category ?? ""} onChangeText={(v) => onFieldChange?.("category", v)} />
              </View>
              <View style={styles.fieldRow}>
                <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="Pack size" placeholderTextColor={colors.textTertiary} value={item.packSize ?? ""} onChangeText={(v) => onFieldChange?.("packSize", v)} />
                <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="Case qty" placeholderTextColor={colors.textTertiary} keyboardType="numeric" value={item.caseSize ? String(item.caseSize) : ""} onChangeText={(v) => onFieldChange?.("caseSize", v)} />
              </View>
            </View>
          ) : null}

          {/* Core fields: qty, purchase price, sell price */}
          <View style={styles.coreFields}>
            <View style={styles.coreField}>
              <Text style={styles.coreLabel}>QTY (CASES)</Text>
              <View style={styles.qtyBox}>
                <Pressable style={styles.qtyBtn} onPress={() => onQtyChange(Math.max(1, item.qtyCases - 1))}><Text style={styles.qtyBtnText}>−</Text></Pressable>
                <Text style={styles.qtyVal}>{item.qtyCases}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => onQtyChange(item.qtyCases + 1)}><Text style={styles.qtyBtnText}>+</Text></Pressable>
              </View>
            </View>
            <View style={styles.coreField}>
              <Text style={[styles.coreLabel, !item.purchasePrice && item.state !== "repeat" && styles.coreLabelRequired]}>PURCHASE ₹/U{item.state !== "repeat" ? " *" : ""}</Text>
              <TextInput style={[styles.priceInput, !item.purchasePrice && item.state === "existing" && styles.priceInputRequired]} value={item.purchasePrice} onChangeText={onPriceChange} placeholder="₹" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
            </View>
            <View style={styles.coreField}>
              <Text style={styles.coreLabel}>SELL ₹/U</Text>
              <TextInput style={styles.priceInput} value={item.sellPrice} placeholder="₹" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
            </View>
          </View>

          {/* Calculated line */}
          {priceNum > 0 ? (
            <Text style={styles.calcLine}>{item.qtyCases} cases × {item.caseSize ?? 24} = {totalUnits} units · ₹{Math.round(totalAmount).toLocaleString("en-IN")}</Text>
          ) : null}

          {/* V3-FIX-170: Conversion preview for bulk procurement */}
          {item.procurementUnit && item.baseStockUnit && item.procurementPackQty && item.procurementPackQty > 1 ? (
            <Text style={[styles.calcLine, { color: "#6366f1" }]}>
              Stock: {item.qtyCases * (item.caseSize ?? 1)} {item.procurementUnit} × {item.procurementPackQty} = {Math.round(item.qtyCases * (item.caseSize ?? 1) * item.procurementPackQty)} {item.baseStockUnit}
            </Text>
          ) : null}
          {item.conversionConfirmed === false && item.state === "new" ? (
            <Text style={[styles.warningText, { fontSize: 12, marginTop: 2 }]}>Retail setup needed after inward</Text>
          ) : null}

          {/* Edit hint */}
          {item.state === "repeat" ? (
            <Text style={styles.editHint}>Tap any field to edit · Price changed? Update purchase ₹</Text>
          ) : null}

          {/* Expandable details */}
          <ExpandableDetails title="More Details (Tax, Batch, Trade Terms)">
            <View style={styles.fieldRow}>
              <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="HSN Code" placeholderTextColor={colors.textTertiary} value={item.hsnCode ?? ""} onChangeText={(v) => onFieldChange?.("hsnCode", v)} />
              <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="GST %" placeholderTextColor={colors.textTertiary} value={item.gstPct ? String(item.gstPct) : ""} onChangeText={(v) => onFieldChange?.("gstPct", v)} keyboardType="numeric" />
            </View>
            <View style={styles.fieldRow}>
              <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="Trade Disc %" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
              <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="Scheme (e.g. 10+1)" placeholderTextColor={colors.textTertiary} />
            </View>
            <View style={styles.fieldRow}>
              <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="Batch No." placeholderTextColor={colors.textTertiary} onChangeText={(v) => onFieldChange?.("barcode", v)} />
              <TextInput style={[styles.fieldInput, { flex: 1 }]} placeholder="Expiry date" placeholderTextColor={colors.textTertiary} />
            </View>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>💡 HSN + batch + expiry helps with GST returns, FEFO rotation, expiry alerts</Text>
            </View>
          </ExpandableDetails>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: getScreenPadding(), borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3, marginBottom: 8 },
    topRow: { flexDirection: "row", gap: 10 },
    imgBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" },
    emoji: { fontSize: 20 },
    info: { flex: 1 },
    nameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    name: { fontSize: 14, fontWeight: "800", color: colors.textPrimary, flex: 1, letterSpacing: -0.2 },
    stateBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    stateText: { fontSize: 9, fontWeight: "700" },
    barcode: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
    // Repeat
    lastPurchaseRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, padding: 6, backgroundColor: colors.primaryLight, borderRadius: 8 },
    lastPurchaseText: { fontSize: 9, color: colors.primary, flex: 1 },
    sameBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    sameBtnText: { fontSize: 9, fontWeight: "700", color: colors.primary },
    // Existing
    noPrevText: { fontSize: 9, color: colors.textTertiary, fontStyle: "italic", marginTop: 4 },
    // New
    warningBox: { marginTop: 6, padding: 6, backgroundColor: colors.warningSoft, borderRadius: 6 },
    warningText: { fontSize: 9, color: "#92400E", fontWeight: "600" },
    newFields: { marginTop: 8, gap: 6 },
    fieldRow: { flexDirection: "row", gap: 6 },
    fieldInput: { padding: 8, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, fontSize: 12, fontWeight: "500", color: colors.textPrimary },
    // Core
    coreFields: { flexDirection: "row", gap: 6, marginTop: 8 },
    coreField: { flex: 1 },
    coreLabel: { fontSize: 8, fontWeight: "700", color: colors.textTertiary, marginBottom: 2 },
    coreLabelRequired: { color: colors.error },
    qtyBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.backgroundSecondary, borderRadius: 8 },
    qtyBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
    qtyBtnText: { fontSize: 16, fontWeight: "700", color: colors.primary },
    qtyVal: { fontSize: 14, fontWeight: "800", minWidth: 20, textAlign: "center" },
    priceInput: { padding: 8, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, fontSize: 14, fontWeight: "700", textAlign: "center" },
    priceInputRequired: { borderColor: colors.error, borderStyle: "dashed" },
    calcLine: { fontSize: 9, color: colors.textTertiary, marginTop: 4 },
    editHint: { fontSize: 9, color: colors.textTertiary, fontStyle: "italic", marginTop: 4 },
    infoBox: { marginTop: 8, padding: 8, backgroundColor: colors.primaryLight, borderRadius: 8 },
    infoText: { fontSize: 9, color: colors.primary, fontWeight: "600" },
  });
}
