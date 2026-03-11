// CatalogProductCard - SCALE-B2 compliant
// POS Buy Tile: Retailer is the BUYER — NO margin shown.
// Approved design: image 48x48, brand, pack_config, cost_price, MRP, MOQ, stock dot,
//   supplier+city, BNPL badge, GST%, HSN, [+Order] button.

import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme, useThemeColors } from "../../theme";
import { ProductImage } from "../ProductImage";
import type { CatalogProduct } from "../../services/api/catalogApi";
import {
  getLocalizedProductName,
  getLocalizedProductBrand,
} from "../../services/api/catalogApi";

// =============================================================================
// TYPES
// =============================================================================

export interface CatalogProductCardProps {
  product: CatalogProduct;
  onPress: (product: CatalogProduct) => void;
  cartQuantity?: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Format paise (integer) as ₹XX.XX */
function formatRupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/** Build pack config label: "70g × 12 Pack" or null if data missing */
function buildPackConfig(
  netContentValue: number | null | undefined,
  netContentUnit: string | null | undefined,
  packSize: number | null | undefined
): string | null {
  if (!netContentValue || !netContentUnit) return null;
  if (packSize && packSize > 1) {
    return `${netContentValue}${netContentUnit} × ${packSize} Pack`;
  }
  return `${netContentValue}${netContentUnit}`;
}

/** Map stock_status to dot color */
function stockDotColor(
  status: "in_stock" | "low_stock" | "out_of_stock",
  colors: ReturnType<typeof useThemeColors>
): string {
  switch (status) {
    case "in_stock":
      return colors.success;
    case "low_stock":
      return colors.warning;
    case "out_of_stock":
      return colors.error;
    default:
      return colors.textTertiary;
  }
}

/** Human-readable stock label */
function stockLabel(status: "in_stock" | "low_stock" | "out_of_stock"): string {
  switch (status) {
    case "in_stock":
      return "In Stock";
    case "low_stock":
      return "Low Stock";
    case "out_of_stock":
      return "Out of Stock";
    default:
      return "Unknown";
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CatalogProductCard({
  product,
  onPress,
  cartQuantity = 0,
}: CatalogProductCardProps) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);

  // TR-PEND-006: Use localized display names for Hindi UX parity
  const displayName = getLocalizedProductName(product);
  const displayBrand = getLocalizedProductBrand(product);

  // SCALE-B2: Pack config from net_content + pack_size
  const packConfig = buildPackConfig(
    product.netContentValue,
    product.netContentUnit,
    product.packSize
  );

  // SCALE-B2: Stock dot color
  const dotColor = stockDotColor(product.stockStatus, tc);

  // SCALE-B2: Show MOQ if > 1
  const showMoq = (product.minMoq ?? 1) > 1;

  // SCALE-B2: Supplier line "Name (City)"
  const supplierLine =
    product.supplierName
      ? product.supplierCity
        ? `${product.supplierName} (${product.supplierCity})`
        : product.supplierName
      : null;

  return (
    <Pressable
      testID="catalog-product-card"
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        product.stockStatus === "out_of_stock" && styles.cardOutOfStock,
      ]}
      onPress={() => onPress(product)}
      accessibilityRole="button"
      accessibilityLabel={`Order ${displayName}`}
    >
      {/* Cart quantity badge */}
      {cartQuantity > 0 && (
        <View style={styles.cartBadge} testID="catalog-card-cart-badge">
          <Text style={styles.cartBadgeText}>{cartQuantity}</Text>
        </View>
      )}

