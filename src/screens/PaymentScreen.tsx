import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import { useCartStore } from "../stores/cartStore";
import { formatMoney } from "../utils/money";
import {
  confirmUpiPaymentManual,
  createSale,
  initUpiPayment,
  recordCashPayment,
  recordDuePayment
} from "../services/api/posApi";
import { logPaymentEvent } from "../services/cloudEventLogger";
import { ApiError } from "../services/api/apiClient";
import { subscribeNetworkStatus } from "../services/networkStatus";
import { clearDeviceSession } from "../services/deviceSession";
import { POS_MESSAGES } from "../utils/uiStatus";
import { theme } from "../theme";

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  EnrollDevice: undefined;
  DeviceBlocked: undefined;
  SuccessPrint: {
    paymentMode: "UPI" | "CASH" | "DUE";
    transactionId: string;
    billId: string;
  };
};

type PaymentScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Payment">;
type PaymentMode = "UPI" | "CASH" | "DUE";

const PaymentScreen = () => {
  const navigation = useNavigation<PaymentScreenNavigationProp>();
  const { total, items } = useCartStore();
  const [selectedMode, setSelectedMode] = useState<PaymentMode>("UPI");
  const [saleId, setSaleId] = useState<string | null>(null);
  const [billRef, setBillRef] = useState<string | null>(null);
  const [upiIntent, setUpiIntent] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [loadingSale, setLoadingSale] = useState(false);
  const [loadingUpi, setLoadingUpi] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const currency = items[0]?.currency ?? "INR";
  const transactionId = useRef(`${Date.now()}-${Math.random().toString(16).slice(2)}`).current;
  const finalized = useRef(false);

  const subtotalMinor = useMemo(
    () => items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0),
    [items]
  );
  const discountMinor = Math.max(0, subtotalMinor - total);

  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus((online) => {
      setIsOnline(online);
      if (!online && selectedMode === "UPI") {
        setSelectedMode("CASH");
        setUpiIntent(null);
        setPaymentId(null);
      }
    });

    return () => unsubscribe();
  }, [selectedMode]);

  useEffect(() => {
    if (saleId || items.length === 0 || loadingSale) return;

    let cancelled = false;
    setLoadingSale(true);

    createSale({
      items: items.map((item) => ({
        productId: item.id,
        barcode: item.barcode,
        name: item.name,
        quantity: item.quantity,
        priceMinor: item.priceMinor
      })),
      discountMinor
    })
      .then((res) => {
        if (cancelled) return;
        setSaleId(res.saleId);
        setBillRef(res.billRef);
        void logPaymentEvent("PAYMENT_INIT", {
          transactionId,
          billId: res.billRef,
          paymentMode: selectedMode,
          amountMinor: res.totals.totalMinor,
          currency,
          itemCount: items.length
        });
      })
      .catch(async (error) => {
        if (cancelled) return;
        if (error instanceof ApiError) {
          if (await handleDeviceAuthError(error)) {
            return;
          }
          if (error.message === "store_inactive") {
            Alert.alert("POS Inactive", POS_MESSAGES.storeInactive, [
              { text: "OK", onPress: () => navigation.navigate("SellScan") }
            ]);
            return;
          }
          if (error.message === "store not found") {
            Alert.alert("Store Missing", "Store not found. Check Superadmin setup.");
            return;
          }
        }
        Alert.alert("Sale Error", "Unable to start payment. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSale(false);
      });

    return () => {
      cancelled = true;
    };
  }, [discountMinor, items, saleId, selectedMode, transactionId, currency, loadingSale]);

  useEffect(() => {
    if (!isOnline || selectedMode !== "UPI" || !saleId || upiIntent || loadingUpi) return;

    let cancelled = false;
    setLoadingUpi(true);

    initUpiPayment({ saleId })
      .then((res) => {
        if (cancelled) return;
        setUpiIntent(res.upiIntent);
        setPaymentId(res.paymentId);
        void logPaymentEvent("PAYMENT_QR_CREATED", {
          transactionId,
          billId: res.billRef,
          paymentMode: "UPI",
          upiString: res.upiIntent,
          amountMinor: res.amountMinor,
          currency
        });
        void logPaymentEvent("PAYMENT_PENDING", {
          transactionId,
          billId: res.billRef,
          paymentMode: "UPI",
          amountMinor: res.amountMinor,
          currency
        });
      })
      .catch(async (error) => {
        if (cancelled) return;
        if (error instanceof ApiError) {
          if (await handleDeviceAuthError(error)) {
            return;
          }
          if (error.message === "store_inactive") {
            Alert.alert("POS Inactive", POS_MESSAGES.storeInactive, [
              { text: "OK", onPress: () => navigation.navigate("SellScan") }
            ]);
            return;
          }
          if (error.message === "upi_offline_blocked") {
            Alert.alert("UPI Offline", "UPI is unavailable while offline. Use Cash or Due.");
            return;
          }
          if (error.message === "upi_vpa_missing") {
            Alert.alert("UPI Missing", "UPI VPA is not set for this store.");
            return;
          }
        }
        Alert.alert("UPI Error", "UPI ID not configured or QR failed.");
      })
      .finally(() => {
        if (!cancelled) setLoadingUpi(false);
      });

    return () => {
      cancelled = true;
    };
  }, [saleId, selectedMode, upiIntent, transactionId, currency, loadingUpi, isOnline]);

  useEffect(() => {
    return () => {
      if (!finalized.current && billRef) {
        void logPaymentEvent("PAYMENT_CANCELLED", {
          transactionId,
          billId: billRef,
          paymentMode: selectedMode,
          amountMinor: total,
          currency
        });
      }
    };
  }, [billRef, currency, selectedMode, total, transactionId]);

  const handleDeviceAuthError = async (error: ApiError): Promise<boolean> => {
    if (error.message === "device_inactive") {
      navigation.reset({ index: 0, routes: [{ name: "DeviceBlocked" }] });
      return true;
    }
    if (error.message === "device_unauthorized") {
      await clearDeviceSession();
      navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
      return true;
    }
    if (error.message === "device_not_enrolled") {
      navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
      return true;
    }
    return false;
  };

  const handlePaymentSelect = (mode: PaymentMode) => {
    setSelectedMode(mode);
  };

  const handleCompletePayment = async () => {
    if (!saleId || !billRef) {
      Alert.alert("Payment Error", "Sale is not ready yet.");
      return;
    }

    if (finalized.current || submitting) return;
    setSubmitting(true);

    try {
      if (selectedMode === "UPI") {
        if (!isOnline) {
          Alert.alert("UPI Offline", "UPI is unavailable while offline. Use Cash or Due.");
          return;
        }
        if (!paymentId) {
          Alert.alert("UPI Error", "UPI payment is not ready yet.");
          return;
        }
        await confirmUpiPaymentManual({ paymentId });
      } else if (selectedMode === "CASH") {
        await recordCashPayment({ saleId });
      } else {
        await recordDuePayment({ saleId });
      }

      void logPaymentEvent("PAYMENT_CONFIRMED", {
        transactionId,
        billId: billRef,
        paymentMode: selectedMode,
        amountMinor: total,
        currency
      });

      finalized.current = true;
      void logPaymentEvent("PAYMENT_SUCCESS", {
        transactionId,
        billId: billRef,
        paymentMode: selectedMode,
        amountMinor: total,
        currency
      });

      navigation.navigate("SuccessPrint", {
        paymentMode: selectedMode,
        transactionId,
        billId: billRef
      });
    } catch (error) {
      void logPaymentEvent("PAYMENT_FAILED", {
        transactionId,
        billId: billRef,
        paymentMode: selectedMode,
        amountMinor: total,
        currency,
        reason: "backend_error"
      });
      if (error instanceof ApiError) {
        if (await handleDeviceAuthError(error)) {
          return;
        }
        if (error.message === "store_inactive") {
          Alert.alert("POS Inactive", POS_MESSAGES.storeInactive, [
            { text: "OK", onPress: () => navigation.navigate("SellScan") }
          ]);
          return;
        }
      }
      Alert.alert("Payment Error", "Unable to complete payment. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderPaymentOption = (mode: PaymentMode, title: string, icon: string, disabled = false) => (
    <TouchableOpacity
      style={[
        styles.paymentOption,
        selectedMode === mode && styles.paymentOptionSelected,
        disabled && styles.paymentOptionDisabled
      ]}
      onPress={() => handlePaymentSelect(mode)}
      disabled={disabled}
    >
      <MaterialCommunityIcons
        name={icon as any}
        size={24}
        color={selectedMode === mode ? theme.colors.secondary : theme.colors.textTertiary}
      />
      <Text style={[
        styles.paymentOptionText,
        selectedMode === mode && styles.paymentOptionTextSelected,
        disabled && styles.paymentOptionTextDisabled
      ]}>
        {title}
      </Text>
      {selectedMode === mode && (
        <MaterialCommunityIcons
          name="check-circle"
          size={20}
          color={theme.colors.secondary}
          style={styles.checkIcon}
        />
      )}
    </TouchableOpacity>
  );

  const canSubmit =
    Boolean(saleId && billRef) &&
    !loadingSale &&
    !submitting &&
    (selectedMode !== "UPI" || Boolean(paymentId));

  const ctaLabel =
    selectedMode === "UPI" ? "Payment Received" : selectedMode === "DUE" ? "Mark as Due" : "Complete Payment";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Select Payment Method</Text>
      </View>

      <View style={styles.amountSection}>
        <Text style={styles.amountLabel}>Total Amount</Text>
        <Text
          style={styles.amountValue}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          numberOfLines={1}
        >
          {formatMoney(total, currency)}
        </Text>
        {billRef && <Text style={styles.billRef}>Bill #{billRef}</Text>}
      </View>

      {!isOnline && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{POS_MESSAGES.offline}</Text>
        </View>
      )}

      <ScrollView style={styles.paymentOptions} contentContainerStyle={styles.paymentOptionsContent}>
        <Text style={styles.sectionTitle}>Choose Payment Method</Text>

        {renderPaymentOption("UPI", "UPI Payment", "qrcode-scan", !isOnline)}
        {renderPaymentOption("CASH", "Cash Payment", "cash")}
        {renderPaymentOption("DUE", "Mark as Due", "calendar-clock")}

        {selectedMode === "UPI" && (
          <View style={styles.paymentDetails}>
            <Text style={styles.detailsTitle}>UPI Payment</Text>
            <Text style={styles.detailsText}>
              Show this QR code to the customer to pay.
            </Text>
            {!isOnline ? (
              <Text style={styles.offlineNote}>Offline: UPI is disabled.</Text>
            ) : upiIntent ? (
              <QRCode value={upiIntent} size={160} />
            ) : (
              <View style={styles.qrPlaceholder}>
                <Text style={styles.qrText}>{loadingUpi ? "Generating QR..." : "QR not ready"}</Text>
              </View>
            )}
            <Text style={styles.upiAmount}>{formatMoney(total, currency)}</Text>
          </View>
        )}

        {selectedMode === "CASH" && (
          <View style={styles.paymentDetails}>
            <Text style={styles.detailsTitle}>Cash Payment</Text>
            <Text
              style={styles.detailsText}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              numberOfLines={2}
            >
              Collect {formatMoney(total, currency)} from customer
            </Text>
          </View>
        )}

        {selectedMode === "DUE" && (
          <View style={styles.paymentDetails}>
            <Text style={styles.detailsTitle}>Due Payment</Text>
            <Text style={styles.detailsText}>
              {formatMoney(total, currency)} will be collected later
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.completeButton, !canSubmit && styles.completeButtonDisabled]}
          onPress={handleCompletePayment}
          disabled={!canSubmit}
        >
          <Text style={styles.completeButtonText}>{ctaLabel}</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color={theme.colors.textInverse} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default PaymentScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    textAlign: "center"
  },
  amountSection: {
    backgroundColor: theme.colors.surface,
    margin: 16,
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  amountLabel: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: 8
  },
  amountValue: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.colors.textPrimary
  },
  billRef: {
    marginTop: 6,
    fontSize: 12,
    color: theme.colors.textTertiary
  },
  paymentOptions: {
    flex: 1
  },
  paymentOptionsContent: {
    padding: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 16
  },
  paymentOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  paymentOptionSelected: {
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.accentSoft
  },
  paymentOptionDisabled: {
    opacity: 0.5
  },
  paymentOptionText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginLeft: 12,
    flex: 1
  },
  paymentOptionTextSelected: {
    color: theme.colors.secondary
  },
  paymentOptionTextDisabled: {
    color: theme.colors.textTertiary
  },
  checkIcon: {
    marginLeft: 8
  },
  paymentDetails: {
    backgroundColor: theme.colors.surface,
    padding: 20,
    borderRadius: 12,
    marginTop: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 8
  },
  detailsText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 16
  },
  qrPlaceholder: {
    width: 160,
    height: 160,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: "dashed",
    marginBottom: 12
  },
  qrText: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: "center"
  },
  offlineNote: {
    fontSize: 13,
    color: theme.colors.warning,
    fontWeight: "600",
    marginBottom: 12
  },
  upiAmount: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.secondary
  },
  footer: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border
  },
  banner: {
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft
  },
  bannerText: {
    color: theme.colors.warning,
    fontSize: 13,
    fontWeight: "700"
  },
  completeButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4
  },
  completeButtonDisabled: {
    backgroundColor: theme.colors.textTertiary,
    shadowOpacity: 0
  },
  completeButtonText: {
    color: theme.colors.textInverse,
    fontSize: 18,
    fontWeight: "700",
    marginRight: 8
  }
});
