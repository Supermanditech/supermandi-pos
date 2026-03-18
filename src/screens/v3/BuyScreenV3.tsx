import React, { useMemo, useState, useCallback, useEffect } from "react";
import { View, FlatList, Pressable, ActivityIndicator, TextInput, StyleSheet, Text } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { getScreenPadding, getChipPadding, getChipFontSize } from "../../theme/responsive";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import SupplierProductCardV3, { type SupplierProduct } from "../../components/v3/SupplierProductCardV3";
import ProductDetailSheetV3 from "../../components/v3/ProductDetailSheetV3";
import type { ProductTileData } from "../../components/v3/ProductTileV3";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";
import { getCatalog, type CatalogProduct } from "../../services/api/catalogApi";
import { createOrder, submitOrder, type CreateOrderParams } from "../../services/api/orderApi";
import { getDeviceStoreId } from "../../services/deviceSession";
import { logger } from "../../services/logger";
// V3-FIX-157: Reactive scan result store for procurement scan handoff
import { useScanResultStore } from "../../stores/scanResultStore";

// V3-FIX-076: BUY tab — no fabricated wholesale metadata

// Map CatalogProduct → SupplierProduct using real backend fields only
function catalogToSupplier(p: CatalogProduct): SupplierProduct {
  const raw = p as any;
  return {
    id: p.id,
    supplierId: raw.supplierId ?? raw.supplier_id ?? "",
    barcode: raw.barcode ?? raw.primary_barcode ?? undefined, // V3-FIX-157: carry barcode for scan matching
    name: p.name,
    brand: p.brand ?? "",
    category: p.category ?? "",
    packSize: p.netContentValue ? `${p.netContentValue}${p.netContentUnit ?? ""}` : "",
    caseSize: raw.caseSize ?? raw.case_size ?? 1,
    unit: p.unit ?? "pcs",
    mrpMinor: raw.mrpMinor ?? (raw.bestPrice ? Math.round(raw.bestPrice * 100) : 0),
    ptrMinor: raw.ptrMinor ?? raw.adminRetailPriceMinor ?? raw.purchasePrice ?? 0,
    hsnCode: p.hsnCode ?? "",
    gstPct: p.gstRate ?? p.defaultGstRate ?? 18,
    moq: raw.moq ?? 1,
    supplierName: raw.supplierName ?? "",
    deliveryDays: raw.deliveryDays ?? 0,
    bnplAvailable: raw.bnplAvailable ?? false,
    tradeDiscountPct: raw.tradeDiscountPct,
    creditDays: raw.creditDays,
  };
}

