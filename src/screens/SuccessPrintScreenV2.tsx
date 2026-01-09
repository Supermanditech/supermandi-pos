import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { theme } from "../theme";
import { useCartStore } from "../stores/cartStore";
import type { CartItem } from "../stores/cartStore";
import { eventLogger } from "../services/eventLogger";
import { logPaymentEvent, logPosEvent } from "../services/cloudEventLogger";
import { printerService } from "../services/printerService";
import { formatMoney } from "../utils/money";

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
  const { items, total, clearCart, unlockCart } = useCartStore();

  const saleItems = route.params?.saleItems ?? items;
  const saleTotalMinor = route.params?.saleTotalMinor ?? total;
  const currency = route.params?.saleCurrency ?? saleItems[0]?.currency ?? "INR";
  const paymentMode = route.params?.paymentMode ?? "CASH";
  const billNumber = route.params?.billId ?? useRef(Date.now().toString().slice(-6)).current;
  const isPartialSale = route.params?.partialSale === true;
  // For reconciliation: tie receipt/print outcomes to a bill id.
  const transactionId = route.params?.transactionId ?? useRef(`${Date.now()}-${Math.random().toString(16).slice(2)}`).current;

  const [printStatus, setPrintStatus] = useState<"idle" | "printing" | "success" | "failed">("idle");

  const generateReceiptContent = (): string => {
    return [
      "=================================",
      "       SuperMandi POS",
      "=================================",
      `Bill #: ${billNumber}`,
      `Date: ${new Date().toLocaleString()}`,
      `Payment: ${paymentMode}`,
      "=================================",
      "",
      "ITEMS:",
      ...saleItems.map(
        (i) =>
          `${i.name}\n  ${i.quantity} x ${formatMoney(i.priceMinor, currency)} = ${formatMoney(i.quantity * i.priceMinor, currency)}`
      ),
      "",
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

  const handleSkip = () => {
    if (!isPartialSale) {
      clearCart(true);
    }
    unlockCart();
    navigation.navigate("SellScan");
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
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleSkip}>
          <Text style={[styles.btnText, styles.btnTextSecondary]}>No Print</Text>
        </TouchableOpacity>
      </View>
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
  btnDisabled: {
    opacity: 0.6
  },
  btnText: { color: theme.colors.textInverse, fontSize: 16, fontWeight: "800" },
  btnTextSecondary: { color: theme.colors.textPrimary }
});
