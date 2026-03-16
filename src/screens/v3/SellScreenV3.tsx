import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, FlatList, TextInput, Pressable, ActivityIndicator, RefreshControl, StyleSheet, Text } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import BrandedHeader from "../../components/v3/BrandedHeader";
import CustomerTypeToggle, { type SellMode } from "../../components/v3/CustomerTypeToggle";
import ProductTileV3, { type ProductTileData } from "../../components/v3/ProductTileV3";
import CartSheetV3 from "../../components/v3/CartSheetV3";
import VoiceOverlayV3 from "../../components/v3/VoiceOverlayV3";
import UniversalSearchV3, { type SearchResult } from "../../components/v3/UniversalSearchV3";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useProductsStore, type Product } from "../../stores/productsStore";
import { useCartStore } from "../../stores/cartStore";
import { searchStoreProducts } from "../../services/api/sellSearchApi";
import { formatMoney } from "../../utils/money";
import { showToast } from "../../utils/showToast";
import { getDeviceStoreId } from "../../services/deviceSession";
import { logger } from "../../services/logger";

// V3-006: Sell screen with pull-to-refresh, category filtering, search
// Reads from existing productsStore + cartStore. No backend changes.

const CATEGORIES = ["Frequent", "Beverages", "Snacks", "Dairy", "Staples", "Home Care"];

function productToTileData(p: Product): ProductTileData {
  return {
    id: p.id,
    name: p.name,
    priceMrpMinor: p.priceMinor,
    priceTradeMinor: Math.round(p.priceMinor * 0.85), // ~15% trade margin estimate
    barcode: p.barcode,
    category: p.category,
    stock: p.stock,
    brand: p.description?.split(" ")?.[0], // rough brand extraction
    caseSize: 24, // default case size — will come from backend in STG-555
    unit: "pcs",
  };
}

