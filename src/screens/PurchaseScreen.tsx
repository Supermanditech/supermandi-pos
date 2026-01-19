// PurchaseScreen - Unified Purchase Hub
// Segmented bar: Quick Purchase (scanner) | Live Suppliers (SKU grid)

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

// =============================================================================
// ROTATING HINTS
// =============================================================================

const ROTATING_HINTS = [
  "Search & Buy",
  "Live Suppliers",
  "Best Rates Here",
  "Type product name",
  "Product search karo…",
  "Live suppliers se buy karo →",
  "Quick purchase ⚡",
  "SKU / naam type karo…",
];

import { theme } from "../theme";
import { formatMoney } from "../utils/money";
import { submitStockIn, type StockInPayload } from "../services/api/stockInApi";

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

interface SKUItem {
  id: string;
  sku: string;
  productName: string;
  packSize: string;
  price: number;
  moq: number;
  supplierName: string;
  photoUrl?: string;
  inStock: boolean;
}

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
// MOCK DATA
// =============================================================================

const MOCK_SKUS: SKUItem[] = [
  { id: "1", sku: "TUR-DAL-1KG", productName: "Toor Dal Premium", packSize: "1 kg", price: 142, moq: 10, supplierName: "Agro Fresh", inStock: true },
  { id: "2", sku: "RCE-BAS-5KG", productName: "Basmati Rice", packSize: "5 kg", price: 410, moq: 15, supplierName: "RiceKing", inStock: true },
  { id: "3", sku: "OIL-SUN-1L", productName: "Sunflower Oil", packSize: "1 L", price: 120, moq: 24, supplierName: "OilWorld", inStock: true },
  { id: "4", sku: "SUG-WHT-1KG", productName: "White Sugar", packSize: "1 kg", price: 42, moq: 25, supplierName: "Agro Fresh", inStock: true },
  { id: "5", sku: "ATA-CHK-5KG", productName: "Chakki Atta", packSize: "5 kg", price: 248, moq: 10, supplierName: "KisanMart", inStock: true },
  { id: "6", sku: "SAL-IOD-1KG", productName: "Iodised Salt", packSize: "1 kg", price: 20, moq: 50, supplierName: "Agro Fresh", inStock: true },
  { id: "7", sku: "TEA-TAT-250", productName: "Tata Tea Gold", packSize: "250 gm", price: 135, moq: 12, supplierName: "BevMart", inStock: true },
  { id: "8", sku: "MLK-AMU-500", productName: "Amul Milk", packSize: "500 ml", price: 28, moq: 20, supplierName: "DairyFresh", inStock: false },
  { id: "9", sku: "BIS-PAR-200", productName: "Parle-G Biscuit", packSize: "200 gm", price: 22, moq: 24, supplierName: "SnackHub", inStock: true },
];

const SCREEN_WIDTH = Dimensions.get("window").width;
const NUM_COLUMNS = 3;
const CARD_GAP = 8;
const CARD_PADDING = 12;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - CARD_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

// =============================================================================
// COMPONENT
// =============================================================================

