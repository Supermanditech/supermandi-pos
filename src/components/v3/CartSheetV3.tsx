import React, { useMemo, useCallback } from "react";
import { View, FlatList, Pressable, StyleSheet, Text, Share } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useCartStore, type CartItem } from "../../stores/cartStore";
import CartItemRowV3 from "./CartItemRowV3";
import { showToast } from "../../utils/showToast";

// V3-FIX-067: Cart screen matching V3 prototype
// Back→SELL, Clear All, item list, total, +Add More, Park, WhatsApp Share, PAY→

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
  const discount = useCartStore((s) => s.discount);
  const discountAmount = useCartStore((s) => s.discountAmount);
  const clearCart = useCartStore((s) => s.clearCart);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const removeDiscount = useCartStore((s) => s.removeDiscount);

  const isBulk = sellMode === "bulk";
  const subtotal = total;
  // DA-075: Per-product GST from item metadata, fallback to 18% for bulk
  const gstAmount = isBulk ? items.reduce((sum, item) => {
    const gstPct = (item as any).metadata?.gstPct ?? 18;
    return sum + Math.round(item.priceMinor * item.quantity * gstPct / 100);
  }, 0) : 0;
  const grandTotal = subtotal - discountAmount + gstAmount;
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
      {/* V3-FIX-067: Header with back→SELL and Clear All */}
      <View style={styles.header}>
        <Pressable onPress={onClose} accessibilityLabel="Back to SELL" style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
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

      {/* V3-FIX-067: Discount summary (if applied) */}
      {discount ? (
        <View style={styles.discountRow}>
          <Text style={styles.discountText}>Discount ({discount.type === "percentage" ? `${discount.value}%` : `₹${discount.value / 100}`})</Text>
          <Pressable onPress={removeDiscount}><Text style={styles.discountRemove}>Remove</Text></Pressable>
        </View>
      ) : null}

      {/* V3-FIX-067: Action row matching prototype — Add More, Park, WhatsApp Share */}
      <View style={styles.actions}>
        <Pressable style={styles.addMoreBtn} onPress={onClose} accessibilityLabel="Add more items">
          <Text style={styles.addMoreText}>+ Add More</Text>
        </Pressable>
        <Pressable style={styles.parkBtn} accessibilityLabel="Park cart" onPress={() => {
          const parked = useCartStore.getState().parkedCarts ?? [];
          if (parked.length >= 3) { showToast("Max 3 parked carts"); return; }
          useCartStore.getState().parkCart();
          showToast(`Cart parked (${parked.length + 1}/3)`);
          onClose();
        }}>
          <Text style={styles.parkText}>📌 Park</Text>
        </Pressable>
        <Pressable style={styles.shareBtn} accessibilityLabel="Share cart via WhatsApp" onPress={() => {
          const lines = items.map((i) => `${i.name} x${i.quantity} = ₹${Math.round(i.priceMinor * i.quantity / 100)}`);
          const msg = `SuperMandi Bill\n${lines.join("\n")}\nTotal: ₹${Math.round(grandTotal / 100)}`;
          Share.share({ message: msg }).catch(() => {});
        }}>
          <Text style={styles.shareText}>Share</Text>
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
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    backBtn: { paddingRight: 8 },
    backText: { fontSize: 14, fontWeight: "600", color: colors.primary },
    headerTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
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
    shareBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: "center",
    },
    shareText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    discountRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 4 },
    discountText: { fontSize: 12, color: colors.success },
    discountRemove: { fontSize: 12, color: colors.error, fontWeight: "600" },
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