export default function SellScreenV3() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sellMode, setSellMode] = useState<SellMode>("retail");
  const [selectedCategory, setSelectedCategory] = useState("Frequent");
  const [searchVisible, setSearchVisible] = useState(false);
  const [cartSheetVisible, setCartSheetVisible] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Load products on mount
  const loadProducts = useProductsStore((s) => s.loadProducts);
  const checkAndRefresh = useProductsStore((s) => s.checkAndRefresh);
  const productsLoading = useProductsStore((s) => s.loading);
  const products = useProductsStore((s) => s.products);
  useEffect(() => { void loadProducts(); }, [loadProducts]);

  // V3-006: Pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await checkAndRefresh(); } catch {}
    setRefreshing(false);
  }, [checkAndRefresh]);

  // V3-006: Search handler — queries sellSearchApi
  const handleSearchQuery = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) { setSearchResults([]); return; }
      const groups = await searchStoreProducts(storeId, query, { limit: 20 });
      // Flatten search groups into SearchResult[]
      const flat: SearchResult[] = groups.flatMap((g) =>
        (g.matches ?? []).map((sku) => ({
          id: sku.storeProductId ?? sku.productId ?? g.groupId,
          name: sku.displayName ?? g.displayName,
          barcode: sku.barcode,
          priceMinor: sku.sellPrice ?? 0,
          stock: sku.currentStock,
          brand: g.brand,
        }))
      );
      setSearchResults(flat);
    } catch (err) {
      logger.debug("SellV3Search", `failed:${String(err)}`);
      setSearchResults([]);
    }
    setSearchLoading(false);
  }, []);

  const cartItems = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);

  // V3-006: Search result → add to cart
  const handleSearchSelect = useCallback((result: SearchResult) => {
    const existing = cartItems.find((i) => i.barcode === result.barcode || i.id === result.id);
    if (existing) {
      useCartStore.getState().updateQuantity(existing.id, existing.quantity + 1);
      showToast(`${result.name} ×${existing.quantity + 1}`);
    } else {
      addItem({ id: result.barcode ?? result.id, name: result.name, priceMinor: result.priceMinor, barcode: result.barcode, currency: "INR" });
      showToast(`${result.name} added`);
    }
    setSearchVisible(false);
  }, [cartItems, addItem]);
  const cartTotal = useCartStore((s) => {
    const price = sellMode === "bulk" ? 0.85 : 1;
    return s.items.reduce((sum, item) => sum + item.priceMinor * item.quantity * price, 0);
  });
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Map products to tile data
  const tileProducts: ProductTileData[] = useMemo(
    () => products.slice(0, 30).map(productToTileData),
    [products]
  );

  // Get cart qty for a product
  const getCartQty = useCallback(
    (productId: string): number => {
      const item = cartItems.find((i) => i.id === productId || i.barcode === productId);
      return item?.quantity ?? 0;
    },
    [cartItems]
  );

  // Add product to cart
  const handleAddProduct = useCallback(
    (product: ProductTileData) => {
      const existing = cartItems.find((i) => i.id === product.id || i.barcode === product.barcode);
      if (existing) {
        useCartStore.getState().updateQuantity(existing.id, existing.quantity + 1);
        showToast(`${product.name} ×${existing.quantity + 1}`);
      } else {
        const price = sellMode === "bulk" && product.priceTradeMinor
          ? product.priceTradeMinor
          : product.priceMrpMinor;
        addItem({
          id: product.barcode ?? product.id,
          name: product.name,
          priceMinor: price,
          currency: "INR",
          barcode: product.barcode,
          metadata: {
            brand: product.brand,
            caseSize: product.caseSize,
            unit: product.unit,
            sellMode,
          },
        });
        showToast(`${product.name} added`);
      }
    },
    [cartItems, addItem, sellMode]
  );

  const renderTile = useCallback(
    ({ item }: { item: ProductTileData }) => (
      <ProductTileV3
        product={item}
        sellMode={sellMode}
        cartQty={getCartQty(item.barcode ?? item.id)}
        onPress={() => handleAddProduct(item)}
      />
    ),
    [sellMode, getCartQty, handleAddProduct]
  );

  return (
    <View style={styles.container}>
      {/* Branded header */}
      <BrandedHeader />

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Pressable style={styles.searchInput} onPress={() => setSearchVisible(true)}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth={2} strokeLinecap="round">
            <Circle cx={11} cy={11} r={8} />
            <Path d="M21 21l-4.35-4.35" />
          </Svg>
          <Text style={[styles.searchText, { color: colors.textTertiary }]}>{t("sell.searchProducts", "Search your products...")}</Text>
        </Pressable>
        <Pressable style={[styles.iconButton, { backgroundColor: colors.backgroundSecondary }]} accessibilityLabel="Scan barcode" onPress={() => navigation.navigate("V3Scan")}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2}>
            <Rect x={3} y={3} width={18} height={18} rx={2} />
            <Path d="M7 7h.01M7 12h10M7 17h.01M12 7h5M12 17h5" />
          </Svg>
        </Pressable>
        <Pressable style={[styles.iconButton, { backgroundColor: colors.primaryLight }]} accessibilityLabel="Voice input" onPress={() => setVoiceVisible(true)}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2}>
            <Rect x={9} y={2} width={6} height={12} rx={3} />
            <Path d="M5 10a7 7 0 0014 0M12 18v4M9 22h6" />
          </Svg>
        </Pressable>
      </View>

      {/* Retail / Bulk toggle */}
      <CustomerTypeToggle mode={sellMode} onModeChange={setSellMode} />

      {/* Category chips */}
      <View style={styles.chipRow}>
        <FlatList
          horizontal
          data={CATEGORIES}
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
      </View>

      {/* Product grid with loading/empty states */}
      {productsLoading && products.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 12 }}>Loading products...</Text>
        </View>
      ) : tileProducts.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.textSecondary }}>No products yet</Text>
          <Text style={{ fontSize: 13, color: colors.textTertiary, textAlign: "center", marginTop: 4 }}>Scan a barcode or add products from your supplier catalogue</Text>
        </View>
      ) : (
        <FlatList
          data={tileProducts}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContainer}
          renderItem={renderTile}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          windowSize={5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />}
        />
      )}

      {/* Cart strip — tap to expand sheet */}
      {cartCount > 0 ? (
        <Pressable style={styles.cartStrip} onPress={() => setCartSheetVisible(true)} accessibilityRole="button" accessibilityLabel="View cart">
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
        <View style={styles.cartEmpty}>
          <Text style={styles.cartEmptyText}>Cart empty — tap a product or scan barcode</Text>
        </View>
      )}

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
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
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
    chipTextActive: { color: "#FFFFFF" },
    // Grid
    gridContainer: { paddingHorizontal: 14, paddingVertical: 12 },
    gridRow: { gap: 10, marginBottom: 10 },
    // Cart strip
    cartStrip: { marginHorizontal: 12, marginBottom: 8, borderRadius: 18, padding: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.primary },
    cartLeft: { flexDirection: "column", gap: 2 },
    cartCount: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
    cartItems: { fontSize: 10, color: "rgba(255,255,255,0.8)", maxWidth: 140 },
    cartTotal: { fontSize: 18, fontWeight: "900", color: "#FFFFFF", marginHorizontal: 12 },
    payButton: { backgroundColor: "#FFFFFF", paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12 },
    payButtonText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
    cartEmpty: { marginHorizontal: 12, marginBottom: 8, borderRadius: 18, padding: 14, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border, alignItems: "center" },
    cartEmptyText: { fontSize: 12, fontWeight: "500", color: colors.textTertiary },
  });
}
