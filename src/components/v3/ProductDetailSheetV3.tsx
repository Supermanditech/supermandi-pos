/**
 * V3-FIX-135: Product detail-first sheet for SELL flow
 * V3-HARDEN-137: Shared detail-first contract across SELL and BUY
 *
 * Tap on a product tile/card opens this sheet instead of adding directly.
 * Add-to-cart only happens from explicit CTAs inside this surface.
 */
import React, { useMemo, useState, useCallback } from "react";
import { View, Pressable, Modal, ScrollView, StyleSheet, Text, Image } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import type { ProductTileData } from "./ProductTileV3";
import { showToast } from "../../utils/showToast";

// V3-FIX-136: Procurement metadata for BUY context
export interface ProcurementData {
  supplierName?: string;
  hsnCode?: string;
  gstPct?: number;
  moq?: number;
  ptrMinor?: number;
  ptsMinor?: number;
  deliveryDays?: number;
  scheme?: string;
  tradeDiscountPct?: number;
  creditDays?: number;
  bnplAvailable?: boolean;
}

type ProductDetailSheetV3Props = {
  product: ProductTileData | null;
  visible: boolean;
  onClose: () => void;
  onAddToCart: (product: ProductTileData, quantity: number) => void;
  context: "SELL" | "BUY";
  procurement?: ProcurementData;
};