export default function PurchaseScreen({
  onOpenScanner,
  scannedBarcode,
  onBarcodeProcessed
}: PurchaseScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Quick Purchase state
  const [quickItems, setQuickItems] = useState<QuickPurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Live Suppliers state
  const [searchQuery, setSearchQuery] = useState("");
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
        setHintIndex((prev) => (prev + 1) % ROTATING_HINTS.length);
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

  // Handle scanned barcode from parent
  useEffect(() => {
    if (scannedBarcode) {
      markUserActive();
      setExpandedSegment("quick");

      // Add to quick items - use functional update to avoid stale closure
      setQuickItems((prev) => {
        const existing = prev.find((i) => i.barcode === scannedBarcode);
        if (existing) {
          return prev.map((item) =>
            item.barcode === scannedBarcode ? { ...item, quantity: item.quantity + 1 } : item
          );
        } else {
          const newItem: QuickPurchaseItem = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            barcode: scannedBarcode,
            productName: "",
            quantity: 1,
            buyPrice: 0,
            sellPrice: 0,
            isNew: true,
          };
          return [newItem, ...prev];
        }
      });
      onBarcodeProcessed?.();
    }
  }, [scannedBarcode, markUserActive, onBarcodeProcessed]);

  // Filter SKUs
  const filteredSKUs = MOCK_SKUS.filter((sku) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return sku.productName.toLowerCase().includes(q) || sku.sku.toLowerCase().includes(q);
  });

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

  const handleQuickSubmit = useCallback(async () => {
    if (quickItems.length === 0) {
      Alert.alert("No Items", "Scan items to add.");
      return;
    }
    const incomplete = quickItems.filter((i) => !i.productName || i.buyPrice <= 0 || i.sellPrice <= 0);
    if (incomplete.length > 0) {
      Alert.alert("Incomplete", "Fill name, buy & sell price for all items.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: StockInPayload = {
        items: quickItems.map((item) => ({
          barcode: item.barcode,
          productName: item.productName,
          quantity: item.quantity,
          buyPrice: item.buyPrice,
          sellPrice: item.sellPrice,
          isNewProduct: item.isNew,
        })),
        totalAmount: quickItems.reduce((sum, i) => sum + i.quantity * i.buyPrice, 0),
      };
      const result = await submitStockIn(payload);
      Alert.alert("Done", `${result.itemsProcessed} items added to ledger.`);
      setQuickItems([]);
    } catch (error) {
      Alert.alert("Error", "Failed to submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [quickItems]);

  const quickTotal = quickItems.reduce((sum, i) => sum + i.quantity * i.buyPrice, 0);

  // =============================================================================
  // LIVE SUPPLIERS HANDLERS
  // =============================================================================

  const addToCart = useCallback((sku: SKUItem) => {
    markUserActive();
    setCart((prev) => {
      const existing = prev.find((c) => c.skuId === sku.id);
      if (existing) {
        return prev.map((c) =>
          c.skuId === sku.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, {
        skuId: sku.id,
        sku: sku.sku,
        productName: sku.productName,
        quantity: 1,
        price: sku.price,
        supplierName: sku.supplierName,
      }];
    });
  }, [markUserActive]);

  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.price, 0);
  const cartQty = cart.reduce((sum, c) => sum + c.quantity, 0);

  // =============================================================================
  // RENDER QUICK PURCHASE
  // =============================================================================

  const renderQuickItem = useCallback(({ item }: { item: QuickPurchaseItem }) => (
    <View style={styles.quickItemCard}>
      <View style={styles.quickItemHeader}>
        <View style={styles.barcodeWrap}>
          <MaterialCommunityIcons name="barcode" size={12} color={theme.colors.textTertiary} />
          <Text style={styles.barcodeText}>{item.barcode}</Text>
        </View>
        <Pressable onPress={() => removeQuickItem(item.id)} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={16} color={theme.colors.error} />
        </Pressable>
      </View>
      <TextInput
        style={styles.quickNameInput}
        placeholder="Product name"
        placeholderTextColor={theme.colors.textTertiary}
        value={item.productName}
        onChangeText={(t) => updateQuickItem(item.id, "productName", t)}
      />
      <View style={styles.quickPriceRow}>
        <View style={styles.qtyWrap}>
          <Pressable style={styles.qtyBtn} onPress={() => updateQuickItem(item.id, "quantity", Math.max(1, item.quantity - 1))}>
            <MaterialCommunityIcons name="minus" size={14} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <Pressable style={styles.qtyBtn} onPress={() => updateQuickItem(item.id, "quantity", item.quantity + 1)}>
            <MaterialCommunityIcons name="plus" size={14} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.priceInputWrap}>
          <Text style={styles.priceLabel}>Buy</Text>
          <TextInput
            style={styles.priceInput}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.colors.textTertiary}
            value={item.buyPrice > 0 ? String(item.buyPrice) : ""}
            onChangeText={(t) => updateQuickItem(item.id, "buyPrice", parseFloat(t) || 0)}
          />
        </View>
        <View style={styles.priceInputWrap}>
          <Text style={styles.priceLabel}>Sell</Text>
          <TextInput
            style={styles.priceInput}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.colors.textTertiary}
            value={item.sellPrice > 0 ? String(item.sellPrice) : ""}
            onChangeText={(t) => updateQuickItem(item.id, "sellPrice", parseFloat(t) || 0)}
          />
        </View>
      </View>
    </View>
  ), [removeQuickItem, updateQuickItem]);

  // =============================================================================
  // RENDER SKU GRID
  // =============================================================================

  const renderSKU = useCallback(({ item }: { item: SKUItem }) => {
    const inCart = cart.find((c) => c.skuId === item.id);
    return (
      <Pressable
        style={[styles.skuCard, !item.inStock && styles.skuCardDisabled]}
        onPress={() => item.inStock && addToCart(item)}
        disabled={!item.inStock}
      >
        {/* Photo placeholder */}
        <View style={styles.skuPhoto}>
          <MaterialCommunityIcons
            name="camera-plus"
            size={20}
            color={theme.colors.textTertiary}
          />
        </View>
        {/* Details */}
        <Text style={styles.skuName} numberOfLines={2}>{item.productName}</Text>
        <Text style={styles.skuMeta}>{item.packSize}</Text>
        <Text style={styles.skuPrice}>{formatMoney(item.price)}</Text>
        <Text style={styles.skuMoq}>MOQ {item.moq}</Text>
        {/* Cart badge */}
        {inCart && (
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{inCart.quantity}</Text>
          </View>
        )}
        {/* Out of stock overlay */}
        {!item.inStock && (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>Out</Text>
          </View>
        )}
      </Pressable>
    );
  }, [addToCart, cart]);

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
          >
            <MaterialCommunityIcons
              name="camera"
              size={20}
              color={quickItems.length > 0 ? theme.colors.textInverse : theme.colors.textSecondary}
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
              >
                <Text style={styles.halfSegmentText}>Quick Purchase</Text>
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
              >
                <Text style={styles.halfSegmentText}>Live Suppliers</Text>
              </Pressable>
            </>
          ) : expandedSegment === "quick" ? (
            // Quick Purchase Expanded
            <Pressable
              style={[styles.expandedSegment, styles.segmentActive]}
              onPress={() => onOpenScanner?.()}
            >
              <Animated.Text
                style={[styles.expandedSegmentText, { opacity: fadeAnim }]}
                numberOfLines={1}
              >
                {ROTATING_HINTS[hintIndex]}
              </Animated.Text>
            </Pressable>
          ) : (
            // Live Suppliers Expanded - Search input
            <View style={[styles.expandedSegment, styles.segmentActive]}>
              <MaterialCommunityIcons
                name="magnify"
                size={18}
                color={theme.colors.textInverse}
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
                  placeholderTextColor={theme.colors.textInverse}
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
                >
                  <Animated.Text
                    style={[styles.rotatingHintExpanded, { opacity: fadeAnim }]}
                    numberOfLines={1}
                  >
                    {ROTATING_HINTS[hintIndex]}
                  </Animated.Text>
                </Pressable>
              )}
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={16}
                    color={theme.colors.textInverse}
                  />
                </Pressable>
              )}
            </View>
          )}
        </View>
      </View>

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

          {/* Quick Purchase Action Bar */}
          <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.actionSummary}>
              <Text style={styles.actionText}>{quickItems.length} items</Text>
              <Text style={styles.actionTotal}>{formatMoney(quickTotal)}</Text>
            </View>
            <Pressable
              style={[styles.actionBtn, submitting && styles.actionBtnDisabled]}
              onPress={handleQuickSubmit}
              disabled={submitting}
            >
              <Text style={styles.actionBtnText}>Stock In</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        // Live Suppliers Content - SKU Grid directly (no separate search bar)
        <View style={styles.suppliersContent}>
          {/* SKU Grid */}
          <FlatList
            key={`suppliers-grid-${NUM_COLUMNS}`}
            data={filteredSKUs}
            renderItem={renderSKU}
            keyExtractor={(item) => item.id}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={styles.skuRow}
            contentContainerStyle={[styles.skuGrid, { paddingBottom: insets.bottom + (cartQty > 0 ? 90 : 20) }]}
            showsVerticalScrollIndicator={false}
          />

          {/* Cart Action Bar */}
          {cartQty > 0 && (
            <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.actionSummary}>
                <Text style={styles.actionText}>{cartQty} items</Text>
                <Text style={styles.actionTotal}>{formatMoney(cartTotal)}</Text>
              </View>
              <Pressable style={styles.actionBtn}>
                <Text style={styles.actionBtnText}>Place Order</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Segmented Bar
  segmentedBarContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  segmentedBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
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
    color: theme.colors.textInverse,
  },
  segmentActive: {
    backgroundColor: theme.colors.primary,
  },
  segmentDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.border,
  },
  rotatingHintContainer: {
    flex: 1,
  },
  rotatingHintExpanded: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  searchInputExpanded: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textInverse,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    fontSize: 11,
    fontFamily: "monospace",
    color: theme.colors.textTertiary,
  },
  quickNameInput: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.backgroundSecondary,
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
    color: theme.colors.textPrimary,
    minWidth: 24,
    textAlign: "center",
  },
  priceInputWrap: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  priceInput: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },

  // Live Suppliers
  suppliersContent: {
    flex: 1,
  },
  skuGrid: {
    padding: CARD_PADDING,
    paddingTop: 8,
  },
  skuRow: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  skuCard: {
    width: CARD_WIDTH,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 8,
    alignItems: "center",
  },
  skuCardDisabled: {
    opacity: 0.5,
  },
  skuPhoto: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  skuName: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    textAlign: "center",
    minHeight: 28,
  },
  skuMeta: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  skuPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
    marginTop: 4,
  },
  skuMoq: {
    fontSize: 9,
    color: theme.colors.warning,
    fontWeight: "600",
    marginTop: 2,
  },
  cartBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: theme.colors.success,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  outOfStockOverlay: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: theme.colors.error,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  outOfStockText: {
    fontSize: 8,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },

  // Action Bar
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 12,
  },
  actionSummary: {
    flex: 1,
  },
  actionText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  actionTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  actionBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
});
