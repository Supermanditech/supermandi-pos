/**
 * V3-FIX-071: Payment chooser screen — navigates to dedicated child screens
 * Prototype route chain: payment (chooser) → cash | upi | udhar → success
 * Back flow: child → chooser → cart
 */
import React, { useMemo, useState, useCallback, useRef } from "react";
import { View, Pressable, TextInput, KeyboardAvoidingView, Platform, StyleSheet, Text, ScrollView, Modal, Alert } from "react-native";
import Svg, { Path, Rect, Circle, Line } from "react-native-svg";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { useCartStore } from "../../stores/cartStore";
import { createSale, createSplitPayment, type SaleItemInput, type SplitPaymentItem } from "../../services/api/posApi";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";
import { logger } from "../../services/logger";

type PaymentScreenV3Props = {
  onBack: () => void;
  onCash: () => void;
  onUpi: () => void;
  onUdhar: () => void;
  onComplete: (method: "CASH" | "UPI" | "DUE", saleId?: string, totalMinor?: number, itemCount?: number) => void;
};

export default function PaymentScreenV3({ onBack, onCash, onUpi, onUdhar, onComplete }: PaymentScreenV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const sellMode = useCartStore((s) => s.sellMode);
  const isBulk = sellMode === "bulk";
  const gst = isBulk ? Math.round(total * 0.18) : 0;
  const grandTotal = total + gst;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const totalDisplay = `₹${Math.round(grandTotal / 100).toLocaleString("en-IN")}`;

  // Split payment state (stays in chooser since it's a combined flow)
  const [splitVisible, setSplitVisible] = useState(false);
  const [splitCash, setSplitCash] = useState("");
  const [splitSecondMethod, setSplitSecondMethod] = useState<"UPI" | "DUE">("UPI");
  const [processing, setProcessing] = useState(false);
  const [saleId, setSaleId] = useState<string | null>(null);
  const createSaleInFlight = useRef(false);

  const splitCashNum = parseInt(splitCash, 10) || 0;
  const splitRemainder = Math.max(0, Math.round(grandTotal / 100) - splitCashNum);

  const createSaleStep = useCallback(async (): Promise<string | null> => {
    if (items.length === 0) { showToast("Cart is empty"); return null; }
    const online = await isOnline();
    if (!online) { showToast("Offline — sale will be queued and synced when online"); }
    // V3-FIX-167: Pass canonical store/variant identity through checkout
    const saleItems: SaleItemInput[] = items.map((item) => ({
      productId: item.barcode ?? item.id,
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      priceMinor: item.priceMinor,
      itemDiscount: item.itemDiscount ?? null,
      batchNumber: item.batchNumber ?? null,
      store_product_id: item.metadata?.storeProductId ?? undefined,
      retail_variant_id: (item.metadata as any)?.retailVariantId ?? undefined,
    }));
    const discount = useCartStore.getState().discount;
    const result = await createSale({
      items: saleItems,
      discountMinor: discount ? (discount.type === "fixed" ? discount.value : 0) : 0,
      cartDiscount: discount ?? undefined,
      currency: "INR",
    });
    logger.debug("V3Payment", `sale_created:${result.saleId}`);
    setSaleId(result.saleId);
    return result.saleId;
  }, [items]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} accessibilityLabel="Back to cart">
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Total */}
        <Text style={styles.totalAmount}>{totalDisplay}</Text>
        <Text style={styles.totalSub}>{itemCount} item{itemCount !== 1 ? "s" : ""}{isBulk ? " · incl. GST" : ""}</Text>

        {/* V3-FIX-071: Method buttons navigate to child screens */}
        <View style={styles.methodGrid}>
          <Pressable style={styles.methodBtn} onPress={onCash} accessibilityRole="button">
            <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.5}>
              <Rect x={2} y={6} width={20} height={12} rx={2} />
              <Circle cx={12} cy={12} r={3} />
              <Path d="M6 12h.01M18 12h.01" />
            </Svg>
            <Text style={styles.methodLabel}>CASH</Text>
            <Text style={styles.methodHint}>नकद</Text>
          </Pressable>

          <Pressable style={styles.methodBtn} onPress={onUpi} accessibilityRole="button">
            <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.5}>
              <Rect x={5} y={2} width={14} height={20} rx={2} />
              <Line x1={12} y1={18} x2={12} y2={18.01} strokeWidth={2} />
              <Path d="M9 6h6" />
            </Svg>
            <Text style={styles.methodLabel}>UPI</Text>
            <Text style={styles.methodHint}>यूपीआई</Text>
          </Pressable>

          <Pressable style={styles.methodBtn} onPress={onUdhar} accessibilityRole="button">
            <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.5}>
              <Path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              <Path d="M8 7h8M8 11h6" />
            </Svg>
            <Text style={styles.methodLabel}>UDHAR</Text>
            <Text style={styles.methodHint}>उधार</Text>
          </Pressable>
        </View>

        {/* Secondary actions — both Split Payment and Add Discount per prototype */}
        <View style={styles.secondaryRow}>
          <Pressable style={styles.secondaryBtn} onPress={() => setSplitVisible(true)}>
            <Text style={styles.secondaryText}>Split Payment</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => {
            Alert.alert("Add Discount", "Choose discount type:", [
              { text: "Cancel", style: "cancel" },
              { text: "10%", onPress: () => { useCartStore.getState().applyDiscount({ type: "percentage", value: 10 }); showToast("10% discount applied"); } },
              { text: "₹50 off", onPress: () => { useCartStore.getState().applyDiscount({ type: "fixed", value: 5000 }); showToast("₹50 discount applied"); } },
            ]);
          }}>
            <Text style={styles.secondaryText}>Add Discount</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Split Payment Modal — stays in chooser */}
      {/* V3-HARDEN-112: KeyboardAvoidingView wraps modal content for keyboard safety */}
      <Modal visible={splitVisible} transparent animationType="slide" onRequestClose={() => setSplitVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <ScrollView style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%" }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 4 }}>Split Payment</Text>
            <Text style={{ fontSize: 13, color: colors.textTertiary, marginBottom: 16 }}>Total: {totalDisplay}</Text>

            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textTertiary, marginBottom: 6 }}>CASH AMOUNT</Text>
            <TextInput
              style={{ padding: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.border, fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 12 }}
              value={splitCash}
              onChangeText={setSplitCash}
              keyboardType="number-pad"
              placeholder="₹ 0"
              placeholderTextColor={colors.textTertiary}
            />

            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textTertiary, marginBottom: 6 }}>REMAINING VIA</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <Pressable onPress={() => setSplitSecondMethod("UPI")} style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: splitSecondMethod === "UPI" ? colors.primary : colors.border, alignItems: "center" }}>
                <Text style={{ fontWeight: "700", color: splitSecondMethod === "UPI" ? colors.primary : colors.textSecondary }}>📱 UPI</Text>
              </Pressable>
              <Pressable onPress={() => setSplitSecondMethod("DUE")} style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: splitSecondMethod === "DUE" ? colors.primary : colors.border, alignItems: "center" }}>
                <Text style={{ fontWeight: "700", color: splitSecondMethod === "DUE" ? colors.primary : colors.textSecondary }}>📋 Udhar</Text>
              </Pressable>
            </View>

            <View style={{ padding: 12, backgroundColor: colors.backgroundSecondary, borderRadius: 12, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: colors.textTertiary }}>Cash</Text><Text style={{ fontWeight: "700" }}>₹{splitCashNum.toLocaleString("en-IN")}</Text></View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}><Text style={{ color: colors.textTertiary }}>{splitSecondMethod}</Text><Text style={{ fontWeight: "700" }}>₹{splitRemainder.toLocaleString("en-IN")}</Text></View>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => setSplitVisible(false)} style={{ flex: 1, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.border, alignItems: "center" }}>
                <Text style={{ fontWeight: "700", color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={async () => {
                const totalRupees = Math.round(grandTotal / 100);
                if (splitCashNum <= 0 || splitRemainder <= 0) { showToast("Enter valid cash amount"); return; }
                if (splitCashNum + splitRemainder !== totalRupees) { showToast(`Must equal total ₹${totalRupees}`); return; }
                setSplitVisible(false);
                useCartStore.getState().lockCart();
                setProcessing(true);
                createSaleInFlight.current = true;
                try {
                  const id = saleId ?? await createSaleStep();
                  if (!id) throw new Error("Failed to create sale");
                  const payments: SplitPaymentItem[] = [
                    { mode: "CASH", amountMinor: splitCashNum * 100 },
                    { mode: splitSecondMethod, amountMinor: splitRemainder * 100 },
                  ];
                  await createSplitPayment({ saleId: id, payments });
                  logger.debug("V3Payment", `split_done:${id}`);
                  onComplete("CASH", id, grandTotal, itemCount);
                } catch (err: any) {
                  showToast(err?.message ?? "Split payment failed");
                } finally {
                  useCartStore.getState().unlockCart();
                  createSaleInFlight.current = false;
                  setProcessing(false);
                }
              }} style={{ flex: 2, padding: 14, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center" }}>
                <Text style={{ fontWeight: "800", color: "#fff" }}>Confirm Split</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: getScreenPadding(), paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    body: { flex: 1 },
    bodyContent: { padding: getScreenPadding(), alignItems: "center" },
    totalAmount: { fontSize: 44, fontWeight: "900", color: colors.textPrimary, letterSpacing: -1, marginTop: 16 },
    totalSub: { fontSize: 14, color: colors.textTertiary, fontWeight: "500", marginTop: 4 },
    methodGrid: { flexDirection: "row", gap: 12, marginTop: 28, width: "100%" },
    methodBtn: { flex: 1, padding: 24, borderRadius: 20, borderWidth: 2, borderColor: colors.border, alignItems: "center", backgroundColor: colors.surface },
    methodLabel: { fontSize: 17, fontWeight: "800", color: colors.textSecondary, marginTop: 8, letterSpacing: -0.3 },
    methodHint: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
    secondaryRow: { flexDirection: "row", gap: 10, marginTop: 12, width: "100%" },
    secondaryBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
    secondaryText: { fontSize: 13, fontWeight: "600", color: colors.textTertiary },
  });
}
