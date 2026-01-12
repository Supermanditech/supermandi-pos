// CatalogProductCard - V3.0.9 compliant
// Product card for BUY screen catalog grid

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import type { CatalogProduct } from "../../services/api/catalogApi";
import { getStockStatusColor } from "../../services/api/catalogApi";

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
  const stockColor = getStockStatusColor(product.stockStatus);
  const isOutOfStock = product.stockStatus === "out_of_stock";

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
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        {product.brand && (
          <Text style={styles.brand} numberOfLines={1}>
            {product.brand}
          </Text>
        )}

        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {formatMoney(product.bestPrice * 100)}
          </Text>
          {product.unit && (
            <Text style={styles.unit}>/{product.unit}</Text>
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={[styles.stockBadge, { backgroundColor: stockColor + "20" }]}>
            <View style={[styles.stockDot, { backgroundColor: stockColor }]} />
            <Text style={[styles.stockText, { color: stockColor }]}>
              {product.stockStatus === "in_stock"
                ? "In Stock"
                : product.stockStatus === "low_stock"
                ? "Low"
                : "Out"}
            </Text>
          </View>

          <View style={styles.supplierInfo}>
            <MaterialCommunityIcons
              name="store"
              size={12}
              color={theme.colors.textTertiary}
            />
            <Text style={styles.supplierCount}>
              {product.supplierCount}
            </Text>
          </View>
        </View>

        {product.minMoq > 1 && (
          <Text style={styles.moq}>
            MOQ: {product.minMoq}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.full,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xs,
    zIndex: 1,
  },
  cartBadgeText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: "700",
  },
  content: {
    padding: theme.spacing.md,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    lineHeight: 20,
    marginBottom: theme.spacing.xs,
  },
  brand: {
    fontSize: 12,
    color: theme.colors.textTertiary,
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
    color: theme.colors.primary,
  },
  unit: {
    fontSize: 12,
    color: theme.colors.textTertiary,
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
    color: theme.colors.textTertiary,
  },
  moq: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
});

export default CatalogProductCard;
