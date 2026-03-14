import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// GL-CRIT-0086: Minimum loading display time to prevent flash
const MIN_LOADING_DISPLAY_MS = 300;
// ISSUE-MICRO-068: Warn if cart prices are older than 4 hours
const PRICE_FRESHNESS_THRESHOLD_MS = 4 * 60 * 60 * 1000;
// R4: Persist pending UPI payment for crash/network recovery
const PENDING_UPI_KEY = "@pos_pending_upi";
const PENDING_UPI_TTL_MS = 15 * 60 * 1000; // 15 minutes
// STG-122: Large transaction threshold (₹5,000 = 500000 minor/paise)
const LARGE_TRANSACTION_THRESHOLD_MINOR = 500000;
// STG-380: Cart lock timeout display constant (matches cartStore's 5-minute timeout)
const CART_LOCK_TIMEOUT_DISPLAY_MS = 5 * 60 * 1000;
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  BackHandler,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Vibration,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

import { useCartStore } from "../stores/cartStore";
import type { CartDiscount, CartItem, ItemDiscount } from "../stores/cartStore";
import { formatMoney } from "../utils/money";
import {
  cancelSale,
  createSale,
  initUpiPayment,
  voidSale,
} from "../services/api/posApi";
import { completeCheckout, validateCartStock, formatStockValidationWarning } from "../services/checkoutService";
import { getStockBatch } from "../services/api/inventoryApi";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { logPaymentEvent } from "../services/cloudEventLogger";
import { ApiError } from "../services/api/apiClient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { subscribeNetworkStatus } from "../services/networkStatus";
import { clearDeviceSession } from "../services/deviceSession";
import { POS_MESSAGES } from "../utils/uiStatus";
import { buildUpiIntent } from "../utils/upiIntent";
import { formatStoreName } from "../utils/storeName";
import { uuidv4 } from "../utils/uuid";
import { buildStockDeductionLogs, partitionSaleItems } from "../services/saleScope";
import {
  savePartialSaleState,
  loadPartialSaleState,
  clearPartialSaleState,
  updatePartialSaleConfirmed,
  updatePartialSaleSaleId,
} from "../services/partialSaleState";
import { theme, useThemeColors } from "../theme";
import { useTranslation } from "react-i18next";
import { SplitPaymentModal, SplitPaymentResult } from "../components/sell/SplitPaymentModal";
// STG-120: Staff name/ID for audit trail
import { useStaffSessionStore } from "../stores/staffSessionStore";

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
    saleId?: string; // STG-107: Actual backend sale UUID for WhatsApp bill
    saleItems?: CartItem[];
    saleTotalMinor?: number;
    saleCurrency?: string;
    partialSale?: boolean;
  };
};

type PaymentScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Payment">;
type PaymentScreenRouteProp = RouteProp<RootStackParamList, "Payment">;
// STG-115: Extended payment mode type to include CARD and WALLET placeholders
type PaymentMode = "UPI" | "CASH" | "DUE" | "CARD" | "WALLET";

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

  return { subtotalMinor, itemDiscountMinor, cartDiscountMinor, discountTotalMinor, totalMinor };
};

