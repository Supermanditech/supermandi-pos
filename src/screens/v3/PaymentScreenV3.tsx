import React, { useMemo, useState, useCallback, useRef } from "react";
import { View, Pressable, TextInput, ActivityIndicator, StyleSheet, Text, ScrollView } from "react-native";
import Svg, { Path, Rect, Circle, Line } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useCartStore, type SellMode } from "../../stores/cartStore";
import { createSale, type SaleItemInput } from "../../services/api/posApi";
import { showToast } from "../../utils/showToast";
import { logger } from "../../services/logger";

// V3-002: Payment screen v3 — wired to real createSale API

type PaymentScreenV3Props = {
  onBack: () => void;
  onComplete: (method: "CASH" | "UPI" | "DUE") => void;
};

type PaymentMethod = "CASH" | "UPI" | "DUE";

// Quick cash amount presets relative to total
function getQuickAmounts(totalPaise: number): number[] {
  const t = Math.round(totalPaise / 100);
  const presets = [t]; // exact
  const roundUps = [50, 100, 200, 500, 1000, 2000, 5000];
  for (const r of roundUps) {
    if (r > t && presets.length < 5) presets.push(r);
  }
  return presets;
}

export default function PaymentScreenV3({ onBack, onComplete }: PaymentScreenV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const sellMode = useCartStore((s) => s.sellMode);
  const isBulk = sellMode === "bulk";
  const gst = isBulk ? Math.round(total * 0.18) : 0;
  const grandTotal = total + gst;
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  const quickAmounts = useMemo(() => getQuickAmounts(grandTotal), [grandTotal]);

  const totalDisplay = `₹${Math.round(grandTotal / 100).toLocaleString("en-IN")}`;
  const cashReceivedNum = parseInt(cashReceived, 10) || 0;
  const changeAmount = cashReceivedNum > 0 ? Math.max(0, cashReceivedNum - Math.round(grandTotal / 100)) : 0;

  const handleQuickAmount = useCallback((amt: number) => {
    setCashReceived(String(amt));
  }, []);

  const [processing, setProcessing] = useState(false);
  const createSaleInFlight = useRef(false);

  const handleComplete = useCallback(async () => {
    if (!selectedMethod) { showToast("Select payment method"); return; }
    if (createSaleInFlight.current) return;

    // V3-002: Call real createSale API
    createSaleInFlight.current = true;
    setProcessing(true);
    try {
      const saleItems: SaleItemInput[] = items.map((item) => ({
        productId: item.barcode ?? item.id,
        barcode: item.barcode,
        name: item.name,
        quantity: item.quantity,
        priceMinor: item.priceMinor,
        itemDiscount: item.itemDiscount ?? null,
        batchNumber: item.batchNumber ?? null,
      }));

      const discount = useCartStore.getState().discount;
      const result = await createSale({
        items: saleItems,
        discountMinor: discount ? (discount.type === "fixed" ? discount.value : 0) : 0,
        cartDiscount: discount ?? undefined,
        currency: "INR",
      });

      logger.debug("V3Payment", `sale_created:${result.saleId},billRef:${result.billRef},total:${result.totals.totalMinor}`);
      onComplete(selectedMethod);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "Sale failed";
      showToast(msg);
      logger.debug("V3Payment", `sale_failed:${String(err)}`);
    } finally {
      createSaleInFlight.current = false;
      setProcessing(false);
    }
  }, [selectedMethod, items, onComplete]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} accessibilityLabel="Back">
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Total */}
        <Text style={styles.totalAmount}>{totalDisplay}</Text>
        <Text style={styles.totalSub}>{itemCount} item{itemCount !== 1 ? "s" : ""}{isBulk ? " · incl. GST" : ""}</Text>

        {/* Payment method buttons */}
        <View style={styles.methodGrid}>
          <Pressable
            style={[styles.methodBtn, selectedMethod === "CASH" && styles.methodBtnActive]}
            onPress={() => setSelectedMethod("CASH")}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedMethod === "CASH" }}
          >
            <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={selectedMethod === "CASH" ? colors.primary : colors.textSecondary} strokeWidth={1.5}>
              <Rect x={2} y={6} width={20} height={12} rx={2} />
              <Circle cx={12} cy={12} r={3} />
              <Path d="M6 12h.01M18 12h.01" />
            </Svg>
            <Text style={[styles.methodLabel, selectedMethod === "CASH" && styles.methodLabelActive]}>CASH</Text>
            <Text style={styles.methodHint}>नकद</Text>
          </Pressable>

          <Pressable
            style={[styles.methodBtn, selectedMethod === "UPI" && styles.methodBtnActive]}
            onPress={() => setSelectedMethod("UPI")}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedMethod === "UPI" }}
          >
            <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={selectedMethod === "UPI" ? colors.primary : colors.textSecondary} strokeWidth={1.5}>
              <Rect x={5} y={2} width={14} height={20} rx={2} />
              <Line x1={12} y1={18} x2={12} y2={18.01} strokeWidth={2} />
              <Path d="M9 6h6" />
            </Svg>
            <Text style={[styles.methodLabel, selectedMethod === "UPI" && styles.methodLabelActive]}>UPI</Text>
            <Text style={styles.methodHint}>यूपीआई</Text>
          </Pressable>

          <Pressable
            style={[styles.methodBtn, selectedMethod === "DUE" && styles.methodBtnActive]}
            onPress={() => setSelectedMethod("DUE")}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedMethod === "DUE" }}
          >
            <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={selectedMethod === "DUE" ? colors.primary : colors.textSecondary} strokeWidth={1.5}>
              <Path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              <Path d="M8 7h8M8 11h6" />
            </Svg>
            <Text style={[styles.methodLabel, selectedMethod === "DUE" && styles.methodLabelActive]}>UDHAR</Text>
            <Text style={styles.methodHint}>उधार</Text>
          </Pressable>
        </View>

        {/* Secondary actions */}
        <View style={styles.secondaryRow}>
          <Pressable style={styles.secondaryBtn}><Text style={styles.secondaryText}>Split Payment</Text></Pressable>
          <Pressable style={styles.secondaryBtn}><Text style={styles.secondaryText}>Add Discount</Text></Pressable>
        </View>

        {/* Cash section — shown when CASH selected */}
        {selectedMethod === "CASH" ? (
          <View style={styles.cashSection}>
            <Text style={styles.cashTitle}>Amount Received</Text>
            <View style={styles.quickRow}>
              {quickAmounts.map((amt, i) => (
                <Pressable
                  key={amt}
                  style={[styles.quickBtn, i === 0 && styles.quickBtnExact, cashReceivedNum === amt && styles.quickBtnSelected]}
                  onPress={() => handleQuickAmount(amt)}
                >
                  <Text style={[styles.quickText, i === 0 && styles.quickTextExact, cashReceivedNum === amt && styles.quickTextSelected]}>
                    {i === 0 ? `EXACT ₹${amt}` : `₹${amt}`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.cashInput}
              value={cashReceived}
              onChangeText={setCashReceived}
              placeholder="₹"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              textAlign="center"
            />
            <View style={styles.changeBox}>
              <Text style={styles.changeLabel}>Change to return</Text>
              <Text style={styles.changeAmount}>₹{changeAmount.toLocaleString("en-IN")}</Text>
            </View>
          </View>
        ) : null}

        {/* UPI section */}
        {selectedMethod === "UPI" ? (
          <View style={styles.upiSection}>
            <View style={styles.qrPlaceholder}>
              <Text style={styles.qrText}>QR Code</Text>
              <Text style={styles.qrSub}>Customer scans to pay {totalDisplay}</Text>
            </View>
            <View style={styles.waitingRow}>
              <View style={styles.waitingDot} />
              <Text style={styles.waitingText}>Waiting for payment...</Text>
            </View>
          </View>
        ) : null}

        {/* Udhar section */}
        {selectedMethod === "DUE" ? (
          <View style={styles.udharSection}>
            <Text style={styles.udharTitle}>Record as customer due</Text>
            <TextInput style={styles.udharInput} placeholder="Customer name" placeholderTextColor={colors.textTertiary} />
            <TextInput style={styles.udharInput} placeholder="+91 phone number" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
          </View>
        ) : null}
      </ScrollView>

      {/* Complete button */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.completeBtn, (!selectedMethod || processing) && styles.completeBtnDisabled]}
          onPress={handleComplete}
          disabled={!selectedMethod}
          accessibilityRole="button"
        >
          <Text style={styles.completeBtnText}>
            {processing ? "Processing..." :
             selectedMethod === "CASH" ? `✓ COMPLETE SALE` :
             selectedMethod === "UPI" ? `✓ Payment Received` :
             selectedMethod === "DUE" ? `Record Udhar ${totalDisplay}` :
             `Select Payment Method`}
          </Text>
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
    body: { flex: 1 },
    bodyContent: { padding: 20, alignItems: "center" },
    totalAmount: { fontSize: 44, fontWeight: "900", color: colors.textPrimary, letterSpacing: -1, marginTop: 16 },
    totalSub: { fontSize: 14, color: colors.textTertiary, fontWeight: "500", marginTop: 4 },
    // Method grid
    methodGrid: { flexDirection: "row", gap: 12, marginTop: 28, width: "100%" },
    methodBtn: { flex: 1, padding: 24, borderRadius: 20, borderWidth: 2, borderColor: colors.border, alignItems: "center", backgroundColor: colors.surface },
    methodBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    methodLabel: { fontSize: 17, fontWeight: "800", color: colors.textSecondary, marginTop: 8, letterSpacing: -0.3 },
    methodLabelActive: { color: colors.primary },
    methodHint: { fontSize: 10, color: colors.textTertiary, marginTop: 2 },
    // Secondary
    secondaryRow: { flexDirection: "row", gap: 10, marginTop: 12, width: "100%" },
    secondaryBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
    secondaryText: { fontSize: 13, fontWeight: "600", color: colors.textTertiary },
    // Cash
    cashSection: { width: "100%", marginTop: 20 },
    cashTitle: { fontSize: 13, fontWeight: "700", color: colors.textTertiary, marginBottom: 10, textAlign: "center" },
    quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
    quickBtn: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
    quickBtnExact: { backgroundColor: colors.success, borderColor: colors.success },
    quickBtnSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    quickText: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
    quickTextExact: { color: "#fff" },
    quickTextSelected: { color: colors.primary },
    cashInput: { marginTop: 16, padding: 16, borderRadius: 14, borderWidth: 2, borderColor: colors.border, fontSize: 24, fontWeight: "800", color: colors.textPrimary, backgroundColor: colors.surface, textAlign: "center" },
    changeBox: { marginTop: 14, padding: 16, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: "center" },
    changeLabel: { fontSize: 13, color: colors.textTertiary, fontWeight: "500" },
    changeAmount: { fontSize: 28, fontWeight: "900", color: colors.textPrimary, letterSpacing: -0.5, marginTop: 2 },
    // UPI
    upiSection: { width: "100%", marginTop: 20, alignItems: "center" },
    qrPlaceholder: { width: 200, height: 200, borderRadius: 18, borderWidth: 3, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    qrText: { fontSize: 16, fontWeight: "700", color: colors.textTertiary },
    qrSub: { fontSize: 11, color: colors.textTertiary, marginTop: 4 },
    waitingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.warningSoft, borderRadius: 12 },
    waitingDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.warning },
    waitingText: { fontSize: 13, color: "#92400E", fontWeight: "600" },
    // Udhar
    udharSection: { width: "100%", marginTop: 20 },
    udharTitle: { fontSize: 13, fontWeight: "700", color: colors.textTertiary, marginBottom: 10, textAlign: "center" },
    udharInput: { padding: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.border, fontSize: 15, fontWeight: "500", color: colors.textPrimary, backgroundColor: colors.surface, marginBottom: 10 },
    // Footer
    footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
    completeBtn: { backgroundColor: colors.success, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    completeBtnDisabled: { backgroundColor: colors.disabled, opacity: 0.6 },
    completeBtnText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  });
}