      <View style={styles.content}>
        {/* Row 1: Image + Name + Brand */}
        <View style={styles.imageRow}>
          <ProductImage
            uri={product.imageUrl}
            size={48}
            borderRadius={6}
            testID="catalog-card-image"
          />
          <View style={styles.nameBlock}>
            <Text style={styles.name} numberOfLines={2} testID="catalog-card-name">
              {displayName}
            </Text>
            {displayBrand && (
              <Text style={styles.brand} numberOfLines={1} testID="catalog-card-brand">
                {displayBrand}
              </Text>
            )}
            {/* Pack config: "70g × 12 Pack" */}
            {packConfig && (
              <Text style={styles.packConfig} numberOfLines={1} testID="catalog-card-pack-config">
                {packConfig}
              </Text>
            )}
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Row 2: Cost price + MRP */}
        <View style={styles.priceRow}>
          <Text style={styles.costPrice} testID="catalog-card-cost-price">
            {`Cost ${formatRupees(product.bestPrice)}/pack`}
          </Text>
          {product.suppliers[0]?.mrp != null && product.suppliers[0].mrp > 0 && (
            <Text style={styles.mrp} testID="catalog-card-mrp">
              {`MRP ${formatRupees(product.suppliers[0].mrp)}`}
            </Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Row 3: MOQ + Stock dot */}
        <View style={styles.moqStockRow}>
          {showMoq && (
            <Text style={styles.moq} testID="catalog-card-moq">
              {`MOQ: ${product.minMoq} packs`}
            </Text>
          )}
          <View style={styles.stockBadge}>
            <View
              style={[styles.stockDot, { backgroundColor: dotColor }]}
              testID="catalog-card-stock-dot"
            />
            <Text style={[styles.stockText, { color: dotColor }]} testID="catalog-card-stock-label">
              {stockLabel(product.stockStatus)}
            </Text>
          </View>
        </View>

        {/* Supplier + city */}
        {supplierLine && (
          <Text style={styles.supplier} numberOfLines={1} testID="catalog-card-supplier">
            {supplierLine}
          </Text>
        )}

        {/* Badges row: BNPL + GST + HSN */}
        <View style={styles.badgeRow}>
          {product.bnplEligible && (
            <View style={styles.bnplBadge} testID="catalog-card-bnpl-badge">
              <Text style={styles.bnplBadgeText}>BNPL ✓</Text>
            </View>
          )}
          {product.gstRate != null && product.gstRate > 0 && (
            <Text style={styles.gstText} testID="catalog-card-gst">
              {`GST ${product.gstRate}%`}
            </Text>
          )}
          {product.hsnCode && (
            <Text style={styles.hsnText} numberOfLines={1} testID="catalog-card-hsn">
              {`HSN ${product.hsnCode}`}
            </Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* [+ Order] button */}
        <Pressable
          testID="catalog-card-order-button"
          style={({ pressed }) => [styles.orderButton, pressed && styles.orderButtonPressed]}
          onPress={() => onPress(product)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${displayName} to order`}
        >
          <MaterialCommunityIcons name="plus" size={16} color={tc.textInverse} />
          <Text style={styles.orderButtonText}>Order</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// =============================================================================
// STYLES
// =============================================================================

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      marginHorizontal: theme.spacing.xs,
      marginVertical: theme.spacing.xs,
      ...theme.shadows.sm,
      overflow: "hidden",
    },
    cardPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.98 }],
    },
    cardOutOfStock: {
      opacity: 0.6,
    },
    cartBadge: {
      position: "absolute",
      top: theme.spacing.sm,
      right: theme.spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.full,
      minWidth: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: theme.spacing.xs,
      zIndex: 1,
    },
    cartBadgeText: {
      color: colors.textInverse,
      fontSize: 12,
      fontWeight: "700",
    },
    content: {
      padding: theme.spacing.md,
    },
    // Row 1: Image + name + brand + pack config
    imageRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    nameBlock: {
      flex: 1,
    },
    name: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      lineHeight: 20,
    },
    brand: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    packConfig: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: theme.spacing.xs,
    },
    // Row 2: Cost + MRP
    priceRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    costPrice: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primary,
    },
    mrp: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    // Row 3: MOQ + stock
    moqStockRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    moq: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    stockBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    stockDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    stockText: {
      fontSize: 11,
      fontWeight: "600",
    },
    // Supplier
    supplier: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: theme.spacing.xs,
    },
    // Badges
    badgeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      marginTop: theme.spacing.xs,
      alignItems: "center",
    },
    bnplBadge: {
      backgroundColor: colors.successSoft,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.sm,
    },
    bnplBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.success,
    },
    gstText: {
      fontSize: 10,
      color: colors.textTertiary,
    },
    hsnText: {
      fontSize: 10,
      color: colors.textTertiary,
      flexShrink: 1,
    },
    // Order button
    orderButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.md,
      paddingVertical: theme.spacing.sm,
    },
    orderButtonPressed: {
      opacity: 0.85,
    },
    orderButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textInverse,
    },
  });
}

export default CatalogProductCard;