const PaymentScreen = () => {
  const colors = useThemeColors();
  const { t } = useTranslation();

  const navigation = useNavigation<PaymentScreenNavigationProp>();
  const route = useRoute<PaymentScreenRouteProp>();
  const insets = useSafeAreaInsets();
  const { items, lockCart, unlockCart, locked, lockedAt, discount, removeItem, customer } = useCartStore();
  // STG-120: Staff name/ID for audit trail on receipt
  const staffName = useStaffSessionStore((s) => s.session?.name ?? null);
  const [selectedMode, setSelectedMode] = useState<PaymentMode>("UPI");
  const [saleId, setSaleId] = useState<string | null>(null);
  const [billRef, setBillRef] = useState<string | null>(null);
  const [upiIntent, setUpiIntent] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  // GO-LIVE-124: Track pending payment for network recovery
  const pendingPaymentRef = useRef<{ paymentId: string; saleId: string } | null>(null);
  const [loadingSale, setLoadingSale] = useState(false);
  // ISSUE-076: Track sale creation error to prevent infinite retry loop
  const [saleError, setSaleError] = useState<string | null>(null);
  const [loadingUpi, setLoadingUpi] = useState(false);
  // GL-CRIT-0086: Track when loading started for minimum display time
  const loadingSaleStartRef = useRef<number>(0);
  const loadingUpiStartRef = useRef<number>(0);
  // ISSUE-051/066: Ref-based in-flight guard — prevents loadingSale state change from
  // cancelling its own effect via the dependency array, which caused setSaleId/setBillRef
  // to never be called and the Complete Payment button to stay permanently disabled.
  const createSaleInFlightRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [upiVpa, setUpiVpa] = useState<string | null>(null);
  const [upiStoreName, setUpiStoreName] = useState<string | null>(null);
  const [storeActive, setStoreActive] = useState<boolean | null>(null);
  const [upiStatusLoading, setUpiStatusLoading] = useState(true);
  const [showSplitModal, setShowSplitModal] = useState(false);
  // T-204: UPI QR expiry countdown
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number | null>(null);
  // SA-P1-006: Allowed payment methods from store settings
  const [allowedMethods, setAllowedMethods] = useState<string[]>(["CASH", "UPI", "DUE"]);
  // STG-080: Cash amount input + change calculation
  const [cashReceived, setCashReceived] = useState("");
  // STG-087: Order summary scroll toggle
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  // STG-092: Receipt preview modal visibility
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  // STG-122: Large transaction confirmation dismissed
  const largeTransactionConfirmedRef = useRef(false);
  // STG-380: Cart lock expiry tracking
  const [lockExpired, setLockExpired] = useState(false);

  const saleItemIds = route.params?.saleItemIds;
  const { saleItems: computedSaleItems, isPartial: isPartialSale } = useMemo(
    () => partitionSaleItems(items, saleItemIds),
    [items, saleItemIds]
  );
  // ISSUE-051/066: Lazy-init snapshot synchronously to prevent reference change on first render.
  // Without this, setSaleItemsSnapshot fires on mount causing saleItems reference to change,
  // which cancels the in-flight createSale useEffect and leaves loadingSale stuck at true.
  const [saleItemsSnapshot, setSaleItemsSnapshot] = useState<CartItem[] | null>(
    () => computedSaleItems.length > 0 ? computedSaleItems : null
  );

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
  // ISSUE-MICRO-068: Track if user dismissed stale price warning
  const priceWarningDismissedRef = useRef(false);
  // ISSUE-133: Mirror mutable state into ref for unmount-only cleanup
  const cleanupStateRef = useRef({ saleId: "", billRef: null as string | null, selectedMode: "UPI" as string, totalMinor: 0, currency: "INR" });

  const handleDeviceAuthError = useCallback(async (error: ApiError): Promise<boolean> => {
    if (error.message === "device_inactive") {
      navigation.reset({ index: 0, routes: [{ name: "DeviceBlocked" }] });
      return true;
    }
    if (error.message === "device_unauthorized") {
      try { await clearDeviceSession(); } catch { /* best-effort */ }
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
  // STG-384: Track item-level vs cart-level discounts separately for receipt preview
  const { subtotalMinor, itemDiscountMinor, cartDiscountMinor, discountTotalMinor, totalMinor } = useMemo(
    () => computeSaleTotals(saleItems, appliedCartDiscount),
    [saleItems, appliedCartDiscount]
  );
  const discountMinor = Math.max(0, Math.round(discountTotalMinor));
  const itemCount = saleItems.reduce((sum, item) => sum + item.quantity, 0);
  const upiDisabled =
    !isOnline || upiStatusLoading || storeActive === false || !upiVpa || !allowedMethods.includes("UPI");
  const upiBlocked = storeActive === false || (!upiVpa && !upiStatusLoading);

  // STG-080: Calculate change from cash received
  const cashReceivedMinor = useMemo(() => {
    const parsed = parseFloat(cashReceived);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0;
  }, [cashReceived]);
  const changeMinor = useMemo(() => Math.max(0, cashReceivedMinor - totalMinor), [cashReceivedMinor, totalMinor]);

  // STG-401: Cart-to-payment data consistency validation
  const cartValid = useMemo(() => {
    if (saleItems.length === 0) return false;
    if (totalMinor <= 0) return false;
    for (const item of saleItems) {
      if (item.quantity <= 0 || item.priceMinor < 0) return false;
    }
    return true;
  }, [saleItems, totalMinor]);

  // STG-078: Explain why Complete Payment is disabled
  const disabledReason = useMemo((): string | null => {
    if (loadingSale) return "Creating sale...";
    if (!saleId || !billRef) return "Waiting for sale to be created";
    if (submitting) return "Processing payment...";
    if (selectedMode === "UPI" && !paymentId) return "Waiting for UPI QR to be generated";
    // STG-115: CARD and WALLET are coming soon
    if (selectedMode === "CARD" || selectedMode === "WALLET") return "This payment method is coming soon";
    if (!cartValid) return "Cart has invalid items";
    return null;
  }, [loadingSale, saleId, billRef, submitting, selectedMode, paymentId, cartValid]);

  // STG-119: Auto-dismiss sale error after 8 seconds
  useEffect(() => {
    if (!saleError) return;
    const timer = setTimeout(() => setSaleError(null), 8000);
    return () => clearTimeout(timer);
  }, [saleError]);

  useEffect(() => {
    lockCart();
    return () => {
      unlockCart();
    };
  }, [lockCart, unlockCart]);

  // STG-380: Monitor cart lock timeout and show message when lock expires
  // The cart is locked during payment to prevent modifications (5-minute timeout from cart store).
  // If the lock expires (e.g., after a failed payment + timeout), we show a message.
  useEffect(() => {
    if (!locked || !lockedAt) {
      setLockExpired(false);
      return;
    }
    const checkExpiry = () => {
      if (lockedAt && Date.now() - lockedAt >= CART_LOCK_TIMEOUT_DISPLAY_MS) {
        setLockExpired(true);
      }
    };
    checkExpiry(); // immediate check
    const intervalId = setInterval(checkExpiry, 5000);
    return () => clearInterval(intervalId);
  }, [locked, lockedAt]);

  // R4: On mount, check for pending UPI from a previous crash/close
  useEffect(() => {
    AsyncStorage.getItem(PENDING_UPI_KEY).then((raw) => {
      if (!raw) return;
      try {
        const pending = JSON.parse(raw) as { paymentId: string; saleId: string; timestamp: number };
        if (Date.now() - pending.timestamp > PENDING_UPI_TTL_MS) {
          // Stale — silently clear
          AsyncStorage.removeItem(PENDING_UPI_KEY).catch((e) => {
            if (__DEV__) console.warn("[PaymentScreen] POS-A09: Failed to clear stale pending UPI:", e);
          });
          return;
        }
        Alert.alert(
          t('posPayment.previousUpiPendingTitle'),
          t('posPayment.previousUpiPendingMessage'),
          [{ text: t('common.ok'), onPress: () => AsyncStorage.removeItem(PENDING_UPI_KEY).catch((e) => {
            if (__DEV__) console.warn("[PaymentScreen] POS-A09: Failed to clear pending UPI after ack:", e);
          }) }],
        );
      } catch {
        AsyncStorage.removeItem(PENDING_UPI_KEY).catch((e) => {
          if (__DEV__) console.warn("[PaymentScreen] POS-A09: Failed to clear corrupt pending UPI:", e);
        });
      }
    }).catch((e) => {
      if (__DEV__) console.warn("[PaymentScreen] POS-A09: Failed to read pending UPI from storage:", e);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus((online) => {
      const wasOffline = !isOnline;
      setIsOnline(online);

      if (!online && selectedMode === "UPI") {
        // GO-LIVE-124 + R4: Save pending payment to ref AND AsyncStorage for crash recovery
        if (paymentId && saleId) {
          const pending = { paymentId, saleId, timestamp: Date.now() };
          pendingPaymentRef.current = { paymentId, saleId };
          AsyncStorage.setItem(PENDING_UPI_KEY, JSON.stringify(pending)).catch(() => {});
          if (__DEV__) console.log(`[Payment] R4: Persisted pending UPI ${paymentId} to AsyncStorage`);
        }
        // SA-P1-006: Fall back to first allowed method (not hardcoded CASH)
        const fallback = allowedMethods.includes("CASH") ? "CASH" : allowedMethods.includes("DUE") ? "DUE" : allowedMethods[0] ?? "CASH";
        setSelectedMode(fallback as PaymentMode);
        setUpiIntent(null);
        setPaymentId(null);
      }

      // GO-LIVE-124 + R4: Alert user about pending payment when network recovers
      if (online && wasOffline && pendingPaymentRef.current) {
        const pending = pendingPaymentRef.current;
        pendingPaymentRef.current = null;
        AsyncStorage.removeItem(PENDING_UPI_KEY).catch(() => {});
        Alert.alert(
          t('posPayment.pendingUpiTitle'),
          t('posPayment.pendingUpiMessage'),
          [{ text: t('common.ok') }],
        );
        if (__DEV__) console.log(`[Payment] R4: Network recovered, alerted user about pending ${pending.paymentId}`);
      }
    });

    return () => unsubscribe();
  }, [selectedMode, isOnline, paymentId, saleId, allowedMethods]);

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
        // SA-P1-006: Store allowed payment methods
        const methods = status.allowedPaymentMethods ?? ["CASH", "UPI", "DUE"];
        setAllowedMethods(methods);
        setUpiStatusLoading(false);
        if (status.storeActive === false || !status.upiVpa) {
          // SA-P1-006: Fall back to first allowed method (not hardcoded CASH)
          const fallback = methods.includes("CASH") ? "CASH" : methods.includes("DUE") ? "DUE" : methods[0] ?? "CASH";
          setSelectedMode(fallback as PaymentMode);
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
      // SA-P1-006: Fall back to first allowed method
      const fallback = allowedMethods.includes("CASH") ? "CASH" : allowedMethods.includes("DUE") ? "DUE" : allowedMethods[0] ?? "CASH";
      setSelectedMode(fallback as PaymentMode);
      setUpiIntent(null);
      setPaymentId(null);
    }
  }, [selectedMode, storeActive, upiVpa, allowedMethods]);

  useEffect(() => {
    // ISSUE-076: Guard against infinite retry — stop if saleError is set
    // ISSUE-051/066: Use ref (not loadingSale state) so this effect is not cancelled
    // by its own setLoadingSale(true) call triggering a dependency-array re-run.
    if (saleId || saleItems.length === 0 || createSaleInFlightRef.current || saleError) return;

    let cancelled = false;
    createSaleInFlightRef.current = true;
    setLoadingSale(true);
    setSaleError(null);
    // GL-CRIT-0086: Track start time for minimum display
    loadingSaleStartRef.current = Date.now();

    if (!pendingSaleIdRef.current) {
      pendingSaleIdRef.current = uuidv4();
    }
    const requestedSaleId = pendingSaleIdRef.current;

    // GO-LIVE-233: Validate stock before creating sale
    (async () => {
      try {
        const productIds = saleItems.map((item) => item.id);
        const stockLevels = await getStockBatch(productIds);

        // Convert to simple map for validation
        const stockMap: Record<string, number> = {};
        for (const [productId, stockInfo] of Object.entries(stockLevels)) {
          stockMap[productId] = stockInfo.currentQty;
        }

        const validation = validateCartStock(saleItems, stockMap);
        if (!validation.valid) {
          const warningMessage = formatStockValidationWarning(validation.issues);
          // GO-LIVE-233: Show warning but allow proceeding (soft block)
          return new Promise<void>((resolve, reject) => {
            Alert.alert(
              t('posPayment.lowStockWarningTitle'),
              t('posPayment.lowStockWarningMessage', { warningMessage }),
              [
                {
                  text: t('posPayment.lowStockCancel'),
                  style: "cancel",
                  onPress: () => {
                    setLoadingSale(false);
                    reject(new Error("User cancelled due to low stock"));
                  },
                },
                {
                  text: t('posPayment.lowStockProceed'),
                  style: "default",
                  onPress: () => resolve(),
                },
              ],
              { cancelable: false }
            );
          });
        }
      } catch (stockError) {
        // GO-LIVE-233: Log warning but don't block sale if stock check fails
        if (__DEV__) console.warn("[PaymentScreen] GO-LIVE-233: Stock validation failed, proceeding:", stockError);
      }
    })().then(() => {
      if (cancelled) return;
      return createSale({
        saleId: requestedSaleId,
        items: saleItems.map((item) => {
          const metadata = item.metadata ?? {};
          const globalProductId =
            typeof metadata.globalProductId === "string" && metadata.globalProductId.trim()
              ? metadata.globalProductId.trim()
              : undefined;
          // T-060: Pass retail variant metadata for stock quantity conversion
          const storeProductId =
            typeof metadata.storeProductId === "string" && metadata.storeProductId.trim()
              ? metadata.storeProductId.trim()
              : undefined;
          const retailVariantId =
            typeof metadata.variantId === "string" && metadata.variantId.trim()
              ? metadata.variantId.trim()
              : undefined;

          return {
            productId: item.id,
            barcode: item.barcode,
            name: item.name,
            quantity: item.quantity,
            priceMinor: item.priceMinor,
            itemDiscount: item.itemDiscount ?? null,
            global_product_id: globalProductId,
            store_product_id: storeProductId,
            retail_variant_id: retailVariantId,
            // AUD-016: SCALE-A3 batch traceability
            batchNumber: item.batchNumber ?? undefined,
          };
        }),
        discountMinor,
        cartDiscount: appliedCartDiscount ?? null,
        currency
      });
    }).then((res) => {
      if (cancelled || !res) return;
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
    }).catch(async (error) => {
      if (cancelled) return;
      // GO-LIVE-233: Handle user cancellation from stock warning
      if (error instanceof Error && error.message === "User cancelled due to low stock") {
        if (__DEV__) console.log("[PaymentScreen] GO-LIVE-233: User cancelled sale due to low stock");
        return;
      }
      if (error instanceof ApiError) {
        if (await handleDeviceAuthError(error)) {
          return;
        }
        if (error.message === "store_inactive") {
          setSaleError("Store is inactive");
          Alert.alert(t('posPayment.posInactiveTitle'), POS_MESSAGES.storeInactive, [
            { text: t('common.ok'), onPress: () => navigation.navigate("SellScan") }
          ]);
          return;
        }
        if (error.message === "store not found") {
          setSaleError("Store not found");
          Alert.alert(t('posPayment.storeMissingTitle'), t('posPayment.storeMissingMessage'));
          return;
        }
      }
      // ISSUE-076: Set error state to prevent infinite retry loop
      setSaleError("Unable to start payment. Please try again.");
    }).finally(() => {
      createSaleInFlightRef.current = false;
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
    // loadingSale intentionally omitted — ISSUE-051/066: using createSaleInFlightRef instead
    // selectedMode intentionally omitted — only read in logPaymentEvent telemetry after createSale
    //   returns. Including it caused the UPI-mode effect (which sets selectedMode="CASH" on mount
    //   when upiVpa is null) to cancel the in-flight createSale IIFE before createSale was called.
    //   Sale creation is payment-mode-agnostic; the closure captures the initial mode for telemetry.
    saleError,
    saleId,
    saleItems,
    transactionId
  ]);

  useEffect(() => {
    if (upiDisabled || selectedMode !== "UPI" || !saleId || upiIntent || loadingUpi) return;

    let cancelled = false;
    setLoadingUpi(true);
    // GL-CRIT-0086: Track start time for minimum display
    loadingUpiStartRef.current = Date.now();

    // ISSUE-077: Race UPI init against 30s timeout
    const upiTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("UPI initialization timed out")), 30000)
    );
    Promise.race([initUpiPayment({ saleId, transactionId }), upiTimeout])
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
        // T-204: Store QR expiry for countdown timer
        if (res.expiresAt) {
          setQrExpiresAt(new Date(res.expiresAt).getTime());
        }
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
            Alert.alert(t('posPayment.posInactiveTitle'), POS_MESSAGES.storeInactive, [
              { text: t('common.ok'), onPress: () => navigation.navigate("SellScan") }
            ]);
            setSelectedMode("CASH");
            setUpiIntent(null);
            setPaymentId(null);
            return;
          }
          if (error.message === "upi_offline_blocked") {
            Alert.alert(t('posPayment.upiOfflineTitle'), t('posPayment.upiOfflineMessage'));
            return;
          }
          if (error.message === "upi_vpa_missing") {
            Alert.alert(t('posPayment.upiNotSetUpTitle'), t('posPayment.upiNotSetUpMessage'));
            setSelectedMode("CASH");
            setUpiIntent(null);
            setPaymentId(null);
            return;
          }
        }
        // ISSUE-077 + STG-211: Differentiate UPI errors
        if (error instanceof Error && error.message.includes("timed out")) {
          Alert.alert(t('posPayment.upiTimeoutTitle'), t('posPayment.upiTimeoutMessage'));
        } else if (error instanceof ApiError && error.message === "upi_vpa_missing") {
          Alert.alert(t('posPayment.upiNotSetUpTitle'), t('posPayment.upiNotSetUpMessage'));
        } else {
          Alert.alert(t('posPayment.qrGenerationFailedTitle'), t('posPayment.qrGenerationFailedMessage'));
        }
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

  // T-204: QR expiry countdown timer
  useEffect(() => {
    if (!qrExpiresAt || selectedMode !== "UPI") {
      setQrSecondsLeft(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((qrExpiresAt - Date.now()) / 1000));
      if (remaining <= 0) {
        // STG-378: QR expired — clear immediately without setting 0 to prevent "0:00" flash
        setUpiIntent(null);
        setQrExpiresAt(null);
        setQrSecondsLeft(null);
        setPaymentId(null);
      } else {
        setQrSecondsLeft(remaining);
      }
    };

    tick(); // immediate first tick
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [qrExpiresAt, selectedMode]);

  // ISSUE-133: Keep cleanup ref in sync — avoid stale closures
  useEffect(() => {
    cleanupStateRef.current = { saleId: saleId ?? "", billRef, selectedMode, totalMinor, currency };
  }, [saleId, billRef, selectedMode, totalMinor, currency]);

  // ISSUE-133: Unmount-only cleanup — empty deps so payment mode switch does NOT cancel sale
  useEffect(() => {
    return () => {
      const s = cleanupStateRef.current;
      if (!finalized.current && s.saleId) {
        void cancelSale({ saleId: s.saleId }).catch((error) => {
          if (__DEV__) console.error("Failed to cancel sale on cleanup:", error);
        });

        if (s.billRef) {
          void logPaymentEvent("PAYMENT_CANCELLED", {
            transactionId,
            billId: s.billRef,
            paymentMode: s.selectedMode,
            amountMinor: s.totalMinor,
            currency: s.currency
          });
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AUD-060-B FIX: Block back navigation during payment processing to prevent cancel/pay race
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (submittingRef.current) {
        // Block back navigation while payment is being processed
        Alert.alert(t('posPayment.paymentInProgressTitle'), t('posPayment.paymentInProgressMessage'));
        return true; // Prevent default back behavior
      }
      return false; // Allow default back behavior
    });

    return () => backHandler.remove();
  }, []);

  // STG-377: Lock payment method tabs during transaction
  const handlePaymentSelect = (mode: PaymentMode) => {
    if (submitting || submittingRef.current) return;
    setSelectedMode(mode);
  };

  // GL-CRIT-0047: Ref to track if partial sale was confirmed
  const partialSaleConfirmedRef = useRef(false);

  // GO-LIVE-234: Restore partial sale state on mount
  useEffect(() => {
    if (!isPartialSale || !saleItemIds) return;

    void (async () => {
      const savedState = await loadPartialSaleState();
      if (savedState) {
        // Check if the saved state matches current selection
        const savedIdsSet = new Set(savedState.saleItemIds);
        const currentIdsSet = new Set(saleItemIds);
        const matches =
          savedIdsSet.size === currentIdsSet.size &&
          [...savedIdsSet].every((id) => currentIdsSet.has(id));

        if (matches && savedState.confirmed) {
          if (__DEV__) console.log("[Payment] GO-LIVE-234: Restored partial sale confirmation from storage");
          partialSaleConfirmedRef.current = true;
        }
      }

      // Save current partial sale state (even if not confirmed yet)
      await savePartialSaleState({
        saleItemIds,
        confirmed: partialSaleConfirmedRef.current,
        saleId: saleId ?? undefined,
      });
    })();
  }, [isPartialSale, saleItemIds, saleId]);

  // STG-114: Cancel/void transaction handler
  const handleCancelTransaction = useCallback(() => {
    if (submitting || submittingRef.current) {
      Alert.alert(t('posPayment.paymentInProgressTitle'), t('posPayment.cannotCancelInProgress'));
      return;
    }
    Alert.alert(
      t('posPayment.cancelTransactionTitle'),
      t('posPayment.cancelTransactionMessage'),
      [
        { text: t('posPayment.cancelNo'), style: "cancel" },
        {
          text: t('posPayment.cancelYes'),
          style: "destructive",
          onPress: () => {
            // Cancel the sale on backend if it was already created
            if (saleId) {
              void cancelSale({ saleId }).catch((error) => {
                if (__DEV__) console.error("[PaymentScreen] STG-114: Failed to cancel sale:", error);
              });
            }
            if (billRef) {
              void logPaymentEvent("PAYMENT_CANCELLED", {
                transactionId,
                billId: billRef,
                paymentMode: selectedMode,
                amountMinor: totalMinor,
                currency,
              });
            }
            // Mark as finalized so unmount cleanup does not double-cancel
            finalized.current = true;
            unlockCart();
            navigation.goBack();
          },
        },
      ]
    );
  }, [submitting, saleId, billRef, transactionId, selectedMode, totalMinor, currency, unlockCart, navigation]);

  const handleCompletePayment = async () => {
    if (!saleId || !billRef) {
      Alert.alert(t('posPayment.paymentErrorTitle'), t('posPayment.saleNotReady'));
      return;
    }

    // GL-CRIT-0047: Show confirmation for partial sales
    if (isPartialSale && !partialSaleConfirmedRef.current) {
      const remainingItemCount = items.length - saleItems.length;
      Alert.alert(
        t('posPayment.partialSaleTitle'),
        t('posPayment.partialSaleMessage', { count: remainingItemCount }),
        [
          {
            text: t('common.cancel'),
            style: "cancel"
          },
          {
            text: t('common.confirm'),
            onPress: async () => {
              partialSaleConfirmedRef.current = true;
              // GO-LIVE-234: Persist confirmation to storage
              await updatePartialSaleConfirmed(true);
              handleCompletePayment(); // Retry with confirmation
            }
          }
        ]
      );
      return;
    }

    // ISSUE-MICRO-068: Warn if cart item prices are stale (fetched over 4 hours ago)
    if (!priceWarningDismissedRef.current) {
      const staleItems = saleItems.filter(
        (item) => item.priceFetchedAt && Date.now() - item.priceFetchedAt > PRICE_FRESHNESS_THRESHOLD_MS
      );
      if (staleItems.length > 0) {
        // STG-216: Rewrite Price Freshness Warning in plain language
        Alert.alert(
          t('posPayment.priceOutdatedTitle'),
          t('posPayment.priceOutdatedMessage', { count: staleItems.length }),
          [
            { text: t('common.cancel'), style: "cancel" },
            {
              text: t('posPayment.lowStockProceed'),
              onPress: () => {
                priceWarningDismissedRef.current = true;
                handleCompletePayment();
              },
            },
          ]
        );
        return;
      }
    }

    // STG-122: Large transaction confirmation for amounts >= ₹5,000
    if (!largeTransactionConfirmedRef.current && totalMinor >= LARGE_TRANSACTION_THRESHOLD_MINOR) {
      Alert.alert(
        t('posPayment.largeTransactionTitle'),
        t('posPayment.largeTransactionMessage', { amount: formatMoney(totalMinor, currency) }),
        [
          { text: t('common.cancel'), style: "cancel" },
          {
            text: t('posPayment.lowStockProceed'),
            onPress: () => {
              largeTransactionConfirmedRef.current = true;
              handleCompletePayment();
            },
          },
        ]
      );
      return;
    }

    // STG-092: Show receipt preview before finalizing
    setShowReceiptPreview(true);
  };

  // STG-092: Actual payment execution after receipt preview confirmation
  const executePayment = async () => {
    setShowReceiptPreview(false);

    if (!saleId || !billRef) return;

    // AUD-055-A FIX: Use ref for IMMEDIATE synchronous check (React state is async)
    // This prevents the race window where a second tap could pass the guard
    if (finalized.current || submittingRef.current) return;
    submittingRef.current = true; // Set IMMEDIATELY (synchronous)
    setSubmitting(true); // Also set state for UI updates

    try {
      // Validate UPI mode requirements
      if (selectedMode === "UPI") {
        if (!isOnline) {
          Alert.alert(t('posPayment.upiOfflineTitle'), t('posPayment.upiOfflineMessage'));
          return;
        }
        if (!paymentId) {
          Alert.alert(t('posPayment.verifyingPaymentTitle'), t('posPayment.verifyingPaymentMessage'));
          return;
        }
      }

      // STG-492: Write PENDING_UPI_KEY BEFORE checkout to prevent double-charge on crash
      if (selectedMode === "UPI" && paymentId && saleId) {
        const pending = { paymentId, saleId, timestamp: Date.now() };
        await AsyncStorage.setItem(PENDING_UPI_KEY, JSON.stringify(pending));
      }

      // STG-115: Map CARD/WALLET to CASH for checkout (they are coming soon placeholders)
      const checkoutMode = (selectedMode === "CARD" || selectedMode === "WALLET") ? "CASH" : selectedMode;

      // Complete checkout with payment + inventory deduction
      const result = await completeCheckout({
        saleId,
        billRef,
        paymentMode: checkoutMode,
        paymentId: selectedMode === "UPI" && paymentId ? paymentId : undefined,
        items: saleItems,
        totalMinor,
        currency,
        transactionId,
      });

      // STG-492: Clear pending UPI after successful checkout
      if (selectedMode === "UPI") {
        AsyncStorage.removeItem(PENDING_UPI_KEY).catch(() => {});
      }

      // Log stock deduction (for debugging/audit trail)
      const stockLogs = buildStockDeductionLogs(saleItems, saleId);
      if (__DEV__) stockLogs.forEach((entry) => console.log(entry));

      // Warn if inventory deduction failed (payment still succeeded)
      if (!result.inventoryDeducted) {
        if (__DEV__) console.warn(`[Payment] Inventory not deducted for sale ${saleId} - will reconcile later`);
      }

      if (isPartialSale) {
        for (const item of saleItems) {
          removeItem(item.id, true);
        }
      }

      finalized.current = true;

      // STG-124: Vibrate on successful payment completion
      Vibration.vibrate(200);

      void logPaymentEvent("PAYMENT_SUCCESS", {
        transactionId,
        billId: billRef,
        paymentMode: selectedMode,
        amountMinor: totalMinor,
        currency,
        inventoryDeducted: result.inventoryDeducted,
      });

      // GO-LIVE-234: Clear partial sale state on successful payment
      if (isPartialSale) {
        void clearPartialSaleState();
      }

      // ISSUE-MICRO-101: Use replace instead of navigate to remove Payment from the stack.
      // This prevents the user from navigating back to a stale Payment screen via hardware back button.
      navigation.replace("SuccessPrint", {
        paymentMode: checkoutMode,
        transactionId,
        billId: billRef,
        saleId: saleId || undefined, // STG-107: Pass actual backend sale UUID for WhatsApp bill
        saleItems: isPartialSale ? saleItems : undefined,
        saleTotalMinor: isPartialSale ? totalMinor : undefined,
        saleCurrency: isPartialSale ? currency : undefined,
        partialSale: isPartialSale ? true : undefined
      });
    } catch (error) {
      // ISSUE-MICRO-071: Reset cart lock timer so user gets full 5-min timeout for retry
      lockCart();

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
          Alert.alert(t('posPayment.posInactiveTitle'), POS_MESSAGES.storeInactive, [
            { text: t('common.ok'), onPress: () => navigation.navigate("SellScan") }
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

          Alert.alert(t('posPayment.cartUpdatedTitle'), message, [
            { text: t('common.ok'), onPress: () => navigation.navigate("SellScan") }
          ]);
          return;
        }
      }
      // STG-077: Show specific failure reason
      const msg = error instanceof ApiError
        ? (error.payload as any)?.message || error.message || "Unknown error"
        : error instanceof Error
          ? error.message
          : "Unknown error";
      Alert.alert(t('posPayment.paymentFailedTitle'), t('posPayment.paymentFailedDetail', { message: msg }));
    } finally {
      // AUD-055-A FIX: Only reset submitting if NOT finalized
      // If finalized=true, leave submittingRef=true to prevent any further attempts
      if (!finalized.current) {
        submittingRef.current = false;
      }
      setSubmitting(false);
    }
  };

  // STG-377: Lock tabs during submitting state
  const renderModeTab = (mode: PaymentMode, title: string, icon: string, disabled = false) => {
    const selected = selectedMode === mode;
    const isLocked = disabled || submitting;

    return (
      <Pressable
        style={[
          styles.modeTab,
          selected && styles.modeTabActive,
          isLocked && styles.modeTabDisabled
        ]}
        onPress={() => handlePaymentSelect(mode)}
        disabled={isLocked}
        accessibilityRole="tab"
        accessibilityLabel={`${title} payment${selected ? ", selected" : ""}${isLocked ? ", locked" : ""}`}
        accessibilityState={{ selected, disabled: isLocked }}
      >
        <MaterialCommunityIcons
          name={icon as any}
          size={20}
          color={selected ? colors.textInverse : colors.textSecondary}
        />
        <Text
          style={[
            styles.modeTabText,
            selected && styles.modeTabTextActive,
            isLocked && styles.modeTabTextDisabled
          ]}
        >
          {title}
        </Text>
      </Pressable>
    );
  };

  // STG-401: Include cartValid in submission guard
  // STG-115: Block submission for CARD/WALLET (coming soon)
  const canSubmit =
    Boolean(saleId && billRef) &&
    !loadingSale &&
    !submitting &&
    cartValid &&
    selectedMode !== "CARD" &&
    selectedMode !== "WALLET" &&
    (selectedMode !== "UPI" || Boolean(paymentId));

  // FIX-039: Compute stale price count for warning badge
  const stalePriceCount = useMemo(() => {
    return saleItems.filter(
      (item) => item.priceFetchedAt && Date.now() - item.priceFetchedAt > PRICE_FRESHNESS_THRESHOLD_MS
    ).length;
  }, [saleItems]);

  const ctaLabel =
    selectedMode === "UPI" ? "Payment Received" : selectedMode === "DUE" ? "Mark as Due" : "Complete Payment";

  const formattedStoreName = formatStoreName(upiStoreName);

  // STG-406: Determine if billRef has offline prefix for display consistency
  // When generating a receipt/bill ref offline, ensure it has "OFF-" prefix
  const displayBillRef = useMemo(() => {
    if (!billRef) return null;
    // If offline and billRef does not already have OFF- prefix, prepend it
    if (!isOnline && !billRef.startsWith("OFF-")) {
      return `OFF-${billRef}`;
    }
    return billRef;
  }, [billRef, isOnline]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    // STG-083: Back button
    backButton: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.textPrimary
    },
    billRef: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textTertiary
    },
    // STG-123: Amount in header
    headerAmount: {
      alignItems: "flex-end",
    },
    headerAmountLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    headerAmountValue: {
      fontSize: 22,
      fontWeight: "900",
      color: colors.primary,
    },
    // STG-379: Offline banner
    banner: {
      marginHorizontal: 16,
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.warning,
      backgroundColor: colors.warningSoft,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    bannerText: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "700",
      flex: 1,
    },
    modeTabs: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
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
      backgroundColor: colors.primary
    },
    modeTabDisabled: {
      opacity: 0.5
    },
    modeTabText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary
    },
    modeTabTextActive: {
      color: colors.textInverse
    },
    modeTabTextDisabled: {
      color: colors.textTertiary
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
      borderColor: colors.primary,
      borderStyle: "dashed",
      backgroundColor: colors.surface
    },
    splitButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary
    },
    content: {
      flex: 1,
    },
    contentInner: {
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    qrStage: {
      alignItems: "center",
      paddingVertical: 16,
      gap: 12,
    },
    cashStage: {
      alignItems: "center",
      paddingVertical: 24,
      gap: 16,
    },
    // STG-082: Customer badge for due mode
    customerBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    customerBadgeText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
    },
    // STG-080: Cash input styles
    cashInputLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      alignSelf: "flex-start",
      marginBottom: 4,
    },
    cashInputRow: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
    },
    cashCurrencyPrefix: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.textSecondary,
      marginRight: 4,
    },
    cashInput: {
      flex: 1,
      fontSize: 28,
      fontWeight: "800",
      color: colors.textPrimary,
      paddingVertical: 12,
    },
    changeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
      paddingHorizontal: 4,
      marginTop: 8,
    },
    changeLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    changeValue: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    qrShell: {
      width: 230,
      height: 230,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      ...theme.shadows.sm
    },
    qrHint: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
      textAlign: "center"
    },
    // STG-214: Prominent regenerate QR button
    regenerateButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
    },
    regenerateButtonText: {
      color: colors.textInverse,
      fontSize: 14,
      fontWeight: "700",
    },
    storeName: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary
    },
    cashHint: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      textAlign: "center",
      paddingHorizontal: 24
    },
    // STG-087: Order summary styles
    summaryHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 8,
    },
    summaryHeaderText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    summaryBody: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      gap: 8,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    summaryTotalRow: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 8,
      marginTop: 4,
    },
    summaryItemName: {
      fontSize: 13,
      color: colors.textPrimary,
      fontWeight: "500",
    },
    summaryItemQty: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 2,
    },
    summaryItemTotal: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    summaryItemDiscount: {
      fontSize: 11,
      color: colors.success,
      marginTop: 1,
    },
    summaryTotalLabel: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    summaryTotalValue: {
      fontSize: 16,
      fontWeight: "900",
      color: colors.primary,
    },
    // STG-088: GST note
    summaryGstNote: {
      fontSize: 10,
      color: colors.textTertiary,
      textAlign: "right",
      marginTop: 4,
    },
    // Warning/Error banners
    warningBanner: {
      backgroundColor: colors.warningSoft,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
    },
    warningBannerText: {
      color: colors.warningDark,
      fontSize: 13,
      marginLeft: 8,
      flex: 1,
    },
    errorBanner: {
      backgroundColor: colors.errorSoft,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
    },
    errorBannerText: {
      color: colors.error,
      fontSize: 13,
      marginLeft: 8,
      flex: 1,
    },
    // STG-118: Retry button blue (primary) instead of red
    retryButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 6,
      marginLeft: 8,
    },
    retryButtonText: {
      color: colors.textInverse, // STG-053: use theme token instead of hardcoded #fff
      fontSize: 13,
      fontWeight: "600",
    },
    // STG-078: Disabled hint bar
    disabledHintBar: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      backgroundColor: colors.surface,
    },
    disabledHintText: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: "center",
      fontStyle: "italic",
    },
    footer: {
      padding: 16,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border
    },
    primaryCta: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 52,
    },
    // STG-089: Better WCAG contrast for disabled state
    primaryCtaDisabled: {
      backgroundColor: colors.border,
      opacity: 0.7,
    },
    primaryCtaText: {
      color: colors.textInverse,
      fontSize: 16,
      fontWeight: "800"
    },
    // STG-114: Cancel button
    cancelButton: {
      padding: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.error,
    },
    // STG-380: Lock expiry banner
    lockExpiredBanner: {
      marginHorizontal: 16,
      marginTop: 8,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.warning,
      backgroundColor: colors.warningSoft,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    lockExpiredText: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: "600",
      flex: 1,
    },
    // STG-115: Coming soon placeholder
    comingSoonStage: {
      alignItems: "center",
      paddingVertical: 40,
      gap: 16,
    },
    comingSoonText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textTertiary,
    },
    comingSoonSubtext: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: "center",
      paddingHorizontal: 32,
    },
    // STG-213: Payment processing overlay
    processingOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    },
    processingOverlayBox: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 32,
      alignItems: "center",
      gap: 16,
      ...theme.shadows.lg,
    },
    processingOverlayText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    // STG-092: Receipt preview modal styles
    receiptModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    receiptModalContent: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      width: "100%",
      maxHeight: "80%",
      ...theme.shadows.lg,
    },
    receiptModalHeader: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      alignItems: "center",
    },
    receiptModalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    receiptModalBody: {
      padding: 16,
    },
    receiptStoreName: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
      textAlign: "center",
      marginBottom: 4,
    },
    receiptBillRef: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: "center",
      marginBottom: 12,
    },
    receiptDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 8,
    },
    receiptItemRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingVertical: 4,
    },
    receiptItemName: {
      fontSize: 13,
      color: colors.textPrimary,
      flex: 1,
    },
    receiptItemDetail: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    receiptItemAmount: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    receiptDiscountRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 2,
    },
    receiptDiscountLabel: {
      fontSize: 12,
      color: colors.success,
    },
    receiptDiscountValue: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.success,
    },
    receiptTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderTopWidth: 2,
      borderTopColor: colors.textPrimary,
      marginTop: 4,
    },
    receiptTotalLabel: {
      fontSize: 16,
      fontWeight: "900",
      color: colors.textPrimary,
    },
    receiptTotalValue: {
      fontSize: 16,
      fontWeight: "900",
      color: colors.primary,
    },
    receiptPaymentMethod: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 8,
    },
    receiptModalFooter: {
      flexDirection: "row",
      gap: 12,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    receiptModalBackBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    receiptModalBackBtnText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    receiptModalConfirmBtn: {
      flex: 2,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    receiptModalConfirmBtnText: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.textInverse,
    },
  }), [colors]);

  return (
    <View style={styles.container}>
      {/* STG-213: Processing payment overlay — prevents accidental taps */}
      {submitting && (
        <View style={styles.processingOverlay} pointerEvents="auto">
          <View style={styles.processingOverlayBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingOverlayText}>Processing Payment...</Text>
          </View>
        </View>
      )}

      {/* STG-083: Header with back button + STG-113: Bill number + STG-114: Cancel button */}
      <View style={[styles.header, { paddingTop: 16 + insets.top }]}>
        <Pressable
          onPress={() => {
            if (submitting || submittingRef.current) {
              Alert.alert(t('posPayment.paymentInProgressTitle'), t('posPayment.paymentInProgressMessage'));
              return;
            }
            navigation.goBack();
          }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to cart"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Payment</Text>
          {/* STG-113 + STG-406: Show bill/invoice number with offline prefix if applicable */}
          {displayBillRef && <Text style={styles.billRef}>Bill #{displayBillRef}</Text>}
          {/* STG-120: Staff name for audit */}
          {staffName && <Text style={styles.billRef}>Staff: {staffName}</Text>}
        </View>
        {/* STG-114: Cancel/void transaction button */}
        <Pressable
          onPress={handleCancelTransaction}
          style={styles.cancelButton}
          accessibilityRole="button"
          accessibilityLabel="Cancel transaction"
          disabled={submitting}
        >
          <MaterialCommunityIcons name="close-circle-outline" size={22} color={colors.error} />
        </Pressable>
        {/* STG-123: Total amount in header */}
        <View style={styles.headerAmount}>
          <Text style={styles.headerAmountLabel}>Total</Text>
          <Text
            style={styles.headerAmountValue}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            numberOfLines={1}
          >
            {formatMoney(totalMinor, currency)}
          </Text>
        </View>
      </View>

      {/* STG-379: Offline payment fallback messaging */}
      {!isOnline && (
        <View style={styles.banner}>
          <MaterialCommunityIcons name="wifi-off" size={16} color={colors.warning} />
          <Text style={styles.bannerText}>
            You are offline. UPI is disabled. Use Cash or Due to complete payment.
          </Text>
        </View>
      )}

      {/* STG-380: Cart lock timeout explanation */}
      {lockExpired && (
        <View style={styles.lockExpiredBanner}>
          <MaterialCommunityIcons name="lock-open-outline" size={16} color={colors.warning} />
          <Text style={styles.lockExpiredText}>
            Cart lock has expired after 5 minutes. Go back to re-lock the cart before completing payment.
          </Text>
        </View>
      )}

      {/* STG-377: Tabs locked during submitting */}
      <View style={styles.modeTabs}>
        {allowedMethods.includes("UPI") && renderModeTab("UPI", "UPI", "qrcode-scan", upiDisabled)}
        {allowedMethods.includes("CASH") && renderModeTab("CASH", "Cash", "currency-inr")}
        {allowedMethods.includes("DUE") && renderModeTab("DUE", "Due", "clock-outline")}
        {/* STG-115: Card and Wallet tabs — only shown if allowedMethods includes them */}
        {allowedMethods.includes("CARD") && renderModeTab("CARD", "Card", "credit-card-outline")}
        {allowedMethods.includes("WALLET") && renderModeTab("WALLET", "Wallet", "wallet-outline")}
      </View>

      {/* SM-015: Split Payment Button — STG-377: disabled during submitting */}
      {isOnline && !upiDisabled && (
        <Pressable
          style={[styles.splitButton, submitting && { opacity: 0.5 }]}
          onPress={() => setShowSplitModal(true)}
          disabled={!saleId || loadingSale || submitting}
        >
          <MaterialCommunityIcons name="call-split" size={18} color={colors.primary} />
          <Text style={styles.splitButtonText}>Split Payment (UPI + Cash)</Text>
        </Pressable>
      )}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {/* Payment mode content */}
        {/* STG-115: CARD and WALLET show Coming Soon placeholder */}
        {(selectedMode === "CARD" || selectedMode === "WALLET") ? (
          <View style={styles.comingSoonStage}>
            <MaterialCommunityIcons
              name={selectedMode === "CARD" ? "credit-card-outline" as any : "wallet-outline" as any}
              size={48}
              color={colors.textTertiary}
            />
            <Text style={styles.comingSoonText}>Coming Soon</Text>
            <Text style={styles.comingSoonSubtext}>
              {selectedMode === "CARD" ? "Card" : "Wallet"} payments are not yet available. Please use UPI, Cash, or Due for now.
            </Text>
          </View>
        ) : selectedMode === "UPI" ? (
          <View style={styles.qrStage}>
            <View style={styles.qrShell}>
              {upiStatusLoading ? (
                <Text style={styles.qrHint}>Checking UPI details...</Text>
              ) : upiBlocked ? (
                <Text style={styles.qrHint}>
                  UPI unavailable until the store is active and UPI ID is set.
                </Text>
              ) : !isOnline ? (
                <Text style={styles.qrHint}>Offline: UPI disabled.</Text>
              ) : upiIntent ? (
                <View accessible accessibilityLabel="UPI payment QR code. Ask customer to scan with any UPI app." accessibilityRole="image">
                  <QRCode value={upiIntent} size={200} />
                </View>
              ) : loadingUpi ? (
                <View style={{ alignItems: "center", padding: 16 }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.qrHint, { marginTop: 8 }]}>Generating QR...</Text>
                </View>
              ) : (
                <View style={{ alignItems: "center", gap: 12 }}>
                  <MaterialCommunityIcons name="qrcode-remove" size={40} color={colors.textTertiary} />
                  <Text style={[styles.qrHint, { color: colors.error, fontWeight: "700" }]}>QR Code Expired</Text>
                  <Pressable
                    onPress={() => {
                      setUpiIntent(null);
                      setPaymentId(null);
                      setQrExpiresAt(null);
                      setQrSecondsLeft(null);
                    }}
                    style={styles.regenerateButton}
                    accessibilityRole="button"
                    accessibilityLabel="Regenerate QR code"
                  >
                    <MaterialCommunityIcons name="refresh" size={18} color={colors.textInverse} />
                    <Text style={styles.regenerateButtonText}>Regenerate QR</Text>
                  </Pressable>
                </View>
              )}
            </View>
            {upiIntent && qrSecondsLeft !== null && qrSecondsLeft > 0 && (
              <Text style={{
                fontSize: 13,
                color: qrSecondsLeft <= 60 ? colors.error : colors.textTertiary,
                fontWeight: qrSecondsLeft <= 60 ? "700" : "500",
                marginTop: 8,
                textAlign: "center",
              }}>
                QR expires in {Math.floor(qrSecondsLeft / 60)}:{String(qrSecondsLeft % 60).padStart(2, "0")}
              </Text>
            )}
            {formattedStoreName && (
              <Text style={styles.storeName}>{formattedStoreName}</Text>
            )}
            {/* STG-404: UPI polling status visible during wait */}
            {upiIntent && paymentId && (
              <Text style={styles.qrHint}>
                Ask customer to scan QR with any UPI app
              </Text>
            )}
            {/* STG-091: Dynamic instruction text for UPI */}
            {!upiIntent && !loadingUpi && !upiBlocked && isOnline && saleId && (
              <Text style={styles.qrHint}>Preparing payment QR...</Text>
            )}
          </View>
        ) : selectedMode === "CASH" ? (
          <View style={styles.cashStage}>
            {/* STG-080: Cash amount input + change calculation */}
            <Text style={styles.cashInputLabel}>Cash Received</Text>
            <View style={styles.cashInputRow}>
              <Text style={styles.cashCurrencyPrefix}>₹</Text>
              <TextInput
                style={styles.cashInput}
                value={cashReceived}
                onChangeText={setCashReceived}
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                returnKeyType="done"
                accessibilityLabel="Cash received amount"
              />
            </View>
            {/* STG-091: Dynamic instruction text for Cash */}
            <Text style={styles.qrHint}>
              Enter the amount received and tap Complete Payment
            </Text>
            {cashReceivedMinor > 0 && (
              <View style={styles.changeRow}>
                <Text style={styles.changeLabel}>
                  {changeMinor > 0 ? "Change to return" : cashReceivedMinor < totalMinor ? "Short by" : "Exact amount"}
                </Text>
                <Text style={[
                  styles.changeValue,
                  changeMinor > 0 && { color: colors.success },
                  cashReceivedMinor < totalMinor && { color: colors.error },
                ]}>
                  {cashReceivedMinor < totalMinor
                    ? formatMoney(totalMinor - cashReceivedMinor, currency)
                    : formatMoney(changeMinor, currency)}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.cashStage}>
            <MaterialCommunityIcons name="clock-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.cashHint}>
              Record as due and collect later
            </Text>
            {/* STG-082: Show customer info for due/credit sales */}
            {customer ? (
              <View style={styles.customerBadge}>
                <MaterialCommunityIcons name="account" size={16} color={colors.primary} />
                <Text style={styles.customerBadgeText}>{customer.name}{customer.phone ? ` (${customer.phone})` : ""}</Text>
              </View>
            ) : (
              <Text style={[styles.qrHint, { color: colors.warning }]}>
                No customer selected. Add customer in cart to track this due.
              </Text>
            )}
          </View>
        )}

        {/* STG-087: Order summary section */}
        <Pressable
          style={styles.summaryHeader}
          onPress={() => setSummaryExpanded((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={`Order summary, ${itemCount} items. ${summaryExpanded ? "Collapse" : "Expand"}`}
        >
          <Text style={styles.summaryHeaderText}>
            Order Summary ({saleItems.length} item{saleItems.length !== 1 ? "s" : ""})
          </Text>
          <MaterialCommunityIcons
            name={summaryExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
        {summaryExpanded && (
          <View style={styles.summaryBody}>
            {saleItems.map((item, idx) => {
              const lineTotal = Math.round(item.priceMinor) * Math.round(item.quantity);
              const lineDiscount = calculateDiscountAmount(lineTotal, item.itemDiscount ?? null);
              return (
                <View key={item.id || idx} style={styles.summaryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.summaryItemQty}>
                      {item.quantity} × {formatMoney(item.priceMinor, currency)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.summaryItemTotal}>{formatMoney(lineTotal - lineDiscount, currency)}</Text>
                    {lineDiscount > 0 && (
                      <Text style={styles.summaryItemDiscount}>-{formatMoney(lineDiscount, currency)}</Text>
                    )}
                  </View>
                </View>
              );
            })}
            {/* Cart-level discount */}
            {discountMinor > 0 && (
              <View style={[styles.summaryRow, styles.summaryTotalRow]}>
                <Text style={[styles.summaryItemName, { color: colors.success }]}>Cart Discount</Text>
                <Text style={[styles.summaryItemTotal, { color: colors.success }]}>
                  -{formatMoney(discountMinor, currency)}
                </Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.summaryTotalRow]}>
              <Text style={styles.summaryTotalLabel}>Total</Text>
              <Text style={styles.summaryTotalValue}>{formatMoney(totalMinor, currency)}</Text>
            </View>
            {/* STG-088: GST/tax note */}
            <Text style={styles.summaryGstNote}>* All prices inclusive of applicable taxes</Text>
          </View>
        )}
      </ScrollView>

      {/* FIX-039 + STG-216: Stale price warning banner */}
      {stalePriceCount > 0 && (
        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="alert-outline" size={18} color={colors.warning} />
          <Text style={styles.warningBannerText}>
            {stalePriceCount} item(s) were scanned over 4 hours ago. Prices may have changed.
          </Text>
        </View>
      )}

      {/* ISSUE-076: Sale creation error with retry — STG-077/STG-119: specific failure + dismiss */}
      {saleError && !loadingSale && (
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.error} />
          <Text style={styles.errorBannerText}>{saleError}</Text>
          {/* STG-118: Retry button blue (primary) instead of red */}
          <Pressable
            onPress={() => setSaleError(null)}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
          {/* STG-119: Dismiss X button */}
          <Pressable
            onPress={() => setSaleError(null)}
            style={{ padding: 4, marginLeft: 4 }}
            accessibilityLabel="Dismiss error"
          >
            <MaterialCommunityIcons name="close" size={18} color={colors.error} />
          </Pressable>
        </View>
      )}

      {/* STG-078: Explain greyed-out button */}
      {!canSubmit && disabledReason && !loadingSale && !saleError && (
        <View style={styles.disabledHintBar}>
          <Text style={styles.disabledHintText}>{disabledReason}</Text>
        </View>
      )}

      <View style={styles.footer}>
        {/* STG-090: Loading state in button */}
        <Pressable
          style={[styles.primaryCta, !canSubmit && styles.primaryCtaDisabled]}
          onPress={handleCompletePayment}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={submitting ? "Processing payment" : ctaLabel}
          accessibilityState={{ disabled: !canSubmit }}
        >
          {submitting ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={colors.textInverse} />
              <Text style={styles.primaryCtaText}>Processing...</Text>
            </View>
          ) : loadingSale ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={colors.textInverse} />
              <Text style={styles.primaryCtaText}>Creating Sale...</Text>
            </View>
          ) : (
            <Text style={styles.primaryCtaText}>{ctaLabel}</Text>
          )}
        </Pressable>
      </View>

      {/* STG-092 + STG-384: Receipt preview modal with item vs cart discount differentiation */}
      <Modal
        visible={showReceiptPreview}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReceiptPreview(false)}
      >
        <View style={styles.receiptModalOverlay}>
          <View style={styles.receiptModalContent}>
            <View style={styles.receiptModalHeader}>
              <Text style={styles.receiptModalTitle}>Receipt Preview</Text>
            </View>
            <ScrollView style={styles.receiptModalBody}>
              {/* Store name */}
              <Text style={styles.receiptStoreName}>
                {formattedStoreName || "SuperMandi Store"}
              </Text>
              {/* STG-406: Bill ref with offline prefix */}
              {displayBillRef && (
                <Text style={styles.receiptBillRef}>Bill #{displayBillRef}</Text>
              )}
              <View style={styles.receiptDivider} />

              {/* Item list with individual discounts — STG-384: differentiate item discounts */}
              {saleItems.map((item, idx) => {
                const lineTotal = Math.round(item.priceMinor) * Math.round(item.quantity);
                const lineDiscount = calculateDiscountAmount(lineTotal, item.itemDiscount ?? null);
                return (
                  <View key={item.id || idx}>
                    <View style={styles.receiptItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.receiptItemName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.receiptItemDetail}>
                          {item.quantity} x {formatMoney(item.priceMinor, currency)}
                        </Text>
                      </View>
                      <Text style={styles.receiptItemAmount}>
                        {formatMoney(lineTotal, currency)}
                      </Text>
                    </View>
                    {/* STG-384: Show item-level discount on receipt */}
                    {lineDiscount > 0 && item.itemDiscount && (
                      <View style={styles.receiptDiscountRow}>
                        <Text style={styles.receiptDiscountLabel}>
                          {"  "}Item Discount{item.itemDiscount.reason ? ` (${item.itemDiscount.reason})` : ""}
                        </Text>
                        <Text style={styles.receiptDiscountValue}>
                          -{formatMoney(lineDiscount, currency)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}

              <View style={styles.receiptDivider} />

              {/* Subtotal */}
              <View style={styles.receiptItemRow}>
                <Text style={styles.receiptItemName}>Subtotal</Text>
                <Text style={styles.receiptItemAmount}>
                  {formatMoney(subtotalMinor, currency)}
                </Text>
              </View>

              {/* STG-384: Item discounts total (if any) */}
              {itemDiscountMinor > 0 && (
                <View style={styles.receiptDiscountRow}>
                  <Text style={styles.receiptDiscountLabel}>Item Discounts</Text>
                  <Text style={styles.receiptDiscountValue}>
                    -{formatMoney(itemDiscountMinor, currency)}
                  </Text>
                </View>
              )}

              {/* STG-384: Cart-level discount (if any) */}
              {cartDiscountMinor > 0 && appliedCartDiscount && (
                <View style={styles.receiptDiscountRow}>
                  <Text style={styles.receiptDiscountLabel}>
                    Cart Discount{appliedCartDiscount.reason ? ` (${appliedCartDiscount.reason})` : ""}
                  </Text>
                  <Text style={styles.receiptDiscountValue}>
                    -{formatMoney(cartDiscountMinor, currency)}
                  </Text>
                </View>
              )}

              {/* Total */}
              <View style={styles.receiptTotalRow}>
                <Text style={styles.receiptTotalLabel}>Total</Text>
                <Text style={styles.receiptTotalValue}>
                  {formatMoney(totalMinor, currency)}
                </Text>
              </View>

              {/* Payment method */}
              <Text style={styles.receiptPaymentMethod}>
                Payment Method: {selectedMode}
              </Text>
            </ScrollView>

            {/* Footer buttons */}
            <View style={styles.receiptModalFooter}>
              <Pressable
                style={styles.receiptModalBackBtn}
                onPress={() => setShowReceiptPreview(false)}
                accessibilityRole="button"
                accessibilityLabel="Go back to payment"
              >
                <Text style={styles.receiptModalBackBtnText}>Go Back</Text>
              </Pressable>
              <Pressable
                style={styles.receiptModalConfirmBtn}
                onPress={executePayment}
                accessibilityRole="button"
                accessibilityLabel="Confirm and pay"
              >
                <Text style={styles.receiptModalConfirmBtnText}>Confirm & Pay</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
              t('posPayment.paymentNotCompleteTitle'),
              result.errorMessage || t('posPayment.paymentNotCompleteMessage'),
              [{ text: t('common.ok') }]
            );
            return; // Don't proceed - cart remains intact
          }

          // GL-RJ-001: Payment verified - proceed to success
          // GO-LIVE-113: Keep submittingRef=true and set finalized to prevent any further attempts
          finalized.current = true;

          // STG-124: Vibrate on successful split payment completion
          Vibration.vibrate(200);

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

          // GO-LIVE-234: Clear partial sale state on successful payment
          if (isPartialSale) {
            void clearPartialSaleState();
          }

          // LIVE.POS.SPLIT_PAYMENT_NAV_REPLACE.001: Use replace to prevent back-to-repay
          // STG-467: Include saleId for WhatsApp bill sharing (parity with non-split path)
          navigation.replace("SuccessPrint", {
            paymentMode: "CASH", // Split shows as CASH on receipt
            transactionId,
            billId: billRef || "",
            saleId: saleId || undefined,
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

// STG-405: Discount undo — N/A at payment screen level. Discounts are managed in the cart
// screen before navigating to payment. No action needed here.

export default PaymentScreen;
