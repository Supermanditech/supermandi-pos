import React, { useMemo, useState, useCallback, useEffect } from "react";
import { View, FlatList, Pressable, ActivityIndicator, StyleSheet, Text } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import SupplierProductCardV3, { type SupplierProduct } from "../../components/v3/SupplierProductCardV3";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";
import { getCatalog, type CatalogProduct } from "../../services/api/catalogApi";
import { createOrder, submitOrder, type CreateOrderParams } from "../../services/api/orderApi";
import { getDeviceStoreId } from "../../services/deviceSession";
import { logger } from "../../services/logger";

// V3-013: BUY tab wired to real catalogApi

const DEFAULT_CATEGORIES = ["All", "Biscuits", "Tea & Coffee", "Noodles", "Oil & Ghee", "Dairy", "Cleaning"];

// Map CatalogProduct → SupplierProduct for the card
function catalogToSupplier(p: CatalogProduct): SupplierProduct {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand ?? "",
    category: p.category ?? "",
    packSize: p.netContentValue ? `${p.netContentValue}${p.netContentUnit ?? ""}` : "",
    caseSize: 24, // Default — real case size from wholesale API (V3-017)
    unit: p.unit ?? "pcs",
    mrpMinor: (p as any).bestPrice ? Math.round((p as any).bestPrice * 100) : 0,
    // PD-022: Use admin-approved retail price if available, else estimate
    ptrMinor: (p as any).adminRetailPriceMinor ?? ((p as any).bestPrice ? Math.round((p as any).bestPrice * 85) : 0),
    hsnCode: p.hsnCode ?? "",
    gstPct: p.gstRate ?? p.defaultGstRate ?? 18,
    moq: 1,
    supplierName: (p as any).supplierName ?? "Supplier",
    deliveryDays: 2,
    // bnplAvailable will come from wholesale API (V3-017)
  };
}

export default function BuyScreenV3() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedSupplier, setSelectedSupplier] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [orderQtys, setOrderQtys] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<SupplierProduct[]>([]);
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
        // Extract unique suppliers
        const uniqueSuppliers = [...new Set(mapped.map((p) => p.supplierName).filter(Boolean))];
        setSuppliers(["All Suppliers", ...uniqueSuppliers]);
        // Set default order qtys (MOQ for each)
        const defaultQtys: Record<string, number> = {};
        mapped.forEach((p) => { defaultQtys[p.id] = p.moq; });
        setOrderQtys(defaultQtys);
        logger.debug("BuyV3", `loaded:${mapped.length} products from ${uniqueSuppliers.length} suppliers`);
      } catch (err) {
        logger.debug("BuyV3", `fetch_failed:${String(err)}`);
        showToast("Failed to load catalogue");
      }
      setLoading(false);
    };
    void fetchCatalog();
  }, []);

  const cartItemCount = Object.values(orderQtys).reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
  const cartTotal = products.reduce((s, p) => s + (orderQtys[p.id] ?? 0) * p.caseSize * p.ptrMinor, 0);

  const handleQtyChange = useCallback((id: string, cases: number) => {
    const qty = Math.max(0, Math.round(cases));
    setOrderQtys((prev) => ({ ...prev, [id]: qty }));
  }, []);

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <View style={styles.searchInput}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth={2}><Circle cx={11} cy={11} r={8} /><Path d="M21 21l-4.35-4.35" /></Svg>
          <Text style={styles.searchPlaceholder}>Search supplier products...</Text>
        </View>
        <Pressable style={styles.scanBtn} accessibilityLabel="Scan barcode" onPress={() => navigation.navigate("V3Scan")}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2}><Rect x={3} y={3} width={18} height={18} rx={2} /><Path d="M7 7h.01M7 12h10M7 17h.01" /></Svg>
        </Pressable>
      </View>

      {/* Supplier selector */}
      <View style={styles.supplierRow}>
        <Text style={styles.supplierLabel}>BUYING FROM</Text>
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

      {/* Category chips */}
      <FlatList
        horizontal
        data={DEFAULT_CATEGORIES}
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

      {/* Product list */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 12 }}>Loading catalogue...</Text>
        </View>
      ) : null}
      {!loading ? <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
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
            orderQtyCases={orderQtys[item.id] ?? item.moq}
            onQtyChange={(c) => handleQtyChange(item.id, c)}
            onAddToCart={() => showToast(`${item.name} ×${orderQtys[item.id] ?? item.moq} cases added`)}
            onPress={() => navigation.navigate("V3Compare", { productName: item.name, packSize: item.packSize, mrpMinor: item.mrpMinor, currentStock: 0, sellPriceMinor: item.ptrMinor, weeklyNeed: Math.max(1, item.moq) })}
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
            const supplierId = selectedProducts[0].supplierName ?? "default";
            const orderItems = selectedProducts.map((p) => ({
              supplierProductId: p.id,
              quantity: (orderQtys[p.id] ?? 0) * p.caseSize,
              unitPrice: p.ptrMinor,
            }));
            try {
              const order = await createOrder(sid, { supplierId, orderType: "standard" as any, items: orderItems });
              await submitOrder(sid, order.id);
              showToast(`Order placed: ${cartItemCount} items · ₹${Math.round(cartTotal / 100).toLocaleString("en-IN")}`);
              logger.debug("BuyV3", `order_submitted:${order.id},items:${orderItems.length}`);
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
    searchBar: { flexDirection: "row", gap: 8, padding: 10, paddingHorizontal: 14, backgroundColor: colors.surface },
    searchInput: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.background, borderRadius: 14, borderWidth: 2, borderColor: colors.border },
    searchPlaceholder: { fontSize: 14, color: colors.textTertiary, fontWeight: "500" },
    scanBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" },
    supplierRow: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4, backgroundColor: colors.surface },
    supplierLabel: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 6 },
    supplierChips: { gap: 8 },
    categoryRow: { backgroundColor: colors.surface },
    categoryChips: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
    chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
    chipTextActive: { color: "#fff" },
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
