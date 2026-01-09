import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useCartStore } from "../stores/cartStore";
import type { CartItem } from "../stores/cartStore";
import { useProductsStore } from "../stores/productsStore";
import { formatMoney } from "../utils/money";
import * as productsApi from "../services/api/productsApi";
import { setLocalPrice, upsertLocalProduct } from "../services/offline/scan";
import { offlineDb } from "../services/offline/localDb";
import { onBarcodeScanned } from "../services/scan/handleScan";
import {
  feedHidKey,
  feedHidText,
  submitHidBuffer,
  wasHidCommitRecent,
} from "../services/hidScannerService";
import { theme } from "../theme";

type CartMode = "SELL" | "PURCHASE";

type SellScanScreenProps = {
  storeActive: boolean | null;
  scanDisabled: boolean;
  onOpenScanner: () => void;
  cartMode?: CartMode;
};

type RootStackParamList = {
  Payment: { saleItemIds?: string[] } | undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "Payment">;

type SkuItem = {
  productId?: string | null;
  barcode: string;
  name: string;
  currency: string | null;
  inventoryPriceMinor: number | null;
  variantPriceMinor: number | null;
  variantMrpMinor: number | null;
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
  const trimmedQuery = query?.trim();
  try {
    const remote = await productsApi.listProducts(trimmedQuery ? { q: trimmedQuery } : undefined);
    const items: SkuItem[] = [];

    for (const product of remote) {
      const barcode = typeof product.barcode === "string" ? product.barcode.trim() : "";
      if (!barcode) continue;
      const currency = product.currency ?? "INR";
      const priceSources = productsApi.getProductPriceSources(product);
      const resolved = productsApi.resolvePriceMinorFromSources(priceSources);
      const resolvedPriceMinor = resolved.priceMinor > 0 ? resolved.priceMinor : null;

      items.push({
        productId: product.id,
        barcode,
        name: product.name,
        currency,
        inventoryPriceMinor: priceSources.inventoryPrice ?? null,
        variantPriceMinor: priceSources.variantPrice ?? null,
        variantMrpMinor: priceSources.variantMrp ?? null
      });

      await upsertLocalProduct(barcode, product.name, currency, null);
      if (resolvedPriceMinor !== null) {
        await setLocalPrice(barcode, resolvedPriceMinor);
      }
    }

    return items;
  } catch {
    return [];
  }
}

const PAGE_SIZE = 40;
const NUM_COLUMNS = 2;
const SCAN_SEGMENT_DOCKED_WIDTH = 64;
const PRICE_AUTO_SAVE_DELAY_MS = 300;
const DISCOUNT_AUTO_APPLY_DELAY_MS = 300;
const CART_SHEET_COLLAPSED_RATIO = 0.52;
const CART_SHEET_EXPANDED_RATIO = 0.95;
const CART_SHEET_SNAP_DURATION_MS = 220;
const CART_LIST_FOOTER_SPACER = 220;


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
  onAutoFocusConsumed,
  onUpdateQuantity,
  onUpdatePrice,
  onSaveDefaultPrice,
  onRemoveItem
}: CartItemRowProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isCompactRow = screenWidth <= 360;
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

  const lineTotal = item.priceMinor * item.quantity;
  const lineTotalLabel = formatMoney(lineTotal, currency);
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

  return (
    <Animated.View style={[styles.cartItemRow, isCompactRow && styles.cartItemRowCompact, rowStyle]}>
      <View style={[styles.cartItemInfo, isCompactRow && styles.cartItemInfoCompact]}>
        <Text style={styles.cartItemName} numberOfLines={1} ellipsizeMode="tail">
          {item.name}
        </Text>
        <View style={[styles.cartItemPriceRow, isCompactRow && styles.cartItemPriceRowCompact]}>
          <View style={styles.cartPriceField}>
            <Text style={styles.cartPriceLabel}>Unit price (₹)</Text>
            {showPriceInput ? (
              <TextInput
                style={[
                  styles.cartPriceInput,
                  isCompactRow && styles.cartPriceInputCompact,
                  !canEdit && styles.inputDisabled
                ]}
                ref={priceInputRef}
                value={priceInput}
                onChangeText={handlePriceChange}
                onEndEditing={handlePriceCommit}
                placeholder={pricePlaceholder}
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="decimal-pad"
                editable={canEdit}
              />
            ) : (
              <View style={styles.cartPriceValue}>
                <Text style={styles.cartPriceValueText}>{unitPriceLabel}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <View style={[styles.cartItemMetaRow, isCompactRow && styles.cartItemMetaRowCompact]}>
        <View style={styles.cartItemControlsWrap}>
          <Animated.View
            style={[
              styles.cartItemControls,
              { backgroundColor: qtyHighlightBg }
            ]}
          >
            <Pressable
              style={[styles.qtyButton, controlsDisabled && styles.qtyButtonDisabled]}
              onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
              disabled={controlsDisabled}
              accessibilityLabel={`Decrease ${item.name}`}
            >
              <MaterialCommunityIcons name="minus" size={16} color={theme.colors.textPrimary} />
            </Pressable>
            <Animated.Text style={[styles.qtyValue, { transform: [{ scale: qtyScale }] }]}>
              {item.quantity}
            </Animated.Text>
            <Pressable
              style={[styles.qtyButton, controlsDisabled && styles.qtyButtonDisabled]}
              onPress={handleIncrement}
              disabled={controlsDisabled}
              accessibilityLabel={`Increase ${item.name}`}
            >
              <MaterialCommunityIcons name="plus" size={16} color={theme.colors.textPrimary} />
            </Pressable>
          </Animated.View>
          {showStock ? (
            <Text style={styles.stockLabel}>In stock: {stockLabel}</Text>
          ) : null}
        </View>
        <View style={[styles.cartItemSummary, isCompactRow && styles.cartItemSummaryCompact]}>
          <Text style={styles.cartItemTotal}>
            <Text style={styles.cartItemTotalLabel}>Total </Text>
            {lineTotalLabel}
          </Text>
          <Pressable
            style={[styles.removeItemButton, removeDisabled && styles.removeItemButtonDisabled]}
            onPress={() => onRemoveItem(item.id)}
            disabled={removeDisabled}
            accessibilityLabel={`Remove ${item.name}`}
          >
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={16}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

export default function SellScanScreen({
  storeActive,
  scanDisabled,
  onOpenScanner,
  cartMode = "SELL",
}: SellScanScreenProps) {
  const navigation = useNavigation<Nav>();
  const { height: screenHeight } = useWindowDimensions();
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
    updateQuantity,
    updatePrice,
    removeItem,
    applyDiscount,
    removeDiscount,
  } = useCartStore();

  useEffect(() => {
    if (products.length === 0) {
      void loadProducts();
    }
  }, [loadProducts, products.length]);

  const stockByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of products) {
      if (typeof product.stock !== "number" || !Number.isFinite(product.stock)) continue;
      map.set(product.id, product.stock);
      if (product.barcode) {
        map.set(product.barcode, product.stock);
      }
    }
    return map;
  }, [products]);

  const resolveAvailableStock = useCallback((item: CartItem): number | null => {
    const meta = item.metadata ?? {};
    const metaValue =
      typeof (meta as any).availableQty === "number"
        ? (meta as any).availableQty
        : typeof (meta as any).available_qty === "number"
          ? (meta as any).available_qty
          : null;
    if (metaValue !== null && Number.isFinite(metaValue)) {
      return metaValue;
    }
    if (item.barcode && stockByKey.has(item.barcode)) {
      return stockByKey.get(item.barcode) ?? null;
    }
    if (stockByKey.has(item.id)) {
      return stockByKey.get(item.id) ?? null;
    }
    return null;
  }, [stockByKey]);

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
  const [autoFocusItemId, setAutoFocusItemId] = useState<string | null>(null);
  const [stockLimitItemId, setStockLimitItemId] = useState<string | null>(null);
  const [stockLimitPulse, setStockLimitPulse] = useState(0);

  const addMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceLogRef = useRef<Set<string>>(new Set());
  const addInputRef = useRef<TextInput>(null);
  const lastAddQueryRef = useRef<string | null>(null);
  const suppressAddBlurRef = useRef(false);
  const suppressAddBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addFocusedRef = useRef(false);
  const addExpandedBeforeCartRef = useRef(false);
  const addFocusedBeforeCartRef = useRef(false);
  const cartOpeningRef = useRef(false);
  const discountApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetDragStartYRef = useRef(0);
  const sheetSnapRef = useRef<"collapsed" | "expanded">("collapsed");

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

  const cartHint = locked
    ? "Cart locked"
    : itemCount === 0
      ? "Ready"
      : itemCount <= 2
        ? "Keep scanning"
        : "Review cart";

  const collapsedHeight = Math.round(screenHeight * CART_SHEET_COLLAPSED_RATIO);
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
        snapSheetTo("collapsed");
        return;
      }
      const shouldExpand =
        velocityY < -0.4 || nextOffset < collapsedOffset * 0.5;
      snapSheetTo(shouldExpand ? "expanded" : "collapsed");
    },
    [collapsedOffset, snapSheetTo]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) => {
          const vertical = Math.abs(gesture.dy) > Math.abs(gesture.dx);
          return vertical && Math.abs(gesture.dy) > 4;
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
    sheetTranslateY.setValue(collapsedOffset);
    sheetSnapRef.current = "collapsed";
  }, [cartExpanded, collapsedOffset, sheetTranslateY]);

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
    if (!addExpanded) {
      setAddExpanded(true);
    }
  };

  const logPriceDebug = useCallback((item: SkuItem, resolved: productsApi.PriceResolution) => {
    const productId = item.productId ?? item.barcode;
    const key = `${productId}:${resolved.priceMinor}:${resolved.inventoryPrice ?? "null"}:${resolved.variantPrice ?? "null"}:${resolved.mrp ?? "null"}`;
    if (priceLogRef.current.has(key)) return;
    priceLogRef.current.add(key);
    console.log(
      `[PRICE_DEBUG] ${productId} ${resolved.priceMinor} ${resolved.inventoryPrice ?? "null"} ${resolved.variantPrice ?? "null"} ${resolved.mrp ?? "null"}`
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
      await productsApi.updateStoreProductPrice({
        globalProductId,
        scanned,
        format: scanFormat,
        sellPriceMinor: priceMinor
      });
      if (barcode) {
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

  const handleScanSubmit = (event?: { nativeEvent: { text: string } }) => {
    const raw = event?.nativeEvent?.text ?? addQuery;
    const trimmed = raw.trim();
    if (!trimmed) return;
    void onBarcodeScanned(trimmed);
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

    const page = reset ? 0 : catalogPage;
    const offset = page * PAGE_SIZE;

    setCatalogLoading(true);
    if (reset) {
      setCatalogItems([]);
    }

    const params: Array<string | number> = [PAGE_SIZE, offset];
    const sql = `
      SELECT
        p.barcode as barcode,
        p.name as name,
        p.currency as currency,
        pr.price_minor as inventoryPriceMinor,
        NULL as variantPriceMinor,
        NULL as variantMrpMinor
      FROM offline_products p
      LEFT JOIN offline_prices pr ON pr.barcode = p.barcode
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.name ASC
      LIMIT ? OFFSET ?
    `;

    try {
      let rows = await offlineDb.all<SkuItem>(sql, params);
      if (reset && rows.length === 0) {
        const remote = await syncProductsToOffline();
        if (remote.length > 0) {
          rows = await offlineDb.all<SkuItem>(sql, params);
        }
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

    const query = addQuery.trim().toLowerCase();
    const page = reset ? 0 : addPage;
    const offset = page * PAGE_SIZE;

    setAddLoading(true);

    const params: Array<string | number> = [];
    let sql = `
      SELECT
        p.barcode as barcode,
        p.name as name,
        p.currency as currency,
        pr.price_minor as inventoryPriceMinor,
        NULL as variantPriceMinor,
        NULL as variantMrpMinor
      FROM offline_products p
      LEFT JOIN offline_prices pr ON pr.barcode = p.barcode
    `;

    if (query.length > 0) {
      const like = `%${query}%`;
      sql += " WHERE lower(p.name) LIKE ? OR lower(p.barcode) LIKE ?";
      params.push(like, like);
    }

    sql += " ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.name ASC LIMIT ? OFFSET ?";
    params.push(PAGE_SIZE, offset);

    try {
      let rows = await offlineDb.all<SkuItem>(sql, params);
      if (reset && rows.length === 0) {
        const remote = await syncProductsToOffline(query);
        if (remote.length > 0) {
          rows = await offlineDb.all<SkuItem>(sql, params);
        }
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
    }, 200);

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
    if (!stockLimitEvent) return;
    if (Platform.OS === "android") {
      const message =
        stockLimitEvent.reason === "out_of_stock"
          ? "Out of stock"
          : stockLimitEvent.reason === "unknown_stock"
            ? "Stock unavailable. Sync required."
            : `Only ${stockLimitEvent.availableStock} in stock`;
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
    if (stockLimitEvent.itemId) {
      setStockLimitItemId(stockLimitEvent.itemId);
      setStockLimitPulse((prev) => prev + 1);
    }
  }, [stockLimitEvent]);

  useEffect(() => {
    const lastMutation = mutationHistory[mutationHistory.length - 1];
    if (!lastMutation || lastMutation.type !== "UPSERT_ITEM") return;

    const currentItem = items.find((item) => item.id === lastMutation.itemId);
    if (!currentItem) return;

    const previousQty = lastMutation.previousItem?.quantity ?? 0;
    if (!lastMutation.previousItem) {
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
  }, [items, mutationHistory]);

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
    const resolved = resolveSkuPrice(item);
    const stockKey = item.productId && stockByKey.has(item.productId)
      ? item.productId
      : item.barcode;
    const availableStock = stockKey && stockByKey.has(stockKey)
      ? stockByKey.get(stockKey)
      : null;
    const existing = items.find((entry) => entry.barcode === item.barcode);
    const mergedMetadata = {
      ...(existing?.metadata ?? {}),
      ...(typeof availableStock === "number" && Number.isFinite(availableStock)
        ? { availableQty: availableStock }
        : {})
    };

    useCartStore.getState().addItem({
      id: item.barcode,
      name: item.name,
      priceMinor: resolved.priceMinor,
      currency: item.currency ?? "INR",
      barcode: item.barcode,
      metadata: Object.keys(mergedMetadata).length ? mergedMetadata : undefined
    });

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

    return (
      <Pressable
        style={[styles.skuCard, storeActive === false && styles.skuCardDisabled]}
        onPress={() => handleAddSku(item)}
        disabled={storeActive === false}
      >
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
      </Pressable>
    );
  };

  const renderAddRow = ({ item }: { item: SkuItem }) => {
    const resolved = resolveSkuPrice(item);
    logPriceDebug(item, resolved);
    const priceLabel = formatMoney(resolved.priceMinor, item.currency ?? "INR");

    return (
      <Pressable
        style={styles.addRow}
        onPressIn={() => markAddInteraction()}
        onPress={() => handleAddFromSearch(item)}
        accessibilityLabel={`Add ${item.name}`}
      >
        <MaterialCommunityIcons name="barcode" size={16} color={theme.colors.textSecondary} />
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
        </View>
      </Pressable>
    );
  };

  const renderCartItem = ({ item }: { item: CartItem }) => (
    <CartItemRow
      item={item}
      currency={item.currency ?? currency}
      mode={cartMode}
      availableStock={resolveAvailableStock(item)}
      canEdit={canEditCart}
      autoFocusPrice={item.id === autoFocusItemId}
      stockLimitPulse={stockLimitItemId === item.id ? stockLimitPulse : 0}
      onAutoFocusConsumed={handleAutoFocusConsumed}
      onUpdateQuantity={updateQuantity}
      onUpdatePrice={updatePrice}
      onSaveDefaultPrice={handleSaveDefaultPrice}
      onRemoveItem={handleRemoveItem}
    />
  );
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
          placeholder="Search product"
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
            Scan product here
          </Text>
        ) : null}
      </Pressable>
    </View>
  );

  const searchHeader = (
    <View style={styles.searchHeader}>
      {renderSearchBar(addExpanded ? "expanded" : "collapsed")}
      <View
        style={[styles.searchPanel, !addExpanded && styles.searchPanelCollapsed]}
        pointerEvents={addExpanded ? "auto" : "none"}
        onTouchStart={() => markAddInteraction()}
      >
        <Text style={styles.searchPanelTitle}>
          {addQuery.trim() ? "Search results" : "Recent products"}
        </Text>
        <FlatList
          data={addResults}
          keyExtractor={(item) => item.barcode}
          renderItem={renderAddRow}
          style={styles.searchPanelList}
          contentContainerStyle={styles.searchPanelListContent}
          ListEmptyComponent={
            !addLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {addQuery.trim() ? "No matches found." : "No recent products."}
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
      <FlatList
        data={catalogItems}
        keyExtractor={(item) => item.barcode}
        renderItem={renderSkuItem}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.skuRow}
        ListEmptyComponent={
          !catalogLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No SKUs</Text>
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

      <Pressable
        style={[
          styles.cartBar,
          flashActive && styles.cartBarFlash,
          !canOpenCart && styles.cartBarDisabled,
        ]}
        onPress={handleOpenCart}
        disabled={!canOpenCart}
        accessibilityLabel="View cart"
      >
        <View style={styles.cartBarTop}>
          <Text style={styles.cartBarCount}>
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </Text>
          <View style={styles.cartBarTopRight}>
            {locked ? (
              <View style={styles.cartBarLocked}>
                <Text style={styles.cartBarLockedText}>Locked</Text>
              </View>
            ) : null}
            <Text style={styles.cartBarTotal}>{totalLabel}</Text>
          </View>
        </View>
        <View style={styles.cartBarBottom}>
          <Text style={styles.cartBarHint} numberOfLines={1}>
            {lastAddMessage ?? cartHint}
          </Text>
          {undoVisible && !locked ? (
            <Pressable onPress={handleUndo} hitSlop={8}>
              <Text style={styles.cartBarUndo}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>

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
              {
                height: expandedHeight,
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <View style={styles.cartHandleWrap} {...panResponder.panHandlers}>
              <View style={styles.cartHandle} />
            </View>
            <View style={styles.cartHeader}>
              <View style={styles.cartHeaderLeft}>
                <Pressable onPress={closeCart} hitSlop={8} accessibilityLabel="Back to scan">
                  <MaterialCommunityIcons
                    name="chevron-left"
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
                <View style={styles.cartTitleWrap}>
                  <Text style={styles.cartTitle}>{cartTitle}</Text>
                  <Text style={styles.cartSubtitle}>
                    Items: {uniqueSkuCount} | Qty: {itemCount}
                  </Text>
                </View>
              </View>
            </View>

            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={renderCartItem}
              style={styles.cartList}
              contentContainerStyle={styles.cartListContent}
              ListFooterComponent={
                items.length ? <View style={styles.cartListFooterSpacer} /> : null
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Cart empty</Text>
                </View>
              }
              removeClippedSubviews
              windowSize={7}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              keyboardShouldPersistTaps="handled"
            />

            <View style={styles.discountSection}>
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
                      % Discount
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
                      Flat Discount
                    </Text>
                  </Pressable>
                </View>
                <TextInput
                  style={[styles.discountInput, !canEditCart && styles.inputDisabled]}
                  value={discountValue}
                  onChangeText={handleDiscountValueChange}
                  placeholder={
                    discountType === "percentage" ? "Enter %" : "Enter amount (INR)"
                  }
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="numeric"
                  editable={canEditCart}
                />
              </View>
            </View>

            <View style={styles.cartTotals}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{subtotalLabel}</Text>
              </View>
              {discountTotal ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Discount</Text>
                  <Text style={styles.totalValue}>-{discountAmountLabel}</Text>
                </View>
              ) : null}
              <View style={[styles.totalRow, styles.totalRowEmphasis]}>
                <Text style={styles.totalLabelStrong}>Total</Text>
                <Text style={styles.totalValueStrong}>{totalLabel}</Text>
              </View>
            </View>

            <Pressable
              style={[styles.totalCta, !canPay && styles.ctaDisabled]}
              onPress={handleCheckout}
              disabled={!canPay}
              accessibilityLabel="Total bill"
            >
              <Text style={styles.totalCtaText}>Checkout</Text>
              <Text style={styles.totalCtaAmount}>{totalLabel}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  list: {
    position: "relative",
    zIndex: 0,
  },
  listContent: {
    paddingHorizontal: 12,
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
  cartOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 15, 20, 0.55)",
    justifyContent: "flex-end",
  },
  cartOverlayTap: {
    ...StyleSheet.absoluteFillObject,
  },
  cartSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
    ...theme.shadows.sm,
  },
  cartHandleWrap: {
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  cartHandle: {
    alignSelf: "center",
    width: 46,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
  },
  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cartHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  cartTitleWrap: {
    minWidth: 0,
  },
  cartTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  cartSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  cartList: {
    flex: 1,
    minHeight: 0,
  },
  cartListContent: {
    paddingBottom: 4,
  },
  cartListFooterSpacer: {
    height: CART_LIST_FOOTER_SPACER,
  },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cartItemRowCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
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
    width: "100%",
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
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonDisabled: {
    opacity: 0.5,
  },
  qtyValue: {
    minWidth: 18,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  stockLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
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
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    padding: 6,
  },
  removeItemButtonDisabled: {
    opacity: 0.5,
  },
  discountSection: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    gap: 10,
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
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    gap: 6,
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
  skuRow: {
    gap: 12,
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
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    ...theme.shadows.sm,
    zIndex: 3,
  },
  cartBarFlash: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  cartBarDisabled: {
    opacity: 0.6,
  },
  cartBarTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartBarTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cartBarLocked: {
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cartBarLockedText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.warning,
  },
  cartBarCount: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartBarTotal: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.primaryDark,
    fontVariant: ["tabular-nums"],
  },
  cartBarBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  cartBarHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  cartBarUndo: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
});
