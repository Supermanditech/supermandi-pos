import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, FlatList, TextInput, Pressable, ActivityIndicator, RefreshControl, StyleSheet, Text, Modal } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { getGridColumns, getScreenPadding, getChipPadding, getChipFontSize, SCREEN_W } from "../../theme/responsive";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import BrandedHeader from "../../components/v3/BrandedHeader";
import CustomerTypeToggle, { type SellMode } from "../../components/v3/CustomerTypeToggle";
import ProductTileV3, { type ProductTileData } from "../../components/v3/ProductTileV3";
import CartSheetV3 from "../../components/v3/CartSheetV3";
import ProductDetailSheetV3 from "../../components/v3/ProductDetailSheetV3";
import VoiceOverlayV3 from "../../components/v3/VoiceOverlayV3";
import UniversalSearchV3, { type SearchResult } from "../../components/v3/UniversalSearchV3";
import { OfflineBanner } from "../../components/ui/OfflineBanner";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { tabAccents, cardElevation, typeRhythm } from "../../theme/brand";
import { useProductsStore, type Product } from "../../stores/productsStore";
import { useCartStore } from "../../stores/cartStore";
import { searchStoreProducts } from "../../services/api/sellSearchApi";
import { getSellCategoryGroups, type SellCategoryGroup } from "../../services/api/catalogApi";
import { buildCartItemFromTile, buildCartItemFromSearch } from "../../services/cartPayload";
import { formatMoney } from "../../utils/money";
import { showToast } from "../../utils/showToast";
import { getDeviceStoreId } from "../../services/deviceSession";
import { useSettingsStore } from "../../stores/settingsStore";
import { getFrequentProducts } from "../../services/api/productsApi";
import { logger } from "../../services/logger";
// GCP-STG-0316: Reactive search trigger from scan miss
import { useSearchTriggerStore } from "../../stores/searchTriggerStore";

// V3-FIX-052: V3 category-group contract — loaded from backend, fallback to canonical labels
const FALLBACK_CATEGORIES = ["Frequent", "Beverages", "Snacks", "Dairy", "Staples", "Home Care"];

// GCP-STG-0370: Pre-calculated tile row height for getItemLayout (eliminates scroll jank)
// Tile content: padding(10+10) + imageArea(~tileWidth) + name(~30) + price(~18) + extras(~20) + gridRow marginBottom(10)
// On a 360dp phone with 3 columns: tileWidth ≈ (360-28-20)/3 ≈ 104, total ≈ 104+60+10+10 ≈ 184
// We use a conservative estimate that works across device classes
const TILE_ROW_HEIGHT = 180;
const TILE_ROW_MARGIN = 10; // styles.gridRow marginBottom
const ITEM_HEIGHT = TILE_ROW_HEIGHT + TILE_ROW_MARGIN;

const getItemLayoutFn = (_data: unknown, index: number) => ({
  length: ITEM_HEIGHT,
  offset: ITEM_HEIGHT * index,
  index,
});

// V3-FIX-042: Use real backend fields, no synthetic fallbacks
function productToTileData(p: Product): ProductTileData {
  return {
    id: p.id,
    name: p.name,
    priceMrpMinor: p.priceMinor,
    priceTradeMinor: (p as any).tradePriceMinor ?? undefined, // no fake 85% — undefined if no real trade price
    barcode: p.barcode,
    category: p.category,
    stock: p.stock,
    brand: (p as any).brand ?? undefined, // real brand from backend, not guessed
    caseSize: (p as any).caseSize ?? undefined, // real case size from backend, not hardcoded
    unit: (p as any).unit ?? "pcs",
    imageUrl: (p as any).imageUrl ?? (p as any).image_url ?? undefined,
    // V3-FIX-167: Canonical identity
    storeProductId: p.storeProductId,
    // V3-HARDEN-171: Conversion-aware sell flow
    productMode: p.productMode,
    soldBy: p.soldBy,
    rateUnit: p.rateUnit,
    baseStockUnit: p.baseStockUnit,
    allowFractionalSell: p.allowFractionalSell,
    conversionConfirmed: p.conversionConfirmed,
    // GCP-STG-0400: Purchase price for margin indicator
    purchasePriceMinor: p.purchasePriceMinor,
    // GCP-STG-0410: Expiry date for SELL detail info section
    expiryDate: p.expiryDate,
  };
}

