// PurchaseScreen - Unified Purchase Hub
// Segmented bar: Quick Purchase (scanner) | Live Suppliers (SKU grid)
// GATE-000: Uses ReadinessGate for runtime endpoint detection

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

// GATE-000: ReadinessGate for runtime endpoint detection
import { useFeatureReadiness, useProbeOnFocus } from "../hooks/useReadinessGate";

// =============================================================================
// ROTATING HINTS
// =============================================================================

const ROTATING_HINT_KEYS = [
  "purchase.hintSearchBuy",
  "purchase.hintLiveSuppliers",
  "purchase.hintBestRates",
  "purchase.hintTypeProduct",
  "purchase.hintSearchKaro",
  "purchase.hintBuyKaro",
  "purchase.hintQuickPurchase",
  "purchase.hintTypeKaro",
];

import { theme, useThemeColors } from "../theme";
import { formatMoney } from "../utils/money";
import { submitStockIn, submitStockInDemo, type StockInPayload } from "../services/api/stockInApi";

// POS-BUY-001: Live supplier catalog imports
import {
  getBuyCatalog,
  buyBarcodeSearch,
  getPreferredOrBestSupplier,
  type CatalogProduct,
} from "../services/api/catalogApi";
import { getDeviceStoreId } from "../services/deviceSession";
import { usePurchaseCartStore } from "../stores/purchaseCartStore";
// T-200: Wire Place Order to purchases API
import { createOrder } from "../services/api/orderApi";
import { CatalogProductCard } from "../components/buy/CatalogProductCard";
// POS-BUY-002: Grouped supplier product view modal
import { ProductDetailModal } from "../components/buy/ProductDetailModal";

// =============================================================================
// TYPES
// =============================================================================

type PurchaseMode = "quick" | "suppliers";

interface QuickPurchaseItem {
  id: string;
  barcode: string;
  productName: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  isNew: boolean;
}

// POS-BUY-001: SKUItem and CartItem types replaced by CatalogProduct + PurchaseCartItem
// Kept CartItem for Quick Purchase local cart only
interface CartItem {
  skuId: string;
  sku: string;
  productName: string;
  quantity: number;
  price: number;
  supplierName: string;
}

export interface PurchaseScreenProps {
  onOpenScanner?: () => void;
  scannedBarcode?: string | null; // Barcode from scanner to add to quick purchase
  onBarcodeProcessed?: () => void; // Called after barcode is processed
}

// =============================================================================
// FEATURE FLAGS - GATE-000: Replaced by ReadinessGate runtime probe
// =============================================================================
// NOTE: The old LIVE_SUPPLIERS_ENABLED and STOCK_IN_API_AVAILABLE flags have been
// replaced by useFeatureReadiness() hooks that probe actual endpoint availability.

const CARD_GAP = 8;
const CARD_PADDING = 12;

// =============================================================================
// COMPONENT
// =============================================================================

