import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { theme } from "../theme";
import { useCartStore } from "../stores/cartStore";
import { eventLogger } from "../services/eventLogger";
import { logPaymentEvent, logPosEvent } from "../services/cloudEventLogger";
import { printerService } from "../services/printerService";
import { buildBillText } from "../services/billing/billFormatter";
import { fetchLocalBillSnapshot } from "../services/billing/billStorage";
import type { BillSnapshot } from "../services/billing/billTypes";

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: { paymentMode: "UPI" | "CASH" | "DUE"; transactionId: string; billId: string; saleId: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList, "SuccessPrint">;
type Rt = RouteProp<RootStackParamList, "SuccessPrint">;

export default function SuccessPrintScreenV2() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { clearCart } = useCartStore();

  const paymentMode = route.params?.paymentMode ?? "CASH";
  const billNumber = route.params?.billId ?? useRef(Date.now().toString().slice(-6)).current;
  const saleId = route.params?.saleId ?? "";
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const printedRef = useRef(false);

  // For reconciliation: tie receipt/print outcomes to a bill id.
  const transactionId = route.params?.transactionId ?? useRef(`${Date.now()}-${Math.random().toString(16).slice(2)}`).current;

  const [printStatus, setPrintStatus] = useState<"printing" | "success" | "failed">("printing");
  const [showToast, setShowToast] = useState(false);
  const [bill, setBill] = useState<BillSnapshot | null>(null);
  const [billError, setBillError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!saleId) {
      setBillError("Bill not found.");
      setPrintStatus("failed");
      return () => {
        cancelled = true;
      };
    }

    fetchLocalBillSnapshot(saleId)
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot) {
          setBillError("Bill not available offline.");
          setPrintStatus("failed");
          return;
        }
        setBill(snapshot);
      })
      .catch(() => {
        if (cancelled) return;
        setBillError("Bill not available offline.");
        setPrintStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [saleId]);

  useEffect(() => {
    if (!bill || printedRef.current) return;
    printedRef.current = true;

    const run = async () => {
      await eventLogger.log("USER_ACTION", {
        action: "SALE_COMPLETED",
        paymentMode,
        billNumber: bill.billRef,
        total: bill.totalMinor,
        itemCount: bill.items.length
      });

      // Cloud events: record payment success at the point the POS considers the sale done.
      // If upstream payment confirmation is added later, those events will also carry the same transactionId.
      void logPaymentEvent("PAYMENT_SUCCESS", {
        transactionId,
        billId: bill.billRef,
        paymentMode,
        amountMinor: bill.totalMinor,
        currency: bill.currency
      });

      try {
        await printerService.printReceipt(buildBillText(bill));
        setPrintStatus("success");
      } catch {
        setPrintStatus("failed");

        // Cloud event (required)
        void logPosEvent("PRINTER_ERROR", { billId: bill.billRef, transactionId, reason: "print_failed" });
      }

      setShowToast(true);
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    };

    run();
  }, [bill, paymentMode, toastOpacity, transactionId]);

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
        {billError
          ? billError
          : printStatus === "printing"
          ? "PRINTING..."
          : printStatus === "success"
          ? "Receipt Printed"
          : "Print Failed"}
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
