import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { View, FlatList, Pressable, ActivityIndicator, TextInput, StyleSheet, Text, Modal, Alert } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { getScreenPadding, getChipPadding, getChipFontSize, getGridColumns } from "../../theme/responsive";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import SupplierProductCardV3, { type SupplierProduct } from "../../components/v3/SupplierProductCardV3";
import ProductDetailSheetV3 from "../../components/v3/ProductDetailSheetV3";
import ProductTileV3, { type ProductTileData } from "../../components/v3/ProductTileV3";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { tabAccents, typeRhythm } from "../../theme/brand";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";
import { getBuyCatalog, type CatalogProduct } from "../../services/api/catalogApi";
import { createOrder, submitOrder, confirmPayment, type CreateOrderParams } from "../../services/api/orderApi";
import { getDeviceStoreId } from "../../services/deviceSession";
import { logger } from "../../services/logger";
// V3-FIX-157: Reactive scan result store for procurement scan handoff
import { useScanResultStore } from "../../stores/scanResultStore";
// GCP-STG-0316: Search trigger store for scan-not-found → search-by-name handoff
import { useSearchTriggerStore } from "../../stores/searchTriggerStore";
// GCP-STG-0402: Persisted BUY cart — survives screen unmount
import { usePurchaseCartStore } from "../../stores/purchaseCartStore";

// V3-FIX-076: BUY tab — no fabricated wholesale metadata

// Map CatalogProduct → SupplierProduct using real backend fields only
// V3-FIX-173: Map CatalogProduct (with suppliers array) to SupplierProduct
// Uses best supplier offer (first in sorted array) for commercial terms
function catalogToSupplier(p: CatalogProduct): SupplierProduct {
  const raw = p as any;
  // Buy-catalog returns products with a suppliers[] array containing per-supplier offers
  const bestOffer = (raw.suppliers ?? [])[0] ?? {};
  return {
    id: bestOffer.supplierProductId ?? p.id,
    supplierId: bestOffer.supplierId ?? raw.supplierId ?? "",
    barcode: raw.barcode ?? raw.primaryBarcode ?? undefined,
    name: p.name,
    brand: p.brand ?? "",
    category: p.category ?? "",
    packSize: p.netContentValue ? `${p.netContentValue}${p.netContentUnit ?? ""}` : "",
    caseSize: raw.caseSize ?? raw.case_size ?? 1,
    unit: p.unit ?? "pcs",
    mrpMinor: bestOffer.mrp ?? raw.mrpMinor ?? 0,
    ptrMinor: bestOffer.ptrMinor ?? bestOffer.purchasePrice ?? raw.bestPrice ?? 0,
    ptsMinor: bestOffer.ptsMinor ?? undefined,
    hsnCode: p.hsnCode ?? "",
    gstPct: p.gstRate ?? p.defaultGstRate ?? 18,
    moq: bestOffer.moq ?? raw.minMoq ?? 1,
    supplierName: bestOffer.supplierName ?? raw.bestSupplierName ?? "",
    deliveryDays: bestOffer.deliveryDays ?? 2,
    bnplAvailable: bestOffer.bnplEligible ?? false,
    tradeDiscountPct: bestOffer.tradeDiscountPct ?? undefined,
    scheme: bestOffer.scheme ?? undefined,
    creditDays: bestOffer.creditDays ?? undefined,
    // V3-FIX-173: Full published buyer-card contract
    deliveryTerms: bestOffer.deliveryTerms ?? undefined,
    financeEligible: bestOffer.financeEligible ?? false,
    publishedTermsVersion: bestOffer.publishedTermsVersion ?? undefined,
    // V3-HARDEN-177: MOQ tier discounts from supplier offer
    moqTiers: bestOffer.moqTiers ?? undefined,
    // V3-FIX-170: Conversion-aware procurement context (from supplier offer, fallback to product level)
    procurementUnit: bestOffer.procurementUnit ?? raw.procurementUnit ?? raw.procurement_unit,
    procurementPackQty: bestOffer.procurementPackQty ?? raw.procurementPackQty ?? raw.procurement_pack_qty,
    baseStockUnit: bestOffer.baseStockUnit ?? raw.baseStockUnit ?? raw.base_stock_unit,
    soldBy: raw.soldBy ?? raw.sold_by,
    rateUnit: raw.rateUnit ?? raw.rate_unit,
    productMode: raw.productMode ?? raw.product_mode,
    // GCP-STG-0087: B2B billing model
    billingModel: bestOffer.billingModel ?? "SUPERMANDI_PRINCIPAL",
  };
}

