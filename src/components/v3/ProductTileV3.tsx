import React, { useMemo } from "react";
import { View, Pressable, StyleSheet, Text, Image } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getChipFontSize } from "../../theme/responsive";
import { cardElevation, shell } from "../../theme/brand";
import type { SellMode } from "../../stores/cartStore";

// STG-553: Product tile for v3 sell grid — stock dot, cart badge, case size, wholesale price

export interface ProductTileData {
  id: string;
  name: string;
  priceMrpMinor: number;      // MRP in paise
  priceTradeMinor?: number;   // wholesale/trade price in paise (optional)
  barcode?: string;
  brand?: string;
  category?: string;
  stock?: number;
  caseSize?: number;           // units per case
  unit?: string;               // pcs, kg, ltr, btl
  imageUrl?: string;           // V3-FIX-054: real product image URL
  // V3-HARDEN-171: Conversion-aware sell flow
  productMode?: string;        // PACKAGED or LOOSE_BULK
  soldBy?: string;             // WEIGHT or COUNT
  rateUnit?: string;           // KG, GM, PCS, DOZEN, LTR, ML
  baseStockUnit?: string;      // canonical inventory unit
  allowFractionalSell?: boolean;
  conversionConfirmed?: boolean;
  storeProductId?: string;       // canonical store product identity
}

type ProductTileV3Props = {
  product: ProductTileData;
  sellMode: SellMode;
  cartQty: number;
  onPress: () => void;
};

function getStockStatus(stock?: number): "in" | "low" | "out" | "unknown" {
  if (stock == null) return "unknown";
  if (stock <= 0) return "out";
  if (stock <= 10) return "low";
  return "in";
}

export default function ProductTileV3({ product, sellMode, cartQty, onPress }: ProductTileV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const stockStatus = getStockStatus(product.stock);
  const displayPrice = sellMode === "bulk" && product.priceTradeMinor
    ? product.priceTradeMinor
    : product.priceMrpMinor;
  const priceLabel = `₹${(displayPrice / 100).toFixed(displayPrice % 100 === 0 ? 0 : 2)}`;
  const emoji = getCategoryEmoji(product.category);

  return (
    <Pressable
      style={[styles.tile, cartQty > 0 && styles.tileInCart]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${priceLabel}, tap for details`}
    >
      {cartQty > 0 ? (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{cartQty}</Text>
        </View>
      ) : null}

      {stockStatus !== "unknown" ? (
        <View style={[
          styles.stockDot,
          stockStatus === "in" && styles.dotGreen,
          stockStatus === "low" && styles.dotYellow,
          stockStatus === "out" && styles.dotRed,
        ]} />
      ) : null}

      <View style={styles.imageArea}>
        {/* V3-FIX-054: Use real image when available, emoji fallback */}
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={{ width: 32, height: 32, borderRadius: 6 }} resizeMode="contain" />
        ) : (
          <Text style={styles.emoji}>{emoji}</Text>
        )}
        {product.brand ? (
          <Text style={styles.brandLabel}>{product.brand}</Text>
        ) : null}
      </View>

      <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
      <Text style={styles.price}>{priceLabel}</Text>

      {product.caseSize ? (
        <Text style={styles.caseInfo}>
          {sellMode === "bulk" ? "Trade" : "MRP"} · {product.caseSize}/{product.unit ?? "pcs"}
        </Text>
      ) : null}

      {/* V3-HARDEN-171: Sell-unit indicator for loose products */}
      {product.productMode === "LOOSE_BULK" && product.rateUnit ? (
        <Text style={[styles.caseInfo, { color: "#6366f1" }]}>per {product.rateUnit}</Text>
      ) : null}

      {/* V3-FIX-173: Operator-first stock health indicator */}
      {product.stock != null && product.stock > 0 && product.stock <= 10 ? (
        <Text style={styles.stockLow}>Low: {product.stock}</Text>
      ) : product.stock != null && product.stock <= 0 ? (
        <Text style={styles.stockOut}>Out of stock</Text>
      ) : null}

      {/* V3-HARDEN-171: Warning for unconverted bulk stock */}
      {product.conversionConfirmed === false && product.productMode === "LOOSE_BULK" ? (
        <Text style={styles.setupNeeded}>Setup needed</Text>
      ) : null}
    </Pressable>
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
    // V3-FIX-181: Premium tile with subtle elevation
    tile: {
      backgroundColor: colors.surface,
      borderRadius: shell.cardRadius,
      padding: 10,
      alignItems: "center",
      borderWidth: 1.5,
      borderColor: colors.border,
      position: "relative",
      ...cardElevation.subtle,
    },
    tileInCart: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    // V3-DELETE-113: Responsive badge dimensions
    cartBadge: {
      position: "absolute",
      top: -6,
      left: -6,
      backgroundColor: colors.primary,
      width: getChipFontSize() * 2,
      height: getChipFontSize() * 2,
      borderRadius: getChipFontSize(),
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },
    // V3-HARDEN-111: Responsive badge text
    cartBadgeText: {
      color: colors.textInverse,
      fontSize: getChipFontSize(),
      fontWeight: "800",
    },
    // V3-DELETE-113: Responsive stock dot
    stockDot: {
      position: "absolute",
      top: 7,
      right: 7,
      width: getChipFontSize() - 1,
      height: getChipFontSize() - 1,
      borderRadius: (getChipFontSize() - 1) / 2,
      borderWidth: 2,
      borderColor: colors.surface,
      zIndex: 1,
    },
    dotGreen: { backgroundColor: colors.success },
    dotYellow: { backgroundColor: colors.warning },
    dotRed: { backgroundColor: colors.error },
    imageArea: {
      width: "100%",
      aspectRatio: 1,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 6,
    },
    emoji: {
      fontSize: 34,
    },
    // V3-HARDEN-111: Responsive brand label
    brandLabel: {
      fontSize: getChipFontSize() - 3,
      fontWeight: "700",
      color: colors.textTertiary,
      letterSpacing: 0.3,
      marginTop: 2,
    },
    // V3-HARDEN-111: Responsive name text with flexible height
    name: {
      fontSize: getChipFontSize(),
      fontWeight: "600",
      color: colors.textPrimary,
      lineHeight: getChipFontSize() + 3,
      textAlign: "center",
      minHeight: (getChipFontSize() + 3) * 2,
    },
    // V3-HARDEN-111: Responsive price text
    price: {
      fontSize: getChipFontSize() + 3,
      fontWeight: "800",
      color: colors.primary,
      marginTop: 2,
    },
    // V3-HARDEN-111: Responsive case info
    caseInfo: {
      fontSize: getChipFontSize() - 3,
      color: colors.textTertiary,
      marginTop: 1,
    },
    // V3-FIX-181: Stock health + setup indicators using theme tokens
    stockLow: { fontSize: 9, color: colors.warning, textAlign: "center" as const, fontWeight: "700" as const },
    stockOut: { fontSize: 9, color: colors.error, textAlign: "center" as const, fontWeight: "700" as const },
    setupNeeded: { fontSize: 10, color: colors.warning, textAlign: "center" as const, marginTop: 2 },
  });
}
