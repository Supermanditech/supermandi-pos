import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import { useCartStore } from "../stores/cartStore";
import type { CartDiscount, CartItem, ItemDiscount } from "../stores/cartStore";
import { formatMoney } from "../utils/money";
import {
  confirmUpiPaymentManual,
  createSale,
  initUpiPayment,
  recordCashPayment,
  recordDuePayment
} from "../services/api/posApi";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { logPaymentEvent } from "../services/cloudEventLogger";
import { ApiError } from "../services/api/apiClient";
import { subscribeNetworkStatus } from "../services/networkStatus";
import { clearDeviceSession } from "../services/deviceSession";
import { POS_MESSAGES } from "../utils/uiStatus";
import { buildUpiIntent } from "../utils/upiIntent";
import { formatStoreName } from "../utils/storeName";
import { uuidv4 } from "../utils/uuid";
import { buildStockDeductionLogs, partitionSaleItems } from "../services/saleScope";
import { theme } from "../theme";

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: { saleItemIds?: string[] } | undefined;
  EnrollDevice: undefined;
  DeviceBlocked: undefined;
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

type PaymentScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Payment">;
type PaymentScreenRouteProp = RouteProp<RootStackParamList, "Payment">;
type PaymentMode = "UPI" | "CASH" | "DUE";

const calculateDiscountAmount = (
  baseAmount: number,
  discount: CartDiscount | ItemDiscount | null
): number => {
  if (!discount) return 0;
  const safeBase = Math.max(0, Math.round(baseAmount));
  const safeValue = Math.max(0, Number.isFinite(discount.value) ? discount.value : 0);

  if (discount.type === "percentage") {
    return Math.min(Math.round(safeBase * (safeValue / 100)), safeBase);
  }
  return Math.min(Math.round(safeValue), safeBase);
};

const computeSaleTotals = (items: CartItem[], cartDiscount: CartDiscount | null) => {
  let subtotalMinor = 0;
  let itemDiscountMinor = 0;

  for (const item of items) {
    const lineSubtotal = Math.round(item.priceMinor) * Math.round(item.quantity);
    const lineDiscount = calculateDiscountAmount(lineSubtotal, item.itemDiscount ?? null);
    subtotalMinor += lineSubtotal;
    itemDiscountMinor += lineDiscount;
  }

  const subtotalAfterItemDiscounts = Math.max(0, subtotalMinor - itemDiscountMinor);
  const cartDiscountMinor = calculateDiscountAmount(subtotalAfterItemDiscounts, cartDiscount);
  const discountTotalMinor = itemDiscountMinor + cartDiscountMinor;
  const totalMinor = Math.max(0, subtotalMinor - discountTotalMinor);

  return { subtotalMinor, discountTotalMinor, totalMinor };
};

