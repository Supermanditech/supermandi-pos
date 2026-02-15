import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  Easing,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { AppText, ButtonText, PriceText, LabelText } from "../components/ui/AppText";
import { useCartStore } from "../stores/cartStore";
import type { CartItem, StockAdjustment } from "../stores/cartStore";
import { useProductsStore } from "../stores/productsStore";
import { formatMoney } from "../utils/money";
import * as productsApi from "../services/api/productsApi";
import type { SubstituteProduct } from "../services/api/productsApi";
import * as sellSearchApi from "../services/api/sellSearchApi";
import { getDeviceStoreId } from "../services/deviceSession";
import { setLocalPrice, upsertLocalProduct } from "../services/offline/scan";
import { offlineDb } from "../services/offline/localDb";
import { setCorruptedEventsCallback, failedOutboxCount, clearCorruptedEvents } from "../services/offline/outbox"; // GL-CRIT-0012
import { onBarcodeScanned, type SellFirstOnboardingRequest } from "../services/scan/handleScan";
import { submitSellFirstOnboarding } from "../services/scan/sellFirstOnboarding";
import {
  refreshStockSnapshot,
  resolveStockForCartItem,
  resolveStockForSku,
  subscribeStockUpdates,
  upsertStockEntries,
  startStockAutoRefresh, // GL-CRIT-0013
  stopStockAutoRefresh // GL-CRIT-0013
} from "../services/stockService";
import {
  feedHidKey,
  feedHidText,
  submitHidBuffer,
  wasHidCommitRecent,
} from "../services/hidScannerService";
import { theme } from "../theme";
import { CategoryRail, DEMO_CATEGORIES, fmcgCategoryToItem, type CategoryItem } from "../components/sell/CategoryRail";
import { useSettingsStore } from "../stores/settingsStore";
import { getFmcgCategories, getCategoryProducts, type CategoryProduct } from "../services/api/catalogApi";
import { useFeatureEnabled } from "../utils/featureFlags";
import { VoiceSheet, type VoiceButtonState, type VoiceSheetState, type VoiceLocale } from "../components/voice";
import { startRecording, stopRecording, cancelRecording, submitVoiceCommand } from "../services/voice";
// GL-CRIT-0089: Import centralized pagination constant
// GO-LIVE-170: Import pagination safeguard
import { PRODUCTS_PAGE_SIZE, MAX_PAGINATION_PAGE } from "../config/pagination";
import { showToast } from "../utils/showToast";
import * as searchHistory from "../services/searchHistory";

type CartMode = "SELL" | "PURCHASE";

type SellScanScreenProps = {
  storeActive: boolean | null;
  scanDisabled: boolean;
  onOpenScanner: () => void;
  cartMode?: CartMode;
  sellOnboardingRequest?: SellFirstOnboardingRequest | null;
  onSellOnboardingClose?: () => void;
  isScanningActive?: boolean;
};

