import React, { useMemo, useCallback } from "react";
import { View, FlatList, Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useCartStore, type CartItem } from "../../stores/cartStore";
import CartItemRowV3 from "./CartItemRowV3";

// STG-554: Cart sheet — expanded view with items, qty controls, summary
// In the full app this would be a bottom sheet (react-native-reanimated).
// For now it's a full-screen overlay accessible from the cart strip or PAY button.

type CartSheetV3Props = {
  visible: boolean;
  sellMode: "retail" | "bulk";
  onClose: () => void;
  onCheckout: () => void;
};

export default function CartSheetV3({ visible, sellMode, onClose, onCheckout }: CartSheetV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const clearCart = useCartStore((s) => s.clearCart);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const isBulk = sellMode === "bulk";
  const subtotal = total;
  const gstAmount = isBulk ? Math.round(subtotal * 0.18) : 0;
  const grandTotal = subtotal + gstAmount;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  const handleIncrement = useCallback((id: string, qty: number) => {
    updateQuantity(id, qty + 1);
  }, [updateQuantity]);

  const handleDecrement = useCallback((id: string, qty: number) => {
    if (qty > 1) updateQuantity(id, qty - 1);
    else removeItem(id);
  }, [updateQuantity, removeItem]);

  const renderItem = useCallback(({ item }: { item: CartItem }) => (
    <CartItemRowV3
      item={item}
      onIncrement={() => handleIncrement(item.id, item.quantity)}
      onDecrement={() => handleDecrement(item.id, item.quantity)}
      onRemove={() => removeItem(item.id)}
    />
  ), [handleIncrement, handleDecrement, removeItem]);

  if (!visible || items.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Handle bar */}
      <View style={styles.handleBar}>
        <View style={styles.handle} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cart ({itemCount} item{itemCount !== 1 ? "s" : ""})</Text>
        <Pressable onPress={() => clearCart(true)} accessibilityLabel="Clear cart">
          <Text style={styles.clearText}>Clear All</Text>
        </Pressable>
      </View>

      {/* Item list */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={styles.list}
        showsVerticalScrollIndicator={false}
      />

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal ({itemCount} items)</Text>
          <Text style={styles.summaryValue}>₹{Math.round(subtotal / 100).toLocaleString("en-IN")}</Text>
        </View>
        {isBulk ? (
          <>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { fontSize: 11 }]}>CGST (9%)</Text>
              <Text style={[styles.summaryValue, { fontSize: 11 }]}>₹{Math.round(gstAmount / 200).toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { fontSize: 11 }]}>SGST (9%)</Text>
              <Text style={[styles.summaryValue, { fontSize: 11 }]}>₹{Math.round(gstAmount / 200).toLocaleString("en-IN")}</Text>
            </View>
          </>
        ) : null}
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total{isBulk ? " (incl. GST)" : ""}</Text>
          <Text style={styles.totalValue}>₹{Math.round(grandTotal / 100).toLocaleString("en-IN")}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.addMoreBtn} onPress={onClose} accessibilityLabel="Add more items">
          <Text style={styles.addMoreText}>+ Add More</Text>
        </Pressable>
        <Pressable style={styles.parkBtn} accessibilityLabel="Park cart">
          <Text style={styles.parkText}>📌 Park</Text>
        </Pressable>
      </View>
      <View style={styles.payRow}>
        <Pressable style={styles.payBtn} onPress={onCheckout} accessibilityRole="button" accessibilityLabel="Proceed to payment">
          <Text style={styles.payText}>PAY ₹{Math.round(grandTotal / 100).toLocaleString("en-IN")} →</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      zIndex: 10,
    },
    handleBar: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
    handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2 },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 8,
    },
    headerTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
    clearText: { fontSize: 12, fontWeight: "600", color: colors.textTertiary },
    list: { flex: 1 },
    summary: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    summaryLabel: { fontSize: 13, color: colors.textTertiary },
    summaryValue: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
    totalRow: {
      borderTopWidth: 2,
      borderTopColor: colors.textPrimary,
      paddingTop: 8,
      marginTop: 4,
    },
    totalLabel: { fontSize: 18, fontWeight: "900", color: colors.textPrimary, letterSpacing: -0.3 },
    totalValue: { fontSize: 18, fontWeight: "900", color: colors.textPrimary, letterSpacing: -0.3 },
    actions: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 6,
    },
    addMoreBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: "center",
    },
    addMoreText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    parkBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: "center",
    },
    parkText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    payRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
    payBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: "center",
    },
    payText: { fontSize: 17, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.2 },
  });
}
