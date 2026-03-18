/**
 * V3-FIX-073: Dedicated UPI payment screen
 * Two-phase flow:
 *   Phase 1: Mount → create sale → init UPI → show QR + waiting state
 *   Phase 2: Operator taps "Payment Received" → confirm → success
 * Init and confirm are explicitly separated — no auto-confirm.
 */
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { View, Pressable, ActivityIndicator, StyleSheet, Text } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useCartStore } from "../../stores/cartStore";
import { createSale, initUpiPayment, confirmUpiPaymentManual, type SaleItemInput } from "../../services/api/posApi";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";
import { logger } from "../../services/logger";
import type { PaymentMethod } from "./usePaymentFlow";

type UpiState = "initializing" | "waiting" | "confirming" | "error";

type UpiScreenV3Props = {
  onBack: () => void;
  onComplete: (method: PaymentMethod, saleId: string, totalMinor: number, itemCount: number) => void;
};

export default function UpiScreenV3({ onBack, onComplete }: UpiScreenV3Props) {
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

  const [upiState, setUpiState] = useState<UpiState>("initializing");
  const [saleId, setSaleId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [upiVpa, setUpiVpa] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [billRef, setBillRef] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Phase 1: On mount, create sale + init UPI payment automatically
  useEffect(() => {
    let cancelled = false;

    const initFlow = async () => {
      try {
        setUpiState("initializing");

        // Check connectivity first
        const online = await isOnline();
        if (!online) {
          setErrorMsg("UPI requires internet connection");
          setUpiState("error");
          return;
        }

        if (items.length === 0) {
          setErrorMsg("Cart is empty");
          setUpiState("error");
          return;
        }

        // Lock cart during UPI flow
        useCartStore.getState().lockCart();

        // Create sale
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
        const saleResult = await createSale({
          items: saleItems,
          discountMinor: discount ? (discount.type === "fixed" ? discount.value : 0) : 0,
          cartDiscount: discount ?? undefined,
          currency: "INR",
        });

        if (cancelled) return;
        setSaleId(saleResult.saleId);
        logger.debug("V3Upi", `sale_created:${saleResult.saleId}`);

        // V3-FIX-123: Use committed sale total, not client-computed grandTotal
        const committedTotal = saleResult.totals.totalMinor;

        // Init UPI payment via canonical /payments/upi/generate — returns real qrData
        const upi = await initUpiPayment({ saleId: saleResult.saleId, amountMinor: committedTotal });
        if (cancelled) return;

        setPaymentId(upi.paymentId);
        setUpiVpa(upi.upiVpa);
        setQrData(upi.qrData);
        setBillRef(upi.orderId);
        setUpiState("waiting");
        logger.debug("V3Upi", `upi_initiated:${upi.paymentId},vpa:${upi.upiVpa}`);
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.response?.data?.error?.message ?? err?.message ?? "Failed to initialize UPI payment";
        setErrorMsg(msg);
        setUpiState("error");
        useCartStore.getState().unlockCart();
        logger.debug("V3Upi", `init_failed:${String(err)}`);
      }
    };

    void initFlow();
    return () => { cancelled = true; };
  }, []); // Run once on mount

  // Phase 2: Operator explicitly confirms payment was received
  const handleConfirm = useCallback(async () => {
    if (!paymentId || !saleId) return;
    setUpiState("confirming");
    try {
      await confirmUpiPaymentManual({ paymentId });
      logger.debug("V3Upi", `upi_confirmed:${saleId},payment:${paymentId}`);
      useCartStore.getState().unlockCart();
      onComplete("UPI", saleId, grandTotal, itemCount);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "Confirmation failed";
      showToast(msg);
      setUpiState("waiting"); // Return to waiting, let operator retry
      logger.debug("V3Upi", `confirm_failed:${String(err)}`);
    }
  }, [paymentId, saleId, grandTotal, itemCount, onComplete]);

  const handleBack = useCallback(() => {
    useCartStore.getState().unlockCart();
    onBack();
  }, [onBack]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={handleBack} accessibilityLabel="Back to payment methods">
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>UPI Payment</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.totalAmount}>{totalDisplay}</Text>
        <Text style={styles.totalSub}>{itemCount} item{itemCount !== 1 ? "s" : ""}{isBulk ? " · incl. GST" : ""}</Text>

        {/* Initializing state */}
        {upiState === "initializing" ? (
          <View style={styles.stateArea}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stateText}>Generating QR code...</Text>
          </View>
        ) : null}

        {/* Waiting state — QR is ready, waiting for customer to pay */}
        {(upiState === "waiting" || upiState === "confirming") ? (
          <View style={styles.qrArea}>
            <View style={styles.qrBox} testID="upi-qr-box">
              <Text style={styles.qrLabel}>Scan to Pay</Text>
              {qrData ? (
                <QRCode value={qrData} size={150} backgroundColor="#fff" color="#000" />
              ) : (
                <Text style={styles.qrFallback}>QR</Text>
              )}
              {upiVpa ? <Text style={styles.qrVpa}>{upiVpa}</Text> : null}
              {billRef ? <Text style={styles.qrRef}>Ref: {billRef}</Text> : null}
            </View>

            <View style={styles.waitingRow}>
              <ActivityIndicator size="small" color={colors.warning} />
              <Text style={styles.waitingText}>Waiting for customer payment...</Text>
            </View>
          </View>
        ) : null}

        {/* Error state */}
        {upiState === "error" ? (
          <View style={styles.stateArea}>
            <Text style={styles.errorIcon}>⚠</Text>
            <Text style={styles.errorText}>{errorMsg ?? "UPI initialization failed"}</Text>
            <Pressable style={styles.retryBtn} onPress={handleBack}>
              <Text style={styles.retryText}>← Back to Payment Methods</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Confirm button — only visible in waiting state */}
      {(upiState === "waiting" || upiState === "confirming") ? (
        <View style={styles.footer}>
          <Pressable
            style={[styles.completeBtn, upiState === "confirming" && styles.completeBtnDisabled]}
            onPress={handleConfirm}
            disabled={upiState === "confirming"}
            accessibilityRole="button"
            testID="upi-confirm-btn"
          >
            <Text style={styles.completeBtnText}>
              {upiState === "confirming" ? "Confirming..." : "✓ Payment Received"}
            </Text>
          </Pressable>
        </View>
      ) : null}
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
    stateArea: { marginTop: 40, alignItems: "center", gap: 16 },
    stateText: { fontSize: 14, color: colors.textTertiary, fontWeight: "500" },
    errorIcon: { fontSize: 40 },
    errorText: { fontSize: 14, color: colors.error, fontWeight: "600", textAlign: "center" },
    retryBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.border },
    retryText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
    qrArea: { marginTop: 28, alignItems: "center", width: "100%" },
    qrBox: { width: 220, minHeight: 220, borderRadius: 18, borderWidth: 3, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", padding: 16 },
    qrLabel: { fontSize: 12, fontWeight: "700", color: colors.textTertiary, marginBottom: 12 },
    qrFallback: { fontSize: 24, fontWeight: "700", color: colors.textTertiary },
    qrVpa: { fontSize: 13, fontWeight: "600", color: colors.primary, marginTop: 8 },
    qrRef: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
    waitingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.warningSoft, borderRadius: 12 },
    waitingText: { fontSize: 13, color: "#92400E", fontWeight: "600" },
    footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
    completeBtn: { backgroundColor: colors.success, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    completeBtnDisabled: { opacity: 0.6 },
    completeBtnText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  });
}