// V3-FIX-036: Welcome guide local persistence
const GUIDE_VERSION = "1";
async function shouldShowGuide(storeId: string): Promise<boolean> {
  const key = `supermandi.guide.${storeId}.v${GUIDE_VERSION}`;
  const dismissed = await AsyncStorage.getItem(key);
  return dismissed !== "1";
}
async function dismissGuide(storeId: string): Promise<void> {
  const key = `supermandi.guide.${storeId}.v${GUIDE_VERSION}`;
  await AsyncStorage.setItem(key, "1");
}

export default function SellScreenV3() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sellMode, setSellMode] = useState<SellMode>("retail");
  const [selectedCategory, setSelectedCategory] = useState("Frequent");
  // V3-FIX-052: Load category groups from backend contract
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  useEffect(() => {
    (async () => {
      const storeId = await getDeviceStoreId();
      if (!storeId) return;
      const groups = await getSellCategoryGroups(storeId);
      if (groups.length > 0) setCategories(groups.map((g) => g.label));
    })();
  }, []);

  // V3-FIX-036: Welcome guide state
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    (async () => {
      const storeId = await getDeviceStoreId();
      if (storeId && await shouldShowGuide(storeId)) setShowGuide(true);
    })();
  }, []);
  const handleDismissGuide = useCallback(async () => {
    setShowGuide(false);
    const storeId = await getDeviceStoreId();
    if (storeId) await dismissGuide(storeId);
  }, []);

  // V3-FIX-039: Feature flags from settingsStore
  const voiceEnabled = useSettingsStore((s) => (s as any).voiceEnabled ?? true);
  const categoryBrowsingEnabled = useSettingsStore((s) => (s as any).categoryBrowsingEnabled ?? true);

  // V3-FIX-041: Frequent products state
  const [frequentProducts, setFrequentProducts] = useState<Product[]>([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [cartSheetVisible, setCartSheetVisible] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);
  // V3-FIX-135: Detail-first product sheet state
  const [detailProduct, setDetailProduct] = useState<ProductTileData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load products on mount
  const loadProducts = useProductsStore((s) => s.loadProducts);
  const checkAndRefresh = useProductsStore((s) => s.checkAndRefresh);
  const productsLoading = useProductsStore((s) => s.loading);
  const products = useProductsStore((s) => s.products);
  useEffect(() => { void loadProducts(); }, [loadProducts]);

  // V3-FIX-041: Load frequent products
  useEffect(() => {
    if (selectedCategory === "Frequent") {
      getFrequentProducts().then((fps) => {
        setFrequentProducts(fps.map((p: any) => ({ id: p.id ?? p.product_id, name: p.name ?? p.display_name, priceMinor: p.sell_price ?? p.mrp ?? 0, barcode: p.barcode, category: p.category, stock: p.current_stock ?? 0, description: p.brand, currency: "INR" })));
      }).catch(() => {});
    }
  }, [selectedCategory]);

  // V3-006: Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await checkAndRefresh(); } catch {}
    setRefreshing(false);
  }, [checkAndRefresh]);

  // V3-006: Search handler — queries sellSearchApi
  // GCP-STG-0321: Pass selectedCategory to backend search (skip virtual "Frequent")
  const handleSearchQuery = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); if (query.length === 1) showToast("Type at least 2 characters to search"); return; }
    setSearchLoading(true);
    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) { setSearchResults([]); return; }
      const catParam = selectedCategory && selectedCategory !== "Frequent" ? selectedCategory : undefined;
      const groups = await searchStoreProducts(storeId, query, { limit: 20, category: catParam });
      // V3-FIX-120: Flatten search groups into SearchResult[] preserving all metadata
      const flat: SearchResult[] = groups.flatMap((g) =>
        (g.matches ?? []).map((sku) => ({
          id: sku.storeProductId ?? sku.productId ?? g.groupId,
          name: sku.displayName ?? g.displayName,
          barcode: sku.barcode,
          priceMinor: sku.sellPrice ?? 0,
          stock: sku.currentStock,
          brand: g.brand,
          storeProductId: sku.storeProductId,
          gstRate: (sku as any).gstRate ?? (g as any).gstRate ?? undefined,
          hsnCode: (sku as any).hsnCode ?? (g as any).hsnCode ?? undefined,
          unit: (sku as any).unit ?? (sku as any).net_content_unit ?? undefined,
          caseSize: (sku as any).caseSize ?? undefined,
          category: (g as any).category ?? undefined,
          imageUrl: (sku as any).image_url ?? (g as any).imageUrl ?? undefined,
          mrpMinor: (sku as any).mrpMinor ?? undefined,
          supplierName: (g as any).supplierName ?? undefined,
          // V3-FIX-167: Carry canonical conversion profile from search
          productMode: (sku as any).mode ?? (sku as any).productMode ?? undefined,
          soldBy: (sku as any).soldBy ?? undefined,
          rateUnit: (sku as any).rateUnit ?? undefined,
          baseStockUnit: (sku as any).baseStockUnit ?? undefined,
          allowFractionalSell: (sku as any).allowFractionalSell ?? undefined,
          conversionConfirmed: (sku as any).conversionConfirmed ?? undefined,
        }))
      );
      // DA-029: Deduplicate by barcode
      const seen = new Set<string>();
      const deduped = flat.filter((r) => {
        const key = r.barcode ?? r.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setSearchResults(deduped);
    } catch (err) {
      logger.debug("SellV3Search", `failed:${String(err)}`);
      setSearchResults([]);
    }
    setSearchLoading(false);
  }, [selectedCategory]);

  // GCP-STG-0316: React to scan-not-found "Search by Name" trigger
  const searchTriggerBarcode = useSearchTriggerStore((s) => s.missedBarcode);
  const searchTriggerTimestamp = useSearchTriggerStore((s) => s.timestamp);
  useEffect(() => {
    if (searchTriggerBarcode && searchTriggerTimestamp > 0) {
      useSearchTriggerStore.getState().clearTrigger();
      // Open the universal search overlay so the user can search by name
      setSearchVisible(true);
    }
  }, [searchTriggerBarcode, searchTriggerTimestamp]);

  const cartItems = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);

  // V3-006: Search result → add to cart
  const handleSearchSelect = useCallback((result: SearchResult) => {
    // V3-HARDEN-171: Block unconfirmed loose-bulk sale on search-add
    const r = result as any;
    if (r.productMode === "LOOSE_BULK" && r.conversionConfirmed === false) {
      showToast("Retail setup needed — complete conversion setup before selling");
      return;
    }
    const existing = cartItems.find((i) => i.barcode === result.barcode || i.id === result.id);
    if (existing) {
      useCartStore.getState().updateQuantity(existing.id, existing.quantity + 1);
      showToast(`${result.name} ×${existing.quantity + 1}`);
    } else {
      // V3-FIX-120: Use canonical cart payload builder
      addItem(buildCartItemFromSearch(result));
      showToast(`${result.name} added`);
    }
    setSearchVisible(false);
  }, [cartItems, addItem]);
  // V3-HARDEN-059: No invented 0.85 pricing — retail mode only until trade contract exists
  const cartTotal = useCartStore((s) => s.items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0));
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // GCP-STG-0367: Pre-compute cart ID + barcode sets for O(1) lookup instead of O(m) .some()
  const cartIdSet = useMemo(() => new Set(cartItems.map(c => c.id)), [cartItems]);
  const cartBarcodeSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of cartItems) { if (c.barcode) s.add(c.barcode); }
    return s;
  }, [cartItems]);

  // V3-FIX-041: Filter by category + use frequent products when "Frequent" selected
  const tileProducts: ProductTileData[] = useMemo(() => {
    // Source: Frequent loads from API, other categories filter from products store
    const sourceProducts = selectedCategory === "Frequent" && frequentProducts.length > 0
      ? frequentProducts
      : products;

    // V3-FIX-041: Category filter (skip for "Frequent" which is already filtered by backend)
    const filtered = selectedCategory === "Frequent"
      ? sourceProducts
      : sourceProducts.filter((p) => {
          if (!p.category) return true; // show uncategorized in all
          const cat = p.category.toLowerCase();
          const sel = selectedCategory.toLowerCase();
          return cat.includes(sel) || sel.includes(cat);
        });

    const sorted = [...filtered].sort((a, b) => {
      // GCP-STG-0367: O(1) cart membership check via Set instead of O(m) .some()
      const aInCart = (cartIdSet.has(a.id) || (a.barcode ? cartBarcodeSet.has(a.barcode) : false)) ? 1 : 0;
      const bInCart = (cartIdSet.has(b.id) || (b.barcode ? cartBarcodeSet.has(b.barcode) : false)) ? 1 : 0;
      if (aInCart !== bInCart) return bInCart - aInCart;
      const aStock = (a.stock ?? 0) > 0 ? 1 : 0;
      const bStock = (b.stock ?? 0) > 0 ? 1 : 0;
      if (aStock !== bStock) return bStock - aStock;
      return a.name.localeCompare(b.name);
    });
    return sorted.map(productToTileData);
  // GCP-STG-0370: Removed cartItems from deps — only cartIdSet/cartBarcodeSet are used inside
  // This prevents O(n) re-sort on every cart quantity change (Set refs only change on add/remove)
  }, [products, selectedCategory, frequentProducts, cartIdSet, cartBarcodeSet]);

  // Get cart qty for a product
  const getCartQty = useCallback(
    (productId: string): number => {
      const item = cartItems.find((i) => i.id === productId || i.barcode === productId);
      return item?.quantity ?? 0;
    },
    [cartItems]
  );

  // GCP-STG-0024: Tap adds to cart directly (fast billing for kirana stores)
  // GCP-STG-0127: Warn on add-to-cart when stock is low/zero (but still allow — kirana stock is often inaccurate)
  // Long-press opens detail sheet for price/qty/discount adjustments
  const handleTilePress = useCallback(
    (product: ProductTileData) => {
      if (product.productMode === "LOOSE_BULK" && product.conversionConfirmed === false) {
        showToast("Retail setup needed — complete conversion setup before selling");
        return;
      }
      // GCP-STG-0127: Stock warning (non-blocking — kirana stores sell even when stock shows 0)
      if (product.stock != null && product.stock <= 0) {
        showToast(`${product.name} may be out of stock`);
      }
      const existing = cartItems.find((i) => i.id === (product.barcode ?? product.id) || i.barcode === product.barcode);
      if (existing) {
        const newQty = existing.quantity + 1;
        if (product.stock != null && newQty > product.stock && product.stock > 0) {
          showToast(`${product.name}: only ${product.stock} in stock`);
        }
        useCartStore.getState().updateQuantity(existing.id, newQty);
      } else {
        addItem({ ...buildCartItemFromTile(product, sellMode), quantity: 1 });
      }
    },
    [cartItems, addItem, sellMode]
  );

  const handleTileLongPress = useCallback(
    (product: ProductTileData) => {
      setDetailProduct(product);
    },
    []
  );

  // V3-FIX-135: Add-to-cart only from explicit CTA inside detail sheet
  // V3-HARDEN-171: Block add-to-cart for unconfirmed bulk products
  const handleDetailAdd = useCallback(
    (product: ProductTileData, quantity: number) => {
      if (product.productMode === "LOOSE_BULK" && product.conversionConfirmed === false) {
        showToast("Retail setup needed — complete conversion setup before selling");
        return;
      }
      const existing = cartItems.find((i) => i.id === (product.barcode ?? product.id) || i.barcode === product.barcode);
      if (existing) {
        useCartStore.getState().updateQuantity(existing.id, existing.quantity + quantity);
      } else {
        addItem({ ...buildCartItemFromTile(product, sellMode), quantity });
      }
    },
    [cartItems, addItem, sellMode]
  );

  // GCP-STG-0024: Tap = add to cart, long-press = detail sheet
  const renderTile = useCallback(
    ({ item }: { item: ProductTileData }) => (
      <ProductTileV3
        product={item}
        sellMode={sellMode}
        cartQty={getCartQty(item.barcode ?? item.id)}
        onPress={() => handleTilePress(item)}
        onLongPress={() => handleTileLongPress(item)}
      />
    ),
    [sellMode, getCartQty, handleTilePress, handleTileLongPress]
  );

  return (
    <View style={styles.container} testID="sell-screen-v3">
      {/* V3-FIX-037: Header with working menu + unified online state (no separate OfflineBanner) */}
      <BrandedHeader onMenuPress={() => {
        // Navigate to MORE tab from SELL
        const parent = navigation.getParent?.();
        if (parent) parent.navigate("MORE" as any);
      }} />

      {/* GCP-STG-0033: Removed redundant "BILLING MODE" strip — replaced by
         Retail/Bulk toggle (GCP-STG-0142). Cart info is in the cart strip at bottom. */}

      {/* Search bar */}
      <View style={styles.searchBar} testID="sell-search-bar">
        <Pressable style={styles.searchInput} onPress={() => setSearchVisible(true)} testID="sell-search-tap">
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={8} />
            <Path d="M21 21l-4.35-4.35" />
          </Svg>
          <Text style={[styles.searchText, { color: colors.textTertiary }]}>{t("sell.searchProducts", "Search your products...")}</Text>
        </Pressable>
        <Pressable style={[styles.iconButton, { backgroundColor: colors.backgroundSecondary }]} accessibilityLabel="Scan barcode" testID="sell-scan-btn" onPress={() => navigation.navigate("V3Scan")}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2}>
            <Rect x={3} y={3} width={18} height={18} rx={2} />
            <Path d="M7 7h.01M7 12h10M7 17h.01M12 7h5M12 17h5" />
          </Svg>
        </Pressable>
        {/* V3-FIX-039: Hide voice when voiceEnabled=false */}
        {voiceEnabled ? (
          <Pressable style={[styles.iconButton, { backgroundColor: colors.primaryLight }]} accessibilityLabel="Voice input" testID="sell-mic-btn" onPress={() => setVoiceVisible(true)}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2}>
              <Rect x={9} y={2} width={6} height={12} rx={3} />
              <Path d="M5 10a7 7 0 0014 0M12 18v4M9 22h6" />
            </Svg>
          </Pressable>
        ) : null}
      </View>

      {/* GCP-STG-0142: Retail/Bulk toggle — enabled now that B2B pricing exists (GCP-STG-0087) */}
      <CustomerTypeToggle mode={sellMode} onModeChange={setSellMode} />

      {/* V3-FIX-039: Hide category chips when categoryBrowsingEnabled=false */}
      {categoryBrowsingEnabled ? <View style={styles.chipRow} testID="sell-category-chips">
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.chip, selectedCategory === item && styles.chipActive]}
              onPress={() => setSelectedCategory(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedCategory === item }}
            >
              <Text style={[styles.chipText, selectedCategory === item && styles.chipTextActive]}>{item}</Text>
            </Pressable>
          )}
        />
      </View> : null}

      {/* Product grid with loading/empty states */}
      {productsLoading && products.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 12 }}>Loading products...</Text>
        </View>
      ) : tileProducts.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>{selectedCategory === "Frequent" ? "📊" : "📦"}</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.textSecondary }}>
            {selectedCategory === "Frequent" ? "No frequent items yet" : products.length === 0 ? "No products yet" : `No ${selectedCategory} products`}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: "center", marginTop: 4 }}>
            {selectedCategory === "Frequent" ? "Complete a few sales and your most-sold products will appear here" : products.length === 0 ? "Scan a barcode or add products from your supplier catalogue" : "Try another category or search for a specific product"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={tileProducts}
          keyExtractor={(item) => item.id}
          numColumns={getGridColumns()}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContainer}
          renderItem={renderTile}
          getItemLayout={getItemLayoutFn}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={15}
          initialNumToRender={12}
          updateCellsBatchingPeriod={50}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />}
        />
      )}

      {/* Cart strip — tap to expand sheet */}
      {cartCount > 0 ? (
        <Pressable style={styles.cartStrip} onPress={() => setCartSheetVisible(true)} accessibilityRole="button" accessibilityLabel="View cart" testID="sell-cart-strip">
          <View style={styles.cartLeft}>
            <Text style={styles.cartCount}>{cartCount} item{cartCount !== 1 ? "s" : ""}</Text>
            <Text style={styles.cartItems} numberOfLines={1}>
              {cartItems.slice(0, 3).map((i) => i.name.split(" ")[0]).join(", ")}
            </Text>
          </View>
          <Text style={styles.cartTotal}>₹{Math.round(cartTotal / 100).toLocaleString("en-IN")}</Text>
          <Pressable style={styles.payButton} onPress={(e) => { e.stopPropagation?.(); setCartSheetVisible(true); }} accessibilityRole="button" accessibilityLabel="Pay">
            <Text style={styles.payButtonText}>PAY →</Text>
          </Pressable>
        </Pressable>
      ) : (
        <View style={styles.cartEmpty} testID="sell-cart-empty">
          <Text style={styles.cartEmptyText}>Cart empty — tap product or scan barcode</Text>
        </View>
      )}

      {/* V3-FIX-135: Product detail-first sheet */}
      <ProductDetailSheetV3
        product={detailProduct}
        visible={detailProduct !== null}
        onClose={() => setDetailProduct(null)}
        onAddToCart={handleDetailAdd}
        context="SELL"
      />

      {/* STG-554: Cart sheet overlay */}
      <CartSheetV3
        visible={cartSheetVisible}
        sellMode={sellMode}
        onClose={() => setCartSheetVisible(false)}
        onCheckout={() => { setCartSheetVisible(false); navigation.navigate("V3Payment"); }}
      />

      {/* STG-558: Voice overlay — opened from mic button in search bar */}
      <VoiceOverlayV3
        visible={voiceVisible}
        onClose={() => setVoiceVisible(false)}
        onProductMatched={(name, qty) => {
          showToast(`${name} ×${qty} added via voice`);
        }}
      />

      {/* V3-006: Universal search overlay */}
      <UniversalSearchV3
        context="sell"
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        onSelect={handleSearchSelect}
        results={searchResults}
        loading={searchLoading}
        onQueryChange={handleSearchQuery}
      />

      {/* V3-FIX-036: Welcome guide modal */}
      <Modal visible={showGuide} transparent animationType="fade" onRequestClose={handleDismissGuide} testID="sell-welcome-guide">
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 28, maxWidth: 340, width: "100%" }}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: colors.primary, textAlign: "center", letterSpacing: -0.5 }}>Welcome to SuperMandi POS</Text>
            <View style={{ marginTop: 20, gap: 12 }}>
              {([
                { tab: "SELL" as const, desc: "Billing & checkout" },
                { tab: "BUY" as const, desc: "Order from suppliers" },
                { tab: "STORE" as const, desc: "Stock & inventory" },
                { tab: "MORE" as const, desc: "Reports, Khata, Settings" },
              ]).map(({ tab, desc }) => (
                <View key={tab} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: tabAccents(colors)[tab].hero, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: colors.textInverse, fontSize: 11, fontWeight: "800" }}>{tab}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textSecondary }}>{desc}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={handleDismissGuide} style={{ marginTop: 24, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 14, alignItems: "center" }} testID="sell-guide-dismiss">
              <Text style={{ color: colors.textInverse, fontSize: 16, fontWeight: "800" }}>Got it, Start Billing →</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    // V3-FIX-180: SELL mode identity strip
    modeStrip: {
      backgroundColor: tabAccents(colors).SELL.heroSoft,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modeLabel: {
      ...typeRhythm.sectionTitle,
      color: tabAccents(colors).SELL.accent,
    },
    modeCartHint: { fontSize: 11, fontWeight: "700" as const, color: colors.primary },
    modeHint: { fontSize: 11, color: colors.textTertiary },
    // Search
    searchBar: { flexDirection: "row", gap: 8, padding: 10, paddingHorizontal: 14, backgroundColor: colors.surface },
    searchInput: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.background, borderRadius: 14, borderWidth: 2, borderColor: colors.border },
    searchInputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
    searchText: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.textPrimary },
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    // Chips
    chipRow: { backgroundColor: colors.surface },
    chipContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
    chip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
    chipTextActive: { color: colors.textInverse },
    // Grid
    gridContainer: { paddingHorizontal: 14, paddingVertical: 12 },
    gridRow: { gap: 10, marginBottom: 10 },
    // Cart strip
    cartStrip: { marginHorizontal: 12, marginBottom: 8, borderRadius: 18, padding: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.primary },
    cartLeft: { flexDirection: "column", gap: 2 },
    cartCount: { fontSize: 13, fontWeight: "700", color: colors.textInverse },
    cartItems: { fontSize: 10, color: colors.overlayInverse, maxWidth: 140 },
    cartTotal: { ...typeRhythm.heroStat, fontSize: 18, color: colors.textInverse, marginHorizontal: 12 },
    payButton: { backgroundColor: colors.textInverse, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12 },
    payButtonText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
    cartEmpty: { marginHorizontal: 12, marginBottom: 8, borderRadius: 18, padding: 14, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border, alignItems: "center" },
    cartEmptyText: { fontSize: 12, fontWeight: "500", color: colors.textTertiary },
  });
}
