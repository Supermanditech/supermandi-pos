// CatalogProductCard - V3.0.9 compliant
// Product card for BUY screen catalog grid

import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme, useThemeColors } from "../../theme";
import { formatMoney } from "../../utils/money";
import type { CatalogProduct } from "../../services/api/catalogApi";
import { ProductImage } from "../ProductImage";
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
// COMPONENT
// =============================================================================

export function CatalogProductCard({
  product,
  onPress,
  cartQuantity = 0,
}: CatalogProductCardProps) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);

  const isOutOfStock = product.stockStatus === "out_of_stock";

  // TR-PEND-006: Use localized display names for Hindi UX parity
  const displayName = getLocalizedProductName(product);
  const displayBrand = getLocalizedProductBrand(product);

  // T-142: Compute total available quantity from all suppliers
  const totalAvailableQty = product.suppliers.reduce(
    (sum, s) => sum + (s.stockQuantity || 0),
    0
  );
  // T-142: Determine stock color based on actual quantity
  const stockQtyColor =
    totalAvailableQty <= 0
      ? tc.error
      : totalAvailableQty < 10
        ? tc.warning
        : tc.success;

  // T-141: Always show MOQ with unit
  const moqValue = product.minMoq || 1;
  const moqLabel = product.unit
    ? `MOQ: ${moqValue} ${product.unit}`
    : `MOQ: ${moqValue}`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
        isOutOfStock && styles.cardOutOfStock,
      ]}
      onPress={() => onPress(product)}
    >
      {cartQuantity > 0 && (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{cartQuantity}</Text>
        </View>
      )}

      <View style={styles.content}>
        {/* T-139 / SCALE-E2: Product image — uses ProductImage for remote load + error fallback */}
        <View style={styles.imageRow}>
          <ProductImage uri={product.imageUrl} size={48} borderRadius={6} />
          <View style={styles.imageRowInfo}>
            <Text style={styles.name} numberOfLines={2}>
              {displayName}
            </Text>

            {displayBrand && (
              <Text style={styles.brand} numberOfLines={1}>
                {displayBrand}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {formatMoney(product.bestPrice)}
          </Text>
          {product.unit && (
            <Text style={styles.unit}>/{product.unit}</Text>
          )}
        </View>

        <View style={styles.metaRow}>
          {/* T-142: Show actual numeric quantity instead of generic labels */}
          <View style={[styles.stockBadge, { backgroundColor: stockQtyColor + "20" }]}>
            <View style={[styles.stockDot, { backgroundColor: stockQtyColor }]} />
            <Text style={[styles.stockText, { color: stockQtyColor }]}>
              {totalAvailableQty} available
            </Text>
          </View>

          <View style={styles.supplierInfo}>
            <MaterialCommunityIcons
              name="store"
              size={12}
              color={tc.textTertiary}
            />
            <Text style={styles.supplierCount}>
              {product.supplierCount}
            </Text>
          </View>
        </View>

        {/* T-141: Always show MOQ (not just when > 1) */}
        <Text style={styles.moq}>
          {moqLabel}
        </Text>
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
    // T-139: Image row layout
    imageRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    imageRowInfo: {
      flex: 1,
    },
    name: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      lineHeight: 20,
      marginBottom: theme.spacing.xs,
    },
    brand: {
      fontSize: 12,
      color: colors.textTertiary,
      marginBottom: theme.spacing.sm,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      marginBottom: theme.spacing.sm,
    },
    price: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.primary,
    },
    unit: {
      fontSize: 12,
      color: colors.textTertiary,
      marginLeft: 2,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    stockBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
      borderRadius: theme.borderRadius.full,
    },
    stockDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 4,
    },
    stockText: {
      fontSize: 11,
      fontWeight: "600",
    },
    supplierInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    supplierCount: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    moq: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: theme.spacing.xs,
    },
  });
}

export default CatalogProductCard;