export default function BuyScreenV3() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // GCP-STG-0402: BUY cart persisted via Zustand store (survives screen unmount)
  const orderQtys = usePurchaseCartStore((s) => s.orderQtys);
  const selectedSupplier = usePurchaseCartStore((s) => s.selectedSupplierIndex);
  const storeSetOrderQty = usePurchaseCartStore((s) => s.setOrderQty);
  const storeClearOrderQtys = usePurchaseCartStore((s) => s.clearOrderQtys);
  const storeSetSelectedSupplier = usePurchaseCartStore((s) => s.setSelectedSupplierIndex);
  const setSelectedSupplier = storeSetSelectedSupplier;
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [searchQuery, setSearchQuery] = useState("");
  // GCP-STG-0316: Ref to focus search input on scan-not-found fallback
  const searchInputRef = useRef<TextInput>(null);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  // V3-FIX-136: Detail-first product sheet state
  const [detailProduct, setDetailProduct] = useState<SupplierProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<string[]>(["All Suppliers"]);
  const [offline, setOffline] = useState(false);
  // GCP-STG-0320: Server-side search results (null = use full catalog)
  const [serverSearchResults, setServerSearchResults] = useState<SupplierProduct[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // V3-FIX-175: Procurement checkout state
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"UPI" | "BANK" | "BNPL" | "CREDIT" | "CASH">("CASH");
  const [ordering, setOrdering] = useState(false);

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
        // V3-FIX-173: Use buy-catalog endpoint for B2B procurement offers
        const result = await getBuyCatalog(storeId, { limit: 50 });
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
        // GCP-STG-0316: Show alert with "Search by Name" fallback instead of toast-only
        Alert.alert(
          "Product Not Found",
          `Barcode "${scanBarcode}" is not in the supplier catalogue.`,
          [
            {
              text: "Search by Name",
              onPress: () => {
                setSearchQuery("");
                setTimeout(() => searchInputRef.current?.focus(), 100);
              },
            },
            { text: "Dismiss", style: "cancel" },
          ]
        );
      }
    }
  }, [loading, products, scanBarcode, scanTimestamp]);

  // GCP-STG-0316: React to scan-not-found "Search by Name" trigger from ScanScreenV3
  const searchTriggerBarcode = useSearchTriggerStore((s) => s.missedBarcode);
  const searchTriggerTs = useSearchTriggerStore((s) => s.timestamp);
  useEffect(() => {
    if (searchTriggerBarcode && searchTriggerTs > 0) {
      useSearchTriggerStore.getState().clearTrigger();
      setSearchQuery("");
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchTriggerBarcode, searchTriggerTs]);

  // GCP-STG-0320: Server-side search with 300ms debounce
  // When searchQuery has >=2 chars, call getBuyCatalog with q= parameter.
  // When searchQuery is empty/short, clear server results and show full catalog.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      // Clear server search — revert to full catalog browse
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      setServerSearchResults(null);
      setSearchLoading(false);
      return;
    }
    // Debounce 300ms before hitting server
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const storeId = await getDeviceStoreId();
        if (!storeId) { setSearchLoading(false); return; }
        const result = await getBuyCatalog(storeId, { q: trimmed, limit: 50 });
        const mapped = result.data.map(catalogToSupplier);
        setServerSearchResults(mapped);
      } catch (err) {
        logger.debug("BuyV3", `server_search_failed:${String(err)}`);
        // Fallback: keep showing current results, don't clear
      }
      setSearchLoading(false);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // V3-FIX-076: Filter products by supplier and category
  // GCP-STG-0320: Use server search results when available, otherwise full catalog
  const filteredProducts = useMemo(() => {
    const baseList = serverSearchResults !== null ? serverSearchResults : products;
    let list = baseList;
    if (selectedSupplier > 0) {
      const supplierName = suppliers[selectedSupplier];
      list = list.filter((p) => p.supplierName === supplierName);
    }
    if (selectedCategory > 0) {
      const cat = categories[selectedCategory];
      list = list.filter((p) => p.category === cat);
    }
    return list;
  }, [products, serverSearchResults, selectedSupplier, suppliers, selectedCategory, categories]);

  const cartItemCount = Object.values(orderQtys).reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
  // GCP-STG-0398: Apply MOQ tier discounts to cart total (not display-only)
  const { cartTotal, volumeDiscountTotal } = useMemo(() => {
    let total = 0;
    let discount = 0;
    for (const p of products) {
      const cases = orderQtys[p.id] ?? 0;
      if (cases <= 0) continue;
      const orderQty = cases * p.caseSize;
      const lineBase = cases * p.caseSize * p.ptrMinor;
      const applicableTier = (p.moqTiers as any[] | undefined)
        ?.slice()
        .sort((a: any, b: any) => (b.minQty || 0) - (a.minQty || 0))
        .find((t: any) => orderQty >= (t.minQty || 0));
      const discPct = applicableTier?.discountPct ?? 0;
      const lineDiscount = Math.round(lineBase * discPct / 100);
      total += lineBase - lineDiscount;
      discount += lineDiscount;
    }
    return { cartTotal: total, volumeDiscountTotal: discount };
  }, [products, orderQtys]);

  // GCP-STG-0397: Enforce MOQ floor — qty=0 removes from cart, qty>0 must be >= product.moq
  const handleQtyChange = useCallback((id: string, cases: number) => {
    const rounded = Math.max(0, Math.round(cases));
    if (rounded === 0) {
      // Allow removal from cart
      storeSetOrderQty(id, 0);
      return;
    }
    const product = products.find((p) => p.id === id);
    const moq = product?.moq ?? 1;
    if (rounded < moq) {
      showToast(`Minimum order is ${moq} case${moq > 1 ? "s" : ""}`);
      storeSetOrderQty(id, moq);
      return;
    }
    storeSetOrderQty(id, rounded);
  }, [products, storeSetOrderQty]);

  return (
    <View style={styles.container}>
      {/* V3-FIX-180: BUY mode identity — procurement/trade decision */}
      <View style={styles.buyHero}>
        <Text style={styles.buyHeroLabel}>🛒 PROCUREMENT</Text>
        <Text style={styles.buyHeroSub}>{cartItemCount > 0 ? `${cartItemCount} items · ₹${Math.round(cartTotal / 100).toLocaleString("en-IN")}` : 'Browse & order from suppliers'}</Text>
      </View>

      {/* V3-FIX-076: Real search input */}
      <View style={styles.searchBar}>
        <View style={styles.searchInput}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth={2}><Circle cx={11} cy={11} r={8} /><Path d="M21 21l-4.35-4.35" /></Svg>
          <TextInput ref={searchInputRef} style={styles.searchTextInput} value={searchQuery} onChangeText={setSearchQuery} placeholder="Search supplier products..." placeholderTextColor={colors.textTertiary} testID="buy-search-input" />
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
      {/* GCP-STG-0320: Search loading indicator */}
      {searchLoading && !loading ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 6 }} testID="buy-search-loading">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.textTertiary, fontSize: 12, marginLeft: 6 }}>Searching...</Text>
        </View>
      ) : null}
      {/* GCP-STG-0145: BUY tiles = SELL tiles — 3-column grid with ProductTileV3 */}
      {!loading ? <FlatList
        data={filteredProducts}
        keyExtractor={(p) => p.id}
        numColumns={getGridColumns()} // GCP-STG-0304: responsive grid matching SellScreenV3
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={12}
        initialNumToRender={12}
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No supplier products</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4, textAlign: "center" }}>Connect with suppliers to browse their catalogue</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ProductTileV3
            product={{
              id: item.id,
              name: item.name,
              priceMrpMinor: item.mrpMinor,
              priceTradeMinor: item.ptrMinor,
              barcode: item.barcode,
              brand: item.brand,
              category: item.category,
              unit: item.unit,
              caseSize: item.caseSize,
            }}
            sellMode="bulk"
            cartQty={orderQtys[item.id] ?? 0}
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
            barcode: detailProduct.barcode ?? undefined, // GCP-STG-0293: pass barcode from supplier data
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
            billingModel: detailProduct.billingModel,
            // GCP-STG-0401: 6 missing procurement fields
            deliveryTerms: detailProduct.deliveryTerms,
            financeEligible: detailProduct.financeEligible,
            publishedTermsVersion: detailProduct.publishedTermsVersion,
            moqTiers: detailProduct.moqTiers,
            procurementUnit: detailProduct.procurementUnit,
            procurementPackQty: detailProduct.procurementPackQty,
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
          {/* V3-FIX-175: Open checkout instead of direct order */}
          <Pressable style={styles.orderBtn} accessibilityLabel="Review & checkout" onPress={() => setCheckoutVisible(true)}>
            <Text style={styles.orderBtnText}>CHECKOUT →</Text>
          </Pressable>
        </View>
      ) : null}
      {/* V3-FIX-175+176: Procurement checkout modal */}
      <Modal visible={checkoutVisible} transparent animationType="slide" onRequestClose={() => !ordering && setCheckoutVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 }}>Procurement Checkout</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginBottom: 8 }}>Payment to SuperMandi Tech Pvt Ltd</Text>

            {/* Order summary with GST/discount/payment breakdown */}
            {(() => {
              const selected = products.filter((p) => (orderQtys[p.id] ?? 0) > 0);
              const subtotal = cartTotal;
              // GCP-STG-0403: Per-item GST extraction (not averaged across items)
              const estimatedGst = selected.reduce((sum, p) => {
                const cases = orderQtys[p.id] ?? 0;
                const gst = p.gstPct ?? 18;
                const lineTotal = cases * p.caseSize * p.ptrMinor;
                return sum + Math.round(lineTotal * gst / (100 + gst));
              }, 0);
              const baseAmount = subtotal - estimatedGst;
              const discountItems = selected.filter(p => p.tradeDiscountPct);
              const hasCredit = paymentMode === "CREDIT" || paymentMode === "BNPL";
              return (
                <View style={{ backgroundColor: colors.backgroundSecondary, borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{cartItemCount} items · {Object.values(orderQtys).reduce((s, v) => s + v, 0)} cases</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>Subtotal (excl. GST)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600' }}>₹{Math.round(baseAmount / 100).toLocaleString("en-IN")}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>GST (per-item)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600' }}>₹{Math.round(estimatedGst / 100).toLocaleString("en-IN")}</Text>
                  </View>
                  {discountItems.length > 0 ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                      <Text style={{ fontSize: 12, color: colors.success }}>Trade discount applied</Text>
                      <Text style={{ fontSize: 12, color: colors.success, fontWeight: '600' }}>{discountItems.map(p => `-${p.tradeDiscountPct}%`).join(', ')}</Text>
                    </View>
                  ) : null}
                  {/* GCP-STG-0398: Volume/tier discount line — actually applied to total */}
                  {volumeDiscountTotal > 0 ? (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }} testID="volume-discount-line">
                      <Text style={{ fontSize: 12, color: colors.success }}>Volume discount</Text>
                      <Text style={{ fontSize: 12, color: colors.success, fontWeight: '600' }}>-₹{Math.round(volumeDiscountTotal / 100).toLocaleString("en-IN")}</Text>
                    </View>
                  ) : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.primary }}>{hasCredit ? 'Payable later' : 'Total payable'}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: colors.primary }}>₹{Math.round(subtotal / 100).toLocaleString("en-IN")}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}>Payment to SuperMandi Tech Pvt Ltd · Principal procurement lane</Text>
                </View>
              );
            })()}

            {/* V3-FIX-175: Per-item published terms in checkout — authoritative accepted snapshot */}
            {(() => {
              const selected = products.filter((p) => (orderQtys[p.id] ?? 0) > 0);
              const withTerms = selected.filter(p => p.scheme || p.tradeDiscountPct || p.deliveryDays || p.deliveryTerms || p.bnplAvailable || p.financeEligible || p.creditDays || p.publishedTermsVersion || (p.procurementUnit && p.procurementUnit !== p.unit) || (p.moqTiers && Array.isArray(p.moqTiers) && p.moqTiers.length > 0));
              if (withTerms.length === 0) return null;
              return (
                <View style={{ backgroundColor: colors.primaryLight, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.info, marginBottom: 6 }}>Accepted Terms (per item)</Text>
                  {withTerms.map((p) => (
                    <View key={p.id} style={{ marginBottom: 4, paddingBottom: 4, borderBottomWidth: withTerms.indexOf(p) < withTerms.length - 1 ? 0.5 : 0, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textPrimary }}>{p.name} ×{orderQtys[p.id] ?? 0} cases</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                        {p.scheme ? <Text style={{ fontSize: 10, color: colors.warningDark, backgroundColor: colors.warningSoft, paddingHorizontal: 4, borderRadius: 3 }}>{p.scheme}</Text> : null}
                        {p.tradeDiscountPct ? <Text style={{ fontSize: 10, color: colors.textSecondary }}>-{p.tradeDiscountPct}%</Text> : null}
                        {p.deliveryDays != null ? <Text style={{ fontSize: 10, color: colors.info }}>{p.deliveryDays}d delivery</Text> : null}
                        {p.deliveryTerms ? <Text style={{ fontSize: 10, color: colors.info }}>{p.deliveryTerms}</Text> : null}
                        {p.creditDays ? <Text style={{ fontSize: 10, color: colors.primary }}>{p.creditDays}d credit</Text> : null}
                        {p.bnplAvailable ? <Text style={{ fontSize: 10, color: colors.success }}>BNPL</Text> : null}
                        {p.financeEligible && !p.bnplAvailable ? <Text style={{ fontSize: 10, color: colors.success }}>Finance</Text> : null}
                        {p.procurementUnit && p.procurementUnit !== p.unit ? <Text style={{ fontSize: 10, color: colors.accent }}>{p.procurementUnit}{p.procurementPackQty && p.procurementPackQty > 1 ? ` ×${p.procurementPackQty}` : ''}</Text> : null}
                        {(() => {
                          const qty = (orderQtys[p.id] ?? 0) * p.caseSize;
                          const tiers = p.moqTiers;
                          if (!tiers || !Array.isArray(tiers) || tiers.length === 0) return null;
                          const sorted = [...tiers].sort((a: any, b: any) => (b.minQty || 0) - (a.minQty || 0));
                          const applied = sorted.find((t: any) => qty >= (t.minQty || 0));
                          if (!applied) return null;
                          return <Text style={{ fontSize: 10, color: colors.success, fontWeight: '600' }}>MOQ tier: {applied.minQty}+ → -{applied.discountPct}%</Text>;
                        })()}
                        {p.publishedTermsVersion ? <Text style={{ fontSize: 10, color: colors.textTertiary }}>v{p.publishedTermsVersion}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* V3-FIX-176: Payment mode selection */}
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 6 }}>Payment Method</Text>
            {(["CASH", "UPI", "BNPL", "CREDIT"] as const).map((mode) => (
              <Pressable
                key={mode}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: paymentMode === mode ? colors.primary + '15' : colors.background, borderRadius: 10, marginBottom: 4, borderWidth: 1, borderColor: paymentMode === mode ? colors.primary : colors.border }}
                onPress={() => setPaymentMode(mode)}
              >
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: paymentMode === mode ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  {paymentMode === mode ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
                </View>
                <Text style={{ fontSize: 14, fontWeight: paymentMode === mode ? '700' : '500', color: paymentMode === mode ? colors.primary : colors.textPrimary }}>
                  {mode === "CASH" ? "Cash on Delivery" : mode === "UPI" ? "UPI / PhonePe" : mode === "BNPL" ? "Buy Now Pay Later" : "SuperMandi Credit"}
                </Text>
              </Pressable>
            ))}

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }} onPress={() => setCheckoutVisible(false)} disabled={ordering}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable style={{ flex: 2, padding: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' }} disabled={ordering} onPress={async () => {
                setOrdering(true);
                try {
                  const online = await isOnline();
                  if (!online) { showToast("Order requires internet connection"); setOrdering(false); return; }
                  const sid = await getDeviceStoreId();
                  if (!sid) { showToast("Store not configured"); setOrdering(false); return; }
                  const selectedProducts = products.filter((p) => (orderQtys[p.id] ?? 0) > 0);
                  if (selectedProducts.length === 0) { showToast("No items in order"); setOrdering(false); return; }

                  // V3-FIX-175: Snapshot accepted terms per item
                  const bySupplier = new Map<string, typeof selectedProducts>();
                  for (const p of selectedProducts) {
                    if (!p.supplierId) { showToast(`${p.name}: supplier identity missing`); setOrdering(false); return; }
                    const list = bySupplier.get(p.supplierId) ?? [];
                    list.push(p);
                    bySupplier.set(p.supplierId, list);
                  }

                  let totalItems = 0;
                  for (const [supplierId, supplierProducts] of bySupplier) {
                    const orderItems = supplierProducts.map((p) => ({
                      supplierProductId: p.id,
                      quantity: (orderQtys[p.id] ?? 0) * p.caseSize,
                      unitPrice: p.ptrMinor,
                      // GCP-STG-0387: Mark qty as already expanded to BASE units (cartons×caseSize→PCS)
                      // so GRN does NOT multiply by procurementPackQty again
                      quantityUnit: 'BASE' as const,
                      // V3-FIX-175: Snapshot commercial terms at order time
                      acceptedTerms: {
                        ptrMinor: p.ptrMinor, mrpMinor: p.mrpMinor,
                        scheme: p.scheme, tradeDiscountPct: p.tradeDiscountPct,
                        deliveryDays: p.deliveryDays, creditDays: p.creditDays,
                        moq: p.moq, bnplAvailable: p.bnplAvailable,
                        deliveryTerms: p.deliveryTerms, financeEligible: p.financeEligible,
                        publishedTermsVersion: p.publishedTermsVersion,
                      },
                    }));
                    // V3-FIX-176: Include payment mode in order
                    const order = await createOrder(sid, {
                      supplierId,
                      orderType: "catalogue_principal" as any,
                      items: orderItems,
                      paymentMode: paymentMode as any,
                    });
                    await submitOrder(sid, order.id);
                    // V3-FIX-176: Payment intent created server-side — surface state + redirect
                    const orderData = order as any;
                    if (orderData.paymentIntentStatus === 'pending' && orderData.paymentRedirectUrl) {
                      // UPI/Provider: open payment redirect
                      showToast(`Order placed — redirecting to payment...`);
                      try {
                        const { Linking } = require('react-native');
                        await Linking.openURL(orderData.paymentRedirectUrl);
                      } catch {
                        showToast(`Pay via: ${orderData.paymentRedirectUrl}`);
                      }
                      logger.debug("BuyV3", `payment_redirect:${orderData.paymentRedirectUrl}`);
                    } else if (orderData.paymentIntentStatus === 'authorized') {
                      showToast(`Order placed — SuperMandi Credit approved!`);
                    } else if (orderData.paymentIntentStatus === 'pending') {
                      showToast(`Order placed — payment pending partner approval`);
                    }
                    totalItems += orderItems.length;
                    logger.debug("BuyV3", `checkout:${order.id},supplier:${supplierId},payment:${paymentMode},intent:${orderData.paymentIntentStatus || 'none'}`);
                  }
                  if (paymentMode === "CASH") {
                    showToast(`Order placed (Cash on Delivery): ${totalItems} items · ₹${Math.round(cartTotal / 100).toLocaleString("en-IN")}`);
                  }
                  storeClearOrderQtys();
                  setCheckoutVisible(false);
                } catch (err: any) {
                  showToast(err?.message ?? "Failed to place order");
                } finally {
                  setOrdering(false);
                }
              }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textInverse }}>{ordering ? "Placing..." : `Pay ₹${Math.round(cartTotal / 100).toLocaleString("en-IN")} →`}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    // V3-FIX-180: BUY mode identity hero
    buyHero: {
      backgroundColor: tabAccents(colors).BUY.heroSoft,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    buyHeroLabel: { ...typeRhythm.sectionTitle, color: tabAccents(colors).BUY.accent },
    buyHeroSub: { fontSize: 11, color: colors.textTertiary },
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
    chipTextActive: { color: colors.textInverse },
    // V3-FIX-181: Finance banner uses brand tokens
    financeBanner: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 14, marginTop: 8, padding: 12, backgroundColor: tabAccents(colors).STORE.heroSoft, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    financeIcon: { fontSize: 20 },
    financeTitle: { fontSize: 13, fontWeight: "700", color: tabAccents(colors).STORE.accent },
    financeSub: { fontSize: 11, color: tabAccents(colors).STORE.accent },
    financeArrow: { fontSize: 16, color: tabAccents(colors).STORE.accent, fontWeight: "700" },
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
    cartCount: { fontSize: 13, fontWeight: "700", color: colors.textInverse },
    cartItems: { fontSize: 10, color: colors.overlayInverse, maxWidth: 140 },
    cartTotal: { fontSize: 18, fontWeight: "900", color: colors.textInverse, marginHorizontal: 12 },
    orderBtn: { backgroundColor: colors.textInverse, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12 },
    orderBtnText: { color: colors.accent, fontSize: 14, fontWeight: "800" },
  });
}
