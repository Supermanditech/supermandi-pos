// CartItem - V3.0.9 compliant
// Individual item row in purchase cart

import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import { QuantityPicker } from "./QuantityPicker";
import type { PurchaseCartItem } from "../../stores/purchaseCartStore";

// =============================================================================
// TYPES
// =============================================================================

export interface CartItemProps {
  item: PurchaseCartItem;
  onUpdateQuantity: (supplierProductId: string, quantity: number) => void;
  onRemove: (supplierProductId: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CartItem({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  const lineTotal = item.quantity * item.unitPrice;
  const isBelowMoq = item.quantity < item.moq;

  // Handle quantity change
  const handleQuantityChange = useCallback(
    (quantity: number) => {
      onUpdateQuantity(item.supplierProductId, quantity);
    },
    [item.supplierProductId, onUpdateQuantity]
  );

  // Handle remove
  const handleRemove = useCallback(() => {
    onRemove(item.supplierProductId);
  }, [item.supplierProductId, onRemove]);

  return (
    <View style={[styles.container, isBelowMoq && styles.containerWarning]}>
      {/* Product info */}
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.productName}
        </Text>
        {item.barcode && (
          <Text style={styles.barcode}>{item.barcode}</Text>
        )}
        <View style={styles.priceRow}>
          <Text style={styles.unitPrice}>
            {formatMoney(item.unitPrice)}
          </Text>
          <Text style={styles.perUnit}>/unit</Text>
          {item.mrp && item.mrp > item.unitPrice && (
            <Text style={styles.mrp}>
              MRP {formatMoney(item.mrp)}
            </Text>
          )}
        </View>
      </View>

      {/* Quantity and total */}
      <View style={styles.quantitySection}>
        <QuantityPicker
          value={item.quantity}
          onChange={handleQuantityChange}
          moq={item.moq}
          compact
        />

        {isBelowMoq && (
          <View style={styles.moqWarning}>
            <MaterialCommunityIcons
              name="alert"
              size={12}
              color={theme.colors.warning}
            />
            <Text style={styles.moqWarningText}>
              MOQ: {item.moq}
            </Text>
          </View>
        )}

        <Text style={styles.lineTotal}>
          {formatMoney(lineTotal)}
        </Text>
      </View>

      {/* Remove button */}
      <Pressable
        style={styles.removeButton}
        onPress={handleRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Remove item from cart"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name="trash-can-outline"
          size={18}
          color={theme.colors.error}
        />
      </Pressable>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  containerWarning: {
    backgroundColor: theme.colors.warningSoft,
  },
  productInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  productName: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  barcode: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  unitPrice: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  perUnit: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  mrp: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    textDecorationLine: "line-through",
    marginLeft: theme.spacing.sm,
  },
  quantitySection: {
    alignItems: "center",
    minWidth: 100,
  },
  moqWarning: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 2,
  },
  moqWarningText: {
    fontSize: 10,
    color: theme.colors.warning,
    fontWeight: "500",
  },
  lineTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.xs,
  },
  removeButton: {
    padding: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
  },
});

export default CartItem;
