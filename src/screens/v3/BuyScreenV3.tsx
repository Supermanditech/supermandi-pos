import React, { useMemo, useState, useCallback } from "react";
import { View, FlatList, Pressable, StyleSheet, Text } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import SupplierProductCardV3, { type SupplierProduct } from "../../components/v3/SupplierProductCardV3";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";

// V3-004: BUY tab with sub-screen navigation wired

const SUPPLIERS = ["All Suppliers", "ABC Distributors", "XYZ Trading", "Fresh Dairy Co"];
const CATEGORIES = ["All", "Biscuits", "Tea & Coffee", "Noodles", "Oil & Ghee", "Dairy", "Cleaning"];

// Demo wholesale products
const DEMO_PRODUCTS: SupplierProduct[] = [
  { id: "1", name: "Parle-G Gold 100g", brand: "Parle", category: "Biscuits", packSize: "100g", caseSize: 48, unit: "pcs", mrpMinor: 1000, ptrMinor: 850, ptsMinor: 800, hsnCode: "1905", gstPct: 18, moq: 1, supplierName: "ABC Distributors", deliveryDays: 2, tradeDiscountPct: 15, scheme: "10+1 Free", currentStock: 12, daysOfStock: 2 },
  { id: "2", name: "Tata Tea Premium 250g", brand: "Tata", category: "Tea & Coffee", packSize: "250g", caseSize: 24, unit: "pcs", mrpMinor: 8000, ptrMinor: 6800, ptsMinor: 6400, hsnCode: "0902", gstPct: 5, moq: 1, supplierName: "XYZ Trading", deliveryDays: 1, tradeDiscountPct: 15, creditDays: 30, currentStock: 24, daysOfStock: 5 },
  { id: "3", name: "Amul Taaza Milk 500ml", brand: "Amul", category: "Dairy", packSize: "500ml", caseSize: 12, unit: "pcs", mrpMinor: 2800, ptrMinor: 2400, hsnCode: "0401", gstPct: 5, moq: 2, supplierName: "Fresh Dairy Co", deliveryDays: 0, currentStock: 5, daysOfStock: 1 },
];

export default function BuyScreenV3() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [selectedSupplier, setSelectedSupplier] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [orderQtys, setOrderQtys] = useState<Record<string, number>>({ "1": 2, "2": 1, "3": 3 });

  const cartItemCount = Object.values(orderQtys).reduce((s, v) => s + (v > 0 ? 1 : 0), 0);
  const cartTotal = DEMO_PRODUCTS.reduce((s, p) => s + (orderQtys[p.id] ?? 0) * p.caseSize * p.ptrMinor, 0);

  const handleQtyChange = useCallback((id: string, cases: number) => {
    setOrderQtys((prev) => ({ ...prev, [id]: Math.max(0, cases) }));
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
          data={SUPPLIERS}
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
        data={CATEGORIES}
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
      <FlatList
        data={DEMO_PRODUCTS}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <SupplierProductCardV3
            product={item}
            orderQtyCases={orderQtys[item.id] ?? item.moq}
            onQtyChange={(c) => handleQtyChange(item.id, c)}
            onAddToCart={() => showToast(`${item.name} ×${orderQtys[item.id] ?? item.moq} cases added`)}
            onPress={() => navigation.navigate("V3Compare", { productName: item.name })}
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
      />

      {/* Purchase cart strip */}
      {cartItemCount > 0 ? (
        <View style={styles.cartStrip}>
          <View style={styles.cartLeft}>
            <Text style={styles.cartCount}>{cartItemCount} item{cartItemCount > 1 ? "s" : ""} · {Object.values(orderQtys).reduce((s, v) => s + v, 0)} cases</Text>
            <Text style={styles.cartItems}>{DEMO_PRODUCTS.filter(p => (orderQtys[p.id] ?? 0) > 0).map(p => p.name.split(" ")[0]).join(", ")}</Text>
          </View>
          <Text style={styles.cartTotal}>₹{Math.round(cartTotal / 100).toLocaleString("en-IN")}</Text>
          <Pressable style={styles.orderBtn} accessibilityLabel="Place order">
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
