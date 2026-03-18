/**
 * V3-FIX-073: Dedicated UPI payment screen
 * Prototype: total amount, QR from authoritative payload, waiting state, confirm action
 */
import React, { useMemo, useState, useCallback } from "react";
import { View, Pressable, ActivityIndicator, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { initUpiPayment, confirmUpiPaymentManual } from "../../services/api/posApi";
import { showToast } from "../../utils/showToast";
import { logger } from "../../services/logger";
import { usePaymentFlow, type PaymentMethod } from "./usePaymentFlow";

type UpiScreenV3Props = {
  onBack: () => void;
  onComplete: (method: PaymentMethod, saleId: string, totalMinor: number, itemCount: number) => void;
};

export default function UpiScreenV3({ onBack, onComplete }: UpiScreenV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { grandTotal, itemCount, totalDisplay, isBulk, processing, executePayment } = usePaymentFlow();

  const [upiData, setUpiData] = useState<{ paymentId: string; upiVpa: string; billRef: string } | null>(null);

  const handleComplete = useCallback(() => {
    executePayment("UPI", async (saleId) => {
      const upi = await initUpiPayment({ saleId });
      setUpiData({ paymentId: upi.paymentId, upiVpa: upi.upiVpa, billRef: upi.billRef });
      logger.debug("V3Upi", `upi_initiated:${upi.paymentId}`);
      await confirmUpiPaymentManual({ paymentId: upi.paymentId });
      logger.debug("V3Upi", `upi_confirmed:${saleId}`);
    }, onComplete);
  }, [executePayment, onComplete]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} accessibilityLabel="Back to payment methods">
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>UPI Payment</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.totalAmount}>{totalDisplay}</Text>
        <Text style={styles.totalSub}>{itemCount} item{itemCount !== 1 ? "s" : ""}{isBulk ? " · incl. GST" : ""}</Text>

        {/* QR display area */}
        <View style={styles.qrArea}>
          {upiData ? (
            <>
              <View style={styles.qrBox}>
                <Text style={styles.qrText}>UPI QR</Text>
                <Text style={styles.qrVpa}>{upiData.upiVpa}</Text>
                <Text style={styles.qrRef}>Ref: {upiData.billRef}</Text>
              </View>
              <View style={styles.waitingRow}>
                <ActivityIndicator size="small" color={colors.warning} />
                <Text style={styles.waitingText}>Waiting for payment...</Text>
              </View>
            </>
          ) : (
            <View style={styles.qrBox}>
              <Text style={styles.qrText}>QR Code</Text>
              <Text style={styles.qrSub}>Customer scans to pay {totalDisplay}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.completeBtn, processing && styles.completeBtnDisabled]}
          onPress={handleComplete}
          disabled={processing}
          accessibilityRole="button"
        >
          <Text style={styles.completeBtnText}>{processing ? "Processing..." : "✓ Payment Received"}</Text>
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
    qrArea: { marginTop: 28, alignItems: "center", width: "100%" },
    qrBox: { width: 200, height: 200, borderRadius: 18, borderWidth: 3, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
    qrText: { fontSize: 16, fontWeight: "700", color: colors.textTertiary },
    qrVpa: { fontSize: 13, fontWeight: "600", color: colors.primary, marginTop: 4 },
    qrRef: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
    qrSub: { fontSize: 11, color: colors.textTertiary, marginTop: 4 },
    waitingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.warningSoft, borderRadius: 12 },
    waitingText: { fontSize: 13, color: "#92400E", fontWeight: "600" },
    footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
    completeBtn: { backgroundColor: colors.success, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    completeBtnDisabled: { opacity: 0.6 },
    completeBtnText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  });
}
