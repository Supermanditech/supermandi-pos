import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// GL-CRIT-0086: Minimum loading display time to prevent flash
const MIN_LOADING_DISPLAY_MS = 300;
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";

import { useCartStore } from "../stores/cartStore";
import type { CartDiscount, CartItem, ItemDiscount } from "../stores/cartStore";
import { formatMoney } from "../utils/money";
import {
  cancelSale,
  createSale,
  initUpiPayment,
} from "../services/api/posApi";
import { completeCheckout } from "../services/checkoutService";
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
import { SplitPaymentModal, SplitPaymentResult } from "../components/sell/SplitPaymentModal";

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

const resolveStockErrorMessage = (error: ApiError): string | null => {
  const payload = error.payload;
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { message?: unknown; details?: unknown };
  const details = Array.isArray(data.details) ? data.details : null;
  if (details) {
    const messages = details
      .map((entry) =>
        entry && typeof entry === "object" && "message" in entry && typeof (entry as any).message === "string"
          ? (entry as any).message.trim()
          : ""
      )
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join("\n");
    }
  }
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  return null;
};

const calculateDiscountAmount = (
  baseAmount: number,
  discount: CartDiscount | ItemDiscount | null
): number => {
  if (!discount) return 0;
  const MAX_MINOR = 2147483647; // INT32_MAX to prevent overflow
  const safeBase = Math.max(0, Math.min(Math.round(baseAmount), MAX_MINOR));

  // Cap percentage at 100% and fixed amount at MAX_MINOR
  const maxValue = discount.type === 'percentage' ? 100 : MAX_MINOR;
  const safeValue = Math.max(0, Math.min(Number.isFinite(discount.value) ? discount.value : 0, maxValue));

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
  // GL-CRIT-0086: Track when loading started for minimum display time
  const loadingSaleStartRef = useRef<number>(0);
  const loadingUpiStartRef = useRef<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [upiVpa, setUpiVpa] = useState<string | null>(null);
  const [upiStoreName, setUpiStoreName] = useState<string | null>(null);
  const [storeActive, setStoreActive] = useState<boolean | null>(null);
  const [upiStatusLoading, setUpiStatusLoading] = useState(true);
  const [showSplitModal, setShowSplitModal] = useState(false);

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
  // AUD-055-A FIX / GO-LIVE-113: Use ref for immediate synchronous double-submit protection
  // React setState is async, ref check is synchronous - prevents payment fraud from rapid taps
  const submittingRef = useRef(false);

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
    // GL-CRIT-0086: Track start time for minimum display
    loadingSaleStartRef.current = Date.now();

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
        if (cancelled) return;
        // GL-CRIT-0086: Ensure minimum display time to prevent flash
        const elapsed = Date.now() - loadingSaleStartRef.current;
        const remaining = Math.max(0, MIN_LOADING_DISPLAY_MS - elapsed);
        if (remaining > 0) {
          setTimeout(() => setLoadingSale(false), remaining);
        } else {
          setLoadingSale(false);
        }
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
    // GL-CRIT-0086: Track start time for minimum display
    loadingUpiStartRef.current = Date.now();

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
        if (cancelled) return;
        // GL-CRIT-0086: Ensure minimum display time to prevent flash
        const elapsed = Date.now() - loadingUpiStartRef.current;
        const remaining = Math.max(0, MIN_LOADING_DISPLAY_MS - elapsed);
        if (remaining > 0) {
          setTimeout(() => setLoadingUpi(false), remaining);
        } else {
          setLoadingUpi(false);
        }
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
      if (!finalized.current && saleId) {
        // Cancel the sale to prevent stock loss
        void cancelSale({ saleId }).catch((error) => {
          console.error("Failed to cancel sale on cleanup:", error);
        });

        if (billRef) {
          void logPaymentEvent("PAYMENT_CANCELLED", {
            transactionId,
            billId: billRef,
            paymentMode: selectedMode,
            amountMinor: totalMinor,
            currency
          });
        }
      }
    };
  }, [billRef, currency, selectedMode, saleId, totalMinor, transactionId]);

  // AUD-060-B FIX: Block back navigation during payment processing to prevent cancel/pay race
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (submittingRef.current) {
        // Block back navigation while payment is being processed
        Alert.alert("Payment in Progress", "Please wait for the payment to complete.");
        return true; // Prevent default back behavior
      }
      return false; // Allow default back behavior
    });

    return () => backHandler.remove();
  }, []);

  const handlePaymentSelect = (mode: PaymentMode) => {
    setSelectedMode(mode);
  };

  // GL-CRIT-0047: Ref to track if partial sale was confirmed
  const partialSaleConfirmedRef = useRef(false);

  const handleCompletePayment = async () => {
    if (!saleId || !billRef) {
      Alert.alert("Payment Error", "Sale is not ready yet.");
      return;
    }

    // GL-CRIT-0047: Show confirmation for partial sales
    if (isPartialSale && !partialSaleConfirmedRef.current) {
      const remainingItemCount = items.length - saleItems.length;
      Alert.alert(
        "Partial Sale",
        `${remainingItemCount} item(s) will remain in cart after this sale. Continue?`,
        [
          {
            text: "Cancel",
            style: "cancel"
          },
          {
            text: "Continue",
            onPress: () => {
              partialSaleConfirmedRef.current = true;
              handleCompletePayment(); // Retry with confirmation
            }
          }
        ]
      );
      return;
    }

    // AUD-055-A FIX: Use ref for IMMEDIATE synchronous check (React state is async)
    // This prevents the race window where a second tap could pass the guard
    if (finalized.current || submittingRef.current) return;
    submittingRef.current = true; // Set IMMEDIATELY (synchronous)
    setSubmitting(true); // Also set state for UI updates

    try {
      // Validate UPI mode requirements
      if (selectedMode === "UPI") {
        if (!isOnline) {
          Alert.alert("UPI Offline", "UPI is unavailable while offline. Use Cash or Due.");
          return;
        }
        if (!paymentId) {
          Alert.alert("UPI Error", "UPI payment is not ready yet.");
          return;
        }
      }

      // Complete checkout with payment + inventory deduction
      const result = await completeCheckout({
        saleId,
        billRef,
        paymentMode: selectedMode,
        paymentId: selectedMode === "UPI" && paymentId ? paymentId : undefined,
        items: saleItems,
        totalMinor,
        currency,
        transactionId,
      });

      // Log stock deduction (for debugging/audit trail)
      const stockLogs = buildStockDeductionLogs(saleItems, saleId);
      stockLogs.forEach((entry) => console.log(entry));

      // Warn if inventory deduction failed (payment still succeeded)
      if (!result.inventoryDeducted) {
        console.warn(`[Payment] Inventory not deducted for sale ${saleId} - will reconcile later`);
      }

      if (isPartialSale) {
        for (const item of saleItems) {
          removeItem(item.id, true);
        }
      }

      finalized.current = true;
      void logPaymentEvent("PAYMENT_SUCCESS", {
        transactionId,
        billId: billRef,
        paymentMode: selectedMode,
        amountMinor: totalMinor,
        currency,
        inventoryDeducted: result.inventoryDeducted,
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
        if (error.message === "insufficient_stock") {
          // GL-CRIT-0100: Auto-update cart when stock error received
          const { normalizeItemsToStock } = useCartStore.getState();
          const { changed, adjustments } = normalizeItemsToStock();

          let message = "";
          if (changed && adjustments.length > 0) {
            const removed = adjustments.filter(a => a.removed).length;
            const reduced = adjustments.filter(a => !a.removed).length;
            if (removed > 0 && reduced > 0) {
              message = `Stock changed: ${removed} item(s) removed, ${reduced} item(s) reduced. Cart has been updated.`;
            } else if (removed > 0) {
              message = `Stock changed: ${removed} item(s) removed from cart.`;
            } else if (reduced > 0) {
              message = `Stock changed: ${reduced} item(s) had quantity reduced.`;
            }
          } else {
            message = resolveStockErrorMessage(error) ?? "Stock changed. Please review the cart.";
          }

          Alert.alert("Cart Updated", message, [
            { text: "Review Cart", onPress: () => navigation.navigate("SellScan") }
          ]);
          return;
        }
      }
      Alert.alert("Payment Error", "Unable to complete payment. Try again.");
    } finally {
      // AUD-055-A FIX: Only reset submitting if NOT finalized
      // If finalized=true, leave submittingRef=true to prevent any further attempts
      if (!finalized.current) {
        submittingRef.current = false;
      }
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

      {/* SM-015: Split Payment Button */}
      {isOnline && !upiDisabled && (
        <TouchableOpacity
          style={styles.splitButton}
          onPress={() => setShowSplitModal(true)}
          disabled={!saleId || loadingSale}
        >
          <MaterialCommunityIcons
            name="call-split"
            size={18}
            color={theme.colors.primary}
          />
          <Text style={styles.splitButtonText}>Split Payment (UPI + Cash)</Text>
        </TouchableOpacity>
      )}

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

      {/* SM-015: Split Payment Modal */}
      {/* GL-RJ-001: Updated to verify payment result before completing */}
      {/* GO-LIVE-113: Added submittingRef protection to prevent double-submit race condition */}
      <SplitPaymentModal
        visible={showSplitModal}
        totalAmountMinor={totalMinor}
        currency={currency}
        saleId={saleId || ""}
        onClose={() => setShowSplitModal(false)}
        onComplete={(result: SplitPaymentResult) => {
          // GO-LIVE-113: Immediately acquire lock to prevent race with main payment button
          // This check+set must happen FIRST, before any other logic
          if (finalized.current || submittingRef.current) {
            setShowSplitModal(false);
            return; // Already processing or completed - ignore duplicate
          }
          submittingRef.current = true; // Lock immediately (synchronous)
          setShowSplitModal(false);

          // GL-RJ-001: Verify payment was actually successful before completing
          if (!result.success || result.paymentStatus !== 'completed') {
            // Payment failed or not verified - release lock and show error
            submittingRef.current = false; // Release lock to allow retry
            void logPaymentEvent("PAYMENT_FAILED", {
              transactionId,
              billId: billRef || "",
              paymentMode: "SPLIT",
              amountMinor: totalMinor,
              currency,
              reason: result.errorMessage || "split_payment_not_verified",
              upiVerified: result.upiVerified,
              cashConfirmed: result.cashConfirmed,
            });

            Alert.alert(
              "Payment Not Complete",
              result.errorMessage || "Split payment could not be verified. Please try again.",
              [{ text: "OK" }]
            );
            return; // Don't proceed - cart remains intact
          }

          // GL-RJ-001: Payment verified - proceed to success
          // GO-LIVE-113: Keep submittingRef=true and set finalized to prevent any further attempts
          finalized.current = true;
          if (isPartialSale) {
            for (const item of saleItems) {
              removeItem(item.id, true);
            }
          }

          void logPaymentEvent("PAYMENT_SUCCESS", {
            transactionId,
            billId: billRef || "",
            paymentMode: "SPLIT",
            amountMinor: totalMinor,
            currency,
            upiVerified: result.upiVerified,
            cashConfirmed: result.cashConfirmed,
          });

          navigation.navigate("SuccessPrint", {
            paymentMode: "CASH", // Split shows as CASH on receipt
            transactionId,
            billId: billRef || "",
            saleItems: isPartialSale ? saleItems : undefined,
            saleTotalMinor: isPartialSale ? totalMinor : undefined,
            saleCurrency: isPartialSale ? currency : undefined,
            partialSale: isPartialSale ? true : undefined
          });
        }}
      />
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
  splitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: "dashed",
    backgroundColor: theme.colors.surface
  },
  splitButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.primary
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