export default function BuyScreenV3() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedSupplier, setSelectedSupplier] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [orderQtys, setOrderQtys] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  // V3-FIX-136: Detail-first product sheet state
  const [detailProduct, setDetailProduct] = useState<SupplierProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<string[]>(["All Suppliers"]);
  const [offline, setOffline] = useState(false);

  // V3-013: Fetch real catalog data
  useEffect(() => {
    const fetchCatalog = async () => {
      setLoading(true);
      const online = await isOnline();
      setOffline(!online);
      if (!online) { setLoading(false); showToast("Offline — catalogue unavailable"); return; }
      try {
        const storeId = await getDeviceStoreId();
        if (!storeId) { setLoading(false); return; }
        const result = await getCatalog(storeId, { limit: 50 });
        const mapped = result.data.map(catalogToSupplier);
        setProducts(mapped);
        // V3-FIX-076: Extract real categories from loaded data
        const uniqueCategories = [...new Set(mapped.map((p) => p.category).filter(Boolean))];
        setCategories(["All", ...uniqueCategories]);
        // Extract unique suppliers
        const uniqueSuppliers = [...new Set(mapped.map((p) => p.supplierName).filter(Boolean))];
        setSuppliers(["All Suppliers", ...uniqueSuppliers]);
        // V3-FIX-136: Do NOT pre-seed purchase cart with MOQ on load
        // Cart only changes via explicit CTA inside detail surface
        logger.debug("BuyV3", `loaded:${mapped.length} products from ${uniqueSuppliers.length} suppliers`);
      } catch (err) {
        logger.debug("BuyV3", `fetch_failed:${String(err)}`);
        showToast("Failed to load catalogue");
      }
      setLoading(false);
    };
    void fetchCatalog();
  }, []);

  // V3-FIX-157: Reactive subscription to scan result store
  const scanBarcode = useScanResultStore((s) => s.barcode);
  const scanIntent = useScanResultStore((s) => s.intent);
  const scanTimestamp = useScanResultStore((s) => s.timestamp);

  useEffect(() => {
    if (!loading && products.length > 0 && scanBarcode && scanIntent === "supplier_catalog_procurement_scan") {
      // Clear immediately to prevent re-trigger
      useScanResultStore.getState().clearScanResult();
      // Find matching product by barcode or ID
      const match = products.find((p) =>
        p.barcode === scanBarcode || p.id === scanBarcode
      );
      if (match) {
        setDetailProduct(match);
        showToast(`Found: ${match.name}`);
      } else {
        showToast(`Scanned product not found in catalogue`);
      }
    }
  }, [loading, products, scanBarcode, scanTimestamp]);

  // V3-FIX-076: Filter products by supplier, category, and search query
  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedSupplier > 0) {
      const supplierName = suppliers[selectedSupplier];
      list = list.filter((p) => p.supplierName === supplierName);
    }
    if (selectedCategory > 0) {
      const cat = categories[selectedCategory];
      list = list.filter((p) => p.category === cat);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q));
    }
    return list;
  }, [products, selectedSupplier, suppliers, selectedCategory, categories, searchQuery]);

  const cartItemCount = Object.values(orderQtys).reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
  const cartTotal = products.reduce((s, p) => s + (orderQtys[p.id] ?? 0) * p.caseSize * p.ptrMinor, 0);

  const handleQtyChange = useCallback((id: string, cases: number) => {
    const qty = Math.max(0, Math.round(cases));
    setOrderQtys((prev) => ({ ...prev, [id]: qty }));
  }, []);

  return (
    <View style={styles.container}>
      {/* V3-FIX-076: Real search input */}
      <View style={styles.searchBar}>
        <View style={styles.searchInput}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth={2}><Circle cx={11} cy={11} r={8} /><Path d="M21 21l-4.35-4.35" /></Svg>
          <TextInput style={styles.searchTextInput} value={searchQuery} onChangeText={setSearchQuery} placeholder="Search supplier products..." placeholderTextColor={colors.textTertiary} />
        </View>
        <Pressable style={styles.scanBtn} accessibilityLabel="Scan barcode" onPress={() => navigation.navigate("V3Scan", { defaultContext: "supplier_catalog_procurement_scan" })}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2}><Rect x={3} y={3} width={18} height={18} rx={2} /><Path d="M7 7h.01M7 12h10M7 17h.01" /></Svg>
        </Pressable>
      </View>

      {/* V3-FIX-142: Principal lane — retailer buys from SuperMandi, not directly from supplier */}
      <View style={styles.supplierRow}>
        <Text style={styles.supplierLabel}>SUPERMANDI CATALOGUE</Text>
        <FlatList
          horizontal
          data={suppliers}
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.supplierChips}
          renderItem={({ item, index }) => (
            <Pressable style={[styles.chip, selectedSupplier === index && styles.chipActive]} onPress={() => setSelectedSupplier(index)}>
              <Text style={[styles.chipText, selectedSupplier === index && styles.chipTextActive]}>{index === 0 ? "🏪 " : ""}{item}</Text>
            </Pressable>
          )}
        />
      </View>

      {/* V3-FIX-076: Dynamic category chips from real catalog data */}
      <FlatList
        horizontal
        data={categories}
        keyExtractor={(c) => c}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryChips}
        style={styles.categoryRow}
        renderItem={({ item, index }) => (
          <Pressable style={[styles.chip, selectedCategory === index && styles.chipActive]} onPress={() => setSelectedCategory(index)}>
            <Text style={[styles.chipText, selectedCategory === index && styles.chipTextActive]}>{item}</Text>
          </Pressable>
        )}
      />

      {/* V3-FIX-076: Finance banner — navigates to finance/BNPL screen */}
      <Pressable style={styles.financeBanner} onPress={() => navigation.navigate("V3Finance" as any)} accessibilityRole="button" testID="buy-finance-banner">
        <Text style={styles.financeIcon}>💳</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.financeTitle}>Buy Now, Pay Later</Text>
          <Text style={styles.financeSub}>Credit available on eligible orders</Text>
        </View>
        <Text style={styles.financeArrow}>→</Text>
      </Pressable>

      {/* Product list */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 12 }}>Loading catalogue...</Text>
        </View>
      ) : null}
      {/* V3-HARDEN-150: Virtualized list for 5k+ supplier SKUs */}
      {!loading ? <FlatList
        data={filteredProducts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={8}
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No supplier products</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4, textAlign: "center" }}>Connect with suppliers to browse their catalogue</Text>
          </View>
        }
        renderItem={({ item }) => (
          <SupplierProductCardV3
            product={item}
            orderQtyCases={orderQtys[item.id]}
            onPress={() => setDetailProduct(item)}
          />
        )}
        ListFooterComponent={
          /* Counter Purchase CTA */
          <Pressable style={styles.counterCta} accessibilityRole="button" onPress={() => navigation.navigate("V3CounterPurchase")}>
            <View style={styles.counterIcon}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}><Rect x={3} y={3} width={18} height={18} rx={2} /><Path d="M7 7h.01M7 12h10M7 17h.01" /></Svg>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.counterTitle}>Counter Purchase</Text>
              <Text style={styles.counterSub}>Supplier at counter? Scan, enter details, record</Text>
            </View>
            <Text style={styles.counterArrow}>→</Text>
          </Pressable>
        }
      /> : null}

      {/* V3-FIX-136: Product detail-first sheet for BUY with procurement metadata */}
      {detailProduct ? (
        <ProductDetailSheetV3
          product={{
            id: detailProduct.id,
            name: detailProduct.name,
            priceMrpMinor: detailProduct.mrpMinor,
            priceTradeMinor: detailProduct.ptrMinor,
            barcode: undefined,
            brand: detailProduct.brand,
            category: detailProduct.category,
            stock: detailProduct.currentStock,
            caseSize: detailProduct.caseSize,
            unit: detailProduct.unit,
          }}
          visible={true}
          onClose={() => setDetailProduct(null)}
          onAddToCart={(_, quantity) => {
            if (detailProduct) {
              handleQtyChange(detailProduct.id, quantity);
              showToast(`${detailProduct.name} ×${quantity} cases added`);
            }
            setDetailProduct(null);
          }}
          context="BUY"
          procurement={{
            supplierName: detailProduct.supplierName,
            hsnCode: detailProduct.hsnCode,
            gstPct: detailProduct.gstPct,
            moq: detailProduct.moq,
            ptrMinor: detailProduct.ptrMinor,
            ptsMinor: detailProduct.ptsMinor,
            deliveryDays: detailProduct.deliveryDays,
            scheme: detailProduct.scheme,
            tradeDiscountPct: detailProduct.tradeDiscountPct,
            creditDays: detailProduct.creditDays,
            bnplAvailable: detailProduct.bnplAvailable,
          }}
        />
      ) : null}

      {/* Purchase cart strip */}
      {cartItemCount > 0 ? (
        <View style={styles.cartStrip}>
          <View style={styles.cartLeft}>
            <Text style={styles.cartCount}>{cartItemCount} item{cartItemCount > 1 ? "s" : ""} · {Object.values(orderQtys).reduce((s, v) => s + v, 0)} cases</Text>
            <Text style={styles.cartItems}>{products.filter((p: SupplierProduct) => (orderQtys[p.id] ?? 0) > 0).map((p: SupplierProduct) => p.name.split(" ")[0]).join(", ")}</Text>
          </View>
          <Text style={styles.cartTotal}>₹{Math.round(cartTotal / 100).toLocaleString("en-IN")}</Text>
          <Pressable style={styles.orderBtn} accessibilityLabel="Place order" onPress={async () => {
            const online = await isOnline();
            if (!online) { showToast("Order requires internet connection"); return; }
            const sid = await getDeviceStoreId();
            if (!sid) { showToast("Store not configured"); return; }
            const selectedProducts = products.filter((p) => (orderQtys[p.id] ?? 0) > 0);
            if (selectedProducts.length === 0) { showToast("No items in order"); return; }
            // V3-FIX-142: Principal procurement — one order per supplier, all tagged catalogue_principal
            // Backend enforces single-supplier per order; we split here and tag each as principal
            const bySupplier = new Map<string, typeof selectedProducts>();
            for (const p of selectedProducts) {
              if (!p.supplierId) { showToast(`${p.name}: supplier identity missing`); return; }
              const list = bySupplier.get(p.supplierId) ?? [];
              list.push(p);
              bySupplier.set(p.supplierId, list);
            }
            try {
              let totalItems = 0;
              for (const [supplierId, supplierProducts] of bySupplier) {
                const orderItems = supplierProducts.map((p) => ({
                  supplierProductId: p.id,
                  quantity: (orderQtys[p.id] ?? 0) * p.caseSize,
                  unitPrice: p.ptrMinor,
                }));
                // V3-FIX-142: Every catalogue order is principal-sale — retailer→SuperMandi
                const order = await createOrder(sid, { supplierId, orderType: "catalogue_principal" as any, items: orderItems });
                await submitOrder(sid, order.id);
                totalItems += orderItems.length;
                logger.debug("BuyV3", `principal_order_submitted:${order.id},supplier:${supplierId},items:${orderItems.length}`);
              }
              showToast(`Order placed: ${totalItems} items · ₹${Math.round(cartTotal / 100).toLocaleString("en-IN")}`);
              setOrderQtys({});
            } catch (err: any) {
              showToast(err?.message ?? "Failed to place order");
            }
          }}>
            <Text style={styles.orderBtnText}>ORDER →</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    // V3-FIX-109: Responsive padding
    searchBar: { flexDirection: "row", gap: 8, padding: 10, paddingHorizontal: getScreenPadding(), backgroundColor: colors.surface },
    searchInput: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: getScreenPadding(), paddingVertical: 10, backgroundColor: colors.background, borderRadius: 14, borderWidth: 2, borderColor: colors.border },
    searchTextInput: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.textPrimary },
    scanBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" },
    supplierRow: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, backgroundColor: colors.surface },
    supplierLabel: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 6 },
    supplierChips: { gap: 8 },
    categoryRow: { backgroundColor: colors.surface },
    categoryChips: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
    // V3-FIX-109: Responsive chip sizing
    chip: { paddingHorizontal: getChipPadding(), paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: getChipFontSize(), fontWeight: "700", color: colors.textSecondary },
    chipTextActive: { color: "#fff" },
    financeBanner: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 14, marginTop: 8, padding: 12, backgroundColor: "#F5F3FF", borderRadius: 12, borderWidth: 1, borderColor: "#DDD6FE" },
    financeIcon: { fontSize: 20 },
    financeTitle: { fontSize: 13, fontWeight: "700", color: "#7C3AED" },
    financeSub: { fontSize: 11, color: "#6D28D9" },
    financeArrow: { fontSize: 16, color: "#7C3AED", fontWeight: "700" },
    list: { paddingHorizontal: 14, paddingTop: 8 },
    // Counter CTA
    counterCta: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 2, borderStyle: "dashed", borderColor: colors.primary, backgroundColor: colors.primaryLight, marginBottom: 8 },
    counterIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    counterTitle: { fontSize: 14, fontWeight: "800", color: colors.primary },
    counterSub: { fontSize: 11, color: colors.textTertiary },
    counterArrow: { fontSize: 16, color: colors.primary },
    // Cart strip
    cartStrip: { marginHorizontal: 12, marginBottom: 8, borderRadius: 18, padding: 14, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.accent },
    cartLeft: { flexDirection: "column", gap: 2 },
    cartCount: { fontSize: 13, fontWeight: "700", color: "#fff" },
    cartItems: { fontSize: 10, color: "rgba(255,255,255,0.8)", maxWidth: 140 },
    cartTotal: { fontSize: 18, fontWeight: "900", color: "#fff", marginHorizontal: 12 },
    orderBtn: { backgroundColor: "#fff", paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12 },
    orderBtnText: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  });
}
