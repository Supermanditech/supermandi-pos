/**
 * V3-FIX-072: Dedicated cash payment screen
 * Prototype: amount to collect, exact preset, round-up presets, manual entry, change, COMPLETE SALE
 */
import React, { useMemo, useState, useCallback } from "react";
import { View, Pressable, TextInput, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { recordCashPayment } from "../../services/api/posApi";
import { logger } from "../../services/logger";
import { usePaymentFlow, type PaymentMethod } from "./usePaymentFlow";

function getQuickAmounts(totalPaise: number): number[] {
  const t = Math.round(totalPaise / 100);
  const presets = [t];
  const roundUps = [50, 100, 200, 500, 1000, 2000, 5000];
  for (const r of roundUps) {
    if (r > t && presets.length < 5) presets.push(r);
  }
  return presets;
}

type CashScreenV3Props = {
  onBack: () => void;
  onComplete: (method: PaymentMethod, saleId: string, totalMinor: number, itemCount: number) => void;
};

export default function CashScreenV3({ onBack, onComplete }: CashScreenV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { grandTotal, itemCount, totalDisplay, isBulk, processing, executePayment } = usePaymentFlow();

  const [cashReceived, setCashReceived] = useState("");
  const quickAmounts = useMemo(() => getQuickAmounts(grandTotal), [grandTotal]);
  const cashReceivedNum = parseInt(cashReceived, 10) || 0;
  const changeAmount = cashReceivedNum > 0 ? Math.max(0, cashReceivedNum - Math.round(grandTotal / 100)) : 0;

  const handleComplete = useCallback(() => {
    executePayment("CASH", async (saleId) => {
      await recordCashPayment({ saleId });
      logger.debug("V3Cash", `cash_recorded:${saleId}`);
    }, onComplete);
  }, [executePayment, onComplete]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} accessibilityLabel="Back to payment methods">
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Cash Payment</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.totalAmount}>{totalDisplay}</Text>
        <Text style={styles.totalSub}>{itemCount} item{itemCount !== 1 ? "s" : ""}{isBulk ? " · incl. GST" : ""}</Text>

        <Text style={styles.sectionTitle}>Amount Received</Text>
        <View style={styles.quickRow}>
          {quickAmounts.map((amt, i) => (
            <Pressable
              key={amt}
              style={[styles.quickBtn, i === 0 && styles.quickBtnExact, cashReceivedNum === amt && styles.quickBtnSelected]}
              onPress={() => setCashReceived(String(amt))}
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

      <View style={styles.footer}>
        <Pressable
          style={[styles.completeBtn, processing && styles.completeBtnDisabled]}
          onPress={handleComplete}
          disabled={processing}
          accessibilityRole="button"
        >
          <Text style={styles.completeBtnText}>{processing ? "Processing..." : "✓ COMPLETE SALE"}</Text>
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
    body: { flex: 1, padding: 20, alignItems: "center" },
    totalAmount: { fontSize: 44, fontWeight: "900", color: colors.textPrimary, letterSpacing: -1, marginTop: 8 },
    totalSub: { fontSize: 14, color: colors.textTertiary, fontWeight: "500", marginTop: 4 },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textTertiary, marginTop: 24, marginBottom: 10, textAlign: "center" },
    quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
    quickBtn: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
    quickBtnExact: { backgroundColor: colors.success, borderColor: colors.success },
    quickBtnSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    quickText: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
    quickTextExact: { color: "#fff" },
    quickTextSelected: { color: colors.primary },
    cashInput: { marginTop: 16, padding: 16, borderRadius: 14, borderWidth: 2, borderColor: colors.border, fontSize: 24, fontWeight: "800", color: colors.textPrimary, backgroundColor: colors.surface, textAlign: "center", width: "100%" },
    changeBox: { marginTop: 14, padding: 16, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: "center", width: "100%" },
    changeLabel: { fontSize: 13, color: colors.textTertiary, fontWeight: "500" },
    changeAmount: { fontSize: 28, fontWeight: "900", color: colors.textPrimary, letterSpacing: -0.5, marginTop: 2 },
    footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
    completeBtn: { backgroundColor: colors.success, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    completeBtnDisabled: { opacity: 0.6 },
    completeBtnText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  });
}
