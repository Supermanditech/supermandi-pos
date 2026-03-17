import React, { useMemo, useCallback, useState } from "react";
import { View, FlatList, Pressable, TextInput, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useCartStore, type CartItem, type CartDiscount } from "../../stores/cartStore";
import CartItemRowV3 from "./CartItemRowV3";
import { showToast } from "../../utils/showToast";

// V3-007: Cart sheet with discount, customer info, parked carts

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
  const applyDiscount = useCartStore((s) => s.applyDiscount);
  const removeDiscount = useCartStore((s) => s.removeDiscount);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const customer = useCartStore((s) => s.customer);

  // V3-007: Discount UI state
  const [discountVisible, setDiscountVisible] = useState(false);
  const [discountValue, setDiscountValue] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  // V3-007: Customer UI state
  const [customerVisible, setCustomerVisible] = useState(false);
  const [customerName, setCustomerName] = useState(customer?.name ?? "");
  const [customerPhone, setCustomerPhone] = useState(customer?.phone ?? "");

  const isBulk = sellMode === "bulk";
  const subtotal = total;
  const gstAmount = isBulk ? Math.round(subtotal * 0.18) : 0;
  const grandTotal = subtotal - discountAmount + gstAmount;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  // V3-007: Apply discount
  const handleApplyDiscount = useCallback(() => {
    const val = parseFloat(discountValue);
    if (!val || val <= 0) return;
    applyDiscount({ type: discountType, value: discountType === "fixed" ? Math.round(val * 100) : val });
    showToast(`${discountType === "percentage" ? val + "%" : "₹" + val} discount applied`);
    setDiscountVisible(false);
    setDiscountValue("");
  }, [discountValue, discountType, applyDiscount]);

  // V3-007: Save customer
  const handleSaveCustomer = useCallback(() => {
    const name = customerName.trim();
    if (name) {
      setCustomer({ name, phone: customerPhone.trim() || undefined });
      showToast(`Customer: ${name}`);
    } else {
      setCustomer(null);
    }
    setCustomerVisible(false);
  }, [customerName, customerPhone, setCustomer]);

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

      {/* V3-007: Discount section */}
      {discount ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, color: colors.success }}>Discount ({discount.type === "percentage" ? `${discount.value}%` : `₹${discount.value / 100}`})</Text>
          <Pressable onPress={removeDiscount}><Text style={{ fontSize: 12, color: colors.error, fontWeight: "600" }}>Remove</Text></Pressable>
        </View>
      ) : null}
      {discountVisible ? (
        <View style={{ paddingHorizontal: 18, paddingVertical: 8, backgroundColor: colors.background, borderRadius: 10, marginHorizontal: 16, marginBottom: 4 }}>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
            <Pressable onPress={() => setDiscountType("percentage")} style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: discountType === "percentage" ? colors.primary : colors.backgroundSecondary }}><Text style={{ fontSize: 11, fontWeight: "700", color: discountType === "percentage" ? "#fff" : colors.textSecondary }}>%</Text></Pressable>
            <Pressable onPress={() => setDiscountType("fixed")} style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: discountType === "fixed" ? colors.primary : colors.backgroundSecondary }}><Text style={{ fontSize: 11, fontWeight: "700", color: discountType === "fixed" ? "#fff" : colors.textSecondary }}>₹ Fixed</Text></Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, fontSize: 14, fontWeight: "700", textAlign: "center" }} value={discountValue} onChangeText={setDiscountValue} placeholder={discountType === "percentage" ? "e.g., 10" : "e.g., 50"} keyboardType="numeric" placeholderTextColor={colors.textTertiary} />
            <Pressable onPress={handleApplyDiscount} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Apply</Text></Pressable>
            <Pressable onPress={() => setDiscountVisible(false)} style={{ paddingHorizontal: 8, justifyContent: "center" }}><Text style={{ color: colors.textTertiary, fontSize: 14 }}>✕</Text></Pressable>
          </View>
        </View>
      ) : null}

      {/* V3-007: Customer section */}
      {customer ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, color: colors.primary }}>Customer: {customer.name}{customer.phone ? ` (${customer.phone})` : ""}</Text>
          <Pressable onPress={() => setCustomer(null)}><Text style={{ fontSize: 12, color: colors.error, fontWeight: "600" }}>Remove</Text></Pressable>
        </View>
      ) : null}
      {customerVisible ? (
        <View style={{ paddingHorizontal: 18, paddingVertical: 8, backgroundColor: colors.background, borderRadius: 10, marginHorizontal: 16, marginBottom: 4 }}>
          <TextInput style={{ padding: 8, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, fontSize: 13, marginBottom: 6 }} value={customerName} onChangeText={setCustomerName} placeholder="Customer name" placeholderTextColor={colors.textTertiary} />
          <TextInput style={{ padding: 8, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, fontSize: 13, marginBottom: 6 }} value={customerPhone} onChangeText={setCustomerPhone} placeholder="+91 phone (optional)" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={handleSaveCustomer} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Save</Text></Pressable>
            <Pressable onPress={() => setCustomerVisible(false)} style={{ paddingHorizontal: 12, justifyContent: "center" }}><Text style={{ color: colors.textTertiary }}>Cancel</Text></Pressable>
          </View>
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.addMoreBtn} onPress={onClose} accessibilityLabel="Add more items">
          <Text style={styles.addMoreText}>+ Add More</Text>
        </Pressable>
        <Pressable style={styles.parkBtn} accessibilityLabel="Park cart" onPress={() => {
          // PD-025: Park cart with real cartStore
          const parked = useCartStore.getState().parkedCarts ?? [];
          if (parked.length >= 3) { showToast("Max 3 parked carts"); return; }
          useCartStore.getState().parkCart();
          showToast(`Cart parked (${parked.length + 1}/3)`);
          onClose();
        }}>
          <Text style={styles.parkText}>📌 Park</Text>
        </Pressable>
      </View>
      {/* Discount + Customer toggle buttons */}
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 4 }}>
        {!discountVisible && !discount ? <Pressable onPress={() => setDiscountVisible(true)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" }}><Text style={{ fontSize: 11, fontWeight: "600", color: colors.textSecondary }}>+ Discount</Text></Pressable> : null}
        {!customerVisible && !customer ? <Pressable onPress={() => setCustomerVisible(true)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" }}><Text style={{ fontSize: 11, fontWeight: "600", color: colors.textSecondary }}>+ Customer</Text></Pressable> : null}
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