const PaymentScreen = () => {
  const navigation = useNavigation<PaymentScreenNavigationProp>();
  const route = useRoute<PaymentScreenRouteProp>();
  const { items, lockCart, unlockCart, locked, discount, removeItem } = useCartStore();
  const [selectedMode, setSelectedMode] = useState<PaymentMode>("UPI");
  const [saleId, setSaleId] = useState<string | null>(null);
  const [billRef, setBillRef] = useState<string | null>(null);
  const [upiIntent, setUpiIntent] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [loadingSale, setLoadingSale] = useState(false);
  const [loadingUpi, setLoadingUpi] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [upiVpa, setUpiVpa] = useState<string | null>(null);
  const [upiStoreName, setUpiStoreName] = useState<string | null>(null);
  const [storeActive, setStoreActive] = useState<boolean | null>(null);
  const [upiStatusLoading, setUpiStatusLoading] = useState(true);

  const saleItemIds = route.params?.saleItemIds;
  const { saleItems: computedSaleItems, isPartial: isPartialSale } = useMemo(
    () => partitionSaleItems(items, saleItemIds),
    [items, saleItemIds]
  );
  const [saleItemsSnapshot, setSaleItemsSnapshot] = useState<CartItem[] | null>(null);

  useEffect(() => {
    if (!saleItemsSnapshot && computedSaleItems.length > 0) {
      setSaleItemsSnapshot(computedSaleItems);
    }
  }, [computedSaleItems, saleItemsSnapshot]);

  const saleItems = saleItemsSnapshot ?? computedSaleItems;
  const currency = saleItems[0]?.currency ?? "INR";
  const transactionId = useRef(`${Date.now()}-${Math.random().toString(16).slice(2)}`).current;
  const finalized = useRef(false);
  const pendingSaleIdRef = useRef<string | null>(null);

  const handleDeviceAuthError = useCallback(async (error: ApiError): Promise<boolean> => {
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
  }, [navigation]);

  const appliedCartDiscount = isPartialSale ? null : discount;
  const { discountTotalMinor, totalMinor } = useMemo(
    () => computeSaleTotals(saleItems, appliedCartDiscount),
    [saleItems, appliedCartDiscount]
  );
  const discountMinor = Math.max(0, Math.round(discountTotalMinor));
  const itemCount = saleItems.reduce((sum, item) => sum + item.quantity, 0);
  const upiDisabled =
    !isOnline || upiStatusLoading || storeActive === false || !upiVpa;
  const upiBlocked = storeActive === false || (!upiVpa && !upiStatusLoading);

  useEffect(() => {
    lockCart();
    return () => {
      unlockCart();
    };
  }, [lockCart, unlockCart]);

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
    let cancelled = false;
    if (!isOnline) {
      setUpiStatusLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setUpiStatusLoading(true);

    fetchUiStatus()
      .then((status) => {
        if (cancelled) return;
        setStoreActive(status.storeActive ?? null);
        setUpiVpa(status.upiVpa ?? null);
        setUpiStoreName(status.storeName ?? null);
        setUpiStatusLoading(false);
        if (status.storeActive === false || !status.upiVpa) {
          setSelectedMode("CASH");
          setUpiIntent(null);
          setPaymentId(null);
        }
      })
      .catch(async (error) => {
        if (cancelled) return;
        if (error instanceof ApiError) {
          if (await handleDeviceAuthError(error)) {
            return;
          }
          if (error.message === "store_inactive") {
            setStoreActive(false);
            setUpiStatusLoading(false);
            setSelectedMode("CASH");
            return;
          }
        }
        setUpiStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [handleDeviceAuthError, isOnline]);

  useEffect(() => {
    if (selectedMode !== "UPI") return;
    if (storeActive === false || !upiVpa) {
      setSelectedMode("CASH");
      setUpiIntent(null);
      setPaymentId(null);
    }
  }, [selectedMode, storeActive, upiVpa]);

  useEffect(() => {
    if (saleId || saleItems.length === 0 || loadingSale) return;

    let cancelled = false;
    setLoadingSale(true);

    if (!pendingSaleIdRef.current) {
      pendingSaleIdRef.current = uuidv4();
    }
    const requestedSaleId = pendingSaleIdRef.current;

    createSale({
      saleId: requestedSaleId,
      items: saleItems.map((item) => {
        const metadata = item.metadata ?? {};
        const globalProductId =
          typeof metadata.globalProductId === "string" && metadata.globalProductId.trim()
            ? metadata.globalProductId.trim()
            : undefined;

        return {
          productId: item.id,
          barcode: item.barcode,
          name: item.name,
          quantity: item.quantity,
          priceMinor: item.priceMinor,
          itemDiscount: item.itemDiscount ?? null,
          global_product_id: globalProductId
        };
      }),
      discountMinor,
      cartDiscount: appliedCartDiscount ?? null,
      currency
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
          itemCount
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
  }, [
    appliedCartDiscount,
    currency,
    discountMinor,
    itemCount,
    loadingSale,
    saleId,
    saleItems,
    selectedMode,
    transactionId
  ]);

  useEffect(() => {
    if (upiDisabled || selectedMode !== "UPI" || !saleId || upiIntent || loadingUpi) return;

    let cancelled = false;
    setLoadingUpi(true);

    initUpiPayment({ saleId, transactionId })
      .then((res) => {
        if (cancelled) return;
        const intent = buildUpiIntent({
          upiVpa: res.upiVpa ?? upiVpa,
          storeName: res.storeName ?? upiStoreName,
          amountMinor: res.amountMinor,
          transactionId,
          note: "Supermandi POS Sale"
        });
        if (!intent) {
          throw new ApiError(0, "upi_vpa_missing");
        }
        setUpiIntent(intent);
        setPaymentId(res.paymentId);
        setUpiVpa(res.upiVpa ?? null);
        setUpiStoreName(res.storeName ?? null);
        void logPaymentEvent("PAYMENT_QR_CREATED", {
          transactionId,
          billId: res.billRef,
          paymentMode: "UPI",
          upiString: intent,
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
            setSelectedMode("CASH");
            setUpiIntent(null);
            setPaymentId(null);
            return;
          }
          if (error.message === "upi_offline_blocked") {
            Alert.alert("UPI Offline", "UPI is unavailable while offline. Use Cash or Due.");
            return;
          }
          if (error.message === "upi_vpa_missing") {
            Alert.alert("UPI Missing", "UPI VPA is not set for this store.");
            setSelectedMode("CASH");
            setUpiIntent(null);
            setPaymentId(null);
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
  }, [
    saleId,
    selectedMode,
    upiIntent,
    transactionId,
    currency,
    loadingUpi,
    upiDisabled,
    upiVpa,
    upiStoreName,
    handleDeviceAuthError,
    navigation
  ]);

  useEffect(() => {
    return () => {
      if (!finalized.current && billRef) {
        void logPaymentEvent("PAYMENT_CANCELLED", {
          transactionId,
          billId: billRef,
          paymentMode: selectedMode,
          amountMinor: totalMinor,
          currency
        });
      }
    };
  }, [billRef, currency, selectedMode, totalMinor, transactionId]);

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

      const stockLogs = buildStockDeductionLogs(saleItems, saleId);
      stockLogs.forEach((entry) => console.log(entry));

      if (isPartialSale) {
        for (const item of saleItems) {
          removeItem(item.id, true);
        }
      }

      void logPaymentEvent("PAYMENT_CONFIRMED", {
        transactionId,
        billId: billRef,
        paymentMode: selectedMode,
        amountMinor: totalMinor,
        currency
      });

      finalized.current = true;
      void logPaymentEvent("PAYMENT_SUCCESS", {
        transactionId,
        billId: billRef,
        paymentMode: selectedMode,
        amountMinor: totalMinor,
        currency
      });

      navigation.navigate("SuccessPrint", {
        paymentMode: selectedMode,
        transactionId,
        billId: billRef,
        saleItems: isPartialSale ? saleItems : undefined,
        saleTotalMinor: isPartialSale ? totalMinor : undefined,
        saleCurrency: isPartialSale ? currency : undefined,
        partialSale: isPartialSale ? true : undefined
      });
    } catch (error) {
      void logPaymentEvent("PAYMENT_FAILED", {
        transactionId,
        billId: billRef,
        paymentMode: selectedMode,
        amountMinor: totalMinor,
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

  const renderModeTab = (mode: PaymentMode, title: string, icon: string, disabled = false) => {
    const selected = selectedMode === mode;

    return (
      <TouchableOpacity
        style={[
          styles.modeTab,
          selected && styles.modeTabActive,
          disabled && styles.modeTabDisabled
        ]}
        onPress={() => handlePaymentSelect(mode)}
        disabled={disabled}
      >
        <MaterialCommunityIcons
          name={icon as any}
          size={20}
          color={selected ? theme.colors.textInverse : theme.colors.textSecondary}
        />
        <Text
          style={[
            styles.modeTabText,
            selected && styles.modeTabTextActive,
            disabled && styles.modeTabTextDisabled
          ]}
        >
          {title}
        </Text>
      </TouchableOpacity>
    );
  };

  const canSubmit =
    Boolean(saleId && billRef) &&
    !loadingSale &&
    !submitting &&
    (selectedMode !== "UPI" || Boolean(paymentId));

  const ctaLabel =
    selectedMode === "UPI" ? "Payment Received" : selectedMode === "DUE" ? "Mark as Due" : "Complete Payment";

  const formattedStoreName = formatStoreName(upiStoreName);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Payment</Text>
          {billRef && <Text style={styles.billRef}>Bill #{billRef}</Text>}
        </View>
        {locked && (
          <View style={styles.lockedBadge}>
            <Text style={styles.lockedBadgeText}>Cart locked</Text>
          </View>
        )}
      </View>

      {!isOnline && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{POS_MESSAGES.offline}</Text>
        </View>
      )}

      <View style={styles.modeTabs}>
        {renderModeTab("UPI", "UPI", "qrcode-scan", upiDisabled)}
        {renderModeTab("CASH", "Cash", "cash")}
        {renderModeTab("DUE", "Due", "calendar-clock")}
      </View>

      <View style={styles.content}>
        {selectedMode === "UPI" ? (
          <View style={styles.qrStage}>
            <Text style={styles.amountLabel}>Amount</Text>
            <Text
              style={styles.amountValue}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              numberOfLines={1}
            >
              {formatMoney(totalMinor, currency)}
            </Text>
            <View style={styles.qrShell}>
              {upiStatusLoading ? (
                <Text style={styles.qrHint}>Checking UPI details...</Text>
              ) : upiBlocked ? (
                <Text style={styles.qrHint}>
                  UPI unavailable until the store is active and VPA is set.
                </Text>
              ) : !isOnline ? (
                <Text style={styles.qrHint}>Offline: UPI disabled.</Text>
              ) : upiIntent ? (
                <QRCode value={upiIntent} size={220} />
              ) : (
                <Text style={styles.qrHint}>{loadingUpi ? "Generating QR..." : "QR not ready"}</Text>
              )}
            </View>
            {formattedStoreName && (
              <Text style={styles.storeName}>{formattedStoreName}</Text>
            )}
          </View>
        ) : (
          <View style={styles.cashStage}>
            <Text style={styles.amountLabel}>Amount</Text>
            <Text
              style={styles.amountValue}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              numberOfLines={1}
            >
              {formatMoney(totalMinor, currency)}
            </Text>
            <Text style={styles.cashHint}>
              {selectedMode === "CASH"
                ? "Collect cash from customer"
                : "Record as due and collect later"}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryCta, !canSubmit && styles.primaryCtaDisabled]}
          onPress={handleCompletePayment}
          disabled={!canSubmit}
        >
          <Text style={styles.primaryCtaText}>{ctaLabel}</Text>
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
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.textPrimary
  },
  billRef: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textTertiary
  },
  lockedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft
  },
  lockedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.warning
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft
  },
  bannerText: {
    color: theme.colors.warning,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  },
  modeTabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden"
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 4
  },
  modeTabActive: {
    backgroundColor: theme.colors.primary
  },
  modeTabDisabled: {
    opacity: 0.5
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary
  },
  modeTabTextActive: {
    color: theme.colors.textInverse
  },
  modeTabTextDisabled: {
    color: theme.colors.textTertiary
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  qrStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16
  },
  cashStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary
  },
  amountValue: {
    fontSize: 32,
    fontWeight: "900",
    color: theme.colors.textPrimary
  },
  qrShell: {
    width: 240,
    height: 240,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    ...theme.shadows.sm
  },
  qrHint: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    textAlign: "center"
  },
  storeName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textSecondary
  },
  cashHint: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 24
  },
  footer: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border
  },
  primaryCta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center"
  },
  primaryCtaDisabled: {
    backgroundColor: theme.colors.textTertiary
  },
  primaryCtaText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: "800"
  }
});