type RootStackParamList = {
  Payment: { saleItemIds?: string[] } | undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "Payment">;

type SkuItem = {
  productId?: string | null;
  storeProductId?: string | null;  // SYNC-PRD-001: needed for metadata update endpoint
  barcode: string;
  name: string;
  currency: string | null;
  inventoryPriceMinor: number | null;
  variantPriceMinor: number | null;
  variantMrpMinor: number | null;
  currentStock?: number | null;
  imageUrl?: string | null; // T-134: Product image URL
};

const resolveSkuPrice = (item: SkuItem) => {
  return productsApi.resolvePriceMinorFromSources({
    inventoryPrice: item.inventoryPriceMinor,
    variantPrice: item.variantPriceMinor,
    variantMrp: item.variantMrpMinor
  });
};

type DiscountType = "percentage" | "fixed";

async function syncProductsToOffline(query?: string): Promise<SkuItem[]> {
  const trimmedQuery = query?.trim() || "";
  try {
    const items: SkuItem[] = [];

    // SD-ONBOARD-002C: Use list endpoint for initial load, search for queries
    if (trimmedQuery.length < 2) {
      // No query or short query - paginate through all store products
      console.log("[syncProductsToOffline] Using list endpoint for tap-and-add");
      const PAGE = 100;
      let offset = 0;
      let allProducts: sellSearchApi.StoreProductListItem[] = [];
      for (;;) {
        const page = await sellSearchApi.listStoreProducts({ limit: PAGE, offset });
        allProducts.push(...page);
        if (page.length < PAGE) break;
        offset += PAGE;
        if (allProducts.length > 1000) break; // Safety cap
      }

      const stockEntries: Array<{ key: string; stock: number }> = [];
      for (const product of allProducts) {
        const barcode = product.barcode?.trim() || "";
        const stock = typeof product.currentStock === "number" ? product.currentStock : null;

        items.push({
          productId: product.productId,
          storeProductId: product.storeProductId,  // SYNC-PRD-001
          barcode,
          name: product.name,
          currency: "INR",
          inventoryPriceMinor: product.sellPrice,
          variantPriceMinor: null,
          variantMrpMinor: null,
        });

        // Store in offline DB (with productId and stock)
        if (barcode) {
          await upsertLocalProduct(barcode, product.name, "INR", null, product.productId, stock, product.storeProductId ?? null);
          if (product.sellPrice !== null) {
            await setLocalPrice(barcode, product.sellPrice);
          }
        }

        // Build stock cache entries
        if (stock !== null) {
          if (product.productId) stockEntries.push({ key: product.productId, stock });
          if (barcode) stockEntries.push({ key: barcode, stock });
        }
      }

      // Populate stock cache
      if (stockEntries.length > 0) upsertStockEntries(stockEntries);
    } else {
      // Query provided - use search endpoint
      const storeId = await getDeviceStoreId();
      if (!storeId) {
        console.log("[syncProductsToOffline] No storeId, skipping sync");
        return [];
      }

      const groups = await sellSearchApi.searchStoreProducts(storeId, trimmedQuery, {
        limit: 50,
        includeZeroStock: true,
      });

      const stockEntries: Array<{ key: string; stock: number }> = [];
      for (const group of groups) {
        for (const match of group.matches) {
          const barcode = match.barcode?.trim() || "";
          const displayName = match.displayName || group.displayName;
          const sellPrice = match.sellPrice ?? null;
          const stock = typeof match.currentStock === "number" ? match.currentStock : null;

          items.push({
            productId: match.productId,
            storeProductId: match.storeProductId,  // SYNC-PRD-001
            barcode,
            name: displayName,
            currency: "INR",
            inventoryPriceMinor: sellPrice,
            variantPriceMinor: null,
            variantMrpMinor: null,
          });

          // Store in offline DB (with productId and stock)
          if (barcode) {
            await upsertLocalProduct(barcode, displayName, "INR", null, match.productId, stock, match.storeProductId ?? null);
            if (sellPrice !== null) {
              await setLocalPrice(barcode, sellPrice);
            }
          }

          // Build stock cache entries
          if (stock !== null) {
            if (match.productId) stockEntries.push({ key: match.productId, stock });
            if (barcode) stockEntries.push({ key: barcode, stock });
          }
        }
      }

      // Populate stock cache
      if (stockEntries.length > 0) upsertStockEntries(stockEntries);
    }

    return items;
  } catch (error) {
    console.log("[syncProductsToOffline] Error:", error);
    return [];
  }
}

// GL-CRIT-0089: Use centralized pagination constant
// GL-CRIT-0089: Use centralized pagination constant
const PAGE_SIZE = PRODUCTS_PAGE_SIZE;
const NUM_COLUMNS = 2;
// GL-CRIT-0090: Disabled auto-collapse as it was confusing to users.
// Category rail stays expanded until user manually collapses (back button or tap outside).
const CATEGORY_AUTO_COLLAPSE_MS = 0; // 0 = disabled
const SCAN_SEGMENT_DOCKED_WIDTH = 64;
const PRICE_AUTO_SAVE_DELAY_MS = 300;
const DISCOUNT_AUTO_APPLY_DELAY_MS = 300;
// DEV-061: Adjusted ratios for better visibility on handhelds
const CART_SHEET_COLLAPSED_RATIO = 0.55;
const CART_SHEET_COLLAPSED_RATIO_SMALL = 0.75;
const CART_SHEET_EXPANDED_RATIO = 0.95;
const CART_SHEET_SNAP_DURATION_MS = 180;
const CART_LIST_FOOTER_SPACER = 100;
const SMALL_SCREEN_WIDTH = 400;
const SMALL_SCREEN_HEIGHT = 750;


const mergeSkuItems = (prev: SkuItem[], incoming: SkuItem[]): SkuItem[] => {
  if (prev.length === 0 && incoming.length <= 1) return incoming;
  const merged = [...prev];
  const indexByBarcode = new Map<string, number>();
  merged.forEach((item, index) => indexByBarcode.set(item.barcode, index));

  for (const item of incoming) {
    const existingIndex = indexByBarcode.get(item.barcode);
    if (existingIndex === undefined) {
      indexByBarcode.set(item.barcode, merged.length);
      merged.push(item);
    } else {
      merged[existingIndex] = item;
    }
  }

  return merged;
};

const parsePriceInput = (text: string): number | null => {
  const normalized = text.replace(/[^0-9.]/g, "");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

const parseQuantityInput = (text: string): number => {
  const value = Math.round(Number(text));
  if (!Number.isFinite(value) || value <= 0) return 1;
  return value;
};

const formatPriceInput = (minor: number | null): string => {
  if (!minor || minor <= 0) return "";
  return (minor / 100).toFixed(2);
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

type CartItemRowProps = {
  item: CartItem;
  currency: string;
  mode: CartMode;
  availableStock: number | null;
  canEdit: boolean;
  autoFocusPrice?: boolean;
  stockLimitPulse?: number;
  rowTestId?: string;
  onPressRow?: () => void;
  onAutoFocusConsumed?: (itemId: string) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onUpdatePrice: (itemId: string, priceMinor: number) => void;
  onSaveDefaultPrice: (item: CartItem, priceMinor: number) => Promise<boolean>;
  onRemoveItem: (itemId: string) => void;
};

function CartItemRow({
  item,
  currency,
  mode,
  availableStock,
  canEdit,
  autoFocusPrice = false,
  stockLimitPulse = 0,
  rowTestId,
  onPressRow,
  onAutoFocusConsumed,
  onUpdateQuantity,
  onUpdatePrice,
  onSaveDefaultPrice,
  onRemoveItem
}: CartItemRowProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isCompactRow = screenWidth <= SMALL_SCREEN_WIDTH || screenHeight <= SMALL_SCREEN_HEIGHT;
  const [priceInput, setPriceInput] = useState(formatPriceInput(item.priceMinor));
  const [saving, setSaving] = useState(false);
  const priceEditedRef = useRef(false);
  const priceCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPriceRef = useRef<number | null>(null);
  const latestPriceRef = useRef(item.priceMinor);
  const priceInputRef = useRef<TextInput>(null);
  const autoFocusHandledRef = useRef(false);
  const shouldAnimate = mode === "SELL";
  const enterAnim = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
  const qtyScale = useRef(new Animated.Value(1)).current;
  const qtyHighlight = useRef(new Animated.Value(0)).current;
  const prevQtyRef = useRef(item.quantity);
  const isPurchaseMode = mode === "PURCHASE";
  const pricePlaceholder = isPurchaseMode ? "Enter purchase price" : "Enter sell price";
  const hasUnitPrice = Number.isFinite(item.priceMinor) && item.priceMinor > 0;
  const showPriceInput = isPurchaseMode || !hasUnitPrice;
  const unitPriceLabel = hasUnitPrice ? formatMoney(item.priceMinor, currency) : "";
  const showStock = mode === "SELL";
  const stockValue =
    typeof availableStock === "number" && Number.isFinite(availableStock)
      ? Math.max(0, Math.floor(availableStock))
      : null;
  const stockLabel = stockValue === null ? "Unknown" : String(stockValue);
  // GL-RJ-007: Check for price resolution errors
  const hasPriceError = item.priceResolutionError || (!hasUnitPrice && !isPurchaseMode);
  const priceErrorMessage = item.priceResolutionMessage || (hasPriceError && !hasUnitPrice ? "Price not set" : null);

  useEffect(() => {
    setPriceInput(formatPriceInput(item.priceMinor));
    priceEditedRef.current = false;
    latestPriceRef.current = item.priceMinor;
    if (priceCommitTimerRef.current) {
      clearTimeout(priceCommitTimerRef.current);
      priceCommitTimerRef.current = null;
    }
  }, [item.priceMinor]);

  useEffect(() => {
    if (!shouldAnimate) {
      enterAnim.setValue(1);
      return;
    }
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [enterAnim, shouldAnimate]);

  useEffect(() => {
    if (!shouldAnimate) {
      prevQtyRef.current = item.quantity;
      return;
    }
    if (prevQtyRef.current === item.quantity) return;
    prevQtyRef.current = item.quantity;
    qtyScale.setValue(1);
    Animated.sequence([
      Animated.timing(qtyScale, {
        toValue: 1.1,
        duration: 90,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(qtyScale, {
        toValue: 1,
        duration: 90,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [item.quantity, qtyScale, shouldAnimate]);

  useEffect(() => {
    if (!autoFocusPrice) {
      autoFocusHandledRef.current = false;
      return;
    }
    if (autoFocusHandledRef.current) return;
    autoFocusHandledRef.current = true;
    if (showPriceInput && canEdit) {
      requestAnimationFrame(() => {
        priceInputRef.current?.focus();
      });
    }
    onAutoFocusConsumed?.(item.id);
  }, [autoFocusPrice, canEdit, item.id, onAutoFocusConsumed, showPriceInput]);

  const lineSubtotal = item.priceMinor * item.quantity;
  // Apply item discount if present (fixed discount already stored in minor units)
  const itemDiscountAmount = item.itemDiscount
    ? item.itemDiscount.type === "percentage"
      ? Math.min(Math.round(lineSubtotal * (item.itemDiscount.value / 100)), lineSubtotal)
      : Math.min(Math.round(item.itemDiscount.value), lineSubtotal)
    : 0;
  const lineTotal = Math.max(0, lineSubtotal - itemDiscountAmount);
  const lineTotalLabel = formatMoney(lineTotal, currency);
  const hasItemDiscount = itemDiscountAmount > 0;
  const controlsDisabled = !canEdit || saving;
  const removeDisabled = controlsDisabled;
  const qtyHighlightBg = qtyHighlight.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", theme.colors.errorSoft],
  });

  const commitDefaultPrice = async (priceMinor: number) => {
    if (saving || lastSavedPriceRef.current === priceMinor) return;
    setSaving(true);
    const saved = await onSaveDefaultPrice(item, priceMinor);
    setSaving(false);
    if (saved) {
      lastSavedPriceRef.current = priceMinor;
    }
  };

  const handlePriceCommit = async () => {
    if (priceCommitTimerRef.current) {
      clearTimeout(priceCommitTimerRef.current);
      priceCommitTimerRef.current = null;
    }
    const parsed = parsePriceInput(priceInput);
    if (parsed === null) {
      setPriceInput(formatPriceInput(item.priceMinor));
      priceEditedRef.current = false;
      return;
    }
    if (parsed !== latestPriceRef.current) {
      onUpdatePrice(item.id, parsed);
    }
    if (priceEditedRef.current) {
      if (!isPurchaseMode) {
        await commitDefaultPrice(parsed);
      }
      priceEditedRef.current = false;
    }
  };

  const scheduleAutoSave = (value: string) => {
    if (!canEdit) return;
    if (priceCommitTimerRef.current) {
      clearTimeout(priceCommitTimerRef.current);
    }
    priceCommitTimerRef.current = setTimeout(() => {
      priceCommitTimerRef.current = null;
      const parsed = parsePriceInput(value);
      if (parsed === null) return;
      if (parsed !== latestPriceRef.current) {
        onUpdatePrice(item.id, parsed);
      }
      if (priceEditedRef.current) {
        if (!isPurchaseMode) {
          void commitDefaultPrice(parsed);
        }
        priceEditedRef.current = false;
      }
    }, PRICE_AUTO_SAVE_DELAY_MS);
  };

  const handlePriceChange = (value: string) => {
    priceEditedRef.current = true;
    setPriceInput(value);
    scheduleAutoSave(value);
  };

  useEffect(() => {
    return () => {
      if (priceCommitTimerRef.current) {
        clearTimeout(priceCommitTimerRef.current);
      }
    };
  }, []);

  const triggerStockHighlight = useCallback(() => {
    qtyHighlight.stopAnimation();
    qtyHighlight.setValue(1);
    Animated.timing(qtyHighlight, {
      toValue: 0,
      duration: 600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [qtyHighlight]);

  useEffect(() => {
    if (!stockLimitPulse) return;
    triggerStockHighlight();
  }, [stockLimitPulse, triggerStockHighlight]);

  const handleIncrement = () => {
    if (controlsDisabled) return;
    onUpdateQuantity(item.id, item.quantity + 1);
  };

  const rowStyle = {
    opacity: enterAnim,
    transform: [
      {
        translateY: enterAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0],
        }),
      },
    ],
  };

  const rowMinWidth = screenWidth;
  const enableRowPress = mode === "SELL" && typeof onPressRow === "function";

  const handleQtyDecrease = (event?: any) => {
    event?.stopPropagation?.();
    onUpdateQuantity(item.id, item.quantity - 1);
  };

  const handleQtyIncrease = (event?: any) => {
    event?.stopPropagation?.();
    handleIncrement();
  };

  const handleRemove = (event?: any) => {
    event?.stopPropagation?.();
    onRemoveItem(item.id);
  };

  // Determine discount badge
  const isFreeItem = item.itemDiscount?.type === "percentage" && item.itemDiscount?.value === 100;
  const discountBadgeText = isFreeItem
    ? "FREE"
    : item.itemDiscount?.type === "percentage"
      ? `${item.itemDiscount.value}% OFF`
      : item.itemDiscount?.type === "fixed" && item.itemDiscount.value > 0
        ? `₹${(item.itemDiscount.value / 100).toFixed(0)} OFF`
        : null;

  // Stock warning level
  const stockWarningLevel = stockValue === null ? "none" : stockValue <= 2 ? "critical" : stockValue <= 5 ? "low" : "none";

  const rowBody = (
    <Pressable
      style={[
        styles.cartItemRowContent,
        isCompactRow && styles.cartItemRowContentCompact,
        isFreeItem && styles.cartItemRowFree,
      ]}
      onPress={enableRowPress ? onPressRow : undefined}
      disabled={!enableRowPress}
      testID={rowTestId}
    >
      {/* Row 1: Product name + badges + delete button */}
      <View style={styles.cartItemNameRow}>
        <View style={styles.cartItemNameSection}>
          <Text style={[styles.cartItemName, isCompactRow && styles.cartItemNameCompact]} numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.3}>
            {item.name}
          </Text>
          {enableRowPress ? (
            <MaterialCommunityIcons
              name="pencil-outline"
              size={12}
              color={theme.colors.textTertiary}
              style={styles.editHintIcon}
            />
          ) : null}
          {discountBadgeText ? (
            <View style={[styles.discountBadge, isFreeItem && styles.discountBadgeFree]}>
              <Text style={[styles.discountBadgeText, isFreeItem && styles.discountBadgeTextFree]}>
                {discountBadgeText}
              </Text>
            </View>
          ) : null}
        </View>
        <Pressable
          style={[styles.removeItemButton, removeDisabled && styles.removeItemButtonDisabled]}
          onPress={handleRemove}
          disabled={removeDisabled}
          hitSlop={6}
          accessibilityLabel={`Remove ${item.name}`}
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={20}
            color={removeDisabled ? theme.colors.textTertiary : theme.colors.error}
          />
        </Pressable>
      </View>

      {/* Row 2: Unit price | Qty stepper | Line total */}
      <View style={styles.cartItemMainRow}>
        {/* Unit price */}
        <View style={styles.cartItemPriceBox}>
          {showPriceInput ? (
            <TextInput
              style={[styles.cartPriceInputCompact, !canEdit && styles.inputDisabled]}
              ref={priceInputRef}
              value={`₹${priceInput}`}
              onChangeText={(text) => handlePriceChange(text.replace(/₹/g, ""))}
              onEndEditing={handlePriceCommit}
              onTouchStart={(event) => event?.stopPropagation?.()}
              placeholder="₹0.00"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
              editable={canEdit}
            />
          ) : (
            <Text style={styles.cartItemPriceText} maxFontSizeMultiplier={1.2}>{unitPriceLabel}</Text>
          )}
        </View>

        {/* Qty stepper */}
        <Animated.View
          style={[
            styles.cartItemControls,
            { backgroundColor: qtyHighlightBg }
          ]}
        >
          <Pressable
            style={[styles.qtyButton, controlsDisabled && styles.qtyButtonDisabled]}
            onPress={handleQtyDecrease}
            disabled={controlsDisabled}
            hitSlop={8}
            accessibilityLabel={`Decrease ${item.name}`}
          >
            <MaterialCommunityIcons name="minus" size={18} color={controlsDisabled ? theme.colors.textTertiary : theme.colors.primary} />
          </Pressable>
          <Animated.Text style={[styles.qtyValue, { transform: [{ scale: qtyScale }] }]} maxFontSizeMultiplier={1.2}>
            {item.quantity}
          </Animated.Text>
          <Pressable
            style={[styles.qtyButton, controlsDisabled && styles.qtyButtonDisabled]}
            onPress={handleQtyIncrease}
            disabled={controlsDisabled}
            hitSlop={8}
            accessibilityLabel={`Increase ${item.name}`}
          >
            <MaterialCommunityIcons name="plus" size={18} color={controlsDisabled ? theme.colors.textTertiary : theme.colors.primary} />
          </Pressable>
        </Animated.View>

        {/* Line total - always visible */}
        <View style={styles.cartItemTotalBox}>
          {hasItemDiscount ? (
            <>
              <Text style={styles.cartItemOriginalPrice} maxFontSizeMultiplier={1.2}>
                {formatMoney(lineSubtotal, currency)}
              </Text>
              <Text style={[styles.cartItemDiscountedPrice, isFreeItem && styles.cartItemFreePrice]} maxFontSizeMultiplier={1.2}>
                {isFreeItem ? "FREE" : lineTotalLabel}
              </Text>
            </>
          ) : (
            <Text style={styles.cartItemTotalText} maxFontSizeMultiplier={1.2}>{lineTotalLabel}</Text>
          )}
        </View>
      </View>

      {/* Row 3: Stock info with warning colors */}
      {showStock ? (
        <View style={styles.stockRow}>
          <Text style={[
            styles.stockLabel,
            stockWarningLevel === "low" && styles.stockLabelWarning,
            stockWarningLevel === "critical" && styles.stockLabelCritical,
          ]}>
            {stockWarningLevel === "critical" ? "⚠ " : stockWarningLevel === "low" ? "● " : ""}
            In stock: {stockLabel}
          </Text>
        </View>
      ) : null}
      {/* GL-RJ-007: Price resolution error warning */}
      {hasPriceError && (
        <View style={styles.priceErrorRow}>
          <MaterialCommunityIcons name="alert" size={14} color={theme.colors.warning} />
          <Text style={styles.priceErrorText}>
            {priceErrorMessage || "Price lookup failed - enter price manually"}
          </Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <Animated.View style={[styles.cartItemRow, isCompactRow && styles.cartItemRowCompact, rowStyle]}>
      {rowBody}
    </Animated.View>
  );
}

export default function SellScanScreen({
  storeActive,
  scanDisabled,
  onOpenScanner,
  cartMode = "SELL",
  sellOnboardingRequest = null,
  onSellOnboardingClose,
  isScanningActive = false,
}: SellScanScreenProps) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isSmallScreen = screenWidth <= SMALL_SCREEN_WIDTH || screenHeight <= SMALL_SCREEN_HEIGHT;
  const insets = useSafeAreaInsets();
  const products = useProductsStore((state) => state.products);
  const loadProducts = useProductsStore((state) => state.loadProducts);
  const {
    items,
    total,
    subtotal,
    discount,
    discountTotal,
    mutationHistory,
    stockLimitEvent,
    undoLastAction,
    locked,
    autoUnlockIfExpired, // GL-CRIT-0011
    lastStockAdjustments, // GL-CRIT-0014
    clearLastStockAdjustments, // GL-CRIT-0014
    updateQuantity,
    updatePrice,
    updateItemDetails,
    removeItem,
    applyItemDiscount,
    removeItemDiscount,
    applyDiscount,
    removeDiscount,
    clearCart,
  } = useCartStore();

  // GL-CRIT-0011: Auto-unlock cart if lock has expired (e.g., app crashed during payment)
  useEffect(() => {
    autoUnlockIfExpired();
  }, [autoUnlockIfExpired]);

  // GL-CRIT-0014: Show notification when cart items are adjusted due to stock changes
  useEffect(() => {
    if (!lastStockAdjustments || lastStockAdjustments.length === 0) return;

    // Build user-friendly message
    const removed = lastStockAdjustments.filter(a => a.removed);
    const adjusted = lastStockAdjustments.filter(a => !a.removed);

    let message = "";
    if (removed.length > 0 && adjusted.length > 0) {
      message = `${removed.length} item(s) removed and ${adjusted.length} item(s) reduced due to stock changes.`;
    } else if (removed.length > 0) {
      message = removed.length === 1
        ? `"${removed[0].itemName}" removed from cart - out of stock.`
        : `${removed.length} items removed from cart - out of stock.`;
    } else if (adjusted.length > 0) {
      message = adjusted.length === 1
        ? `"${adjusted[0].itemName}" reduced to ${adjusted[0].newQty} (stock changed).`
        : `${adjusted.length} items had quantities reduced due to stock changes.`;
    }

    if (message) {
      showToast(message, "long");
    }

    // Clear after showing notification
    clearLastStockAdjustments();
  }, [lastStockAdjustments, clearLastStockAdjustments]);

  // GL-CRIT-0012: Check for corrupted offline sales on mount and set up notification callback
  useEffect(() => {
    // Check for existing corrupted sales
    void failedOutboxCount().then((count) => {
      if (count > 0) {
        Alert.alert(
          "Sync Issue Detected",
          `${count} offline sale(s) could not be synced due to data corruption. Please contact support if sales are missing from your reports.`,
          [
            { text: "Dismiss", style: "cancel" },
            {
              text: "Clear Failed Sales",
              style: "destructive",
              onPress: () => {
                void clearCorruptedEvents().then((cleared) => {
                  showToast(`Cleared ${cleared} failed sales`);
                });
              }
            }
          ]
        );
      }
    });

    // Set up callback for newly detected corrupted events
    setCorruptedEventsCallback((count) => {
      Alert.alert(
        "Sync Error",
        `${count} sale(s) could not sync due to data issues. The affected sales have been logged for review.`,
        [{ text: "OK" }]
      );
    });

    return () => {
      setCorruptedEventsCallback(null);
    };
  }, []);

  // GL-CRIT-0013: Start periodic stock cache refresh
  useEffect(() => {
    startStockAutoRefresh();
    return () => {
      stopStockAutoRefresh();
    };
  }, []);

  useEffect(() => {
    if (products.length === 0) {
      void loadProducts();
    }
  }, [loadProducts, products.length]);

  const resolveAvailableStock = useCallback((item: CartItem): number | null => {
    const rawStock = resolveStockForCartItem({ id: item.id, barcode: item.barcode ?? null });
    if (rawStock === null) return null;
    // Show remaining stock after cart reservation
    return Math.max(0, rawStock - item.quantity);
  }, []);

  const totalAnimatedValue = useRef(new Animated.Value(total)).current;
  const [animatedTotalMinor, setAnimatedTotalMinor] = useState(total);

  const [catalogItems, setCatalogItems] = useState<SkuItem[]>([]);
  const [catalogPage, setCatalogPage] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogHasMore, setCatalogHasMore] = useState(true);

  const [lastAddMessage, setLastAddMessage] = useState<string | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [flashActive, setFlashActive] = useState(false);

  const [addExpanded, setAddExpanded] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SkuItem[]>([]);
  const [addPage, setAddPage] = useState(0);
  const [addLoading, setAddLoading] = useState(false);
  const [addHasMore, setAddHasMore] = useState(true);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [stockRefreshTick, setStockRefreshTick] = useState(0);
  const [sellOnboardingPrice, setSellOnboardingPrice] = useState("");
  const [sellOnboardingPurchasePrice, setSellOnboardingPurchasePrice] = useState("");
  const [sellOnboardingStock, setSellOnboardingStock] = useState("0");
  const [sellOnboardingNameInput, setSellOnboardingNameInput] = useState("");
  const [sellOnboardingBusy, setSellOnboardingBusy] = useState(false);
  const [sellOnboardingError, setSellOnboardingError] = useState<string | null>(null);
  const [autoFocusItemId, setAutoFocusItemId] = useState<string | null>(null);
  const [stockLimitItemId, setStockLimitItemId] = useState<string | null>(null);
  const [stockLimitPulse, setStockLimitPulse] = useState(0);
  const [editorItem, setEditorItem] = useState<CartItem | null>(null);
  const [editorName, setEditorName] = useState("");
  const [editorQty, setEditorQty] = useState("");
  const [editorPrice, setEditorPrice] = useState("");
  const [editorPurchasePrice, setEditorPurchasePrice] = useState("");
  const [editorDiscountType, setEditorDiscountType] = useState<DiscountType>("percentage");
  const [editorDiscountValue, setEditorDiscountValue] = useState("");
  const [detailItem, setDetailItem] = useState<SkuItem | null>(null);
  const [editProductPrice, setEditProductPrice] = useState("");
  const [editProductStock, setEditProductStock] = useState("");
  const [editProductName, setEditProductName] = useState("");
  const [editProductBusy, setEditProductBusy] = useState(false);
  const [editProductError, setEditProductError] = useState<string | null>(null);

  // SD-CATEGORY: Category rail state (Demo Store only)
  const storeCode = useSettingsStore((s) => s.storeCode);
  const isDemoStore = storeCode === "DEMO001";
  const categoryBrowsingEnabled = useFeatureEnabled("category_browsing"); // CAT-005
  const voiceEnabled = useFeatureEnabled("voice"); // VOICE-009
  const showCategoryRail = isDemoStore && categoryBrowsingEnabled;
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categoryRailExpanded, setCategoryRailExpanded] = useState(false);
  const categoryAutoCollapseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CAT-004: API-driven categories for Demo Store
  const [apiCategories, setApiCategories] = useState<CategoryItem[]>([]);
  const [apiCategoriesLoading, setApiCategoriesLoading] = useState(false);
  const [categoryProducts, setCategoryProducts] = useState<CategoryProduct[]>([]);
  const [categoryProductsLoading, setCategoryProductsLoading] = useState(false);
  const [categoryProductsCursor, setCategoryProductsCursor] = useState<string | null>(null);
  const [categoryProductsHasMore, setCategoryProductsHasMore] = useState(true);

  // VOICE-001: Voice assistant state
  // T-135: Voice language locale state
  const [voiceLocale, setVoiceLocale] = useState<VoiceLocale>("EN");
  const [voiceButtonState, setVoiceButtonState] = useState<VoiceButtonState>("idle");
  const [voiceSheetState, setVoiceSheetState] = useState<VoiceSheetState>("hidden");
  const [voiceTranscript, setVoiceTranscript] = useState<string | undefined>();
  const [voiceMessage, setVoiceMessage] = useState<string | undefined>();
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | undefined>();
  // Voice recording mode: "none" = idle, "tap" = tap-to-record, "hold" = press-and-hold
  const [voiceRecordingMode, setVoiceRecordingMode] = useState<"none" | "tap" | "hold">("none");
  const [voiceRecordingDuration, setVoiceRecordingDuration] = useState(0);
  const voiceHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceDurationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetCategoryAutoCollapse = useCallback(() => {
    // GL-CRIT-0090: Auto-collapse disabled (CATEGORY_AUTO_COLLAPSE_MS = 0)
    if (!categoryRailExpanded || CATEGORY_AUTO_COLLAPSE_MS <= 0) return;
    if (categoryAutoCollapseRef.current) {
      clearTimeout(categoryAutoCollapseRef.current);
    }
    categoryAutoCollapseRef.current = setTimeout(() => {
      setCategoryRailExpanded(false);
    }, CATEGORY_AUTO_COLLAPSE_MS);
  }, [categoryRailExpanded]);

  useEffect(() => {
    if (!categoryRailExpanded) {
      if (categoryAutoCollapseRef.current) {
        clearTimeout(categoryAutoCollapseRef.current);
        categoryAutoCollapseRef.current = null;
      }
      return;
    }

    resetCategoryAutoCollapse();
    return () => {
      if (categoryAutoCollapseRef.current) {
        clearTimeout(categoryAutoCollapseRef.current);
        categoryAutoCollapseRef.current = null;
      }
    };
  }, [categoryRailExpanded, resetCategoryAutoCollapse]);

  // SD-CATEGORY: Back button collapses rail if expanded
  useEffect(() => {
    if (!showCategoryRail || !categoryRailExpanded) return;
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      setCategoryRailExpanded(false);
      return true; // Prevent default back behavior
    });
    return () => handler.remove();
  }, [showCategoryRail, categoryRailExpanded]);

  // CAT-004: Fetch FMCG categories on mount (Demo Store only)
  useEffect(() => {
    if (!showCategoryRail) return;

    let cancelled = false;
    const fetchCategories = async () => {
      setApiCategoriesLoading(true);
      try {
        const storeId = await getDeviceStoreId();
        if (!storeId || cancelled) return;

        const cats = await getFmcgCategories(storeId);
        if (!cancelled) {
          setApiCategories(cats.map(fmcgCategoryToItem));
        }
      } catch (error) {
        console.warn("[CAT-004] Failed to fetch categories:", error);
        // Fallback to DEMO_CATEGORIES handled by category dropdown
      } finally {
        if (!cancelled) {
          setApiCategoriesLoading(false);
        }
      }
    };

    void fetchCategories();
    return () => { cancelled = true; };
  }, [showCategoryRail]);

  // CAT-004: Fetch products by category when selected (Demo Store only)
  useEffect(() => {
    if (!showCategoryRail) return;
    if (selectedCategory === "all") {
      // "all" category - clear category products, use normal catalog
      setCategoryProducts([]);
      setCategoryProductsCursor(null);
      setCategoryProductsHasMore(true);
      return;
    }

    let cancelled = false;
    const fetchCategoryProducts = async () => {
      setCategoryProductsLoading(true);
      setCategoryProducts([]); // Reset on category change
      setCategoryProductsCursor(null);
      try {
        const storeId = await getDeviceStoreId();
        if (!storeId || cancelled) return;

        const response = await getCategoryProducts(storeId, selectedCategory, { limit: 50 });
        if (!cancelled) {
          setCategoryProducts(response.data);
          setCategoryProductsCursor(response.pagination.nextCursor);
          setCategoryProductsHasMore(response.pagination.hasMore);
        }
      } catch (error) {
        console.warn("[CAT-004] Failed to fetch category products:", error);
      } finally {
        if (!cancelled) {
          setCategoryProductsLoading(false);
        }
      }
    };

    void fetchCategoryProducts();
    return () => { cancelled = true; };
  }, [showCategoryRail, selectedCategory]);

  useEffect(() => {
    return subscribeStockUpdates(() => {
      setStockRefreshTick((prev) => prev + 1);
    });
  }, []);

  // R5: Catalog freshness check - detect dashboard edits and re-sync
  // POS-HEALTH-002: Removed continuous 30s polling - now only on screen enter + app resume
  const lastSyncedAtRef = useRef<string | null>(new Date().toISOString());
  useEffect(() => {
    let cancelled = false;

    const checkFreshness = async () => {
      if (cancelled) return;
      try {
        const resp = await sellSearchApi.checkCatalogFreshness(lastSyncedAtRef.current);
        if (cancelled) return;
        if (resp.stale) {
          console.log("[R5] Catalog stale, re-syncing from server");
          await syncProductsToOffline();
          if (resp.latestUpdatedAt) {
            lastSyncedAtRef.current = resp.latestUpdatedAt;
          }
          // RET-POS-SYNC-010: Also refresh productsStore so cached product list stays current
          useProductsStore.getState().loadProducts().catch(() => {});
          // Refresh stock snapshot after catalog re-sync
          refreshStockSnapshot();
        }
      } catch {
        // Freshness check failures are non-critical
      }
    };

    // POS-HEALTH-002: Check freshness once on screen mount (not continuously)
    checkFreshness();

    // RCAT-SYNC-001: Freshness check when app returns to foreground
    // POS-CART-002: Also refresh stock snapshot on every foreground return
    const handleAppState = (nextState: string) => {
      if (nextState === "active" && !cancelled) {
        checkFreshness();
        refreshStockSnapshot();
      }
    };
    const appStateSub = AppState.addEventListener("change", handleAppState);

    return () => {
      cancelled = true;
      appStateSub.remove();
    };
  }, []);

  const detailPressRef = useRef(false);
  const addMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceLogRef = useRef<Set<string>>(new Set());
  const sellOnboarding = sellOnboardingRequest ?? null;
  const sellOnboardingVisible = cartMode === "SELL" && Boolean(sellOnboarding);
  // DEV-070: Use editable name input, fallback to product data for display
  const rawOnboardingName =
    sellOnboarding?.product.store_display_name?.trim() ||
    sellOnboarding?.product.global_name?.trim() ||
    "";
  // Prefer search query over placeholder names like "Item 1234"
  const isOnboardingNamePlaceholder = !rawOnboardingName || /^Item\s+\S{1,8}$/i.test(rawOnboardingName);
  const onboardingSearchHint = addQuery.trim();
  const onboardingHintIsBarcode = /^\d{8,}$/.test(onboardingSearchHint);
  // R3: Default name = search query (if not barcode-like), otherwise blank
  // Do NOT prefill with barcode as the product name
  const sellOnboardingDefaultName =
    isOnboardingNamePlaceholder && onboardingSearchHint && !onboardingHintIsBarcode
      ? onboardingSearchHint
      : rawOnboardingName || "";
  const sellOnboardingName = sellOnboardingNameInput.trim() || sellOnboardingDefaultName;
  const sellOnboardingPriceMinor = parsePriceInput(sellOnboardingPrice);
  const sellOnboardingPurchaseProvided = sellOnboardingPurchasePrice.trim().length > 0;
  const sellOnboardingPurchaseMinor = parsePriceInput(sellOnboardingPurchasePrice);
  const sellOnboardingStockRaw = Number(sellOnboardingStock);
  const sellOnboardingStockParsed = Number.isFinite(sellOnboardingStockRaw)
    ? Math.round(sellOnboardingStockRaw)
    : NaN;
  const sellOnboardingStockValid =
    Number.isFinite(sellOnboardingStockParsed) && sellOnboardingStockParsed >= 0;
  const sellOnboardingPurchaseValid =
    !sellOnboardingPurchaseProvided || sellOnboardingPurchaseMinor !== null;
  const sellOnboardingFormValid =
    sellOnboardingPriceMinor !== null &&
    sellOnboardingStockValid &&
    sellOnboardingPurchaseValid;
  const addInputRef = useRef<TextInput>(null);
  const lastAddQueryRef = useRef<string | null>(null);
  const suppressAddBlurRef = useRef(false);
  const suppressAddBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addFocusedRef = useRef(false);
  // T-130: Search history state
  const [searchHistoryTerms, setSearchHistoryTerms] = useState<string[]>([]);
  const [searchHistoryVisible, setSearchHistoryVisible] = useState(false);

  // T-133: Bulk quantity selector state
  const [bulkQtyItem, setBulkQtyItem] = useState<SkuItem | null>(null);
  const [bulkQtyValue, setBulkQtyValue] = useState("");

  // T-136: Substitution suggestions state
  const [substitutes, setSubstitutes] = useState<Record<string, SubstituteProduct[]>>({});

  // T-137: Autocomplete suggestions state
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<SkuItem[]>([]);
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);

  // T-130: Search history handlers (defined early to avoid block-scoped variable ordering issues)
  const loadSearchHistory = useCallback(async () => {
    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) return;
      const terms = await searchHistory.getHistory(storeId);
      setSearchHistoryTerms(terms);
    } catch {
      // Non-critical
    }
  }, []);

  const handleSearchHistoryTap = useCallback((term: string) => {
    setAddQuery(term);
    setSearchHistoryVisible(false);
    if (!addExpanded) setAddExpanded(true);
  }, [addExpanded]);

  const handleClearSearchHistory = useCallback(async () => {
    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) return;
      await searchHistory.clearHistory(storeId);
      setSearchHistoryTerms([]);
    } catch {
      // Non-critical
    }
  }, []);

  const saveSearchTerm = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length < 2) return;
    // Skip barcode-like terms
    if (/^\d{8,}$/.test(trimmed)) return;
    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) return;
      await searchHistory.addTerm(storeId, trimmed);
    } catch {
      // Non-critical
    }
  }, []);

  // T-128: Manual barcode entry state
  const [manualBarcode, setManualBarcode] = useState("");
  // T-129: Search debounce ref
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addExpandedBeforeCartRef = useRef(false);
  const addFocusedBeforeCartRef = useRef(false);
  const cartOpeningRef = useRef(false);
  const discountApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetDragStartYRef = useRef(0);
  const sheetSnapRef = useRef<"collapsed" | "expanded">("collapsed");

  // Reset autoFocusItemId when leaving PURCHASE mode
  useEffect(() => {
    if (cartMode !== "PURCHASE" && autoFocusItemId) {
      setAutoFocusItemId(null);
    }
  }, [autoFocusItemId, cartMode]);

  // Initialize sell onboarding form when request changes
  useEffect(() => {
    if (!sellOnboarding) return;
    const existingPrice =
      typeof sellOnboarding.product.sell_price === "number" && sellOnboarding.product.sell_price > 0
        ? sellOnboarding.product.sell_price
        : null;
    const existingPurchase =
      typeof sellOnboarding.product.purchase_price === "number" &&
      sellOnboarding.product.purchase_price > 0
        ? sellOnboarding.product.purchase_price
        : null;
    // DEV-070: Initialize editable name from product data
    const existingName =
      sellOnboarding.product.store_display_name?.trim() ||
      sellOnboarding.product.global_name?.trim() ||
      "";
    // If the resolved name is a placeholder like "Item 1234", prefer the search query
    const isPlaceholderName = !existingName || /^Item\s+\S{1,8}$/i.test(existingName);
    const searchHint = addQuery.trim();
    const looksLikeBarcode = /^\d{8,}$/.test(searchHint);
    const nameToUse = isPlaceholderName && searchHint && !looksLikeBarcode
      ? searchHint
      : existingName;
    setSellOnboardingNameInput(nameToUse);
    setSellOnboardingPrice(formatPriceInput(existingPrice));
    setSellOnboardingPurchasePrice(formatPriceInput(existingPurchase));
    setSellOnboardingStock("0");
    setSellOnboardingError(null);
  }, [sellOnboarding]);

  const currency = items[0]?.currency ?? "INR";
  const totalLabel = formatMoney(animatedTotalMinor, currency);
  const subtotalLabel = formatMoney(subtotal, currency);
  const discountAmountLabel = formatMoney(Math.max(0, discountTotal ?? 0), currency);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueSkuCount = items.length;
  const cartTitle = cartMode === "PURCHASE" ? "Purchase Cart" : "Sell Cart";
  const canPay = itemCount > 0 && storeActive !== false && !locked;
  const canOpenCart = itemCount > 0;
  const canEditCart = storeActive !== false && !locked;
  const editorDisabled = !canEditCart;
  const parseDiscountInput = (value: string) => {
    const normalized = value.replace(/[^0-9.]/g, "");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
  };
  const formatFixedDiscount = (minor: number) => {
    const major = minor / 100;
    return Number.isInteger(major) ? String(major) : major.toFixed(2);
  };

  useEffect(() => {
    if (!editorItem) return;
    setEditorName(editorItem.name || "");
    setEditorQty(String(editorItem.quantity));
    setEditorPrice(formatPriceInput(editorItem.priceMinor));
    // Get purchase price from metadata if available
    const purchasePrice = editorItem.metadata?.purchasePriceMinor;
    setEditorPurchasePrice(purchasePrice ? formatPriceInput(purchasePrice) : "");
    if (editorItem.itemDiscount) {
      const discountType = editorItem.itemDiscount.type === "fixed" ? "fixed" : "percentage";
      const discountValue =
        discountType === "fixed"
          ? formatFixedDiscount(editorItem.itemDiscount.value)
          : String(editorItem.itemDiscount.value);
      setEditorDiscountType(discountType);
      setEditorDiscountValue(discountValue);
    } else {
      setEditorDiscountType("percentage");
      setEditorDiscountValue("");
    }
  }, [editorItem]);

  // "Keep scanning" only shows when camera/HID scanner is actively in use
  const cartHint = locked
    ? "Cart locked"
    : itemCount === 0
      ? "Ready"
      : isScanningActive
        ? "Keep scanning"
        : "Tap to review cart";

  const collapsedRatio = isSmallScreen ? CART_SHEET_COLLAPSED_RATIO_SMALL : CART_SHEET_COLLAPSED_RATIO;
  const collapsedHeight = Math.round(screenHeight * collapsedRatio);
  const expandedHeight = Math.round(screenHeight * CART_SHEET_EXPANDED_RATIO);
  const collapsedOffset = Math.max(0, expandedHeight - collapsedHeight);

  const snapSheetTo = useCallback(
    (target: "collapsed" | "expanded") => {
      const toValue = target === "expanded" ? 0 : collapsedOffset;
      sheetSnapRef.current = target;
      Animated.timing(sheetTranslateY, {
        toValue,
        duration: CART_SHEET_SNAP_DURATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    },
    [collapsedOffset, sheetTranslateY]
  );

  const handleSheetDragEnd = useCallback(
    (nextOffset: number, velocityY: number) => {
      if (collapsedOffset === 0) {
        snapSheetTo("expanded");
        return;
      }
      // Lower velocity threshold for easier gesture detection
      // Expand if: fast upward swipe OR dragged past 40% of collapse distance
      const shouldExpand =
        velocityY < -0.25 || nextOffset < collapsedOffset * 0.4;
      // Collapse if: fast downward swipe OR dragged past 60% of collapse distance
      const shouldCollapse =
        velocityY > 0.25 || nextOffset > collapsedOffset * 0.6;

      if (shouldExpand && !shouldCollapse) {
        snapSheetTo("expanded");
      } else if (shouldCollapse && !shouldExpand) {
        snapSheetTo("collapsed");
      } else {
        // Default: snap to nearest based on position
        snapSheetTo(nextOffset < collapsedOffset * 0.5 ? "expanded" : "collapsed");
      }
    },
    [collapsedOffset, snapSheetTo]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => {
          // Lower threshold for easier gesture capture
          const vertical = Math.abs(gesture.dy) > Math.abs(gesture.dx) * 0.8;
          return vertical && Math.abs(gesture.dy) > 2;
        },
        onPanResponderGrant: () => {
          sheetTranslateY.stopAnimation((value) => {
            sheetDragStartYRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const next = clamp(sheetDragStartYRef.current + gesture.dy, 0, collapsedOffset);
          sheetTranslateY.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          const next = clamp(sheetDragStartYRef.current + gesture.dy, 0, collapsedOffset);
          handleSheetDragEnd(next, gesture.vy);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: (_, gesture) => {
          const next = clamp(sheetDragStartYRef.current + gesture.dy, 0, collapsedOffset);
          handleSheetDragEnd(next, gesture.vy);
        },
      }),
    [collapsedOffset, handleSheetDragEnd, sheetTranslateY]
  );

  useEffect(() => {
    if (!cartExpanded) return;
    sheetTranslateY.stopAnimation();
    // Always start expanded so discount/total/checkout area is visible immediately
    // This fixes the issue on handheld POS devices (Sunmi V2, iMin Swift 2) where
    // the collapsed state hides the checkout button
    sheetTranslateY.setValue(0);
    sheetSnapRef.current = "expanded";
  }, [cartExpanded, sheetTranslateY]);

  // Auto-collapse cart when all items are removed
  useEffect(() => {
    if (cartExpanded && items.length === 0) {
      setCartExpanded(false);
    }
  }, [cartExpanded, items.length]);

  useEffect(() => {
    const id = totalAnimatedValue.addListener(({ value }) => {
      setAnimatedTotalMinor(Math.round(value));
    });
    return () => {
      totalAnimatedValue.removeListener(id);
    };
  }, [totalAnimatedValue]);

  useEffect(() => {
    totalAnimatedValue.stopAnimation();
    Animated.timing(totalAnimatedValue, {
      toValue: total,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [total, totalAnimatedValue]);

  const clearTimers = () => {
    if (addMessageTimerRef.current) {
      clearTimeout(addMessageTimerRef.current);
      addMessageTimerRef.current = null;
    }
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
  };

  const handleUndo = () => {
    clearTimers();
    setLastAddMessage(null);
    setUndoVisible(false);
    undoLastAction();
  };

  const closeSellOnboarding = useCallback(
    (force = false) => {
      if (sellOnboardingBusy && !force) return;
      setSellOnboardingError(null);
      setSellOnboardingNameInput("");
      setSellOnboardingPrice("");
      setSellOnboardingPurchasePrice("");
      setSellOnboardingStock("0");
      onSellOnboardingClose?.();
    },
    [onSellOnboardingClose, sellOnboardingBusy]
  );

  const handleSellOnboardingConfirm = useCallback(async () => {
    if (!sellOnboarding || sellOnboardingBusy) return;
    if (sellOnboardingPriceMinor === null || !sellOnboardingStockValid) {
      setSellOnboardingError("Enter a sell price and opening stock.");
      return;
    }
    if (sellOnboardingPurchaseProvided && sellOnboardingPurchaseMinor === null) {
      setSellOnboardingError("Enter a valid purchase price.");
      return;
    }

    setSellOnboardingBusy(true);
    setSellOnboardingError(null);
    try {
      await submitSellFirstOnboarding({
        barcode: sellOnboarding.barcode,
        format: sellOnboarding.format,
        sellPriceMinor: sellOnboardingPriceMinor,
        initialStock: sellOnboardingStockParsed,
        purchasePriceMinor: sellOnboardingPurchaseProvided
          ? (sellOnboardingPurchaseMinor as number)
          : undefined,
        name: sellOnboardingName
      });
      closeSellOnboarding(true);
      // R5: Refresh catalog in background after product creation so next scan/search finds it
      syncProductsToOffline().catch(() => {});
    } catch {
      setSellOnboardingError("Unable to receive product. Try again.");
    } finally {
      setSellOnboardingBusy(false);
    }
  }, [
    closeSellOnboarding,
    sellOnboarding,
    sellOnboardingBusy,
    sellOnboardingName,
    sellOnboardingPriceMinor,
    sellOnboardingPurchaseMinor,
    sellOnboardingPurchaseProvided,
    sellOnboardingStockParsed,
    sellOnboardingStockValid
  ]);

  const handleSellOnboardingPriceChange = useCallback(
    (value: string) => {
      setSellOnboardingPrice(value);
      if (sellOnboardingError) {
        setSellOnboardingError(null);
      }
    },
    [sellOnboardingError]
  );

  const handleSellOnboardingStockChange = useCallback(
    (value: string) => {
      setSellOnboardingStock(value);
      if (sellOnboardingError) {
        setSellOnboardingError(null);
      }
    },
    [sellOnboardingError]
  );

  const handleSellOnboardingPurchasePriceChange = useCallback(
    (value: string) => {
      setSellOnboardingPurchasePrice(value);
      if (sellOnboardingError) {
        setSellOnboardingError(null);
      }
    },
    [sellOnboardingError]
  );

  // DEV-070: Handler for editable product name
  const handleSellOnboardingNameChange = useCallback(
    (value: string) => {
      setSellOnboardingNameInput(value);
      if (sellOnboardingError) {
        setSellOnboardingError(null);
      }
    },
    [sellOnboardingError]
  );

  const handleAutoFocusConsumed = useCallback((itemId: string) => {
    setAutoFocusItemId((current) => (current === itemId ? null : current));
  }, []);

  const focusAddInput = () => {
    requestAnimationFrame(() => addInputRef.current?.focus());
  };

  const markAddInteraction = useCallback((durationMs = 400) => {
    suppressAddBlurRef.current = true;
    if (suppressAddBlurTimerRef.current) {
      clearTimeout(suppressAddBlurTimerRef.current);
    }
    suppressAddBlurTimerRef.current = setTimeout(() => {
      suppressAddBlurRef.current = false;
      suppressAddBlurTimerRef.current = null;
    }, durationMs);
  }, []);

  const openAddExpanded = () => {
    if (storeActive === false) return;
    setAddExpanded(true);
  };

  const handleAddQueryChange = (value: string) => {
    if (!scanDisabled) {
      feedHidText(value);
    }
    setAddQuery(value);
    // T-130: Hide search history when typing
    if (value.trim()) {
      setSearchHistoryVisible(false);
    } else {
      setSearchHistoryVisible(true);
      loadSearchHistory();
    }
    if (!addExpanded) {
      setAddExpanded(true);
    }
  };

  // POS-PRICE-003: Gate debug logging behind __DEV__ to prevent spam in production
  const logPriceDebug = useCallback((item: SkuItem, resolved: productsApi.PriceResolution) => {
    if (!__DEV__) return; // Skip in production
    const productId = item.productId ?? item.barcode;
    const key = `${productId}:${resolved.priceMinor}:${resolved.inventoryPrice ?? "null"}:${resolved.variantPrice ?? "null"}:${resolved.mrp ?? "null"}`;
    if (priceLogRef.current.has(key)) return;
    priceLogRef.current.add(key);
    console.log(
      `[PRICE_DEBUG] ${productId} ${resolved.priceMinor} ${resolved.inventoryPrice ?? "null"}:${resolved.variantPrice ?? "null"}:${resolved.mrp ?? "null"}`
    );
  }, []);

  const handleSaveDefaultPrice = useCallback(async (item: CartItem, priceMinor: number): Promise<boolean> => {
    const metadata = item.metadata ?? {};
    const globalProductId =
      typeof metadata.globalProductId === "string" ? metadata.globalProductId : undefined;
    const scanFormat = typeof metadata.scanFormat === "string" ? metadata.scanFormat : undefined;
    const barcode = typeof item.barcode === "string" ? item.barcode : undefined;
    const scanned = !globalProductId ? barcode : undefined;

    if (!globalProductId && !scanned) {
      console.warn("Missing product identifier for store price update", { itemId: item.id });
      return false;
    }

    try {
      const result = await productsApi.updateStoreProductPrice({
        globalProductId,
        scanned,
        format: scanFormat,
        sellPriceMinor: priceMinor
      });
      // RCAT-SYNC-001: Use server-confirmed values to update local caches
      if (result) {
        const confirmedPrice = result.sellPrice ?? priceMinor;
        if (barcode) {
          await setLocalPrice(barcode, confirmedPrice);
        }
        // Update stock cache with server-confirmed stock
        const stockEntries: Array<{ key: string; stock: number }> = [];
        if (result.productId) stockEntries.push({ key: result.productId, stock: result.currentStock });
        if (barcode) stockEntries.push({ key: barcode, stock: result.currentStock });
        if (stockEntries.length > 0) upsertStockEntries(stockEntries);
        // Advance sync timestamp so freshness check knows we're current
        if (result.updatedAt) lastSyncedAtRef.current = result.updatedAt;
      } else if (barcode) {
        await setLocalPrice(barcode, priceMinor);
      }
      const logSku = item.sku ?? barcode ?? item.id;
      console.log(`sell_price_saved_default:${logSku}`);
      return true;
    } catch (error) {
      console.warn("Failed to save store price", error);
      return false;
    }
  }, []);

  // T-128: Manual barcode entry fallback handler
  const handleManualBarcodeSubmit = useCallback(() => {
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    void onBarcodeScanned(trimmed, undefined, "keyboard");
    setManualBarcode("");
  }, [manualBarcode]);

  const handleScanSubmit = (event?: { nativeEvent: { text: string } }) => {
    const raw = event?.nativeEvent?.text ?? addQuery;
    const trimmed = raw.trim();
    if (!trimmed) return;
    // SD-CATEGORY: Auto-collapse rail on scan
    setCategoryRailExpanded(false);
    // T-130: Save search term to history
    void saveSearchTerm(trimmed);
    setSearchHistoryVisible(false);
    void onBarcodeScanned(trimmed, undefined, "keyboard");
    setAddQuery("");
    setAddExpanded(true);
    focusAddInput();
  };

  const handleCameraPress = () => {
    if (scanDisabled) return;
    markAddInteraction(1000);
    onOpenScanner();
  };

  const handleAddKeyPress = (event: { nativeEvent: { key: string } }) => {
    if (scanDisabled) return;
    const scanValue = feedHidKey(event.nativeEvent.key);
    if (scanValue) {
      setAddQuery("");
      setAddExpanded(true);
      focusAddInput();
    }
  };

  const handleAddSubmitEditing = (event?: { nativeEvent: { text: string } }) => {
    if (!scanDisabled) {
      const scanValue = submitHidBuffer();
      if (scanValue || wasHidCommitRecent()) {
        setAddQuery("");
        setAddExpanded(true);
        focusAddInput();
        return;
      }
    }
    handleScanSubmit(event);
  };

  const loadCatalog = useCallback(async (reset: boolean) => {
    if (catalogLoading) return;
    if (!catalogHasMore && !reset) return;
    // GO-LIVE-170: Prevent infinite pagination loops
    if (!reset && catalogPage >= MAX_PAGINATION_PAGE) {
      console.warn(`[GO-LIVE-170] Catalog pagination hit limit (${MAX_PAGINATION_PAGE})`);
      return;
    }

    const page = reset ? 0 : catalogPage;
    const offset = page * PAGE_SIZE;

    setCatalogLoading(true);
    if (reset) {
      setCatalogItems([]);
    }

    const params: Array<string | number> = [PAGE_SIZE, offset];
    const sql = `
      SELECT
        p.product_id as productId,
        p.barcode as barcode,
        p.name as name,
        p.currency as currency,
        pr.price_minor as inventoryPriceMinor,
        NULL as variantPriceMinor,
        NULL as variantMrpMinor,
        p.current_stock as currentStock
      FROM offline_products p
      LEFT JOIN offline_prices pr ON pr.barcode = p.barcode
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.name ASC
      LIMIT ? OFFSET ?
    `;

    try {
      let rows = await offlineDb.all<SkuItem>(sql, params);
      if (reset && rows.length === 0) {
        // DB empty - sync blocking before showing UI
        const remote = await syncProductsToOffline();
        if (remote.length > 0) {
          rows = await offlineDb.all<SkuItem>(sql, params);
        }
      } else if (reset && rows.length > 0) {
        // DB has data - show immediately, sync in background for freshness
        syncProductsToOffline().then(async () => {
          const fresh = await offlineDb.all<SkuItem>(sql, params);
          if (fresh.length > 0) {
            setCatalogItems(fresh);
          }
        }).catch(() => {});
      }
      setCatalogItems((prev) => mergeSkuItems(reset ? [] : prev, rows));
      setCatalogHasMore(rows.length === PAGE_SIZE);
      setCatalogPage(page + 1);
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogHasMore, catalogLoading, catalogPage]);

  const loadAddResults = useCallback(async (reset: boolean) => {
    if (addLoading) return;
    if (!addHasMore && !reset) return;
    // GO-LIVE-170: Prevent infinite pagination loops
    if (!reset && addPage >= MAX_PAGINATION_PAGE) {
      console.warn(`[GO-LIVE-170] Add results pagination hit limit (${MAX_PAGINATION_PAGE})`);
      return;
    }

    const query = addQuery.trim().toLowerCase();
    const page = reset ? 0 : addPage;
    const offset = page * PAGE_SIZE;

    setAddLoading(true);

    const params: Array<string | number> = [];
    let sql = `
      SELECT
        p.product_id as productId,
        p.barcode as barcode,
        p.name as name,
        p.currency as currency,
        pr.price_minor as inventoryPriceMinor,
        NULL as variantPriceMinor,
        NULL as variantMrpMinor,
        p.current_stock as currentStock
      FROM offline_products p
      LEFT JOIN offline_prices pr ON pr.barcode = p.barcode
    `;

    if (query.length > 0) {
      // Tokenize: split by whitespace, match any token against name or barcode (OR)
      const tokens = query.split(/\s+/).filter(t => t.length >= 1);
      if (tokens.length > 0) {
        const tokenClauses = tokens.map(token => {
          const like = `%${token}%`;
          params.push(like, like);
          return "(lower(p.name) LIKE ? OR lower(p.barcode) LIKE ?)";
        });
        sql += ` WHERE (${tokenClauses.join(" OR ")})`;
      }
    }

    sql += " ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.name ASC LIMIT ? OFFSET ?";
    params.push(PAGE_SIZE, offset);

    try {
      let rows = await offlineDb.all<SkuItem>(sql, params);
      if (reset && rows.length === 0 && query.length >= 2) {
        // P1: No local results - fetch from server (handles dashboard-only products)
        const remote = await syncProductsToOffline(query);
        if (remote.length > 0) {
          // Re-query local DB (products with barcodes get stored locally)
          rows = await offlineDb.all<SkuItem>(sql, params);
          // Fallback: if local DB still empty (products without barcodes), use remote results directly
          if (rows.length === 0) {
            rows = remote;
          }
        }
      } else if (reset && query.length >= 2) {
        // Background sync for freshness: pick up dashboard edits without blocking UI (R5)
        syncProductsToOffline(query).then(async () => {
          try {
            const fresh = await offlineDb.all<SkuItem>(sql, params);
            if (fresh.length > 0) {
              setAddResults(fresh);
            }
          } catch {}
        }).catch(() => {});
      }
      setAddResults((prev) => mergeSkuItems(reset ? [] : prev, rows));
      setAddHasMore(rows.length === PAGE_SIZE);
      setAddPage(page + 1);
    } finally {
      setAddLoading(false);
    }
  }, [addHasMore, addLoading, addPage, addQuery]);

  const initialLoadRef = useRef(false);
  const addQueryNormalized = addQuery.trim().toLowerCase();

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    setCatalogHasMore(true);
    setCatalogPage(0);
    void loadCatalog(true);
  }, [loadCatalog]);

  useEffect(() => {
    if (!addExpanded) return;
    if (lastAddQueryRef.current === addQueryNormalized) return;
    lastAddQueryRef.current = addQueryNormalized;
    const timer = setTimeout(() => {
      setAddHasMore(true);
      setAddPage(0);
      void loadAddResults(true);
      // T-130: Save search term after debounce
      if (addQueryNormalized.length >= 2) {
        void saveSearchTerm(addQueryNormalized);
      }
    }, 300); // T-129: 300ms search debounce (was 200ms)

    return () => clearTimeout(timer);
  }, [addExpanded, addQueryNormalized, loadAddResults]);

  useEffect(() => {
    if (!addExpanded) return;
    focusAddInput();
  }, [addExpanded]);

  useEffect(() => {
    if (!cartExpanded) return;
    if (discount) {
      setDiscountType(discount.type);
      setDiscountValue(
        discount.type === "fixed" ? formatFixedDiscount(discount.value) : String(discount.value)
      );
    } else {
      setDiscountType("percentage");
      setDiscountValue("");
    }
  }, [cartExpanded, discount]);

  useEffect(() => {
    if (cartExpanded) {
      cartOpeningRef.current = false;
    }
  }, [cartExpanded]);

  useEffect(() => {
    if (!cartExpanded) return;
    if (cartMode !== "SELL") return;
    void refreshStockSnapshot();
  }, [cartExpanded, cartMode]);

  useEffect(() => {
    if (!stockLimitEvent) return;
    const message =
      stockLimitEvent.reason === "out_of_stock"
        ? "Out of stock"
        : stockLimitEvent.reason === "unknown_stock"
          ? "Stock unavailable. Sync required."
          : `Only ${stockLimitEvent.availableStock} in stock`;
    showToast(message);
    if (stockLimitEvent.itemId) {
      setStockLimitItemId(stockLimitEvent.itemId);
      setStockLimitPulse((prev) => prev + 1);
      // DEV-063: Close editor if stock limit hit on edited item so user sees highlight
      if (editorItem && editorItem.id === stockLimitEvent.itemId) {
        setEditorItem(null);
      }
    }
  }, [stockLimitEvent, editorItem]);

    useEffect(() => {
      const lastMutation = mutationHistory[mutationHistory.length - 1];
      if (!lastMutation || lastMutation.type !== "UPSERT_ITEM") return;

      const currentItem = items.find((item) => item.id === lastMutation.itemId);
      if (!currentItem) return;

    const previousQty = lastMutation.previousItem?.quantity ?? 0;
      if (!lastMutation.previousItem && cartMode === "PURCHASE") {
        const needsPrice = !Number.isFinite(currentItem.priceMinor) || currentItem.priceMinor <= 0;
        if (needsPrice) {
          setAutoFocusItemId(currentItem.id);
        }
      }
    if (currentItem.quantity <= previousQty) return;

    const variantLabel =
      (currentItem.metadata?.variantName as string | undefined)
      ?? (currentItem.metadata?.variant as string | undefined)
      ?? currentItem.sku
      ?? "";
    const variantSuffix = variantLabel ? ` ${variantLabel}` : "";

    clearTimers();
    setLastAddMessage(`Added ${currentItem.name}${variantSuffix}`);
    setUndoVisible(true);
    setFlashActive(true);

    flashTimerRef.current = setTimeout(() => setFlashActive(false), 260);
    addMessageTimerRef.current = setTimeout(() => setLastAddMessage(null), 2000);
    undoTimerRef.current = setTimeout(() => setUndoVisible(false), 3000);
  }, [cartMode, items, mutationHistory]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (suppressAddBlurTimerRef.current) {
        clearTimeout(suppressAddBlurTimerRef.current);
      }
    };
  }, []);

  const collapseAddExpanded = useCallback((blurInput: boolean) => {
    suppressAddBlurRef.current = false;
    setAddExpanded(false);
    if (blurInput) {
      addInputRef.current?.blur();
    }
  }, []);

  const handleOpenCart = () => {
    if (!canOpenCart) return;
    addExpandedBeforeCartRef.current = addExpanded;
    addFocusedBeforeCartRef.current = addFocusedRef.current;
    cartOpeningRef.current = true;
    setCartExpanded(true);
    // SD-CATEGORY: Auto-collapse rail when cart opens
    setCategoryRailExpanded(false);
  };

  const closeCart = () => {
    setCartExpanded(false);
    const shouldRestoreSearch = addExpandedBeforeCartRef.current;
    setAddExpanded(shouldRestoreSearch);
    if (shouldRestoreSearch && addFocusedBeforeCartRef.current) {
      focusAddInput();
    }
  };

  const handleRemoveItem = (itemId: string) => {
    if (!canEditCart) return;
    removeItem(itemId);
  };

  const openEditor = useCallback(
    (item: CartItem) => {
      if (cartMode !== "SELL") return;
      if (!canEditCart) return;
      setEditorItem(item);
    },
    [canEditCart, cartMode]
  );

  const closeEditor = useCallback(() => {
    setEditorItem(null);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailItem(null);
    setEditProductPrice("");
    setEditProductStock("");
    setEditProductName("");
    setEditProductBusy(false);
    setEditProductError(null);
  }, []);

  // Populate edit form when detailItem opens
  useEffect(() => {
    if (!detailItem) return;
    const resolved = resolveSkuPrice(detailItem);
    setEditProductName(detailItem.name || "");
    setEditProductPrice(formatPriceInput(resolved.priceMinor));
    const stockVal = resolveStockForSku(detailItem) ?? detailItem.currentStock ?? 0;
    setEditProductStock(String(stockVal));
    setEditProductError(null);
  }, [detailItem]);

  const handleEditProductSave = useCallback(async () => {
    if (!detailItem || editProductBusy) return;

    const priceVal = parsePriceInput(editProductPrice);
    const stockVal = parseInt(editProductStock, 10);
    const trimmedName = editProductName.trim();

    if (!trimmedName) {
      setEditProductError("Product name cannot be empty");
      return;
    }
    if (priceVal === null || priceVal <= 0) {
      setEditProductError("Enter a valid sell price");
      return;
    }
    if (!Number.isFinite(stockVal) || stockVal < 0) {
      setEditProductError("Enter a valid stock quantity");
      return;
    }

    setEditProductBusy(true);
    setEditProductError(null);
    try {
      // RCAT-SYNC-001: Unified sync for name + price to backend (last-write-wins)
      // AUD-025-B: Send current timestamp for LWW conflict resolution
      const nameChanged = trimmedName !== (detailItem.name || "");
      const hasIdentifier = detailItem.storeProductId || detailItem.productId || detailItem.barcode;
      if (hasIdentifier) {
        const metaResult = await productsApi.updateStoreProductMetadata({
          storeProductId: detailItem.storeProductId ?? undefined,
          productId: detailItem.productId ?? undefined,
          barcode: detailItem.barcode ?? undefined,
          displayName: nameChanged ? trimmedName : undefined,
          sellPrice: priceVal,
          metadataUpdatedAt: new Date().toISOString(), // AUD-025-B: LWW timestamp
        });
        // RCAT-SYNC-001: Use server-confirmed price for local cache
        if (metaResult) {
          const confirmedPrice = metaResult.sellPrice ?? priceVal;
          if (detailItem.barcode) setLocalPrice(detailItem.barcode, confirmedPrice);
          if (metaResult.updatedAt) lastSyncedAtRef.current = metaResult.updatedAt;
        } else if (detailItem.barcode) {
          setLocalPrice(detailItem.barcode, priceVal);
        }
      } else if (detailItem.barcode) {
        setLocalPrice(detailItem.barcode, priceVal);
      }
      // Update stock - use server-confirmed value for cache
      const stockResult = await productsApi.updateStoreProductStock({
        productId: detailItem.productId ?? undefined,
        barcode: detailItem.barcode ?? undefined,
        stock: stockVal,
      });
      const confirmedStock = stockResult?.stock ?? stockVal;
      const stockUpdates: Array<{ key: string; stock: number }> = [];
      if (stockResult?.productId) stockUpdates.push({ key: stockResult.productId, stock: confirmedStock });
      else if (detailItem.productId) stockUpdates.push({ key: detailItem.productId, stock: confirmedStock });
      if (detailItem.barcode) stockUpdates.push({ key: detailItem.barcode, stock: confirmedStock });
      if (stockUpdates.length > 0) upsertStockEntries(stockUpdates);
      // SYNC-PRD-001: Refresh local product lists so updated name shows immediately
      if (nameChanged) {
        const updateName = (items: SkuItem[]) =>
          items.map(i =>
            (i.storeProductId === detailItem.storeProductId || i.barcode === detailItem.barcode)
              ? { ...i, name: trimmedName }
              : i
          );
        setCatalogItems(updateName);
        setAddResults(updateName);
        if (detailItem.barcode) {
          void upsertLocalProduct(detailItem.barcode, trimmedName, "INR", null, detailItem.productId ?? null, null, detailItem.storeProductId ?? null);
        }
      }
      closeDetail();
      showToast("Product updated");
    } catch (e: any) {
      console.error("[SellScanScreen] Product edit failed:", e);
      // RET-POS-SYNC-009: Handle 409 conflict (server has newer data from Dashboard)
      if (e?.status === 409) {
        setEditProductError("Product was updated elsewhere. Close and reopen to see latest values.");
      } else {
        setEditProductError("Update failed. Try again.");
      }
    } finally {
      setEditProductBusy(false);
    }
  }, [detailItem, editProductBusy, editProductPrice, editProductStock, editProductName, closeDetail]);

  const handleEditorRemove = useCallback(() => {
    if (!editorItem) return;
    removeItem(editorItem.id);
    closeEditor();
  }, [closeEditor, editorItem, removeItem]);

  const handleEditorSave = useCallback(() => {
    if (!editorItem) return;
    const nextQty = parseQuantityInput(editorQty);

    // DEV-063: Let cartStore handle stock enforcement uniformly
    // Stock cap check happens in updateQuantity via capRequestedQuantity
    // This triggers stockLimitEvent which shows unified toast + red highlight
    updateQuantity(editorItem.id, nextQty);

    // Update sell price (local cart + local DB)
    const parsedSellPrice = parsePriceInput(editorPrice);
    const sellPriceChanged = parsedSellPrice !== null && parsedSellPrice > 0 && parsedSellPrice !== editorItem.priceMinor;
    if (parsedSellPrice !== null && parsedSellPrice > 0) {
      updatePrice(editorItem.id, parsedSellPrice);
      if (editorItem.barcode) {
        void setLocalPrice(editorItem.barcode, parsedSellPrice);
      }
    }

    // Update name and purchase price in metadata (local cart)
    const parsedPurchasePrice = parsePriceInput(editorPurchasePrice);
    const trimmedName = editorName.trim();
    const nameChanged = trimmedName && trimmedName !== editorItem.name;
    const purchasePriceChanged = parsedPurchasePrice !== null && parsedPurchasePrice > 0;

    if (nameChanged || purchasePriceChanged) {
      updateItemDetails(editorItem.id, {
        name: nameChanged ? trimmedName : undefined,
        metadata: purchasePriceChanged ? { purchasePriceMinor: parsedPurchasePrice } : undefined
      });

      // Update catalog grid so name shows immediately
      if (nameChanged && editorItem.barcode) {
        const updateName = (items: SkuItem[]) =>
          items.map(i => i.barcode === editorItem.barcode ? { ...i, name: trimmedName } : i);
        setCatalogItems(updateName);
        setAddResults(updateName);
        void upsertLocalProduct(editorItem.barcode, trimmedName, "INR", null, editorItem.metadata?.productId ?? null, null, (editorItem.metadata?.storeProductId as string) ?? null);
      }
    }

    // RCAT-SYNC-001: Unified backend sync for ALL changed fields (last-write-wins)
    // Uses storeProductId > productId > barcode fallback for identification
    if (nameChanged || purchasePriceChanged || sellPriceChanged) {
      const storeProductId = editorItem.metadata?.storeProductId as string | undefined;
      const productId = editorItem.metadata?.productId as string | undefined;
      const barcode = editorItem.barcode;

      if (storeProductId || productId || barcode) {
        productsApi.updateStoreProductMetadata({
          storeProductId: storeProductId || undefined,
          productId: productId || undefined,
          barcode: barcode || undefined,
          displayName: nameChanged ? trimmedName : undefined,
          purchasePrice: purchasePriceChanged ? parsedPurchasePrice : undefined,
          sellPrice: sellPriceChanged ? parsedSellPrice! : undefined,
          metadataUpdatedAt: new Date().toISOString(), // AUD-025-B: LWW timestamp
        }).then((result) => {
          // RCAT-SYNC-001: Update local caches with server-confirmed values
          if (result) {
            if (barcode && result.sellPrice) setLocalPrice(barcode, result.sellPrice);
            if (result.updatedAt) lastSyncedAtRef.current = result.updatedAt;
          }
        }).catch((err: any) => {
          // RET-POS-SYNC-009: Log sync failures for debugging (non-blocking for cart UX)
          console.warn("[SellScanScreen] Cart editor sync failed:", err?.status, err?.message || err);
        });
      }
    }

    // Log to ledger for accounting/tracking
    console.log(`ledger_item_edit:${editorItem.id},qty=${nextQty},sellPrice=${parsedSellPrice ?? editorItem.priceMinor},purchasePrice=${parsedPurchasePrice ?? 0},name=${trimmedName || editorItem.name}`);

    const parsedDiscount = parseDiscountInput(editorDiscountValue);
    if (parsedDiscount <= 0) {
      removeItemDiscount(editorItem.id);
    } else {
      // Validate percentage discount doesn't exceed 100%
      if (editorDiscountType === "percentage" && parsedDiscount > 100) {
        showToast("Discount cannot exceed 100%");
        return;
      }
      const value = editorDiscountType === "fixed" ? Math.round(parsedDiscount * 100) : parsedDiscount;
      applyItemDiscount(editorItem.id, { type: editorDiscountType, value });
    }

    closeEditor();
  }, [
    applyItemDiscount,
    closeEditor,
    editorDiscountType,
    editorDiscountValue,
    editorItem,
    editorName,
    editorPrice,
    editorPurchasePrice,
    editorQty,
    removeItemDiscount,
    updateItemDetails,
    updatePrice,
    updateQuantity
  ]);

  const handleMakeFree = useCallback(() => {
    // Toggle FREE state - if already free (100% percentage), clear it
    if (editorDiscountType === "percentage" && editorDiscountValue === "100") {
      setEditorDiscountValue("");
    } else {
      // Set 100% discount to make item free (stock still deducted on checkout)
      setEditorDiscountType("percentage");
      setEditorDiscountValue("100");
    }
  }, [editorDiscountType, editorDiscountValue]);

  const editorTotalLabel = useMemo(() => {
    if (!editorItem) return "";
    const qty = parseQuantityInput(editorQty);
    const priceMinor = parsePriceInput(editorPrice) ?? editorItem.priceMinor ?? 0;
    const lineSubtotal = priceMinor * qty;
    const parsedDiscount = parseDiscountInput(editorDiscountValue);
    let discountMinor = 0;
    if (parsedDiscount > 0) {
      if (editorDiscountType === "fixed") {
        discountMinor = Math.min(Math.round(parsedDiscount * 100), lineSubtotal);
      } else {
        discountMinor = Math.min(Math.round(lineSubtotal * (parsedDiscount / 100)), lineSubtotal);
      }
    }
    const lineTotal = Math.max(0, lineSubtotal - discountMinor);
    return formatMoney(lineTotal, editorItem.currency ?? "INR");
  }, [editorDiscountType, editorDiscountValue, editorItem, editorPrice, editorQty]);

  const editorMaxStock = useMemo(() => {
    if (!editorItem) return null;
    return resolveStockForCartItem({
      id: editorItem.id,
      barcode: editorItem.barcode ?? null
    });
  }, [editorItem, stockRefreshTick]);

  const editorStockLabel = useMemo(() => {
    if (editorMaxStock === null) return "Unknown";
    return String(editorMaxStock);
  }, [editorMaxStock]);

  const editorQtyExceedsStock = useMemo(() => {
    if (editorMaxStock === null) return false;
    const qty = parseQuantityInput(editorQty);
    return qty > editorMaxStock;
  }, [editorMaxStock, editorQty]);

  const editorDiscountExceeds100 = useMemo(() => {
    if (editorDiscountType !== "percentage") return false;
    const parsed = parseDiscountInput(editorDiscountValue);
    return parsed > 100;
  }, [editorDiscountType, editorDiscountValue]);

  const scheduleDiscountApply = useCallback(
    (value: string, type: DiscountType) => {
      if (!canEditCart) return;
      if (discountApplyTimerRef.current) {
        clearTimeout(discountApplyTimerRef.current);
      }
      discountApplyTimerRef.current = setTimeout(() => {
        discountApplyTimerRef.current = null;
        const parsed = parseDiscountInput(value);
        const nextValue = type === "fixed" ? Math.round(parsed * 100) : parsed;
        if (nextValue <= 0) {
          if (discount) {
            removeDiscount();
          }
          return;
        }
        applyDiscount({ type, value: nextValue });
      }, DISCOUNT_AUTO_APPLY_DELAY_MS);
    },
    [applyDiscount, canEditCart, discount, removeDiscount]
  );

  const handleDiscountValueChange = (value: string) => {
    setDiscountValue(value);
    if (!value.trim()) {
      if (discountApplyTimerRef.current) {
        clearTimeout(discountApplyTimerRef.current);
        discountApplyTimerRef.current = null;
      }
      if (discount) {
        removeDiscount();
      }
      return;
    }
    scheduleDiscountApply(value, discountType);
  };
  
  useEffect(() => {
    return () => {
      if (discountApplyTimerRef.current) {
        clearTimeout(discountApplyTimerRef.current);
      }
    };
  }, []);

  const handleAddSku = (item: SkuItem) => {
    if (storeActive === false) return;
    // SD-CATEGORY: Auto-collapse rail when product tapped
    setCategoryRailExpanded(false);
    const resolved = resolveSkuPrice(item);

    // Get fresh cart state to avoid stale data
    const cartState = useCartStore.getState();
    const cartItems = cartState.items || [];

    // Check for existing item by barcode (handles HID scan items with different id)
    const existing = cartItems.find((entry) => entry.barcode === item.barcode);

    if (existing) {
      // Item already in cart - increase quantity instead of adding duplicate
      console.log(`handleAddSku:duplicate_found:${item.barcode},existingId=${existing.id},qty=${existing.quantity}+1`);
      cartState.updateQuantity(existing.id, existing.quantity + 1);
      showToast(`${existing.name} qty +1`);
    } else {
      // New item - add to cart (store identifiers in metadata for sync)
      console.log(`handleAddSku:new_item:${item.barcode}`);
      // GL-RJ-007: Detect price resolution failures
      const priceResolutionFailed = resolved.priceMinor === 0 ||
        (resolved.inventoryPrice === null && resolved.variantPrice === null && resolved.mrp === null);
      cartState.addItem({
        id: item.barcode,
        name: item.name,
        priceMinor: resolved.priceMinor,
        currency: item.currency ?? "INR",
        barcode: item.barcode,
        metadata: {
          storeProductId: item.storeProductId || undefined,
          productId: item.productId || undefined,
        },
        // GL-RJ-007: Set price resolution error flag if no price found
        priceResolutionError: priceResolutionFailed,
        priceResolutionMessage: priceResolutionFailed ? "Price not found - enter manually" : undefined,
      });

      // GL-WF-020: Show alert when price resolution fails
      if (priceResolutionFailed) {
        Alert.alert(
          "Price Not Found",
          `No price found for "${item.name}". Please enter the price manually before checkout.`,
          [{ text: "OK", style: "default" }]
        );
      }
    }

    setCatalogItems((prev) => [item, ...prev.filter((entry) => entry.barcode !== item.barcode)]);

    const now = new Date().toISOString();
    void offlineDb.run(
      "UPDATE offline_products SET updated_at = ? WHERE barcode = ?",
      [now, item.barcode]
    );
  };

  const handleAddFromSearch = (item: SkuItem) => {
    handleAddSku(item);
    setAddQuery("");
    setAddExpanded(true);
    focusAddInput();
  };

  const renderSkuItem = ({ item }: { item: SkuItem }) => {
    const resolved = resolveSkuPrice(item);
    logPriceDebug(item, resolved);
    const priceLabel = formatMoney(resolved.priceMinor, item.currency ?? "INR");
    const stockValue = resolveStockForSku(item) ?? (typeof item.currentStock === "number" ? item.currentStock : null);
    const stockLabel = stockValue === null ? "Unknown" : String(stockValue);

    return (
      <Pressable
        style={[styles.skuCard, storeActive === false && styles.skuCardDisabled]}
        onPressIn={() => {
          detailPressRef.current = false;
        }}
        onLongPress={() => {
          detailPressRef.current = true;
          setDetailItem(item);
        }}
        delayLongPress={250}
        onPress={() => {
          if (detailPressRef.current) {
            detailPressRef.current = false;
            return;
          }
          handleAddSku(item);
        }}
        disabled={storeActive === false}
      >
        {/* T-134: Product image */}
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.skuCardImage} />
        ) : (
          <View style={styles.skuCardImageFallback}>
            <MaterialCommunityIcons name="package-variant" size={20} color={theme.colors.textTertiary} />
          </View>
        )}
        <View style={styles.skuCardTop}>
          <MaterialCommunityIcons name="barcode" size={16} color={theme.colors.textSecondary} />
          <View style={styles.pricePill}>
            <Text style={styles.priceText}>{priceLabel}</Text>
          </View>
        </View>
        <Text style={styles.skuName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.skuBarcode} numberOfLines={1}>
          {item.barcode}
        </Text>
        <Text style={styles.skuStock} numberOfLines={1}>
          Stock: {stockLabel}
        </Text>
      </Pressable>
    );
  };

  const renderFeaturedSkuCard = (item: SkuItem) => {
    const resolved = resolveSkuPrice(item);
    logPriceDebug(item, resolved);
    const priceLabel = formatMoney(resolved.priceMinor, item.currency ?? "INR");

    return (
      <Pressable
        style={[styles.skuCardFirstRow, storeActive === false && styles.skuCardDisabled]}
        onPressIn={() => {
          detailPressRef.current = false;
        }}
        onLongPress={() => {
          detailPressRef.current = true;
          setDetailItem(item);
        }}
        delayLongPress={250}
        onPress={() => {
          if (detailPressRef.current) {
            detailPressRef.current = false;
            return;
          }
          handleAddSku(item);
        }}
        disabled={storeActive === false}
      >
        <Text style={styles.skuName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.pricePill}>
          <Text style={styles.priceText}>{priceLabel}</Text>
        </View>
      </Pressable>
    );
  };

  const renderCategoryPill = () => (
    <Pressable
      style={styles.categoryPillCard}
      onPress={() => setCategoryRailExpanded(true)}
      accessibilityLabel="Expand categories"
    >
      <View style={styles.categoryPillIconWrap}>
        <MaterialCommunityIcons name="view-grid" size={22} color={theme.colors.textInverse} />
      </View>
      <MaterialCommunityIcons name="chevron-down" size={18} color={theme.colors.textSecondary} />
    </Pressable>
  );

  const renderAddRow = ({ item }: { item: SkuItem }) => {
    const resolved = resolveSkuPrice(item);
    logPriceDebug(item, resolved);
    const priceLabel = formatMoney(resolved.priceMinor, item.currency ?? "INR");
    const stockValue = resolveStockForSku(item) ?? (typeof item.currentStock === "number" ? item.currentStock : null);
    const stockLabel = stockValue === null ? "Unknown" : String(stockValue);
    const isOutOfStock = stockValue !== null && stockValue <= 0;
    const productId = item.productId ?? "";

    // T-136: Fetch substitutes if out of stock
    if (isOutOfStock && productId && !substitutes[productId]) {
      void fetchSubstitutes(productId);
    }

    const productSubstitutes = isOutOfStock && productId ? (substitutes[productId] ?? []) : [];

    return (
      <View>
        <Pressable
          style={styles.addRow}
          onPressIn={() => {
            detailPressRef.current = false;
            markAddInteraction();
          }}
          onLongPress={() => {
            // T-133: Long press opens bulk quantity selector
            detailPressRef.current = true;
            handleBulkQtyOpen(item);
          }}
          delayLongPress={250}
          onPress={() => {
            if (detailPressRef.current) {
              detailPressRef.current = false;
              return;
            }
            handleAddFromSearch(item);
          }}
          accessibilityLabel={`Add ${item.name}`}
        >
          {/* T-134: Product image in search results */}
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.addRowImage} />
          ) : (
            <View style={styles.addRowImageFallback}>
              <MaterialCommunityIcons name="package-variant" size={16} color={theme.colors.textTertiary} />
            </View>
          )}
          <View style={styles.addRowInfo}>
            <Text style={styles.addRowName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.addRowMeta} numberOfLines={1}>
              {item.barcode}
            </Text>
          </View>
          <View style={styles.addRowRight}>
            <Text style={styles.addRowPrice}>{priceLabel}</Text>
            <Text style={[styles.addRowStock, isOutOfStock && styles.addRowStockOut]}>
              {isOutOfStock ? "Out of stock" : `Stock: ${stockLabel}`}
            </Text>
          </View>
        </Pressable>

        {/* T-136: Substitution suggestions for out-of-stock items */}
        {productSubstitutes.length > 0 && (
          <View style={styles.substituteSection}>
            <Text style={styles.substituteLabel}>Try instead:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {productSubstitutes.map((sub) => (
                <Pressable
                  key={sub.productId}
                  style={styles.substituteCard}
                  onPress={() => handleAddSubstitute(sub)}
                >
                  <Text style={styles.substituteCardName} numberOfLines={1}>{sub.name}</Text>
                  <Text style={styles.substituteCardPrice}>
                    {formatMoney(sub.sellPrice, "INR")}
                  </Text>
                  <Text style={styles.substituteCardStock}>Stock: {sub.currentStock}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  const renderCartItem = ({ item }: { item: CartItem }) => {
    const rowKey = (item.sku ?? item.barcode ?? item.id).replace(/\s+/g, "-");
    const rowTestId = cartMode === "SELL" ? `sell-lineitem-row-${rowKey}` : undefined;
    return (
      <CartItemRow
        item={item}
        currency={item.currency ?? currency}
        mode={cartMode}
        availableStock={resolveAvailableStock(item)}
        canEdit={canEditCart}
        autoFocusPrice={item.id === autoFocusItemId}
        stockLimitPulse={stockLimitItemId === item.id ? stockLimitPulse : 0}
        rowTestId={rowTestId}
        onPressRow={cartMode === "SELL" ? () => openEditor(item) : undefined}
        onAutoFocusConsumed={handleAutoFocusConsumed}
        onUpdateQuantity={updateQuantity}
        onUpdatePrice={updatePrice}
        onSaveDefaultPrice={handleSaveDefaultPrice}
        onRemoveItem={handleRemoveItem}
      />
    );
  };
  const renderSearchBar = (variant: "collapsed" | "expanded") => (
    <View
      style={[
        styles.searchBar,
        variant === "expanded" && styles.searchBarExpanded,
        storeActive === false && styles.searchBarDisabled,
      ]}
    >
      <View
        style={[
          styles.searchSegment,
          variant === "expanded" && styles.searchSegmentExpanded,
        ]}
      >
        <MaterialCommunityIcons name="magnify" size={18} color="#000000" />
        <TextInput
          ref={addInputRef}
          style={styles.searchInput}
          value={addQuery}
          onChangeText={handleAddQueryChange}
          onFocus={() => {
            addFocusedRef.current = true;
            openAddExpanded();
            // T-130: Show search history when focused and empty
            if (!addQuery.trim()) {
              setSearchHistoryVisible(true);
              loadSearchHistory();
            }
          }}
          onBlur={() => {
            addFocusedRef.current = false;
            if (cartExpanded || cartOpeningRef.current) {
              return;
            }
            if (suppressAddBlurRef.current) {
              suppressAddBlurRef.current = false;
              focusAddInput();
              return;
            }
            if (!addQuery.trim()) {
              setAddExpanded(false);
            }
          }}
          onKeyPress={handleAddKeyPress}
          onSubmitEditing={handleAddSubmitEditing}
          placeholder={t('sell.searchProducts')}
          placeholderTextColor="#000000"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          blurOnSubmit={false}
          editable={storeActive !== false}
        />
        {addQuery ? (
          <Pressable
            onPressIn={() => markAddInteraction()}
            onPress={() => setAddQuery("")}
            hitSlop={8}
            accessibilityLabel="Clear search"
          >
            <MaterialCommunityIcons
              name="close-circle"
              size={18}
              color="#000000"
            />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        style={[
          styles.scanSegment,
          variant === "expanded" && styles.scanSegmentExpanded,
          scanDisabled && styles.ctaDisabled,
        ]}
        onPressIn={() => markAddInteraction(1000)}
        onPress={handleCameraPress}
        disabled={scanDisabled}
        accessibilityLabel="Open camera scanner"
      >
        <MaterialCommunityIcons name="camera" size={18} color={theme.colors.textInverse} />
        {variant === "collapsed" ? (
          <Text style={styles.scanSegmentText} numberOfLines={1}>
            {t('sell.scanProduct')}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );

  const showCategoryPill = showCategoryRail && !addExpanded && !categoryRailExpanded;
  const displayCategories = apiCategories.length > 0 ? apiCategories : DEMO_CATEGORIES;
  const featuredSku =
    showCategoryPill && selectedCategory === "all" && catalogItems.length > 0
      ? catalogItems[0]
      : null;
  const gridItems = featuredSku ? catalogItems.slice(1) : catalogItems;

  const catalogHeader = showCategoryPill ? (
    <View style={styles.firstRowWithPill}>
      {renderCategoryPill()}
      {featuredSku ? renderFeaturedSkuCard(featuredSku) : null}
    </View>
  ) : null;

  const searchHeader = (
    <View style={styles.searchHeader}>
      {renderSearchBar(addExpanded ? "expanded" : "collapsed")}
      {/* T-128: Manual barcode entry fallback */}
      {!addExpanded && (
        <View style={styles.manualBarcodeRow}>
          <MaterialCommunityIcons
            name="barcode-scan"
            size={18}
            color={theme.colors.textTertiary}
          />
          <TextInput
            style={styles.manualBarcodeInput}
            value={manualBarcode}
            onChangeText={setManualBarcode}
            placeholder="Enter barcode manually"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="numeric"
            returnKeyType="done"
            onSubmitEditing={handleManualBarcodeSubmit}
            editable={storeActive !== false}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {manualBarcode.length > 0 && (
            <Pressable
              onPress={handleManualBarcodeSubmit}
              hitSlop={8}
              style={styles.manualBarcodeSubmit}
              accessibilityLabel="Submit barcode"
            >
              <MaterialCommunityIcons
                name="arrow-right-circle"
                size={22}
                color={theme.colors.primary}
              />
            </Pressable>
          )}
        </View>
      )}
      {/* T-137: Autocomplete suggestions dropdown */}
      {autocompleteVisible && addExpanded && addQuery.trim().length >= 2 && (
        <View style={styles.autocompleteDropdown}>
          <FlatList
            data={autocompleteSuggestions}
            keyExtractor={(item) => item.barcode}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.autocompleteSuggestion}
                onPress={() => handleAutocompleteTap(item)}
              >
                <Text style={styles.autocompleteName} numberOfLines={1}>{item.name}</Text>
                {item.barcode ? (
                  <Text style={styles.autocompleteBarcode} numberOfLines={1}>{item.barcode}</Text>
                ) : null}
              </Pressable>
            )}
          />
        </View>
      )}

      {/* T-130: Search history chips */}
      {addExpanded && searchHistoryVisible && !addQuery.trim() && searchHistoryTerms.length > 0 && (
        <View style={styles.searchHistoryRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.searchHistoryScroll}
          >
            {searchHistoryTerms.map((term) => (
              <Pressable
                key={term}
                style={styles.searchHistoryChip}
                onPress={() => handleSearchHistoryTap(term)}
              >
                <MaterialCommunityIcons name="history" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.searchHistoryChipText} numberOfLines={1}>{term}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.searchHistoryClear}
              onPress={handleClearSearchHistory}
            >
              <Text style={styles.searchHistoryClearText}>Clear</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      <View
        style={[styles.searchPanel, !addExpanded && styles.searchPanelCollapsed]}
        pointerEvents={addExpanded ? "auto" : "none"}
        onTouchStart={() => markAddInteraction()}
      >
        <Text style={styles.searchPanelTitle}>
          {addQuery.trim() ? t('sell.searchResults') : t('sell.recentProducts')}
        </Text>
        <FlatList
          data={addResults}
          keyExtractor={(item) => item.barcode}
          renderItem={renderAddRow}
          extraData={stockRefreshTick}
          style={styles.searchPanelList}
          contentContainerStyle={styles.searchPanelListContent}
          ListEmptyComponent={
            !addLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {addQuery.trim() ? t('common.noResults') : t('sell.noRecentProducts')}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            addLoading ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (!addLoading && addHasMore) {
              void loadAddResults(false);
            }
          }}
          onEndReachedThreshold={0.3}
          removeClippedSubviews
          windowSize={7}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        />
      </View>
    </View>
  );

  const handleCheckout = () => {
    if (!canPay) return;
    setCartExpanded(false);
    navigation.navigate("Payment");
  };

  // VOICE-001: Voice recording helpers
  const startVoiceRecording = useCallback(async (mode: "tap" | "hold") => {
    setVoiceButtonState("recording");
    setVoiceRecordingMode(mode);
    setVoiceRecordingDuration(0);
    setVoiceTranscript(undefined);
    setVoiceMessage(undefined);
    setVoiceErrorMessage(undefined);

    const started = await startRecording();
    if (!started) {
      setVoiceButtonState("idle");
      setVoiceRecordingMode("none");
      return false;
    }

    // Start duration timer
    voiceDurationIntervalRef.current = setInterval(() => {
      setVoiceRecordingDuration((prev) => prev + 1);
    }, 1000);

    return true;
  }, []);

  const stopAndSubmitVoice = useCallback(async () => {
    // Clear timers
    if (voiceHoldTimerRef.current) {
      clearTimeout(voiceHoldTimerRef.current);
      voiceHoldTimerRef.current = null;
    }
    if (voiceDurationIntervalRef.current) {
      clearInterval(voiceDurationIntervalRef.current);
      voiceDurationIntervalRef.current = null;
    }

    if (voiceButtonState !== "recording") return;

    setVoiceButtonState("processing");
    setVoiceRecordingMode("none");
    setVoiceSheetState("processing");

    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) {
        throw new Error("Store not configured");
      }

      const result = await submitVoiceCommand(storeId);
      setVoiceTranscript(result.transcript);

      if (result.success) {
        setVoiceMessage(result.message);
        setVoiceSheetState("success");
      } else {
        setVoiceErrorMessage(result.message);
        setVoiceSheetState("error");
      }
    } catch (error) {
      console.error("[VOICE-001] Voice command failed:", error);
      setVoiceErrorMessage(
        error instanceof Error ? error.message : "Voice command failed"
      );
      setVoiceSheetState("error");
    } finally {
      setVoiceButtonState("idle");
      setVoiceRecordingDuration(0);
    }
  }, [voiceButtonState]);

  const cancelVoiceRecording = useCallback(async () => {
    // Clear timers
    if (voiceHoldTimerRef.current) {
      clearTimeout(voiceHoldTimerRef.current);
      voiceHoldTimerRef.current = null;
    }
    if (voiceDurationIntervalRef.current) {
      clearInterval(voiceDurationIntervalRef.current);
      voiceDurationIntervalRef.current = null;
    }

    await cancelRecording();
    setVoiceButtonState("idle");
    setVoiceRecordingMode("none");
    setVoiceRecordingDuration(0);
    setVoiceSheetState("hidden");
  }, []);

  // VOICE-001: Voice button handlers
  const handleVoicePressIn = useCallback(async () => {
    if (voiceButtonState === "processing") return;

    // If already recording in tap mode, this press will be handled by onPress
    if (voiceRecordingMode === "tap") return;

    // Start a timer to detect hold vs tap
    voiceHoldTimerRef.current = setTimeout(async () => {
      // This is a hold - start recording in hold mode
      await startVoiceRecording("hold");
    }, 200); // 200ms threshold for hold detection
  }, [voiceButtonState, voiceRecordingMode, startVoiceRecording]);

  const handleVoicePressOut = useCallback(async () => {
    // Clear hold timer if still pending
    if (voiceHoldTimerRef.current) {
      clearTimeout(voiceHoldTimerRef.current);
      voiceHoldTimerRef.current = null;
    }

    // If in hold mode and recording, stop and submit
    if (voiceRecordingMode === "hold" && voiceButtonState === "recording") {
      await stopAndSubmitVoice();
    }
  }, [voiceRecordingMode, voiceButtonState, stopAndSubmitVoice]);

  const handleVoiceTap = useCallback(async () => {
    if (voiceButtonState === "processing") return;

    // Clear hold timer
    if (voiceHoldTimerRef.current) {
      clearTimeout(voiceHoldTimerRef.current);
      voiceHoldTimerRef.current = null;
    }

    if (voiceRecordingMode === "none" && voiceButtonState === "idle") {
      // Start recording in tap mode
      await startVoiceRecording("tap");
    } else if (voiceRecordingMode === "tap" && voiceButtonState === "recording") {
      // Stop and submit in tap mode
      await stopAndSubmitVoice();
    }
  }, [voiceButtonState, voiceRecordingMode, startVoiceRecording, stopAndSubmitVoice]);

  const handleVoiceSheetDismiss = useCallback(() => {
    setVoiceSheetState("hidden");
    setVoiceTranscript(undefined);
    setVoiceMessage(undefined);
    setVoiceErrorMessage(undefined);
    // Cancel any in-progress recording
    if (voiceButtonState === "recording") {
      void cancelVoiceRecording();
    }
  }, [voiceButtonState, cancelVoiceRecording]);

  // T-136: Fetch substitutes for out-of-stock products
  const fetchSubstitutes = useCallback(async (productId: string) => {
    if (!productId || substitutes[productId]) return;
    try {
      const subs = await productsApi.fetchProductSubstitutes(productId);
      setSubstitutes((prev) => ({ ...prev, [productId]: subs }));
    } catch {
      // Non-critical
    }
  }, [substitutes]);

  // T-136: Add substitute to cart
  const handleAddSubstitute = useCallback((sub: SubstituteProduct) => {
    const cartState = useCartStore.getState();
    const existing = cartState.items.find((item) => item.id === sub.productId);
    if (existing) {
      cartState.updateQuantity(existing.id, existing.quantity + 1);
      showToast(`${existing.name} qty +1`);
    } else {
      cartState.addItem({
        id: sub.productId,
        name: sub.name,
        priceMinor: sub.sellPrice,
        currency: "INR",
        barcode: sub.barcode,
      });
    }
  }, []);

  // T-137: Update autocomplete on query change
  useEffect(() => {
    if (!addExpanded || !addQuery.trim() || addQuery.trim().length < 2) {
      setAutocompleteSuggestions([]);
      setAutocompleteVisible(false);
      return;
    }
    // Show autocomplete when addResults have loaded
    const suggestions = addResults.slice(0, 5);
    setAutocompleteSuggestions(suggestions);
    setAutocompleteVisible(suggestions.length > 0);
  }, [addExpanded, addQuery, addResults]);

  const handleAutocompleteTap = useCallback((item: SkuItem) => {
    setAddQuery(item.name);
    setAutocompleteVisible(false);
    // Trigger search
    setAddHasMore(true);
    setAddPage(0);
    void loadAddResults(true);
  }, [loadAddResults]);

  // T-133: Bulk quantity selector handlers
  const handleBulkQtyOpen = useCallback((item: SkuItem) => {
    setBulkQtyItem(item);
    setBulkQtyValue("1");
  }, []);

  const handleBulkQtyConfirm = useCallback(() => {
    if (!bulkQtyItem) return;
    const qty = parseInt(bulkQtyValue, 10);
    if (!Number.isFinite(qty) || qty <= 0) return;

    const stockValue = resolveStockForSku(bulkQtyItem) ?? (typeof bulkQtyItem.currentStock === "number" ? bulkQtyItem.currentStock : null);
    if (stockValue !== null && qty > stockValue) {
      showToast(`Only ${stockValue} in stock`);
      return;
    }

    const resolved = resolveSkuPrice(bulkQtyItem);
    const cartState = useCartStore.getState();
    const existing = cartState.items.find((entry) => entry.barcode === bulkQtyItem.barcode);

    if (existing) {
      cartState.updateQuantity(existing.id, existing.quantity + qty);
    } else {
      const priceResolutionFailed = resolved.priceMinor === 0;
      cartState.addItem({
        id: bulkQtyItem.barcode,
        name: bulkQtyItem.name,
        priceMinor: resolved.priceMinor,
        currency: bulkQtyItem.currency ?? "INR",
        barcode: bulkQtyItem.barcode,
        quantity: qty,
        metadata: {
          storeProductId: bulkQtyItem.storeProductId || undefined,
          productId: bulkQtyItem.productId || undefined,
        },
        priceResolutionError: priceResolutionFailed,
        priceResolutionMessage: priceResolutionFailed ? "Price not found - enter manually" : undefined,
      });
    }

    setBulkQtyItem(null);
    setBulkQtyValue("");
  }, [bulkQtyItem, bulkQtyValue]);

  const handleBulkQtyClose = useCallback(() => {
    setBulkQtyItem(null);
    setBulkQtyValue("");
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (voiceHoldTimerRef.current) clearTimeout(voiceHoldTimerRef.current);
      if (voiceDurationIntervalRef.current) clearInterval(voiceDurationIntervalRef.current);
      // T-129: Cleanup search debounce timer on unmount
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  return (
    <View style={styles.container}>
      {searchHeader}
      {addExpanded ? (
        <Pressable
          style={styles.searchDismissOverlay}
          onPress={() => collapseAddExpanded(true)}
          accessibilityLabel="Close search"
        />
      ) : null}

      {/* SD-CATEGORY: Main content area with optional category rail */}
      <View style={styles.mainContentRow}>
        {showCategoryRail && !addExpanded && categoryRailExpanded ? (
          <View style={styles.categoryRailWrap} onTouchStart={resetCategoryAutoCollapse}>
            <CategoryRail
              selectedCategory={selectedCategory}
              onSelectCategory={(categoryId) => {
                setSelectedCategory(categoryId);
                resetCategoryAutoCollapse();
              }}
              expanded={categoryRailExpanded}
              compact
              onToggleExpanded={() => setCategoryRailExpanded(false)}
              onCollapse={() => setCategoryRailExpanded(false)}
              categories={apiCategories.length > 0 ? apiCategories : undefined}
              loading={apiCategoriesLoading}
            />
          </View>
        ) : null}

        {/* Product Grid */}
        <View style={styles.productGridContainer}>
          {/* Category filter label (Demo Store only) */}
          {showCategoryRail && selectedCategory !== "all" && (
            <View style={styles.categoryFilterLabel}>
              <Text style={styles.categoryFilterText}>
                Category: {displayCategories.find((c) => c.id === selectedCategory)?.label ?? selectedCategory}
              </Text>
              <Pressable
                onPress={() => setSelectedCategory("all")}
                hitSlop={8}
                accessibilityLabel="Clear category filter"
              >
                <MaterialCommunityIcons name="close-circle" size={16} color={theme.colors.textTertiary} />
              </Pressable>
            </View>
          )}
          <FlatList
            data={gridItems}
            keyExtractor={(item) => item.barcode}
            renderItem={renderSkuItem}
            extraData={stockRefreshTick}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={styles.skuRow}
            ListHeaderComponent={catalogHeader}
            ListEmptyComponent={
              !catalogLoading && gridItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>{t('sell.noRecentProducts')}</Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              catalogLoading ? (
                <View style={styles.footerLoading}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              ) : null
            }
            onTouchStart={resetCategoryAutoCollapse}
            onScrollBeginDrag={resetCategoryAutoCollapse}
            onEndReached={() => {
              if (!catalogLoading && catalogHasMore) {
                void loadCatalog(false);
              }
            }}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          removeClippedSubviews
          windowSize={7}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
        />
        </View>
      </View>

      {itemCount > 0 ? (
        <Pressable
          style={[
            styles.cartBar,
            flashActive && styles.cartBarFlash,
          ]}
          onPress={handleOpenCart}
          accessibilityLabel="View cart"
        >
          <View style={styles.cartBarLeft}>
            <View style={styles.cartBarIconWrap}>
              <MaterialCommunityIcons name="cart" size={20} color={theme.colors.surface} />
              <View style={styles.cartBarBadge}>
                <Text style={styles.cartBarBadgeText}>{itemCount}</Text>
              </View>
            </View>
          </View>
          <View style={styles.cartBarCenter}>
            <View style={styles.cartBarTop}>
              <Text style={styles.cartBarCount}>
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </Text>
              {locked ? (
                <View style={styles.cartBarLocked}>
                  <LabelText style={styles.cartBarLockedText}>{t("sell.cartLocked", "Locked")}</LabelText>
                </View>
              ) : null}
            </View>
            <View style={styles.cartBarBottom}>
              <Text style={styles.cartBarHint} numberOfLines={1}>
                {lastAddMessage ?? cartHint}
              </Text>
              {undoVisible && !locked ? (
                <Pressable onPress={handleUndo} hitSlop={8}>
                  <ButtonText style={styles.cartBarUndo}>{t("common.undo", "Undo")}</ButtonText>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={styles.cartBarRight}>
            <PriceText style={styles.cartBarTotal}>{totalLabel}</PriceText>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.primary} />
          </View>
        </Pressable>
      ) : null}

      <Modal
        visible={cartExpanded}
        transparent
        animationType="slide"
        onRequestClose={closeCart}
      >
        <View style={styles.cartOverlay}>
          <Pressable style={styles.cartOverlayTap} onPress={closeCart} />
          <Animated.View
            style={[
              styles.cartSheet,
              isSmallScreen && styles.cartSheetCompact,
              {
                height: expandedHeight,
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <View style={styles.cartHandleWrap} {...panResponder.panHandlers}>
              <View style={styles.cartHandle} />
            </View>
            <View style={[styles.cartHeader, isSmallScreen && styles.cartHeaderCompact]}>
              <View style={styles.cartHeaderLeft}>
                <Pressable
                  style={styles.backButton}
                  onPress={closeCart}
                  hitSlop={12}
                  accessibilityLabel="Back to scan"
                >
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={22}
                    color={theme.colors.primary}
                  />
                </Pressable>
                <View style={styles.cartTitleWrap}>
                  <Text style={[styles.cartTitle, isSmallScreen && styles.cartTitleCompact]}>{cartTitle}</Text>
                </View>
              </View>
              {items.length > 0 ? (
                <Pressable
                  style={styles.clearCartButton}
                  onPress={() => {
                    // GO-LIVE-249: Confirmation with undo option
                    Alert.alert(
                      t("sell.clearCartTitle", "Clear Cart"),
                      t("sell.clearCartConfirm", "Are you sure you want to remove all items?"),
                      [
                        { text: t("common.cancel", "Cancel"), style: "cancel" },
                        {
                          text: t("common.clear", "Clear"),
                          style: "destructive",
                          onPress: () => {
                            clearCart();
                            // Show undo toast/alert
                            Alert.alert(
                              t("sell.cartCleared", "Cart Cleared"),
                              t("sell.cartClearedUndo", "All items have been removed."),
                              [
                                { text: t("common.ok", "OK") },
                                {
                                  text: t("common.undo", "Undo"),
                                  onPress: () => undoLastAction(),
                                },
                              ]
                            );
                          },
                        },
                      ]
                    );
                  }}
                  hitSlop={8}
                  accessibilityLabel={t("sell.clearCart", "Clear cart")}
                >
                  <ButtonText style={styles.clearCartText}>{t("common.clear", "Clear")}</ButtonText>
                </Pressable>
              ) : null}
            </View>

            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={renderCartItem}
              style={styles.cartList}
              contentContainerStyle={styles.cartListContent}
              nestedScrollEnabled
              ListFooterComponent={
                items.length ? <View style={[styles.cartListFooterSpacer, isSmallScreen && styles.cartListFooterSpacerCompact]} /> : null
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <AppText style={styles.emptyText}>{t("sell.cartEmpty", "Cart empty")}</AppText>
                </View>
              }
              removeClippedSubviews
              windowSize={7}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              keyboardShouldPersistTaps="handled"
            />

            <View style={[styles.cartFooter, isSmallScreen && styles.cartFooterCompact, { paddingBottom: 8 + insets.bottom }]}>
              <View style={[styles.discountSection, isSmallScreen && styles.discountSectionCompact]}>
                <View style={styles.discountHeader}>
                  <Text style={styles.discountTitle}>Discount</Text>
                  {discount ? (
                    <Text style={styles.discountApplied}>Applied</Text>
                  ) : null}
                </View>
                <View style={styles.discountControls}>
                  <View style={styles.discountToggle}>
                    <Pressable
                      style={[
                        styles.discountChip,
                        discountType === "percentage" && styles.discountChipActive
                      ]}
                      onPress={() => {
                        setDiscountType("percentage");
                        scheduleDiscountApply(discountValue, "percentage");
                      }}
                      disabled={!canEditCart}
                    >
                      <Text
                        style={[
                          styles.discountChipText,
                          discountType === "percentage" && styles.discountChipTextActive
                        ]}
                      >
                        %
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.discountChip,
                        discountType === "fixed" && styles.discountChipActive
                      ]}
                      onPress={() => {
                        setDiscountType("fixed");
                        scheduleDiscountApply(discountValue, "fixed");
                      }}
                      disabled={!canEditCart}
                    >
                      <Text
                        style={[
                          styles.discountChipText,
                          discountType === "fixed" && styles.discountChipTextActive
                        ]}
                      >
                        Flat
                      </Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={[styles.discountInput, !canEditCart && styles.inputDisabled]}
                    value={discountValue}
                    onChangeText={handleDiscountValueChange}
                    placeholder={
                      discountType === "percentage" ? "%" : "INR"
                    }
                    placeholderTextColor={theme.colors.textTertiary}
                    keyboardType="numeric"
                    editable={canEditCart}
                  />
                </View>
              </View>

              <View style={[styles.cartTotals, isSmallScreen && styles.cartTotalsCompact]}>
                <View style={styles.totalRow}>
                  <AppText style={styles.totalLabel}>{t("sell.subtotal", "Subtotal")}</AppText>
                  <PriceText style={styles.totalValue}>{subtotalLabel}</PriceText>
                </View>
                {discountTotal ? (
                  <View style={styles.totalRow}>
                    <AppText style={styles.totalLabel}>{t("sell.discount", "Discount")}</AppText>
                    <PriceText style={styles.totalValue}>-{discountAmountLabel}</PriceText>
                  </View>
                ) : null}
                <View style={[styles.totalRow, styles.totalRowEmphasis]}>
                  <AppText style={styles.totalLabelStrong} bold>{t("sell.total", "Total")}</AppText>
                  <PriceText style={styles.totalValueStrong}>{totalLabel}</PriceText>
                </View>
              </View>

              <Pressable
                style={[styles.totalCta, isSmallScreen && styles.totalCtaCompact, !canPay && styles.ctaDisabled]}
                onPress={handleCheckout}
                disabled={!canPay}
                accessibilityLabel={t("sell.checkout", "Checkout")}
              >
                <ButtonText style={styles.totalCtaText}>{t("sell.checkout", "Checkout")}</ButtonText>
                <PriceText style={styles.totalCtaAmount}>{totalLabel}</PriceText>
              </Pressable>
            </View>
          </Animated.View>
          </View>
        </Modal>

      <Modal
        visible={sellOnboardingVisible}
        transparent
        animationType="slide"
        onRequestClose={() => closeSellOnboarding()}
      >
        <View style={styles.onboardingOverlay}>
          <Pressable
            style={styles.onboardingOverlayTap}
            onPress={() => closeSellOnboarding()}
            disabled={sellOnboardingBusy}
          />
          <View style={styles.onboardingSheet}>
            <View style={styles.onboardingHandle} />
            <View style={styles.onboardingHeader}>
              <Text style={styles.onboardingTitle}>New product</Text>
              {sellOnboarding?.barcode ? (
                <Text style={styles.onboardingBarcode}>{sellOnboarding.barcode}</Text>
              ) : null}
            </View>

            <View style={styles.onboardingFields}>
              {/* DEV-070: Editable product name field */}
              <View style={styles.onboardingField}>
                <Text style={styles.onboardingLabel}>Product name</Text>
                <TextInput
                  style={[styles.onboardingInput, sellOnboardingBusy && styles.inputDisabled]}
                  value={sellOnboardingNameInput}
                  onChangeText={handleSellOnboardingNameChange}
                  placeholder="Enter product name"
                  placeholderTextColor={theme.colors.textTertiary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!sellOnboardingBusy}
                />
              </View>
              <View style={styles.onboardingField}>
                <Text style={styles.onboardingLabel}>Sell price</Text>
                <TextInput
                  style={[styles.onboardingInput, sellOnboardingBusy && styles.inputDisabled]}
                  value={sellOnboardingPrice}
                  onChangeText={handleSellOnboardingPriceChange}
                  placeholder="Enter sell price"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="decimal-pad"
                  editable={!sellOnboardingBusy}
                />
              </View>
              <View style={styles.onboardingField}>
                <Text style={styles.onboardingLabel}>Purchase price (optional)</Text>
                <TextInput
                  style={[styles.onboardingInput, sellOnboardingBusy && styles.inputDisabled]}
                  value={sellOnboardingPurchasePrice}
                  onChangeText={handleSellOnboardingPurchasePriceChange}
                  placeholder="Enter purchase price"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="decimal-pad"
                  editable={!sellOnboardingBusy}
                />
              </View>
              <View style={styles.onboardingField}>
                <Text style={styles.onboardingLabel}>Opening stock</Text>
                <TextInput
                  style={[styles.onboardingInput, sellOnboardingBusy && styles.inputDisabled]}
                  value={sellOnboardingStock}
                  onChangeText={handleSellOnboardingStockChange}
                  placeholder="Enter stock (0 if unknown)"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="number-pad"
                  editable={!sellOnboardingBusy}
                />
                <Text style={styles.onboardingHelper}>Creates ledger entry if greater than 0</Text>
              </View>
            </View>

            {sellOnboardingError ? (
              <Text style={styles.onboardingError}>{sellOnboardingError}</Text>
            ) : null}

            <View style={styles.onboardingActions}>
              <Pressable
                style={[
                  styles.onboardingButton,
                  styles.onboardingButtonGhost,
                  sellOnboardingBusy && styles.onboardingButtonDisabled
                ]}
                onPress={() => closeSellOnboarding()}
                disabled={sellOnboardingBusy}
              >
                <Text style={styles.onboardingButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.onboardingButton,
                  styles.onboardingButtonPrimary,
                  (!sellOnboardingFormValid || sellOnboardingBusy) && styles.onboardingButtonDisabled
                ]}
                onPress={handleSellOnboardingConfirm}
                disabled={!sellOnboardingFormValid || sellOnboardingBusy}
              >
                {sellOnboardingBusy ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.onboardingButtonTextInverse}>Save & Add</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(detailItem)}
        transparent
        animationType="slide"
        onRequestClose={closeDetail}
      >
        <View style={styles.onboardingOverlay}>
          <Pressable
            style={styles.onboardingOverlayTap}
            onPress={closeDetail}
            disabled={editProductBusy}
          />
          <View style={styles.onboardingSheet}>
            <View style={styles.onboardingHandle} />
            <View style={styles.onboardingHeader}>
              <Text style={styles.onboardingTitle}>Edit product</Text>
              {detailItem?.barcode ? (
                <Text style={styles.onboardingBarcode}>{detailItem.barcode}</Text>
              ) : null}
            </View>

            <View style={styles.onboardingFields}>
              <View style={styles.onboardingField}>
                <Text style={styles.onboardingLabel}>Product name</Text>
                <TextInput
                  style={[styles.onboardingInput, editProductBusy && styles.inputDisabled]}
                  value={editProductName}
                  onChangeText={(v) => { setEditProductName(v); setEditProductError(null); }}
                  placeholder="Product name"
                  placeholderTextColor={theme.colors.textTertiary}
                  editable={!editProductBusy}
                />
              </View>
              <View style={styles.onboardingField}>
                <Text style={styles.onboardingLabel}>Sell price</Text>
                <TextInput
                  style={[styles.onboardingInput, editProductBusy && styles.inputDisabled]}
                  value={editProductPrice}
                  onChangeText={(v) => { setEditProductPrice(v); setEditProductError(null); }}
                  placeholder="Enter sell price"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="decimal-pad"
                  editable={!editProductBusy}
                />
              </View>
              <View style={styles.onboardingField}>
                <Text style={styles.onboardingLabel}>Stock</Text>
                <TextInput
                  style={[styles.onboardingInput, editProductBusy && styles.inputDisabled]}
                  value={editProductStock}
                  onChangeText={(v) => { setEditProductStock(v); setEditProductError(null); }}
                  placeholder="Enter stock qty"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="number-pad"
                  editable={!editProductBusy}
                />
              </View>
            </View>

            {editProductError ? (
              <Text style={styles.onboardingError}>{editProductError}</Text>
            ) : null}

            <View style={styles.onboardingActions}>
              <Pressable
                style={[
                  styles.onboardingButton,
                  styles.onboardingButtonGhost,
                  editProductBusy && styles.onboardingButtonDisabled
                ]}
                onPress={closeDetail}
                disabled={editProductBusy}
              >
                <Text style={styles.onboardingButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.onboardingButton,
                  styles.onboardingButtonPrimary,
                  editProductBusy && styles.onboardingButtonDisabled
                ]}
                onPress={handleEditProductSave}
                disabled={editProductBusy}
              >
                {editProductBusy ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.onboardingButtonTextInverse}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(editorItem)}
        transparent
        animationType="slide"
        onRequestClose={closeEditor}
      >
        <View style={styles.editOverlay}>
          <Pressable style={styles.editOverlayTap} onPress={closeEditor} />
          <View
            style={[styles.editSheet, { paddingBottom: 16 + insets.bottom }]}
            testID="sell-lineitem-editor"
          >
            <View style={styles.editHandle} />
            <Text style={styles.editTitle}>Edit Item</Text>
            {editorItem ? (
              <View style={styles.editContent}>
                {/* Product name - only editable for new products not from ledger */}
                {(() => {
                  const isFromLedger = Boolean(
                    editorItem.metadata?.globalProductId ||
                    editorItem.metadata?.storeDisplayName
                  );
                  return (
                    <View style={styles.editFieldFull}>
                      <Text style={styles.editLabel}>
                        Product Name {isFromLedger ? "(from catalog)" : "(editable)"}
                      </Text>
                      {isFromLedger ? (
                        <Text style={styles.editNameReadonly} numberOfLines={2}>
                          {editorName}
                        </Text>
                      ) : (
                        <TextInput
                          style={styles.editInputCompact}
                          value={editorName}
                          onChangeText={setEditorName}
                          placeholder="Product name"
                          placeholderTextColor={theme.colors.textTertiary}
                          editable={!editorDisabled}
                        />
                      )}
                    </View>
                  );
                })()}
                {editorItem.barcode ? (
                  <Text style={styles.editBarcode} numberOfLines={1}>
                    Barcode: {editorItem.barcode}
                  </Text>
                ) : null}
                <Text style={[styles.editStock, editorQtyExceedsStock && styles.editStockError]} numberOfLines={1}>
                  In stock: {editorStockLabel}{editorQtyExceedsStock ? " (exceeded!)" : ""}
                </Text>
                <View style={styles.editFields}>
                  {/* Row 1: Qty and Sell Price side by side */}
                  <View style={styles.editFieldsRow}>
                    <View style={styles.editFieldCompact}>
                      <Text style={[styles.editLabel, editorQtyExceedsStock && styles.editLabelError]}>Qty</Text>
                      <TextInput
                        style={[styles.editInputCompact, editorQtyExceedsStock && styles.editInputError]}
                        value={editorQty}
                        onChangeText={setEditorQty}
                        keyboardType="number-pad"
                        editable={!editorDisabled}
                      />
                    </View>
                    <View style={styles.editFieldCompact}>
                      <Text style={styles.editLabel}>Sell Price</Text>
                      <TextInput
                        style={styles.editInputCompact}
                        value={editorPrice}
                        onChangeText={setEditorPrice}
                        keyboardType="decimal-pad"
                        editable={!editorDisabled}
                      />
                    </View>
                    <View style={styles.editFieldCompact}>
                      <Text style={styles.editLabel}>Purchase Price</Text>
                      <TextInput
                        style={styles.editInputCompact}
                        value={editorPurchasePrice}
                        onChangeText={setEditorPurchasePrice}
                        placeholder="Optional"
                        placeholderTextColor={theme.colors.textTertiary}
                        keyboardType="decimal-pad"
                        editable={!editorDisabled}
                      />
                    </View>
                  </View>

                  {/* Discount row - matching other field design */}
                  <View style={styles.editFieldsRow}>
                    <View style={styles.editFieldCompact}>
                      <Text style={[styles.editLabel, editorDiscountExceeds100 && styles.editLabelError]}>
                        Discount {editorDiscountType === "percentage" ? "%" : "₹"}
                      </Text>
                      <View style={styles.editDiscountInputRow}>
                        <TextInput
                          style={[
                            styles.editInputCompact,
                            styles.editDiscountInputField,
                            editorDiscountExceeds100 && styles.editInputError
                          ]}
                          value={editorDiscountValue}
                          onChangeText={setEditorDiscountValue}
                          placeholder="0"
                          placeholderTextColor={theme.colors.textTertiary}
                          keyboardType="decimal-pad"
                          editable={!editorDisabled}
                        />
                        <View style={styles.editDiscountTypeToggle}>
                          <Pressable
                            style={[
                              styles.editDiscountTypeBtn,
                              editorDiscountType === "percentage" && styles.editDiscountTypeBtnActive
                            ]}
                            onPress={() => {
                              setEditorDiscountType("percentage");
                              if (editorDiscountValue === "100") setEditorDiscountValue("");
                            }}
                            disabled={editorDisabled}
                          >
                            <Text style={[
                              styles.editDiscountTypeBtnText,
                              editorDiscountType === "percentage" && styles.editDiscountTypeBtnTextActive
                            ]}>%</Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.editDiscountTypeBtn,
                              editorDiscountType === "fixed" && styles.editDiscountTypeBtnActive
                            ]}
                            onPress={() => {
                              setEditorDiscountType("fixed");
                              if (editorDiscountValue === "100") setEditorDiscountValue("");
                            }}
                            disabled={editorDisabled}
                          >
                            <Text style={[
                              styles.editDiscountTypeBtnText,
                              editorDiscountType === "fixed" && styles.editDiscountTypeBtnTextActive
                            ]}>₹</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                    <View style={styles.editFieldCompact}>
                      <Text style={styles.editLabel}>Quick</Text>
                      <Pressable
                        style={[
                          styles.editFreeBtn,
                          editorDiscountType === "percentage" && editorDiscountValue === "100" && styles.editFreeBtnActive
                        ]}
                        onPress={handleMakeFree}
                        disabled={editorDisabled}
                      >
                        <Text style={[
                          styles.editFreeBtnText,
                          editorDiscountType === "percentage" && editorDiscountValue === "100" && styles.editFreeBtnTextActive
                        ]}>
                          {editorDiscountType === "percentage" && editorDiscountValue === "100" ? "FREE ✓" : "Make Free"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={styles.editTotalRow}>
                  <Text style={styles.editTotalLabel}>Item Total</Text>
                  <Text style={styles.editTotalValue}>{editorTotalLabel || "--"}</Text>
                </View>

                <View style={styles.editActions}>
                  <Pressable
                    style={[styles.editButton, styles.editButtonGhost]}
                    onPress={closeEditor}
                  >
                    <Text style={styles.editButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.editButton, styles.editButtonPrimary, editorDisabled && styles.editButtonDisabled]}
                    onPress={handleEditorSave}
                    disabled={editorDisabled}
                  >
                    <Text style={styles.editButtonTextInverse}>Save</Text>
                  </Pressable>
                </View>
                <Pressable
                  style={[styles.editRemoveButton, editorDisabled && styles.editRemoveButtonDisabled]}
                  onPress={handleEditorRemove}
                  disabled={editorDisabled}
                  testID="sell-lineitem-remove"
                >
                  <Text style={styles.editRemoveText}>Remove item</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* VOICE-001/009: Floating voice button / Recording panel (feature-gated) */}
      {voiceEnabled && voiceButtonState === "recording" ? (
        // Expanded recording panel
        <View style={[styles.voiceRecordingPanel, itemCount > 0 && styles.voiceRecordingPanelWithCart]}>
          {/* Cancel button */}
          <Pressable
            style={styles.voiceCancelButton}
            onPress={cancelVoiceRecording}
            hitSlop={8}
            accessibilityLabel="Cancel recording"
          >
            <MaterialCommunityIcons name="close" size={20} color={theme.colors.error} />
          </Pressable>

          {/* Recording indicator with duration */}
          <View style={styles.voiceRecordingInfo}>
            <View style={styles.voiceRecordingDot} />
            <Text style={styles.voiceRecordingText}>
              {Math.floor(voiceRecordingDuration / 60)}:{(voiceRecordingDuration % 60).toString().padStart(2, "0")}
            </Text>
          </View>

          {/* Stop/Submit button */}
          <Pressable
            style={styles.voiceStopButton}
            onPress={stopAndSubmitVoice}
            accessibilityLabel="Stop and submit"
          >
            <MaterialCommunityIcons name="send" size={20} color={theme.colors.textInverse} />
          </Pressable>
        </View>
      ) : voiceEnabled ? (
        // Normal FAB (only shown when voice feature is enabled)
        <Pressable
          style={[
            styles.voiceFab,
            itemCount > 0 && styles.voiceFabWithCart,
            (!storeActive || scanDisabled) && styles.ctaDisabled,
          ]}
          onPressIn={handleVoicePressIn}
          onPressOut={handleVoicePressOut}
          onPress={handleVoiceTap}
          disabled={!storeActive || scanDisabled || voiceButtonState === "processing"}
          accessibilityLabel="Tap or hold to speak"
        >
          {voiceButtonState === "processing" ? (
            <ActivityIndicator size={22} color={theme.colors.textInverse} />
          ) : (
            <MaterialCommunityIcons
              name="microphone-outline"
              size={22}
              color={theme.colors.textInverse}
            />
          )}
        </Pressable>
      ) : null}

      {/* VOICE-001: Voice sheet modal */}
      {/* T-133: Bulk Quantity Selector Modal */}
      <Modal
        visible={Boolean(bulkQtyItem)}
        transparent
        animationType="slide"
        onRequestClose={handleBulkQtyClose}
      >
        <View style={styles.onboardingOverlay}>
          <Pressable style={styles.onboardingOverlayTap} onPress={handleBulkQtyClose} />
          <View style={styles.onboardingSheet}>
            <View style={styles.onboardingHandle} />
            <View style={styles.onboardingHeader}>
              <Text style={styles.onboardingTitle}>Add Quantity</Text>
              {bulkQtyItem ? (
                <Text style={styles.onboardingBarcode} numberOfLines={1}>{bulkQtyItem.name}</Text>
              ) : null}
            </View>
            {bulkQtyItem ? (
              <View style={styles.onboardingFields}>
                <View style={styles.onboardingField}>
                  <Text style={styles.onboardingLabel}>
                    Available: {resolveStockForSku(bulkQtyItem) ?? bulkQtyItem?.currentStock ?? "Unknown"}
                  </Text>
                  <TextInput
                    style={styles.onboardingInput}
                    value={bulkQtyValue}
                    onChangeText={setBulkQtyValue}
                    placeholder="Enter quantity"
                    placeholderTextColor={theme.colors.textTertiary}
                    keyboardType="number-pad"
                    autoFocus
                  />
                </View>
              </View>
            ) : null}
            <View style={styles.onboardingActions}>
              <Pressable
                style={[styles.onboardingButton, styles.onboardingButtonGhost]}
                onPress={handleBulkQtyClose}
              >
                <Text style={styles.onboardingButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.onboardingButton,
                  styles.onboardingButtonPrimary,
                  (!bulkQtyValue.trim() || parseInt(bulkQtyValue, 10) <= 0) && styles.onboardingButtonDisabled,
                ]}
                onPress={handleBulkQtyConfirm}
                disabled={!bulkQtyValue.trim() || parseInt(bulkQtyValue, 10) <= 0}
              >
                <Text style={styles.onboardingButtonTextInverse}>Add to Cart</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <VoiceSheet
        state={voiceSheetState}
        transcript={voiceTranscript}
        message={voiceMessage}
        errorMessage={voiceErrorMessage}
        onDismiss={handleVoiceSheetDismiss}
        locale={voiceLocale}
        onLocaleChange={setVoiceLocale}
        testID="sell-voice-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  // SD-CATEGORY: Row container for rail + product grid
  mainContentRow: {
    flex: 1,
    flexDirection: "row",
  },
  categoryRailWrap: {
    flexShrink: 0,
  },
  productGridContainer: {
    flex: 1,
  },
  categoryFilterLabel: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  categoryFilterText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  list: {
    flex: 1,
    position: "relative",
    zIndex: 0,
  },
  listContent: {
    paddingBottom: 130,
  },
  searchHeader: {
    paddingHorizontal: 12,
    paddingTop: 12,
    marginBottom: 12,
    position: "relative",
    zIndex: 2,
  },
  searchDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  // T-128: Manual barcode entry fallback styles
  manualBarcodeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    gap: 8,
  },
  manualBarcodeInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  manualBarcodeSubmit: {
    padding: 2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    position: "relative",
    overflow: "hidden",
  },
  searchBarExpanded: {
    borderColor: theme.colors.primary,
  },
  searchBarDisabled: {
    opacity: 0.6,
  },
  searchSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchSegmentExpanded: {
    paddingRight: SCAN_SEGMENT_DOCKED_WIDTH + 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#000000",
    paddingVertical: 0,
  },
  // VOICE-001: Floating voice button (FAB)
  voiceFab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
    zIndex: 100,
  },
  voiceFabRecording: {
    backgroundColor: theme.colors.error,
    transform: [{ scale: 1.1 }],
  },
  voiceFabWithCart: {
    bottom: 76,
  },
  // VOICE-001: Expanded recording panel
  voiceRecordingPanel: {
    position: "absolute",
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
    zIndex: 100,
    borderWidth: 2,
    borderColor: theme.colors.error,
  },
  voiceRecordingPanelWithCart: {
    bottom: 76,
  },
  voiceCancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.errorSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceRecordingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  voiceRecordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.error,
  },
  voiceRecordingText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    fontVariant: ["tabular-nums"],
    minWidth: 40,
  },
  voiceStopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  scanSegment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
  },
  scanSegmentExpanded: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SCAN_SEGMENT_DOCKED_WIDTH,
    paddingHorizontal: 0,
    justifyContent: "center",
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  scanSegmentText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  searchPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    padding: 10,
    gap: 8,
    ...theme.shadows.sm,
  },
  searchPanelCollapsed: {
    display: "none",
  },
  searchPanelTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  searchPanelList: {
    maxHeight: 260,
  },
  searchPanelListContent: {
    paddingVertical: 4,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  addRowInfo: {
    flex: 1,
  },
  addRowName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  addRowMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  addRowRight: {
    alignItems: "flex-end",
  },
  addRowPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  addRowStock: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  cartOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 15, 20, 0.55)",
    justifyContent: "flex-end",
  },
  cartOverlayTap: {
    ...StyleSheet.absoluteFillObject,
  },
  onboardingOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 15, 20, 0.55)",
    justifyContent: "flex-end",
  },
  onboardingOverlayTap: {
    ...StyleSheet.absoluteFillObject,
  },
  onboardingSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
    ...theme.shadows.sm,
  },
  onboardingHandle: {
    alignSelf: "center",
    width: 46,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    marginBottom: 6,
  },
  onboardingHeader: {
    gap: 4,
  },
  onboardingTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  onboardingSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  onboardingBarcode: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  onboardingFields: {
    gap: 10,
  },
  onboardingField: {
    gap: 6,
  },
  onboardingLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  onboardingInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  onboardingHelper: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  onboardingError: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.error,
  },
  onboardingActions: {
    flexDirection: "row",
    gap: 10,
  },
  onboardingButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  onboardingButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  onboardingButtonGhost: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  onboardingButtonDisabled: {
    opacity: 0.6,
  },
  onboardingButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  onboardingButtonTextInverse: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  cartSheet: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 10,
    ...theme.shadows.sm,
  },
  cartSheetCompact: {
    padding: 10,
    gap: 6,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cartHandleWrap: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 40,
    marginTop: -2,
    marginBottom: -2,
  },
  cartHandle: {
    alignSelf: "center",
    width: 50,
    height: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
  },
  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cartHeaderCompact: {
    marginBottom: 2,
  },
  cartHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  clearCartButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: theme.colors.errorSoft,
  },
  clearCartText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.error,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cartTitleWrap: {
    minWidth: 0,
  },
  cartTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  cartTitleCompact: {
    fontSize: 16,
  },
  cartSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  cartList: {
    flex: 1,
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
  cartListContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  cartListFooterSpacer: {
    height: 16,
  },
  cartListFooterSpacerCompact: {
    height: 8,
  },
  cartItemRow: {
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cartItemRowCompact: {
    marginVertical: 3,
    borderRadius: 8,
  },
  cartItemRowContent: {
    flexDirection: "column",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  cartItemRowContentCompact: {
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  cartItemRowFree: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  cartItemNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  cartItemNameSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  cartItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  discountBadge: {
    backgroundColor: "rgba(29, 78, 216, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountBadgeFree: {
    backgroundColor: theme.colors.warning,
  },
  discountBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  discountBadgeTextFree: {
    color: "#fff",
  },
  cartItemMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cartItemPriceBox: {
    minWidth: 70,
    flexShrink: 0,
  },
  cartItemPriceText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartItemTotalBox: {
    minWidth: 70,
    alignItems: "flex-end",
    flexShrink: 0,
  },
  cartItemTotalText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primaryDark,
  },
  cartItemOriginalPrice: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.textTertiary,
    textDecorationLine: "line-through",
  },
  cartItemDiscountedPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.success,
  },
  cartItemFreePrice: {
    color: theme.colors.warning,
    fontWeight: "800",
  },
  cartItemInfo: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
    flexShrink: 1,
  },
  cartItemInfoCompact: {
    marginRight: 0,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    flexShrink: 1,
    minWidth: 0,
  },
  cartItemNameCompact: {
    fontSize: 12,
  },
  editHintIcon: {
    marginLeft: 4,
    opacity: 0.6,
  },
  cartItemMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  cartItemPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  cartItemPriceRowCompact: {
    width: "100%",
  },
  cartPriceField: {
    flex: 1,
    minWidth: 120,
  },
  cartPriceLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  cartPriceInput: {
    flex: 1,
    minWidth: 120,
    minHeight: 52,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.textPrimary,
    textAlignVertical: "center",
  },
  cartPriceInputCompact: {
    minWidth: 65,
    maxWidth: 80,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  cartPriceValue: {
    flex: 1,
    minWidth: 120,
    minHeight: 52,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "center",
  },
  cartPriceValueText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartItemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartItemMetaRowCompact: {
    justifyContent: "space-between",
  },
  cartItemControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 10,
  },
  cartItemControlsWrap: {
    flexShrink: 1,
    gap: 4,
  },
  qtyButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonDisabled: {
    opacity: 0.5,
    borderColor: theme.colors.border,
  },
  qtyValue: {
    minWidth: 24,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stockLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  stockLabelWarning: {
    color: theme.colors.warning,
    fontWeight: "600",
  },
  stockLabelCritical: {
    color: theme.colors.error,
    fontWeight: "700",
  },
  // GL-RJ-007: Price resolution error styles
  priceErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 4,
    paddingBottom: 2,
  },
  priceErrorText: {
    fontSize: 11,
    color: theme.colors.warning,
    fontWeight: "500",
    fontStyle: "italic",
    flex: 1,
  },
  cartItemTotalLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  cartItemTotal: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartItemSummary: {
    alignItems: "flex-end",
    gap: 6,
  },
  cartItemSummaryCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  removeItemButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.errorSoft,
    backgroundColor: theme.colors.errorSoft,
    padding: 8,
  },
  removeItemButtonDisabled: {
    opacity: 0.4,
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
  },
  discountSection: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  discountSectionCompact: {
    padding: 6,
    gap: 4,
    borderRadius: 8,
  },
  discountHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  discountTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  discountApplied: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  discountControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  discountToggle: {
    flexDirection: "row",
    flexWrap: "wrap",
    flexShrink: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  discountChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  discountChipActive: {
    backgroundColor: theme.colors.primary,
  },
  discountChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  discountChipTextActive: {
    color: theme.colors.textInverse,
  },
  discountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  cartTotals: {
    paddingTop: 4,
    gap: 4,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalRowEmphasis: {
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  totalLabelStrong: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  totalValueStrong: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.primaryDark,
    fontVariant: ["tabular-nums"],
  },
  totalCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  totalCtaCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  cartTotalsCompact: {
    paddingTop: 2,
    gap: 2,
  },
  cartFooter: {
    backgroundColor: theme.colors.surface,
    gap: 8,
    flexShrink: 0,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  cartFooterCompact: {
    gap: 6,
    paddingTop: 6,
  },
  totalCtaText: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.textInverse,
  },
  totalCtaAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.textInverse,
    fontVariant: ["tabular-nums"],
  },
  categoryPillCard: {
    width: 72,
    height: 72,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    ...theme.shadows.sm,
  },
  categoryPillIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  // CAT-006: First row with pill + first SKU
  firstRowWithPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  // CAT-006: First SKU card - fills remaining space
  skuCardFirstRow: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  skuRow: {
    gap: 12,
    paddingHorizontal: 12,
  },
  skuCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 12,
    minHeight: 120,
  },
  skuCardDisabled: {
    opacity: 0.5,
  },
  skuCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  pricePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  priceText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  skuName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  skuBarcode: {
    marginTop: 6,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  skuStock: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  footerLoading: {
    paddingVertical: 16,
  },
  cartBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...theme.shadows.md,
    zIndex: 3,
  },
  cartBarFlash: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  cartBarLeft: {
    justifyContent: "center",
    alignItems: "center",
  },
  cartBarIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  cartBarBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.accent,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  cartBarBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.colors.surface,
  },
  cartBarCenter: {
    flex: 1,
    gap: 2,
  },
  cartBarTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cartBarLocked: {
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  cartBarLockedText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.warning,
  },
  cartBarCount: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cartBarTotal: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.primary,
    fontVariant: ["tabular-nums"],
  },
  cartBarBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cartBarHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  cartBarUndo: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.accent,
  },
  editOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 15, 20, 0.55)",
    justifyContent: "flex-end",
  },
  editOverlayTap: {
    ...StyleSheet.absoluteFillObject,
  },
  editSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
    ...theme.shadows.sm,
  },
  editHandle: {
    alignSelf: "center",
    width: 46,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
    marginBottom: 6,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  editContent: {
    gap: 12,
  },
  editName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  editBarcode: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  editStock: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  editFields: {
    gap: 8,
  },
  editFieldsRow: {
    flexDirection: "row",
    gap: 10,
  },
  editFieldCompact: {
    flex: 1,
    gap: 3,
  },
  editFieldFull: {
    gap: 3,
  },
  editField: {
    gap: 3,
  },
  editLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  editInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  editInputCompact: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  editNameReadonly: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  editDiscountSection: {
    gap: 4,
  },
  editDiscountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  editDiscountInputField: {
    flex: 1,
  },
  editDiscountTypeToggle: {
    flexDirection: "row",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  editDiscountTypeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.colors.surface,
  },
  editDiscountTypeBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  editDiscountTypeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  editDiscountTypeBtnTextActive: {
    color: theme.colors.textInverse,
  },
  editFreeBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  editFreeBtnActive: {
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
  },
  editFreeBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  editFreeBtnTextActive: {
    color: theme.colors.warning,
  },
  editInputError: {
    borderColor: theme.colors.error,
    borderWidth: 2,
  },
  editLabelError: {
    color: theme.colors.error,
  },
  editStockError: {
    color: theme.colors.error,
    fontWeight: "700",
  },
  editDiscountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  editDiscountToggle: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  editDiscountChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  editDiscountChipActive: {
    backgroundColor: theme.colors.primary,
  },
  editDiscountChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  editDiscountChipTextActive: {
    color: theme.colors.textInverse,
  },
  editDiscountChipFree: {
    backgroundColor: theme.colors.warning,
  },
  editDiscountChipTextFree: {
    color: "#fff",
  },
  editDiscountInput: {
    flex: 1,
    minWidth: 50,
  },
  freeMarkedText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.warning,
    textAlign: "center",
  },
  editTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editTotalLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  editTotalValue: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.primaryDark,
    fontVariant: ["tabular-nums"],
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
  },
  editButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  editButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  editButtonGhost: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  editButtonDisabled: {
    opacity: 0.6,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  editButtonTextInverse: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  editRemoveButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  editRemoveButtonDisabled: {
    opacity: 0.6,
  },
  editRemoveText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.error,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  // T-130: Search history chip styles
  searchHistoryRow: {
    marginTop: 8,
  },
  searchHistoryScroll: {
    paddingHorizontal: 4,
    gap: 8,
    alignItems: "center",
  },
  searchHistoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchHistoryChipText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    maxWidth: 100,
  },
  searchHistoryClear: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchHistoryClearText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  // T-134: Product image styles for SKU cards
  skuCardImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    alignSelf: "center",
    marginBottom: 4,
  },
  skuCardImageFallback: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: theme.colors.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 4,
  },
  // T-136: Out-of-stock text
  addRowStockOut: {
    color: theme.colors.error,
  },
  // T-136: Substitution suggestion styles
  substituteSection: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  substituteLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  substituteCard: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 100,
  },
  substituteCardName: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    maxWidth: 120,
  },
  substituteCardPrice: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "700",
    marginTop: 2,
  },
  substituteCardStock: {
    fontSize: 10,
    color: theme.colors.success,
    marginTop: 1,
  },
  // T-137: Autocomplete dropdown styles
  autocompleteDropdown: {
    position: "relative",
    zIndex: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    maxHeight: 200,
    ...theme.shadows.md,
  },
  autocompleteSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  autocompleteName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  autocompleteBarcode: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginLeft: 8,
  },
  // T-134: Product image in search result rows
  addRowImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  addRowImageFallback: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: theme.colors.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
});
