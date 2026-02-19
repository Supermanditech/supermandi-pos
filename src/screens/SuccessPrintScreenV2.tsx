import React, { useEffect, useRef, useState } from "react";
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../theme";
import { useCartStore } from "../stores/cartStore";
import type { CartItem } from "../stores/cartStore";
import { eventLogger } from "../services/eventLogger";
import { logPaymentEvent, logPosEvent } from "../services/cloudEventLogger";
import { printerService } from "../services/printerService";
import { syncOutbox } from "../services/offline/sync";
import { formatMoney } from "../utils/money";
import { formatDateTime } from "../i18n/formatters";
import { getDeviceStoreId } from "../services/deviceSession";
import { checkWhatsAppStatus, sendBillWhatsApp } from "../services/api/posApi";

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: { saleItemIds?: string[] } | undefined;
  SuccessPrint: {
    paymentMode: "UPI" | "CASH" | "DUE";
    transactionId: string;
    billId: string;
    saleItems?: CartItem[];
    saleTotalMinor?: number;
    saleCurrency?: string;
    partialSale?: boolean;
  };
};

type Nav = NativeStackNavigationProp<RootStackParamList, "SuccessPrint">;
type Rt = RouteProp<RootStackParamList, "SuccessPrint">;

export default function SuccessPrintScreenV2() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { items, total, subtotal, discountAmount, discount, clearCart, unlockCart } = useCartStore();

  // UIUX-POS-001: useRef MUST be unconditional (Rules of Hooks).
  // These are fallbacks when route params don't provide billId/transactionId.
  const fallbackBillRef = useRef(Date.now().toString().slice(-6));
  const fallbackTxnRef = useRef(`${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const saleItems = route.params?.saleItems ?? items;
  const saleTotalMinor = route.params?.saleTotalMinor ?? total;
  const currency = route.params?.saleCurrency ?? saleItems[0]?.currency ?? "INR";
  const paymentMode = route.params?.paymentMode ?? "CASH";
  const billNumber = route.params?.billId ?? fallbackBillRef.current;
  const isPartialSale = route.params?.partialSale === true;
  // For reconciliation: tie receipt/print outcomes to a bill id.
  const transactionId = route.params?.transactionId ?? fallbackTxnRef.current;

  const [printStatus, setPrintStatus] = useState<"idle" | "printing" | "success" | "failed">("idle");
  const [operatorStoreId, setOperatorStoreId] = useState<string | null>(null);

  // WA-001: WhatsApp state
  const [waConfigured, setWaConfigured] = useState(false);
  const [waStatus, setWaStatus] = useState<"idle" | "prompting" | "sending" | "sent" | "failed">("idle");
  const [waPhone, setWaPhone] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  useEffect(() => {
    getDeviceStoreId().then(setOperatorStoreId);
    // WA-001: Check if WhatsApp Cloud API is configured
    checkWhatsAppStatus()
      .then((res) => setWaConfigured(res.configured))
      .catch(() => setWaConfigured(false));
  }, []);

  // POS-PRINT-001: Snapshot discount from cart (fallback to route params)
  const saleSubtotal = subtotal || saleTotalMinor;
  const saleDiscountAmount = discountAmount || 0;
  const saleDiscountLabel = discount
    ? discount.type === "percentage"
      ? `${discount.value}%`
      : formatMoney(discount.value, currency)
    : null;

  const generateReceiptContent = (): string => {
    // ISSUE-MICRO-029: Detect offline sales (bill refs from offline start with "OFF-")
    const isOfflineSale = billNumber.startsWith("OFF-");
    return [
      "=================================",
      "       SuperMandi POS",
      "=================================",
      `Bill #: ${billNumber}`,
      `Date: ${formatDateTime(new Date())}`,
      `Payment: ${paymentMode}`,
      // POS-PRINT-001: Operator (store) ID on receipt
      ...(operatorStoreId ? [`Operator: ${operatorStoreId.slice(0, 8)}`] : []),
      // ISSUE-MICRO-029: Mark offline receipts so customers know sync is pending
      ...(isOfflineSale ? ["* OFFLINE SALE - PENDING SYNC *"] : []),
      "=================================",
      "",
      "ITEMS:",
      ...saleItems.map(
        (i) =>
          `${i.name}\n  ${i.quantity} x ${formatMoney(i.priceMinor, currency)} = ${formatMoney(i.quantity * i.priceMinor, currency)}`
      ),
      "",
      "---------------------------------",
      `SUBTOTAL: ${formatMoney(saleSubtotal, currency)}`,
      // POS-PRINT-001: Show discount line if applied
      ...(saleDiscountAmount > 0
        ? [`DISCOUNT${saleDiscountLabel ? ` (${saleDiscountLabel})` : ""}: -${formatMoney(saleDiscountAmount, currency)}`]
        : []),
      "=================================",
      `TOTAL: ${formatMoney(saleTotalMinor, currency)}`,
      "=================================",
      "",
      "Thank you for your business!",
      "================================="
    ].join("\n");
  };

  useEffect(() => {
    void eventLogger.log("USER_ACTION", {
      action: "SALE_COMPLETED",
      paymentMode,
      billNumber,
      total: saleTotalMinor,
      itemCount: saleItems.length
    });

    void logPaymentEvent("PAYMENT_SUCCESS", {
      transactionId,
      billId: billNumber,
      paymentMode,
      amountMinor: saleTotalMinor,
      currency
    });

    // ISSUE-MICRO-027: Trigger immediate sync so the sale reaches the server ASAP
    // Fire-and-forget — doesn't block the user; regular background sync retries on failure
    void syncOutbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrint = async () => {
    if (printStatus === "printing") return;
    setPrintStatus("printing");

    try {
      await printerService.printReceipt(generateReceiptContent());
      setPrintStatus("success");
    } catch {
      setPrintStatus("failed");
      void logPosEvent("PRINTER_ERROR", { billId: billNumber, transactionId, reason: "print_failed" });
    }
  };

  // WA-001: Validate Indian mobile number (10 digits starting with 6-9)
  const validatePhone = (raw: string): string | null => {
    const digits = raw.replace(/\D/g, "");
    // 10-digit Indian mobile
    if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
    // 11-digit with leading 0
    if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) return digits.slice(1);
    // 12-digit with 91 prefix
    if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return digits.slice(2);
    return null;
  };

  // WA-001: Send bill via WhatsApp Cloud API (with retry support)
  const handleWhatsAppSend = async () => {
    const cleanPhone = validatePhone(waPhone);
    if (!cleanPhone) {
      Alert.alert("Invalid Number", "Please enter a valid 10-digit Indian mobile number (starting with 6-9).");
      return;
    }

    setWaStatus("sending");
    setShowPhoneModal(false);

    try {
      const result = await sendBillWhatsApp({
        saleId: transactionId,
        recipientPhone: cleanPhone,
      });

      if (result.sent) {
        setWaStatus("sent");
        void logPosEvent("WHATSAPP_BILL_SENT", { billId: billNumber, transactionId, phone: cleanPhone });
        Alert.alert("Sent!", "Bill sent via WhatsApp successfully.");
      } else {
        setWaStatus("failed");
        void logPosEvent("WHATSAPP_BILL_FAILED", { billId: billNumber, transactionId, phone: cleanPhone, error: result.error });
        Alert.alert("Failed", result.error || "Could not send WhatsApp message.");
      }
    } catch (err: unknown) {
      setWaStatus("failed");
      const msg = err instanceof Error ? err.message : "Unknown error";
      void logPosEvent("WHATSAPP_BILL_ERROR", { billId: billNumber, transactionId, phone: cleanPhone, error: msg });
      const isOffline = msg.includes("offline") || msg.includes("network") || msg.includes("whatsapp_offline_blocked");
      Alert.alert(
        isOffline ? "Offline" : "Error",
        isOffline ? "WhatsApp requires an internet connection. Please try again when online." : `Failed to send: ${msg}`
      );
    }
  };

  const handleSkip = () => {
    // GL-CRIT-0094: Navigate first, then unlock cart after navigation completes
    // This prevents race conditions where cart is unlocked while still on this screen
    if (!isPartialSale) {
      clearCart(true);
    }
    // Use reset to ensure clean navigation state and unlock after
    navigation.reset({
      index: 0,
      routes: [{ name: "SellScan" }],
    });
    // Unlock after reset is queued (React Navigation processes reset synchronously)
    setTimeout(() => unlockCart(), 0);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{paymentMode === "DUE" ? "Sale Recorded" : "Payment Successful"}</Text>
      <Text style={styles.sub}>Bill #{billNumber}</Text>
      <Text style={styles.status}>
        {printStatus === "idle"
          ? "Choose print option"
          : printStatus === "printing"
            ? "PRINTING..."
            : printStatus === "success"
              ? "Receipt Printed"
              : "Print Failed"}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, printStatus === "printing" && styles.btnDisabled]}
          onPress={handlePrint}
          disabled={printStatus === "printing"}
        >
          <Text style={styles.btnText}>Print Receipt</Text>
        </TouchableOpacity>

        {/* WA-001: WhatsApp Bill button — shown when Cloud API configured */}
        {waConfigured && (
          <TouchableOpacity
            style={[styles.btn, styles.btnWhatsApp, waStatus === "sending" && styles.btnDisabled]}
            onPress={() => { setShowPhoneModal(true); setWaStatus("prompting"); }}
            disabled={waStatus === "sending"}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <MaterialCommunityIcons name="whatsapp" size={20} color={theme.colors.textInverse} />
              <Text style={styles.btnText}>
                {waStatus === "sending" ? "Sending..." : waStatus === "sent" ? "Sent! Tap to Resend" : waStatus === "failed" ? "Retry WhatsApp" : "WhatsApp Bill"}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleSkip}>
          <Text style={[styles.btnText, styles.btnTextSecondary]}>No Print</Text>
        </TouchableOpacity>
      </View>

      {/* WA-001: Phone number input modal */}
      <Modal visible={showPhoneModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send Bill via WhatsApp</Text>
            <Text style={styles.modalSub}>Enter customer's phone number</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder="9876543210"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="phone-pad"
              maxLength={10}
              value={waPhone}
              onChangeText={(t) => setWaPhone(t.replace(/\D/g, ""))}
              editable={waStatus !== "sending"}
              autoFocus
              returnKeyType="send"
              onSubmitEditing={handleWhatsAppSend}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => { setShowPhoneModal(false); setWaStatus("idle"); }}
                disabled={waStatus === "sending"}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.btnWhatsApp, waStatus === "sending" && styles.btnDisabled]}
                onPress={handleWhatsAppSend}
                disabled={waStatus === "sending"}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <MaterialCommunityIcons name="whatsapp" size={18} color={theme.colors.textInverse} />
                  <Text style={styles.btnText}>{waStatus === "sending" ? "Sending..." : "Send"}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  title: { fontSize: 34, fontWeight: "900", color: theme.colors.textPrimary, textAlign: "center" },
  sub: { marginTop: 8, fontSize: 18, fontWeight: "700", color: theme.colors.textSecondary },
  status: { marginTop: 16, fontSize: 16, fontWeight: "800", color: theme.colors.primary },
  actions: {
    width: "100%",
    marginTop: 24,
    gap: 12
  },
  btn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center"
  },
  btnSecondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  btnWhatsApp: {
    backgroundColor: "#25D366",
  },
  btnDisabled: {
    opacity: 0.6
  },
  btnText: { color: theme.colors.textInverse, fontSize: 16, fontWeight: "800" },
  btnTextSecondary: { color: theme.colors.textPrimary },
  // WA-001: Phone modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  modalSub: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  phoneInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    textAlign: "center",
    letterSpacing: 1,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalBtnCancel: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalBtnCancelText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
});