export default function PurchaseScreen({
  onOpenScanner,
  scannedBarcode,
  onBarcodeProcessed
}: PurchaseScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  // R1+R2: Responsive grid — 1 column for very small, 2 for normal
  const numColumns = screenWidth < 340 ? 1 : 2;

  // GATE-000: Runtime endpoint readiness detection
  const {
    isReady: liveSuppliersReady,
    blocker: liveSuppliersBlocker,
    isChecking: isCheckingLiveSuppliers,
    retry: retryLiveSuppliers,
  } = useFeatureReadiness("liveSuppliers");

  const {
    isReady: stockInReady,
    blocker: stockInBlocker,
    isChecking: isCheckingStockIn,
    retry: retryStockIn,
  } = useFeatureReadiness("stockIn");

  // Probe endpoints when Purchase tab is focused
  useProbeOnFocus();

  // Quick Purchase state
  const [quickItems, setQuickItems] = useState<QuickPurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // SA-P0-004: Optional supplier details for walk-in stock-in
  const [walkInSupplierName, setWalkInSupplierName] = useState("");
  const [walkInSupplierGstin, setWalkInSupplierGstin] = useState("");
  const [showSupplierFields, setShowSupplierFields] = useState(false);

  // POS-BUY-001: Live Suppliers catalog state
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const purchaseCart = usePurchaseCartStore();

  // POS-BUY-002: Selected product for supplier detail modal
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);

  // T-200: Place Order loading state
  const [placingOrder, setPlacingOrder] = useState(false);

  // Legacy local cart state (kept for backward compat with Quick Purchase cart actions)
  const [cart, setCart] = useState<CartItem[]>([]);

  // Segment state: null = 50/50 view, "quick" or "suppliers" = expanded
  const [expandedSegment, setExpandedSegment] = useState<PurchaseMode | null>(null);

  // Mode is determined by expanded segment or quick items presence
  const mode: PurchaseMode = quickItems.length > 0 ? "quick" : (expandedSegment || "suppliers");

  // Search input ref
  const searchInputRef = useRef<TextInput>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Track user activity to prevent auto-restore
  const [isUserActive, setIsUserActive] = useState(false);
  const autoRestoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rotating hints animation
  const [hintIndex, setHintIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Auto-restore to 50:50 after 6 seconds of inactivity
  useEffect(() => {
    if (expandedSegment && !isUserActive && !isSearchFocused && searchQuery.length === 0 && quickItems.length === 0 && cart.length === 0) {
      autoRestoreTimerRef.current = setTimeout(() => {
        setExpandedSegment(null);
      }, 6000);
    }

    return () => {
      if (autoRestoreTimerRef.current) {
        clearTimeout(autoRestoreTimerRef.current);
      }
    };
  }, [expandedSegment, isUserActive, isSearchFocused, searchQuery, quickItems.length, cart.length]);

  // Rotating hints - only when expanded
  useEffect(() => {
    if (!expandedSegment || isSearchFocused || searchQuery.length > 0) return;

    const interval = setInterval(() => {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        // Change text
        setHintIndex((prev) => (prev + 1) % ROTATING_HINT_KEYS.length);
        // Fade in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [expandedSegment, isSearchFocused, searchQuery, fadeAnim]);

  // Mark user as active when they interact
  const markUserActive = useCallback(() => {
    setIsUserActive(true);
    if (autoRestoreTimerRef.current) {
      clearTimeout(autoRestoreTimerRef.current);
    }
  }, []);

  // T-148: Unified scan — check supplier catalog first, fall back to manual quick purchase
  // Track scan resolution state for UI feedback
  const [scanResolving, setScanResolving] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<"supplier" | "manual" | null>(null);

  // Handle scanned barcode from parent
  useEffect(() => {
    if (!scannedBarcode) return;
    markUserActive();

    // T-148: Try supplier catalog lookup first (if live suppliers ready)
    if (liveSuppliersReady) {
      setScanResolving(true);
      (async () => {
        try {
          const storeId = await getDeviceStoreId();
          if (storeId) {
            const product = await buyBarcodeSearch(storeId, scannedBarcode);
            if (product && product.suppliers.length > 0) {
              // Found in supplier catalog — add to purchase cart (supplier flow)
              const supplier = getPreferredOrBestSupplier(product);
              if (supplier) {
                purchaseCart.addItem({
                  supplierProductId: supplier.supplierProductId,
                  productId: product.id,
                  supplierId: supplier.supplierId,
                  supplierName: supplier.supplierName,
                  productName: product.name,
                  barcode: product.primaryBarcode || scannedBarcode,
                  unitPrice: supplier.purchasePrice,
                  mrp: supplier.mrp,
                  moq: supplier.moq,
                });
                setExpandedSegment("suppliers");
                setLastScanResult("supplier");
                setScanResolving(false);
                onBarcodeProcessed?.();
                return;
              }
            }
          }
        } catch (err) {
          if (__DEV__) console.warn("[PurchaseScreen] T-148: Supplier lookup failed, falling back to manual:", err);
        }
        // Not found in supplier catalog — fall through to manual entry
        setScanResolving(false);
        addToQuickItems(scannedBarcode);
        onBarcodeProcessed?.();
      })();
    } else {
      // No live suppliers — direct to quick purchase
      addToQuickItems(scannedBarcode);
      onBarcodeProcessed?.();
    }
  }, [scannedBarcode, markUserActive, onBarcodeProcessed, liveSuppliersReady, purchaseCart]);

  // T-148: Helper to add barcode to quick purchase items
  const addToQuickItems = useCallback((barcode: string) => {
    setExpandedSegment("quick");
    setLastScanResult("manual");
    setQuickItems((prev) => {
      const existing = prev.find((i) => i.barcode === barcode);
      if (existing) {
        return prev.map((item) =>
          item.barcode === barcode ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        const newItem: QuickPurchaseItem = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          barcode,
          productName: "",
          quantity: 1,
          buyPrice: 0,
          sellPrice: 0,
          isNew: true,
        };
        return [newItem, ...prev];
      }
    });
  }, []);

  // T-148: Clear scan result indicator after 3 seconds
  useEffect(() => {
    if (lastScanResult) {
      const timer = setTimeout(() => setLastScanResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [lastScanResult]);

  // POS-BUY-001: Fetch live supplier catalog
  const fetchCatalog = useCallback(async (query?: string, page = 1) => {
    if (!liveSuppliersReady) return;
    try {
      setCatalogLoading(true);
      setCatalogError(null);
      const storeId = await getDeviceStoreId();
      if (!storeId) {
        setCatalogError(t("purchase.storeNotConfigured"));
        return;
      }
      const res = await getBuyCatalog(storeId, {
        q: query || undefined,
        page,
        limit: 20,
      });
      if (page === 1) {
        setCatalogProducts(res.data);
      } else {
        setCatalogProducts((prev) => [...prev, ...res.data]);
      }
      setCatalogPage(page);
      setCatalogHasMore(res.pagination.hasMore);
    } catch (err) {
      if (__DEV__) console.error("fetchCatalog error:", err);
      setCatalogError(t("purchase.failedToLoadCatalog"));
    } finally {
      setCatalogLoading(false);
    }
  }, [liveSuppliersReady, t]);

  // POS-BUY-001: Debounced search effect
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!liveSuppliersReady) return;
    if (expandedSegment !== "suppliers") return;

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      fetchCatalog(searchQuery, 1);
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, liveSuppliersReady, expandedSegment, fetchCatalog]);

  // POS-BUY-001: Initial catalog load when switching to suppliers mode
  // ISSUE-067: Guard against catalogError to prevent infinite re-fetch loop
  useEffect(() => {
    if (liveSuppliersReady && expandedSegment === "suppliers" && catalogProducts.length === 0 && !catalogLoading && !catalogError) {
      fetchCatalog("", 1);
    }
  }, [liveSuppliersReady, expandedSegment, catalogProducts.length, catalogLoading, catalogError, fetchCatalog]);

  // POS-BUY-001: Barcode scan → supplier product resolution
  const handleBuyBarcodeScan = useCallback(async (barcode: string) => {
    if (!liveSuppliersReady) return;
    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) return;
      const product = await buyBarcodeSearch(storeId, barcode);
      if (product && product.suppliers.length > 0) {
        const supplier = getPreferredOrBestSupplier(product);
        if (supplier) {
          purchaseCart.addItem({
            supplierProductId: supplier.supplierProductId,
            productId: product.id,
            supplierId: supplier.supplierId,
            supplierName: supplier.supplierName,
            productName: product.name,
            barcode: product.primaryBarcode || barcode,
            unitPrice: supplier.purchasePrice,
            mrp: supplier.mrp,
            moq: supplier.moq,
          });
        }
      }
    } catch (err) {
      if (__DEV__) console.error("buyBarcodeSearch error:", err);
    }
  }, [liveSuppliersReady, purchaseCart]);

  // POS-BUY-002: Handle catalog product tap — show supplier detail modal if
  // multiple suppliers, otherwise add best supplier directly to cart
  const handleCatalogProductPress = useCallback((product: CatalogProduct) => {
    if (product.supplierCount > 1) {
      // Multiple suppliers — open grouped supplier view
      setSelectedProduct(product);
      return;
    }
    // Single supplier — add directly
    const supplier = getPreferredOrBestSupplier(product);
    if (!supplier) return;

    purchaseCart.addItem({
      supplierProductId: supplier.supplierProductId,
      productId: product.id,
      supplierId: supplier.supplierId,
      supplierName: supplier.supplierName,
      productName: product.name,
      barcode: product.primaryBarcode,
      unitPrice: supplier.purchasePrice,
      mrp: supplier.mrp,
      moq: supplier.moq,
    });
  }, [purchaseCart]);

  // POS-BUY-001: Load more pages
  const handleCatalogLoadMore = useCallback(() => {
    if (catalogLoading || !catalogHasMore) return;
    fetchCatalog(searchQuery, catalogPage + 1);
  }, [catalogLoading, catalogHasMore, searchQuery, catalogPage, fetchCatalog]);

  const purchaseCartTotals = purchaseCart.getTotals();

  // =============================================================================
  // QUICK PURCHASE HANDLERS
  // =============================================================================

  const updateQuickItem = useCallback((id: string, field: keyof QuickPurchaseItem, value: string | number) => {
    setQuickItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }, []);

  const removeQuickItem = useCallback((id: string) => {
    setQuickItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const proceedWithSubmit = useCallback(async () => {
    if (quickItems.length === 0) {
      Alert.alert(t("purchase.noItemsTitle"), t("purchase.scanItemsToAdd"));
      return;
    }
    const incomplete = quickItems.filter((i) => !i.productName || i.buyPrice <= 0 || i.sellPrice <= 0);
    if (incomplete.length > 0) {
      Alert.alert(t("purchase.incompleteTitle"), t("purchase.fillAllFields"));
      return;
    }

    setSubmitting(true);
    try {
      // STG-466: Convert user-entered major units (rupees) to minor units (paise) for backend
      const payload: StockInPayload = {
        items: quickItems.map((item) => ({
          barcode: item.barcode,
          productName: item.productName,
          quantity: item.quantity,
          buyPrice: Math.round(item.buyPrice * 100),
          sellPrice: Math.round(item.sellPrice * 100),
          isNewProduct: item.isNew,
        })),
        totalAmount: Math.round(quickItems.reduce((sum, i) => sum + i.quantity * i.buyPrice, 0) * 100),
        // SA-P0-004: Include optional supplier info for walk-in purchases
        ...(walkInSupplierName.trim() ? { supplierName: walkInSupplierName.trim() } : {}),
        ...(walkInSupplierGstin.trim() ? { supplierGstin: walkInSupplierGstin.trim() } : {}),
      };
      // GATE-000: Use real API or demo based on readiness
      const result = stockInReady
        ? await submitStockIn(payload)
        : await submitStockInDemo(payload);
      Alert.alert(
        stockInReady ? t("common.done") : t("purchase.demoMode"),
        stockInReady
          ? t("purchase.itemsAddedToLedger", { count: result.itemsProcessed })
          : t("purchase.itemsSavedLocally", { count: result.itemsProcessed })
      );
      setQuickItems([]);
      setWalkInSupplierName("");
      setWalkInSupplierGstin("");
      setShowSupplierFields(false);
    } catch (error: any) {
      // STG-444: Surface specific error type instead of generic message
      const msg = error?.message || t("purchase.failedToSubmit");
      Alert.alert(t("common.error"), msg);
    } finally {
      setSubmitting(false);
    }
  }, [quickItems, stockInReady, walkInSupplierName, walkInSupplierGstin, t]);

  const handleQuickSubmit = useCallback(async () => {
    // GATE-000: Gate Stock In when API not available
    if (!stockInReady) {
      Alert.alert(
        t("purchase.backendPending"),
        t("purchase.stockInNotDeployed", { blocker: stockInBlocker || t("purchase.blockedByApi") }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("purchase.retryCheck"),
            onPress: () => retryStockIn(),
          },
          {
            text: t("purchase.saveLocallyDemo"),
            onPress: () => proceedWithSubmit(),
          },
        ]
      );
      return;
    }
    proceedWithSubmit();
    // UIUX-POS-013: proceedWithSubmit must be in deps to avoid stale closure
  }, [stockInReady, stockInBlocker, retryStockIn, proceedWithSubmit]);

  // STG-465: Convert major→minor (×100) for formatMoney which expects paise
  const quickTotal = Math.round(quickItems.reduce((sum, i) => sum + i.quantity * i.buyPrice, 0) * 100);

  // POS-BUY-001: Legacy addToCart/cartTotal/cartQty removed — replaced by purchaseCartStore

  // =============================================================================
  // RENDER QUICK PURCHASE
  // =============================================================================

  const renderQuickItem = useCallback(({ item }: { item: QuickPurchaseItem }) => (
    <View style={styles.quickItemCard}>
      <View style={styles.quickItemHeader}>
        <View style={styles.barcodeWrap}>
          <MaterialCommunityIcons name="barcode" size={12} color={colors.textTertiary} />
          <Text style={styles.barcodeText}>{item.barcode}</Text>
        </View>
        <Pressable onPress={() => removeQuickItem(item.id)} hitSlop={8} accessibilityLabel="Remove item" accessibilityRole="button">
          <MaterialCommunityIcons name="close" size={16} color={colors.error} />
        </Pressable>
      </View>
      <TextInput
        style={styles.quickNameInput}
        placeholder={t("purchase.productName")}
        placeholderTextColor={colors.textTertiary}
        value={item.productName}
        onChangeText={(t) => updateQuickItem(item.id, "productName", t)}
      />
      <View style={styles.quickPriceRow}>
        <View style={styles.qtyWrap}>
          <Pressable style={styles.qtyBtn} onPress={() => updateQuickItem(item.id, "quantity", Math.max(1, item.quantity - 1))} accessibilityLabel="Decrease quantity" accessibilityRole="button">
            <MaterialCommunityIcons name="minus" size={14} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <Pressable style={styles.qtyBtn} onPress={() => updateQuickItem(item.id, "quantity", item.quantity + 1)} accessibilityLabel="Increase quantity" accessibilityRole="button">
            <MaterialCommunityIcons name="plus" size={14} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.priceInputWrap}>
          <Text style={styles.priceLabel}>{t("purchase.buyPrice")}</Text>
          <TextInput
            style={styles.priceInput}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            value={item.buyPrice > 0 ? String(item.buyPrice) : ""}
            onChangeText={(val) => updateQuickItem(item.id, "buyPrice", parseFloat(val) || 0)}
          />
        </View>
        <View style={styles.priceInputWrap}>
          <Text style={styles.priceLabel}>{t("purchase.sellPrice")}</Text>
          <TextInput
            style={styles.priceInput}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
            value={item.sellPrice > 0 ? String(item.sellPrice) : ""}
            onChangeText={(val) => updateQuickItem(item.id, "sellPrice", parseFloat(val) || 0)}
          />
        </View>
      </View>
    </View>
  ), [removeQuickItem, updateQuickItem]);

  // POS-BUY-001: renderSKU removed — replaced by CatalogProductCard in FlatList

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <View style={styles.container}>
      {/* Segmented Bar - Camera + Quick Purchase (50%) + Live Suppliers (50%) */}
      <View style={styles.segmentedBarContainer}>
        <View style={styles.segmentedBar}>
          {/* Camera Icon - Opens scanner */}
          <Pressable
            style={[styles.cameraSegment, quickItems.length > 0 && styles.segmentActive]}
            onPress={() => {
              setExpandedSegment("quick");
              onOpenScanner?.();
            }}
            accessibilityLabel="Open camera scanner"
            accessibilityRole="button"
            testID="purchase-scan-btn"
          >
            <MaterialCommunityIcons
              name="camera"
              size={20}
              color={quickItems.length > 0 ? colors.textInverse : colors.textSecondary}
            />
          </Pressable>

          {/* Divider */}
          <View style={styles.segmentDivider} />

          {/* 50/50 or Expanded segments */}
          {expandedSegment === null ? (
            // 50/50 View - Show both segments
            <>
              {/* Quick Purchase Segment (50%) */}
              <Pressable
                style={styles.halfSegment}
                onPress={() => {
                  setExpandedSegment("quick");
                  onOpenScanner?.();
                }}
                accessibilityLabel="Quick Purchase"
                accessibilityRole="tab"
                testID="purchase-quick-tab"
              >
                <Text style={styles.halfSegmentText}>{t("purchase.quickPurchase")}</Text>
              </Pressable>

              {/* Divider */}
              <View style={styles.segmentDivider} />

              {/* Live Suppliers Segment (50%) */}
              <Pressable
                style={styles.halfSegment}
                onPress={() => {
                  setExpandedSegment("suppliers");
                  setQuickItems([]);
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }}
                accessibilityLabel={t("purchase.liveSuppliers")}
                accessibilityRole="tab"
                testID="purchase-suppliers-tab"
              >
                <Text style={styles.halfSegmentText}>{t("purchase.liveSuppliers")}</Text>
              </Pressable>
            </>
          ) : expandedSegment === "quick" ? (
            // Quick Purchase Expanded
            <Pressable
              style={[styles.expandedSegment, styles.segmentActive]}
              onPress={() => onOpenScanner?.()}
              accessibilityLabel="Open scanner for quick purchase"
              accessibilityRole="button"
            >
              <Animated.Text
                style={[styles.expandedSegmentText, { opacity: fadeAnim }]}
                numberOfLines={1}
              >
                {t(ROTATING_HINT_KEYS[hintIndex])}
              </Animated.Text>
            </Pressable>
          ) : (
            // Live Suppliers Expanded - Search input
            <View style={[styles.expandedSegment, styles.segmentActive]}>
              <MaterialCommunityIcons
                name="magnify"
                size={18}
                color={colors.textInverse}
              />
              {isSearchFocused || searchQuery.length > 0 ? (
                <TextInput
                  ref={searchInputRef}
                  style={styles.searchInputExpanded}
                  value={searchQuery}
                  onChangeText={(text) => {
                    markUserActive();
                    setSearchQuery(text);
                  }}
                  onFocus={() => {
                    markUserActive();
                    setIsSearchFocused(true);
                  }}
                  onBlur={() => setIsSearchFocused(false)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  placeholderTextColor={colors.textInverse}
                />
              ) : (
                <Pressable
                  style={styles.rotatingHintContainer}
                  onPress={() => {
                    markUserActive();
                    setIsSearchFocused(true);
                    // Focus after state update causes TextInput to render
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  accessibilityLabel="Tap to search products"
                  accessibilityRole="button"
                >
                  <Animated.Text
                    style={[styles.rotatingHintExpanded, { opacity: fadeAnim }]}
                    numberOfLines={1}
                  >
                    {t(ROTATING_HINT_KEYS[hintIndex])}
                  </Animated.Text>
                </Pressable>
              )}
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8} accessibilityLabel="Clear search" accessibilityRole="button">
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={16}
                    color={colors.textInverse}
                  />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>

      {/* T-148: Scan resolution feedback */}
      {scanResolving && (
        <View style={styles.scanFeedbackBar}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.scanFeedbackText}>{t("purchase.checkingCatalog")}</Text>
        </View>
      )}
      {lastScanResult && !scanResolving && (
        <View style={[
          styles.scanFeedbackBar,
          lastScanResult === "supplier" ? styles.scanFeedbackSupplier : styles.scanFeedbackManual,
        ]}>
          <MaterialCommunityIcons
            name={lastScanResult === "supplier" ? "check-circle" : "pencil-plus"}
            size={16}
            color={lastScanResult === "supplier" ? colors.success : colors.warning}
          />
          <Text style={[
            styles.scanFeedbackText,
            { color: lastScanResult === "supplier" ? colors.success : colors.warning },
          ]}>
            {lastScanResult === "supplier"
              ? t("purchase.addedFromCatalog")
              : t("purchase.notInCatalogManual")}
          </Text>
        </View>
      )}

      {/* Content */}
      {mode === "quick" ? (
        // Quick Purchase Content - only shows when items exist
        <View style={styles.quickContent}>
          <FlatList
            key="quick-purchase-list"
            data={quickItems}
            renderItem={renderQuickItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.quickList, { paddingBottom: insets.bottom + 90 }]}
            showsVerticalScrollIndicator={false}
          />

          {/* SA-P0-004: Optional Supplier Details (collapsible) */}
          {quickItems.length > 0 && (
            <View style={styles.supplierSection}>
              <Pressable
                style={styles.supplierToggle}
                onPress={() => setShowSupplierFields(!showSupplierFields)}
                accessibilityLabel={showSupplierFields ? "Hide supplier details" : "Show supplier details"}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name={showSupplierFields ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.textSecondary}
                />
                <Text style={styles.supplierToggleText}>
                  {t("purchase.supplierDetailsOptional")}
                </Text>
                {(walkInSupplierName.trim() || walkInSupplierGstin.trim()) && (
                  <View style={styles.supplierBadge}>
                    <Text style={styles.supplierBadgeText}>
                      {walkInSupplierGstin.trim() ? t("purchase.gstin") : t("purchase.name")}
                    </Text>
                  </View>
                )}
              </Pressable>
              {showSupplierFields && (
                <View style={styles.supplierFields}>
                  <TextInput
                    style={styles.supplierInput}
                    value={walkInSupplierName}
                    onChangeText={setWalkInSupplierName}
                    placeholder={t("purchase.supplierName")}
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                  />
                  <TextInput
                    style={styles.supplierInput}
                    value={walkInSupplierGstin}
                    onChangeText={(text) => setWalkInSupplierGstin(text.toUpperCase())}
                    placeholder={t("purchase.gstinPlaceholder")}
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="characters"
                    maxLength={15}
                  />
                </View>
              )}
            </View>
          )}

          {/* Quick Purchase Action Bar */}
          <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.actionSummary}>
              <Text style={styles.actionText}>{t("purchase.itemsCount", { count: quickItems.length })}</Text>
              <Text style={styles.actionTotal}>{formatMoney(quickTotal)}</Text>
              {/* GATE-000: Show demo mode indicator when API not ready */}
              {!stockInReady && (
                <Text style={styles.demoModeIndicator}>{t("purchase.demoMode")}</Text>
              )}
            </View>
            <Pressable
              style={[
                styles.actionBtn,
                submitting && styles.actionBtnDisabled,
                !stockInReady && styles.actionBtnDemo,
              ]}
              onPress={handleQuickSubmit}
              disabled={submitting}
              accessibilityLabel={stockInReady ? t("purchase.stockIn") : t("purchase.stockInDraft")}
              accessibilityRole="button"
              testID="purchase-stock-in-btn"
            >
              <Text style={styles.actionBtnText}>
                {stockInReady ? t("purchase.stockIn") : t("purchase.stockInDraft")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        // POS-BUY-001: Live Suppliers Content — real catalog
        <View style={styles.suppliersContent}>
          {!liveSuppliersReady ? (
            <View style={styles.emptyStateContainer}>
              {isCheckingLiveSuppliers ? (
                <>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.emptyStateTitle}>{t("purchase.checkingBackend")}</Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons
                    name="store-off-outline"
                    size={64}
                    color={colors.textTertiary}
                  />
                  <Text style={styles.emptyStateTitle}>{t("purchase.catalogComingSoon")}</Text>
                  <Text style={styles.emptyStateMessage}>
                    {t("purchase.catalogNotEnabled")}
                  </Text>
                  <View style={styles.emptyStateBlocker}>
                    <Text style={styles.emptyStateBlockerLabel}>{t("purchase.requires")}</Text>
                    <Text style={styles.emptyStateBlockerText}>
                      {liveSuppliersBlocker || t("purchase.supplierApiNotAvailable")}
                    </Text>
                  </View>
                  <Pressable style={styles.retryButton} onPress={retryLiveSuppliers} accessibilityLabel={t("purchase.retryCheckingSuppliers")} accessibilityRole="button">
                    <MaterialCommunityIcons name="refresh" size={16} color={colors.primary} />
                    <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
                  </Pressable>
                  <Text style={styles.emptyStateHint}>
                    {t("purchase.useQuickPurchaseHint")}
                  </Text>
                </>
              )}
            </View>
          ) : catalogError ? (
            <View style={styles.emptyStateContainer}>
              <MaterialCommunityIcons name="alert-circle-outline" size={48} color={colors.error} />
              <Text style={styles.emptyStateTitle}>{catalogError}</Text>
              <Pressable style={styles.retryButton} onPress={() => fetchCatalog(searchQuery, 1)} accessibilityLabel={t("purchase.retryLoadingCatalog")} accessibilityRole="button">
                <MaterialCommunityIcons name="refresh" size={16} color={colors.primary} />
                <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
              </Pressable>
            </View>
          ) : catalogProducts.length === 0 && !catalogLoading ? (
            <View style={styles.emptyStateContainer}>
              <MaterialCommunityIcons
                name="magnify"
                size={48}
                color={colors.textTertiary}
              />
              <Text style={styles.emptyStateTitle}>{t("purchase.noProductsFound")}</Text>
              <Text style={styles.emptyStateMessage}>
                {searchQuery ? t("purchase.noProductsMatch", { query: searchQuery }) : t("purchase.searchToAdd")}
              </Text>
            </View>
          ) : (
            <>
              {/* POS-BUY-001: Catalog product grid */}
              <FlatList
                key={`catalog-grid-${numColumns}col`}
                data={catalogProducts}
                renderItem={({ item }) => (
                  <CatalogProductCard
                    product={item}
                    onPress={handleCatalogProductPress}
                    cartQuantity={
                      purchaseCart.items.filter((ci) => ci.productId === item.id)
                        .reduce((sum, ci) => sum + ci.quantity, 0)
                    }
                  />
                )}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                contentContainerStyle={[
                  styles.skuGrid,
                  { paddingBottom: insets.bottom + (purchaseCartTotals.itemCount > 0 ? 90 : 20) },
                ]}
                showsVerticalScrollIndicator={false}
                onEndReached={handleCatalogLoadMore}
                onEndReachedThreshold={0.3}
                ListFooterComponent={
                  catalogLoading ? (
                    <ActivityIndicator style={{ padding: 16 }} color={colors.primary} />
                  ) : null
                }
              />

              {/* POS-BUY-001: Purchase cart action bar */}
              {purchaseCartTotals.itemCount > 0 && (
                <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
                  <View style={styles.actionSummary}>
                    <Text style={styles.actionText}>
                      {t("purchase.cartSummary", { items: purchaseCartTotals.itemCount, suppliers: purchaseCartTotals.supplierCount })}
                    </Text>
                    <Text style={styles.actionTotal}>{formatMoney(purchaseCartTotals.grandTotal)}</Text>
                  </View>
                  {/* T-200: Wire Review Order → Place Order via orderApi */}
                  <Pressable
                    style={[styles.actionBtn, placingOrder && { opacity: 0.6 }]}
                    disabled={placingOrder}
                    accessibilityLabel="Review Order"
                    accessibilityRole="button"
                    testID="purchase-review-order-btn"
                    onPress={() => {
                      const items = purchaseCart.items;
                      const summary = items
                        .map((ci) => `${ci.productName || ci.productId.slice(0, 8)} x${ci.quantity}`)
                        .join("\n");
                      Alert.alert(
                        t("purchase.reviewOrder"),
                        t("purchase.reviewOrderSummary", { items: purchaseCartTotals.itemCount, suppliers: purchaseCartTotals.supplierCount, summary, total: formatMoney(purchaseCartTotals.grandTotal) }),
                        [
                          { text: t("purchase.continueShopping"), style: "cancel" },
                          {
                            text: t("purchase.placeOrder"),
                            onPress: async () => {
                              const storeId = await getDeviceStoreId();
                              if (!storeId) {
                                Alert.alert(t("common.error"), t("purchase.storeNotConfiguredReenroll"));
                                return;
                              }
                              setPlacingOrder(true);
                              try {
                                const supplierGroups = purchaseCart.getItemsBySupplier();
                                // STG-443: Track partial success for multi-supplier orders
                                const succeeded: string[] = [];
                                const failed: { supplier: string; error: string }[] = [];
                                for (const group of supplierGroups) {
                                  try {
                                    const order = await createOrder(storeId, {
                                      supplierId: group.supplierId,
                                      orderType: "manual",
                                      items: group.items.map((ci) => ({
                                        supplierProductId: ci.supplierProductId,
                                        quantity: ci.quantity,
                                        unitPrice: ci.unitPrice,
                                      })),
                                    });
                                    succeeded.push(`${group.supplierName}: ${order.orderNumber}`);
                                    // Remove succeeded supplier items from cart immediately
                                    for (const ci of group.items) {
                                      purchaseCart.removeItem(ci.supplierProductId);
                                    }
                                  } catch (err: any) {
                                    failed.push({ supplier: group.supplierName, error: err?.message || "Unknown error" });
                                  }
                                }
                                if (failed.length === 0) {
                                  purchaseCart.clear();
                                  Alert.alert(
                                    t("purchase.ordersPlaced"),
                                    t("purchase.ordersPlacedMessage", { count: succeeded.length, details: succeeded.join("\n") }),
                                    [{ text: t("common.ok") }]
                                  );
                                } else if (succeeded.length > 0) {
                                  Alert.alert(
                                    t("purchase.partialSuccess"),
                                    t("purchase.partialSuccessMessage", { succeeded: succeeded.length, succeededDetails: succeeded.join("\n"), failed: failed.length, failedDetails: failed.map(f => `${f.supplier}: ${f.error}`).join("\n") }),
                                    [{ text: t("common.ok") }]
                                  );
                                } else {
                                  Alert.alert(t("purchase.orderFailed"), failed.map(f => `${f.supplier}: ${f.error}`).join("\n"));
                                }
                              } catch (err: any) {
                                const msg = err?.message || t("purchase.failedToPlaceOrder");
                                Alert.alert(t("purchase.orderFailed"), msg);
                              } finally {
                                setPlacingOrder(false);
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Text style={styles.actionBtnText}>
                      {placingOrder ? t("purchase.placingOrder") : t("purchase.reviewOrder")}
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      )}
      {/* POS-BUY-002: Grouped supplier product detail modal */}
      <ProductDetailModal
        visible={selectedProduct !== null}
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Segmented Bar
  segmentedBarContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  segmentedBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    height: 44,
  },
  cameraSegment: {
    width: 48,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  halfSegment: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  halfSegmentText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  expandedSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    paddingHorizontal: 12,
    gap: 8,
  },
  expandedSegmentText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textInverse,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  rotatingHintContainer: {
    flex: 1,
  },
  rotatingHintExpanded: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textInverse,
  },
  searchInputExpanded: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textInverse,
    paddingVertical: 0,
  },

  // Quick Purchase
  quickContent: {
    flex: 1,
  },
  quickList: {
    padding: 12,
  },
  quickItemCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 10,
  },
  quickItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  barcodeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  barcodeText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: colors.textTertiary,
  },
  quickNameInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 8,
  },
  quickPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 6,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    minWidth: 24,
    textAlign: "center",
  },
  priceInputWrap: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: 2,
  },
  priceInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },

  // Live Suppliers
  suppliersContent: {
    flex: 1,
  },
  skuGrid: {
    padding: CARD_PADDING,
    paddingTop: 8,
  },
  cartBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: colors.success,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textInverse,
  },
  outOfStockOverlay: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: colors.error,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  outOfStockText: {
    fontSize: 8,
    fontWeight: "700",
    color: colors.textInverse,
  },

  // Action Bar
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 12,
  },
  actionSummary: {
    flex: 1,
  },
  actionText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  actionTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  actionBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  // UI-006: Demo mode button style
  actionBtnDemo: {
    backgroundColor: colors.warning,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textInverse,
  },
  // UI-006: Demo mode indicator
  demoModeIndicator: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.warning,
    marginTop: 2,
  },

  // UI-005: Empty State for Live Suppliers
  emptyStateContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 16,
    textAlign: "center",
  },
  emptyStateMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  emptyStateBlocker: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.warningSoft,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  emptyStateBlockerLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.warning,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  emptyStateBlockerText: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  emptyStateHint: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: 20,
    fontStyle: "italic",
  },
  // SA-P0-004: Supplier details styles
  supplierSection: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
  },
  supplierToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 6,
  },
  supplierToggleText: {
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  supplierBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  supplierBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  supplierFields: {
    gap: 8,
    paddingBottom: 10,
  },
  supplierInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textPrimary,
  },
  // T-148: Scan resolution feedback styles
  scanFeedbackBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  scanFeedbackText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
  },
  scanFeedbackSupplier: {
    backgroundColor: colors.successSoft,
  },
  scanFeedbackManual: {
    backgroundColor: colors.warningSoft,
  },
}); }
