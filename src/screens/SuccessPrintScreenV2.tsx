import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { theme } from "../theme";
import { useCartStore } from "../stores/cartStore";
import { eventLogger } from "../services/eventLogger";
import { logPaymentEvent, logPosEvent } from "../services/cloudEventLogger";
import { printerService } from "../services/printerService";
import { formatMoney } from "../utils/money";

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: { paymentMode: "UPI" | "CASH" | "DUE"; transactionId: string; billId: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList, "SuccessPrint">;
type Rt = RouteProp<RootStackParamList, "SuccessPrint">;

export default function SuccessPrintScreenV2() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { items, total, clearCart } = useCartStore();

  const currency = items[0]?.currency ?? "INR";
  const paymentMode = route.params?.paymentMode ?? "CASH";
  const billNumber = route.params?.billId ?? useRef(Date.now().toString().slice(-6)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // For reconciliation: tie receipt/print outcomes to a bill id.
  const transactionId = route.params?.transactionId ?? useRef(`${Date.now()}-${Math.random().toString(16).slice(2)}`).current;

  const [printStatus, setPrintStatus] = useState<"printing" | "success" | "failed">("printing");
  const [showToast, setShowToast] = useState(false);

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
      ...items.map(
        (i) =>
          `${i.name}\n  ${i.quantity} x ${formatMoney(i.priceMinor, currency)} = ${formatMoney(i.quantity * i.priceMinor, currency)}`
      ),
      "",
      "=================================",
      `TOTAL: ${formatMoney(total, currency)}`,
      "=================================",
      "",
      "Thank you for your business!",
      "================================="
    ].join("\n");
  };

  useEffect(() => {
    const run = async () => {
      await eventLogger.log("USER_ACTION", {
        action: "SALE_COMPLETED",
        paymentMode,
        billNumber,
        total,
        itemCount: items.length
      });

      // Cloud events: record payment success at the point the POS considers the sale done.
      // If upstream payment confirmation is added later, those events will also carry the same transactionId.
      void logPaymentEvent("PAYMENT_SUCCESS", {
        transactionId,
        billId: billNumber,
        paymentMode,
        amountMinor: total,
        currency
      });

      try {
        await printerService.printReceipt(generateReceiptContent());
        setPrintStatus("success");
      } catch {
        setPrintStatus("failed");

        // Cloud event (required)
        void logPosEvent("PRINTER_ERROR", { billId: billNumber, transactionId, reason: "print_failed" });
      }

      setShowToast(true);
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDone = () => {
    Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    clearCart();
    navigation.navigate("SellScan");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{paymentMode === "DUE" ? "Sale Recorded" : "Payment Successful"}</Text>
      <Text style={styles.sub}>Bill #{billNumber}</Text>
      <Text style={styles.status}>
        {printStatus === "printing" ? "PRINTING..." : printStatus === "success" ? "Receipt Printed" : "Print Failed"}
      </Text>

      <TouchableOpacity style={styles.btn} onPress={handleDone}>
        <Text style={styles.btnText}>Back to Scan</Text>
      </TouchableOpacity>

      {showToast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>Sale saved</Text>
        </Animated.View>
      )}
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
  btn: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12
  },
  btnText: { color: theme.colors.textInverse, fontSize: 16, fontWeight: "800" },
  toast: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: theme.colors.ink,
    padding: 14,
    borderRadius: 16
  },
  toastText: { color: theme.colors.textInverse, fontSize: 16, fontWeight: "700", textAlign: "center" }
});

