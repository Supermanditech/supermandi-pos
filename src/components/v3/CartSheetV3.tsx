import React, { useMemo, useCallback, useState } from "react";
import { View, FlatList, Pressable, StyleSheet, Text, Share, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { useCartStore, type CartItem, type ItemDiscount } from "../../stores/cartStore";
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
  const updatePrice = useCartStore((s) => s.updatePrice);
  const applyItemDiscount = useCartStore((s) => s.applyItemDiscount);
  const removeItemDiscount = useCartStore((s) => s.removeItemDiscount);
  const removeItem = useCartStore((s) => s.removeItem);
  const removeDiscount = useCartStore((s) => s.removeDiscount);

  // GCP-STG-0050: Parked carts state
  const parkedCount = useCartStore((s) => s.parkedCarts?.length ?? 0);
  const [showParkedModal, setShowParkedModal] = useState(false);

  // V3-FIX-121: Cart line edit state
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDiscountType, setEditDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [editDiscountValue, setEditDiscountValue] = useState("");
  const [editDiscountReason, setEditDiscountReason] = useState("");

  const openEditModal = useCallback((item: CartItem) => {
    setEditingItem(item);
    setEditPrice(String(item.priceMinor / 100));
    if (item.itemDiscount) {
      setEditDiscountType(item.itemDiscount.type);
      setEditDiscountValue(String(item.itemDiscount.type === "fixed" ? item.itemDiscount.value / 100 : item.itemDiscount.value));
      setEditDiscountReason(item.itemDiscount.reason ?? "");
    } else {
      setEditDiscountType("percentage");
      setEditDiscountValue("");
      setEditDiscountReason("");
    }
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingItem) return;
    // Update price if changed
    const newPriceRupees = parseFloat(editPrice);
    if (!isNaN(newPriceRupees) && newPriceRupees > 0) {
      const newPriceMinor = Math.round(newPriceRupees * 100);
      if (newPriceMinor !== editingItem.priceMinor) {
        updatePrice(editingItem.id, newPriceMinor);
      }
    }
    // Update item discount
    const discVal = parseFloat(editDiscountValue);
    if (!isNaN(discVal) && discVal > 0) {
      const discountPayload: ItemDiscount = {
        type: editDiscountType,
        value: editDiscountType === "fixed" ? Math.round(discVal * 100) : discVal,
        reason: editDiscountReason.trim() || undefined,
      };
      applyItemDiscount(editingItem.id, discountPayload);
    } else {
      // Remove discount if value cleared
      if (editingItem.itemDiscount) {
        removeItemDiscount(editingItem.id);
      }
    }
    showToast(`${editingItem.name} updated`);
    setEditingItem(null);
  }, [editingItem, editPrice, editDiscountType, editDiscountValue, editDiscountReason, updatePrice, applyItemDiscount, removeItemDiscount]);

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
      onEdit={() => openEditModal(item)}
    />
  ), [handleIncrement, handleDecrement, removeItem, openEditModal]);

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

      {/* V3-FIX-067 + GCP-STG-0050: Action row — Add More, Recall, Park, Share */}
      <View style={styles.actions}>
        <Pressable style={styles.addMoreBtn} onPress={onClose} accessibilityLabel="Add more items">
          <Text style={styles.addMoreText}>+ Add More</Text>
        </Pressable>
        {/* GCP-STG-0050: Recall parked carts */}
        <Pressable style={styles.parkBtn} accessibilityLabel="Recall parked cart" onPress={() => {
          const parked = useCartStore.getState().parkedCarts ?? [];
          if (parked.length === 0) { showToast("No parked carts"); return; }
          setShowParkedModal(true);
        }}>
          <Text style={styles.parkText}>📋 Recall{parkedCount > 0 ? ` (${parkedCount})` : ""}</Text>
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

      {/* V3-FIX-121: Cart line edit modal — price override + item discount */}
      <Modal visible={editingItem !== null} transparent animationType="slide" onRequestClose={() => setEditingItem(null)} testID="cart-edit-modal">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <ScrollView style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%" }} contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.textPrimary, marginBottom: 4 }}>Edit Line</Text>
              <Text style={{ fontSize: 14, color: colors.textTertiary, marginBottom: 16 }}>{editingItem?.name}</Text>

              {/* Price override */}
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 4 }}>PRICE (₹)</Text>
              <TextInput
                style={{ padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, fontSize: 18, fontWeight: "700", color: colors.textPrimary }}
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="decimal-pad"
                testID="cart-edit-price"
              />

              {/* Discount */}
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.5, marginTop: 16, marginBottom: 4 }}>ITEM DISCOUNT</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                <Pressable
                  style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: editDiscountType === "percentage" ? colors.primary : colors.backgroundSecondary, alignItems: "center" }}
                  onPress={() => setEditDiscountType("percentage")}
                >
                  <Text style={{ fontWeight: "700", color: editDiscountType === "percentage" ? "#fff" : colors.textSecondary }}>% Off</Text>
                </Pressable>
                <Pressable
                  style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: editDiscountType === "fixed" ? colors.primary : colors.backgroundSecondary, alignItems: "center" }}
                  onPress={() => setEditDiscountType("fixed")}
                >
                  <Text style={{ fontWeight: "700", color: editDiscountType === "fixed" ? "#fff" : colors.textSecondary }}>₹ Off</Text>
                </Pressable>
              </View>
              <TextInput
                style={{ padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, fontSize: 16, fontWeight: "600", color: colors.textPrimary }}
                value={editDiscountValue}
                onChangeText={setEditDiscountValue}
                keyboardType="decimal-pad"
                placeholder={editDiscountType === "percentage" ? "e.g. 10" : "e.g. 50"}
                placeholderTextColor={colors.textTertiary}
                testID="cart-edit-discount-value"
              />
              <TextInput
                style={{ padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, fontSize: 14, color: colors.textPrimary, marginTop: 8 }}
                value={editDiscountReason}
                onChangeText={setEditDiscountReason}
                placeholder="Reason (optional)"
                placeholderTextColor={colors.textTertiary}
                testID="cart-edit-discount-reason"
              />

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
                <Pressable onPress={() => setEditingItem(null)} style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: "center" }}>
                  <Text style={{ fontWeight: "700", color: colors.textSecondary }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={handleSaveEdit} style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" }} testID="cart-edit-save">
                  <Text style={{ fontWeight: "800", color: "#fff" }}>Save</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* GCP-STG-0050: Parked carts recall modal */}
      <Modal visible={showParkedModal} transparent animationType="slide" onRequestClose={() => setShowParkedModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "60%" }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.textPrimary, marginBottom: 16 }}>Parked Carts</Text>
            {(useCartStore.getState().parkedCarts ?? []).map((cart, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.textPrimary }}>
                    {cart.items.length} items — ₹{Math.round(cart.items.reduce((s, i) => s + i.priceMinor * i.quantity, 0) / 100)}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                    Parked {Math.round((Date.now() - cart.parkedAt) / 60000)} min ago
                  </Text>
                </View>
                <Pressable
                  style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginLeft: 8 }}
                  onPress={() => {
                    useCartStore.getState().resumeParkedCart(idx);
                    setShowParkedModal(false);
                    showToast("Cart restored");
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Resume</Text>
                </Pressable>
                <Pressable
                  style={{ paddingHorizontal: 12, paddingVertical: 8, marginLeft: 4 }}
                  onPress={() => {
                    useCartStore.getState().deleteParkedCart(idx);
                    if ((useCartStore.getState().parkedCarts?.length ?? 0) === 0) setShowParkedModal(false);
                    showToast("Parked cart deleted");
                  }}
                >
                  <Text style={{ color: colors.error, fontWeight: "600", fontSize: 13 }}>Delete</Text>
                </Pressable>
              </View>
            ))}
            {parkedCount === 0 ? (
              <Text style={{ color: colors.textTertiary, textAlign: "center", paddingVertical: 20 }}>No parked carts</Text>
            ) : null}
            <Pressable style={{ marginTop: 16, alignItems: "center", paddingVertical: 12 }} onPress={() => setShowParkedModal(false)}>
              <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
      paddingHorizontal: getScreenPadding(),
      paddingVertical: 12,
    },
    backBtn: { paddingRight: 8 },
    backText: { fontSize: 14, fontWeight: "600", color: colors.primary },
    headerTitle: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
    clearText: { fontSize: 12, fontWeight: "600", color: colors.textTertiary },
    list: { flex: 1 },
    summary: {
      paddingHorizontal: getScreenPadding(),
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
      paddingHorizontal: getScreenPadding(),
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
    discountRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: getScreenPadding(), paddingVertical: 4 },
    discountText: { fontSize: 12, color: colors.success },
    discountRemove: { fontSize: 12, color: colors.error, fontWeight: "600" },
    payRow: { paddingHorizontal: getScreenPadding(), paddingTop: 8, paddingBottom: 16 },
    payBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: "center",
    },
    payText: { fontSize: 17, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.2 },
  });
}
