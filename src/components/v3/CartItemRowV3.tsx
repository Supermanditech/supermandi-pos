import React, { useMemo } from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import type { CartItem } from "../../stores/cartStore";

// STG-554: Cart item row for v3 — qty stepper, case conversion, HSN, swipe hint
// V3-FIX-121: Added onEdit callback for line-level price/discount editing

type CartItemRowV3Props = {
  item: CartItem;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
  onEdit?: () => void;
};

// GCP-STG-0025: Use category-based emoji from ProductTileV3 (28 mappings)
// instead of fragile name-based matching that defaults everything to 🍪
import { getCategoryEmoji } from "./ProductTileV3";

export default function CartItemRowV3({ item, onIncrement, onDecrement, onRemove, onEdit }: CartItemRowV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // GCP-STG-0025: Use category field for accurate emoji, fall back to name
  const category = (item.metadata?.category as string) ?? item.name;
  const emoji = getCategoryEmoji(category);
  const lineTotal = item.priceMinor * item.quantity;
  const caseSize = item.caseSize ?? (item.metadata?.caseSize as number | undefined);
  const unit = item.unitLabel ?? (item.metadata?.unit as string) ?? "pcs";
  const brand = item.metadata?.brand as string | undefined;
  const hsnCode = item.hsnCode ?? (item.metadata?.hsnCode as string | undefined);
  const hasDiscount = !!item.itemDiscount;

  return (
    <Pressable style={styles.row} onLongPress={onEdit} accessibilityHint="Long press to edit price/discount">
      <View style={styles.imageBox}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.detail}>
          ₹{(item.priceMinor / 100).toFixed(item.priceMinor % 100 === 0 ? 0 : 2)}/{unit}
          {brand ? ` · ${brand}` : ""}
          {hsnCode ? ` · HSN ${hsnCode}` : ""}
        </Text>
        {hasDiscount ? (
          <Text style={[styles.caseLabel, { color: colors.success }]}>
            {item.itemDiscount!.type === "percentage" ? `${item.itemDiscount!.value}% off` : `₹${item.itemDiscount!.value / 100} off`}
            {item.itemDiscount!.reason ? ` — ${item.itemDiscount!.reason}` : ""}
          </Text>
        ) : null}
        {caseSize && item.quantity >= caseSize ? (
          <Text style={styles.caseLabel}>
            = {Math.floor(item.quantity / caseSize)} case{Math.floor(item.quantity / caseSize) > 1 ? "s" : ""}
            {item.quantity % caseSize ? ` + ${item.quantity % caseSize} loose` : ""}
          </Text>
        ) : null}
        {item.priceResolutionError ? (
          <Text style={[styles.caseLabel, { color: colors.error }]}>{item.priceResolutionMessage ?? "Price needs review"}</Text>
        ) : null}
      </View>
      <View style={styles.qtyBox}>
        <Pressable style={styles.qtyBtn} onPress={item.quantity <= 1 ? onRemove : onDecrement} accessibilityLabel="Decrease quantity">
          <Text style={styles.qtyBtnText}>−</Text>
        </Pressable>
        <Text style={styles.qtyValue}>{item.quantity}</Text>
        <Pressable style={styles.qtyBtn} onPress={onIncrement} accessibilityLabel="Increase quantity">
          <Text style={styles.qtyBtnText}>+</Text>
        </Pressable>
      </View>
      <Text style={styles.total}>₹{Math.round(lineTotal / 100).toLocaleString("en-IN")}</Text>
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: getScreenPadding(),
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.backgroundSecondary,
    },
    imageBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.backgroundSecondary,
      alignItems: "center",
      justifyContent: "center",
    },
    emoji: { fontSize: 20 },
    info: { flex: 1, minWidth: 0 },
    name: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, letterSpacing: -0.2 },
    detail: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
    caseLabel: { fontSize: 9, color: colors.success, fontWeight: "700", marginTop: 2 },
    qtyBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 10,
      overflow: "hidden",
    },
    qtyBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    qtyBtnText: { fontSize: 18, fontWeight: "700", color: colors.primary },
    qtyValue: { fontSize: 15, fontWeight: "800", minWidth: 24, textAlign: "center", color: colors.textPrimary },
    total: { fontSize: 15, fontWeight: "800", minWidth: 48, textAlign: "right", letterSpacing: -0.3, color: colors.textPrimary },
  });
}
