// SupplierCartSection - V3.0.9 compliant
// Grouped cart items by supplier with subtotal and place order

import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import { CartItem } from "./CartItem";
import type { SupplierGroup, PurchaseCartItem } from "../../stores/purchaseCartStore";

// =============================================================================
// TYPES
// =============================================================================

export interface SupplierCartSectionProps {
  group: SupplierGroup;
  minOrderValue?: number;
  onUpdateQuantity: (supplierProductId: string, quantity: number) => void;
  onRemoveItem: (supplierProductId: string) => void;
  onPlaceOrder: (supplierId: string) => void;
  placingOrder?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SupplierCartSection({
  group,
  minOrderValue = 0,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  placingOrder = false,
}: SupplierCartSectionProps) {
  // Check if any item is below MOQ
  const hasInvalidMoq = useMemo(() => {
    return group.items.some((item) => item.quantity < item.moq);
  }, [group.items]);

  // Check if below minimum order value
  const isBelowMinOrder = minOrderValue > 0 && group.totalAmount < minOrderValue;

  // Can place order?
  const canPlaceOrder = !hasInvalidMoq && !isBelowMinOrder && !placingOrder;

  // Handle place order
  const handlePlaceOrder = useCallback(() => {
    if (canPlaceOrder) {
      onPlaceOrder(group.supplierId);
    }
  }, [canPlaceOrder, group.supplierId, onPlaceOrder]);

  return (
    <View style={styles.container}>
      {/* Supplier Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialCommunityIcons
            name="store"
            size={18}
            color={theme.colors.primary}
          />
          <Text style={styles.supplierName} numberOfLines={1}>
            {group.supplierName}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.itemCount}>
            {group.itemCount} {group.itemCount === 1 ? "item" : "items"}
          </Text>
        </View>
      </View>

      {/* Items */}
      <View style={styles.itemsContainer}>
        {group.items.map((item) => (
          <CartItem
            key={item.supplierProductId}
            item={item}
            onUpdateQuantity={onUpdateQuantity}
            onRemove={onRemoveItem}
          />
        ))}
      </View>

      {/* Warnings */}
      {(hasInvalidMoq || isBelowMinOrder) && (
        <View style={styles.warningsContainer}>
          {hasInvalidMoq && (
            <View style={styles.warningRow}>
              <MaterialCommunityIcons
                name="alert"
                size={14}
                color={theme.colors.warning}
              />
              <Text style={styles.warningText}>
                Some items are below minimum order quantity
              </Text>
            </View>
          )}
          {isBelowMinOrder && (
            <View style={styles.warningRow}>
              <MaterialCommunityIcons
                name="alert"
                size={14}
                color={theme.colors.warning}
              />
              <Text style={styles.warningText}>
                Minimum order value: {formatMoney(minOrderValue * 100)}
                {" "}(need {formatMoney((minOrderValue - group.totalAmount) * 100)} more)
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Footer with subtotal and place order */}
      <View style={styles.footer}>
        <View style={styles.subtotalSection}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>
            {formatMoney(group.totalAmount * 100)}
          </Text>
        </View>

        <Pressable
          style={[
            styles.placeOrderButton,
            !canPlaceOrder && styles.placeOrderButtonDisabled,
          ]}
          onPress={handlePlaceOrder}
          disabled={!canPlaceOrder}
        >
          {placingOrder ? (
            <ActivityIndicator size="small" color={theme.colors.textInverse} />
          ) : (
            <>
              <MaterialCommunityIcons
                name="send"
                size={16}
                color={theme.colors.textInverse}
              />
              <Text style={styles.placeOrderText}>Place Order</Text>
            </>
          )}
        </Pressable>
      </View>
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
    overflow: "hidden",
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primaryLight + "15",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: theme.spacing.sm,
  },
  supplierName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  headerRight: {
    marginLeft: theme.spacing.sm,
  },
  itemCount: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  itemsContainer: {
    // Items have their own borders
  },
  warningsContainer: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.warningSoft,
    gap: theme.spacing.xs,
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  warningText: {
    fontSize: 12,
    color: theme.colors.warning,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  subtotalSection: {
    flex: 1,
  },
  subtotalLabel: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  subtotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  placeOrderButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing.xs,
  },
  placeOrderButtonDisabled: {
    backgroundColor: theme.colors.textTertiary,
    opacity: 0.6,
  },
  placeOrderText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});

export default SupplierCartSection;
