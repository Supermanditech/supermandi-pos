// SupplierRow - V3.0.9 compliant
// Individual supplier option in product detail modal

import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import { QuantityPicker } from "./QuantityPicker";
import type { CatalogSupplier } from "../../services/api/catalogApi";
import { getStockStatusColor } from "../../services/api/catalogApi";

// =============================================================================
// TYPES
// =============================================================================

export interface SupplierRowProps {
  supplier: CatalogSupplier;
  productName: string;
  productId: string;
  barcode?: string;
  cartQuantity: number;
  onAddToCart: (params: {
    supplier: CatalogSupplier;
    quantity: number;
    productId: string;
    productName: string;
    barcode?: string;
  }) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SupplierRow({
  supplier,
  productName,
  productId,
  barcode,
  cartQuantity,
  onAddToCart,
  expanded = false,
  onToggleExpand,
}: SupplierRowProps) {
  const [quantity, setQuantity] = useState(supplier.moq);
  const stockColor = getStockStatusColor(
    supplier.stockStatus as "in_stock" | "low_stock" | "out_of_stock"
  );
  const isOutOfStock = supplier.stockStatus === "out_of_stock";

  // Handle add to cart
  const handleAddToCart = useCallback(() => {
    onAddToCart({
      supplier,
      quantity,
      productId,
      productName,
      barcode,
    });
  }, [supplier, quantity, productId, productName, barcode, onAddToCart]);

  // Calculate total price
  const totalPrice = quantity * supplier.purchasePrice;

  return (
    <View style={[styles.container, supplier.isPreferred && styles.containerPreferred]}>
      {/* Header - always visible */}
      <Pressable
        style={styles.header}
        onPress={onToggleExpand}
        disabled={!onToggleExpand}
      >
        <View style={styles.headerLeft}>
          <View style={styles.supplierNameRow}>
            <Text style={styles.supplierName} numberOfLines={1}>
              {supplier.supplierName}
            </Text>
            {supplier.isPreferred && (
              <View style={styles.preferredBadge}>
                <MaterialCommunityIcons
                  name="star"
                  size={10}
                  color={theme.colors.warning}
                />
                <Text style={styles.preferredText}>Preferred</Text>
              </View>
            )}
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.price}>
              {formatMoney(supplier.purchasePrice * 100)}
            </Text>
            {supplier.mrp && supplier.mrp > supplier.purchasePrice && (
              <Text style={styles.mrp}>
                MRP {formatMoney(supplier.mrp * 100)}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.stockBadge, { backgroundColor: stockColor + "20" }]}>
            <View style={[styles.stockDot, { backgroundColor: stockColor }]} />
            <Text style={[styles.stockText, { color: stockColor }]}>
              {supplier.stockQuantity}
            </Text>
          </View>
          {onToggleExpand && (
            <MaterialCommunityIcons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={20}
              color={theme.colors.textTertiary}
            />
          )}
        </View>
      </Pressable>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Meta info */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>MOQ</Text>
              <Text style={styles.metaValue}>{supplier.moq}</Text>
            </View>
            {supplier.maxQty && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Max</Text>
                <Text style={styles.metaValue}>{supplier.maxQty}</Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Stock</Text>
              <Text style={[styles.metaValue, { color: stockColor }]}>
                {supplier.stockStatus === "out_of_stock"
                  ? "Out"
                  : supplier.stockQuantity}
              </Text>
            </View>
          </View>

          {/* Cart info if already in cart */}
          {cartQuantity > 0 && (
            <View style={styles.cartInfo}>
              <MaterialCommunityIcons
                name="cart"
                size={14}
                color={theme.colors.primary}
              />
              <Text style={styles.cartInfoText}>
                {cartQuantity} in cart
              </Text>
            </View>
          )}

          {/* Quantity picker and add button */}
          {!isOutOfStock && (
            <View style={styles.actionRow}>
              <QuantityPicker
                value={quantity}
                onChange={setQuantity}
                moq={supplier.moq}
                maxQty={supplier.maxQty || supplier.stockQuantity}
              />

              <View style={styles.totalSection}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>
                  {formatMoney(totalPrice * 100)}
                </Text>
              </View>

              <Pressable
                style={styles.addButton}
                onPress={handleAddToCart}
              >
                <MaterialCommunityIcons
                  name={cartQuantity > 0 ? "cart-plus" : "cart-outline"}
                  size={18}
                  color={theme.colors.textInverse}
                />
                <Text style={styles.addButtonText}>
                  {cartQuantity > 0 ? "Add More" : "Add"}
                </Text>
              </Pressable>
            </View>
          )}

          {isOutOfStock && (
            <View style={styles.outOfStockMessage}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={16}
                color={theme.colors.error}
              />
              <Text style={styles.outOfStockText}>
                Currently out of stock
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  containerPreferred: {
    borderColor: theme.colors.warning,
    borderWidth: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
  },
  headerLeft: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  supplierNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: 4,
  },
  supplierName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  preferredBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.warningSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    gap: 2,
  },
  preferredText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.warning,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing.sm,
  },
  price: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  mrp: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textDecorationLine: "line-through",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  stockBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    gap: 4,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stockText: {
    fontSize: 12,
    fontWeight: "600",
  },
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  metaRow: {
    flexDirection: "row",
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  metaItem: {
    alignItems: "center",
  },
  metaLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  cartInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    gap: 6,
    marginBottom: theme.spacing.md,
    alignSelf: "flex-start",
  },
  cartInfoText: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.primary,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  totalSection: {
    flex: 1,
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: 6,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  outOfStockMessage: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.errorSoft,
    borderRadius: theme.borderRadius.sm,
  },
  outOfStockText: {
    fontSize: 13,
    color: theme.colors.error,
  },
});

export default SupplierRow;