export default function ProductDetailSheetV3({
  product,
  visible,
  onClose,
  onAddToCart,
  context,
  procurement,
}: ProductDetailSheetV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [qty, setQty] = useState(1);

  const handleAdd = useCallback(() => {
    if (!product) return;
    onAddToCart(product, qty);
    showToast(`${product.name} ×${qty} added`);
    setQty(1);
    onClose();
  }, [product, qty, onAddToCart, onClose]);

  // Reset qty when product changes
  React.useEffect(() => { setQty(1); }, [product?.id]);

  if (!visible || !product) return null;

  // V3-FIX-136: BUY CTA uses procurement/trade price, SELL uses MRP
  const displayPriceMinor = context === "BUY" && product.priceTradeMinor
    ? product.priceTradeMinor
    : product.priceMrpMinor;
  const priceLabel = `₹${(displayPriceMinor / 100).toFixed(displayPriceMinor % 100 === 0 ? 0 : 2)}`;
  const mrpLabel = product.priceMrpMinor > 0
    ? `MRP ₹${(product.priceMrpMinor / 100).toFixed(product.priceMrpMinor % 100 === 0 ? 0 : 2)}`
    : null;
  const ctaLabel = context === "SELL" ? "Add to Cart" : "Add to Purchase Cart";
  const stockText = product.stock != null
    ? product.stock > 0 ? `${product.stock} in stock` : "Out of stock"
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} testID="product-detail-sheet">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Top fast-add CTA for repeat purchases */}
          <View style={styles.topBar}>
            <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close details">
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
            <Pressable style={styles.topAddBtn} onPress={handleAdd} accessibilityLabel={ctaLabel} testID="detail-top-add">
              <Text style={styles.topAddText}>{ctaLabel} →</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false} contentContainerStyle={styles.bodyContent}>
            {/* Product image/icon */}
            <View style={styles.imageArea}>
              {product.imageUrl ? (
                <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="contain" />
              ) : (
                <Text style={styles.emoji}>{getCategoryEmoji(product.category)}</Text>
              )}
            </View>

            {/* Name + brand */}
            <Text style={styles.productName}>{product.name}</Text>
            {product.brand ? <Text style={styles.brand}>{product.brand}</Text> : null}

            {/* Price row — BUY shows trade price prominently, SELL shows MRP */}
            <View style={styles.priceRow}>
              <Text style={styles.price}>{priceLabel}</Text>
              {context === "BUY" && mrpLabel ? (
                <Text style={styles.tradePrice}>{mrpLabel}</Text>
              ) : context === "SELL" && product.priceTradeMinor ? (
                <Text style={styles.tradePrice}>Trade: ₹{(product.priceTradeMinor / 100).toFixed(0)}</Text>
              ) : null}
            </View>

            {/* Metadata grid */}
            <View style={styles.metaGrid}>
              {product.barcode ? (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Barcode</Text>
                  <Text style={styles.metaValue}>{product.barcode}</Text>
                </View>
              ) : null}
              {product.unit ? (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Unit</Text>
                  <Text style={styles.metaValue}>{product.unit}</Text>
                </View>
              ) : null}
              {product.caseSize ? (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Case Size</Text>
                  <Text style={styles.metaValue}>{product.caseSize} {product.unit ?? "pcs"}</Text>
                </View>
              ) : null}
              {stockText ? (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Stock</Text>
                  <Text style={[styles.metaValue, { color: (product.stock ?? 0) > 0 ? colors.success : colors.error }]}>{stockText}</Text>
                </View>
              ) : null}
            </View>

            {/* V3-FIX-136: Procurement metadata for BUY context */}
            {context === "BUY" && procurement ? (
              <View style={styles.metaGrid}>
                {procurement.supplierName ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Supplier</Text>
                    <Text style={styles.metaValue}>{procurement.supplierName}</Text>
                  </View>
                ) : null}
                {procurement.ptrMinor ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>PTR</Text>
                    <Text style={styles.metaValue}>₹{(procurement.ptrMinor / 100).toFixed(2)}/unit</Text>
                  </View>
                ) : null}
                {procurement.hsnCode ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>HSN</Text>
                    <Text style={styles.metaValue}>{procurement.hsnCode}</Text>
                  </View>
                ) : null}
                {procurement.gstPct != null ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>GST</Text>
                    <Text style={styles.metaValue}>{procurement.gstPct}%</Text>
                  </View>
                ) : null}
                {procurement.moq ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>MOQ</Text>
                    <Text style={styles.metaValue}>{procurement.moq} cases</Text>
                  </View>
                ) : null}
                {procurement.deliveryDays ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Delivery</Text>
                    <Text style={styles.metaValue}>{procurement.deliveryDays} days</Text>
                  </View>
                ) : null}
                {procurement.scheme ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Scheme</Text>
                    <Text style={[styles.metaValue, { color: colors.success }]}>{procurement.scheme}</Text>
                  </View>
                ) : null}
                {procurement.ptsMinor ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>PTS</Text>
                    <Text style={styles.metaValue}>₹{(procurement.ptsMinor / 100).toFixed(2)}/unit</Text>
                  </View>
                ) : null}
                {procurement.tradeDiscountPct ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Trade Discount</Text>
                    <Text style={[styles.metaValue, { color: colors.success }]}>{procurement.tradeDiscountPct}%</Text>
                  </View>
                ) : null}
                {procurement.creditDays ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Credit</Text>
                    <Text style={styles.metaValue}>{procurement.creditDays} days</Text>
                  </View>
                ) : null}
                {procurement.bnplAvailable ? (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>BNPL</Text>
                    <Text style={[styles.metaValue, { color: colors.primary }]}>Available</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Quantity selector */}
            <View style={styles.qtyRow}>
              <Text style={styles.qtyLabel}>Quantity</Text>
              <View style={styles.qtyStepper}>
                <Pressable style={styles.qtyBtn} onPress={() => setQty(Math.max(1, qty - 1))} accessibilityLabel="Decrease quantity">
                  <Text style={styles.qtyBtnText}>−</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{qty}</Text>
                <Pressable style={styles.qtyBtn} onPress={() => setQty(qty + 1)} accessibilityLabel="Increase quantity">
                  <Text style={styles.qtyBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {/* Bottom explicit add CTA */}
          <Pressable style={styles.bottomAddBtn} onPress={handleAdd} accessibilityLabel={ctaLabel} testID="detail-bottom-add">
            <Text style={styles.bottomAddText}>{ctaLabel} · {priceLabel} × {qty}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function getCategoryEmoji(cat?: string): string {
  const map: Record<string, string> = {
    Biscuits: "🍪", Tea: "🍵", Noodles: "🍜", Cleaning: "🫧",
    Dairy: "🥛", Bakery: "🍞", Staples: "🧂", Oil: "🫒",
    Chocolate: "🍫", Snacks: "🍿", Beverages: "🥤",
  };
  return map[cat ?? ""] ?? "📦";
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
    topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: getScreenPadding(), paddingTop: 16, paddingBottom: 8 },
    closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" },
    closeBtnText: { fontSize: 16, fontWeight: "700", color: colors.textTertiary },
    topAddBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
    topAddText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: getScreenPadding(), paddingBottom: 16 },
    imageArea: { width: "100%", height: 120, backgroundColor: colors.backgroundSecondary, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    image: { width: 80, height: 80, borderRadius: 12 },
    emoji: { fontSize: 48 },
    productName: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
    brand: { fontSize: 14, fontWeight: "600", color: colors.textTertiary, marginTop: 2 },
    priceRow: { flexDirection: "row", alignItems: "baseline", gap: 12, marginTop: 8 },
    price: { fontSize: 28, fontWeight: "900", color: colors.primary },
    tradePrice: { fontSize: 14, fontWeight: "600", color: colors.success },
    metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
    metaItem: { backgroundColor: colors.backgroundSecondary, borderRadius: 10, padding: 10, minWidth: "45%" },
    metaLabel: { fontSize: 10, fontWeight: "700", color: colors.textTertiary, letterSpacing: 0.5 },
    metaValue: { fontSize: 14, fontWeight: "600", color: colors.textPrimary, marginTop: 2 },
    qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
    qtyLabel: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
    qtyStepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.backgroundSecondary, borderRadius: 12, overflow: "hidden" },
    qtyBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    qtyBtnText: { fontSize: 20, fontWeight: "700", color: colors.primary },
    qtyValue: { fontSize: 18, fontWeight: "800", minWidth: 36, textAlign: "center", color: colors.textPrimary },
    bottomAddBtn: { backgroundColor: colors.primary, marginHorizontal: getScreenPadding(), marginBottom: 16, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    bottomAddText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  });
}
