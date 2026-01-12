// PurchaseCartModal - V3.0.9 compliant
// Full cart modal with items grouped by supplier

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import { SupplierCartSection } from "./SupplierCartSection";
import { usePurchaseCartStore } from "../../stores/purchaseCartStore";

// =============================================================================
// TYPES
// =============================================================================

export interface PurchaseCartModalProps {
  visible: boolean;
  onClose: () => void;
  onOrderPlaced?: (supplierId: string) => void;
  onAllOrdersPlaced?: () => void;
}

// Min order values now come from SupplierGroup (populated from cart items)

// =============================================================================
// COMPONENT
// =============================================================================

export function PurchaseCartModal({
  visible,
  onClose,
  onOrderPlaced,
  onAllOrdersPlaced,
}: PurchaseCartModalProps) {
  const insets = useSafeAreaInsets();

  // Cart store
  const items = usePurchaseCartStore((state) => state.items);
  const getItemsBySupplier = usePurchaseCartStore((state) => state.getItemsBySupplier);
  const getTotals = usePurchaseCartStore((state) => state.getTotals);
  const updateQuantity = usePurchaseCartStore((state) => state.updateQuantity);
  const removeItem = usePurchaseCartStore((state) => state.removeItem);
  const removeSupplierItems = usePurchaseCartStore((state) => state.removeSupplierItems);
  const clear = usePurchaseCartStore((state) => state.clear);

  // State
  const [placingOrderFor, setPlacingOrderFor] = useState<string | null>(null);
  const [placingAllOrders, setPlacingAllOrders] = useState(false);

  // Get grouped items
  const supplierGroups = useMemo(() => getItemsBySupplier(), [items, getItemsBySupplier]);
  const totals = useMemo(() => getTotals(), [items, getTotals]);

  // Check if all orders are valid
  const allOrdersValid = useMemo(() => {
    return supplierGroups.every((group) => {
      const hasInvalidMoq = group.items.some((item) => item.quantity < item.moq);
      const isBelowMinOrder = group.minOrderValue > 0 && group.totalAmount < group.minOrderValue;
      return !hasInvalidMoq && !isBelowMinOrder;
    });
  }, [supplierGroups]);

  // Handle update quantity
  const handleUpdateQuantity = useCallback(
    (supplierProductId: string, quantity: number) => {
      updateQuantity(supplierProductId, quantity);
    },
    [updateQuantity]
  );

  // Handle remove item
  const handleRemoveItem = useCallback(
    (supplierProductId: string) => {
      Alert.alert(
        "Remove Item",
        "Are you sure you want to remove this item from the cart?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => removeItem(supplierProductId),
          },
        ]
      );
    },
    [removeItem]
  );

  // Handle place order for supplier
  const handlePlaceOrder = useCallback(
    async (supplierId: string) => {
      setPlacingOrderFor(supplierId);

      try {
        // TODO: Call API to place order
        // const response = await purchaseOrderApi.createOrder({ supplierId, items: ... });

        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Remove items for this supplier from cart
        removeSupplierItems(supplierId);

        // Notify parent
        onOrderPlaced?.(supplierId);

        // Show success
        Alert.alert(
          "Order Placed",
          "Your purchase order has been submitted successfully.",
          [{ text: "OK" }]
        );
      } catch (error) {
        console.error("[PurchaseCartModal] Failed to place order:", error);
        Alert.alert(
          "Order Failed",
          "Failed to place order. Please try again.",
          [{ text: "OK" }]
        );
      } finally {
        setPlacingOrderFor(null);
      }
    },
    [removeSupplierItems, onOrderPlaced]
  );

  // Handle place all orders
  const handlePlaceAllOrders = useCallback(async () => {
    if (!allOrdersValid) return;

    Alert.alert(
      "Place All Orders",
      `Place orders with ${supplierGroups.length} suppliers for a total of ${formatMoney(totals.grandTotal * 100)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Place Orders",
          onPress: async () => {
            setPlacingAllOrders(true);

            try {
              // Place orders sequentially
              for (const group of supplierGroups) {
                // TODO: Call API to place order
                // await purchaseOrderApi.createOrder({ supplierId: group.supplierId, items: group.items });

                // Simulate API call
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }

              // Clear all items
              clear();

              // Notify parent
              onAllOrdersPlaced?.();

              // Show success
              Alert.alert(
                "All Orders Placed",
                `Successfully placed ${supplierGroups.length} purchase orders.`,
                [{ text: "OK", onPress: onClose }]
              );
            } catch (error) {
              console.error("[PurchaseCartModal] Failed to place all orders:", error);
              Alert.alert(
                "Some Orders Failed",
                "Some orders could not be placed. Please check and try again.",
                [{ text: "OK" }]
              );
            } finally {
              setPlacingAllOrders(false);
            }
          },
        },
      ]
    );
  }, [allOrdersValid, supplierGroups, totals, clear, onAllOrdersPlaced, onClose]);

  // Handle clear cart
  const handleClearCart = useCallback(() => {
    Alert.alert(
      "Clear Cart",
      "Are you sure you want to remove all items from the cart?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => clear(),
        },
      ]
    );
  }, [clear]);

  // Empty state
  const isEmpty = items.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <MaterialCommunityIcons
              name="close"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
          <Text style={styles.headerTitle}>Purchase Cart</Text>
          <View style={styles.headerRight}>
            {!isEmpty && (
              <Pressable style={styles.clearButton} onPress={handleClearCart}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </Pressable>
            )}
          </View>
        </View>

        {isEmpty ? (
          /* Empty State */
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="cart-outline"
              size={64}
              color={theme.colors.textTertiary}
            />
            <Text style={styles.emptyTitle}>Your cart is empty</Text>
            <Text style={styles.emptyText}>
              Add products from the catalog to create purchase orders
            </Text>
            <Pressable style={styles.browseButton} onPress={onClose}>
              <Text style={styles.browseButtonText}>Browse Catalog</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Cart Summary */}
            <View style={styles.summaryBar}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Suppliers</Text>
                <Text style={styles.summaryValue}>{totals.supplierCount}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Items</Text>
                <Text style={styles.summaryValue}>{totals.itemCount}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Qty</Text>
                <Text style={styles.summaryValue}>{totals.totalQuantity}</Text>
              </View>
            </View>

            {/* Supplier Sections */}
            <ScrollView
              style={styles.content}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: insets.bottom + 100 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {supplierGroups.map((group) => (
                <SupplierCartSection
                  key={group.supplierId}
                  group={group}
                  minOrderValue={group.minOrderValue}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemoveItem={handleRemoveItem}
                  onPlaceOrder={handlePlaceOrder}
                  placingOrder={placingOrderFor === group.supplierId}
                />
              ))}
            </ScrollView>

            {/* Footer with grand total and place all */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
              <View style={styles.grandTotalSection}>
                <Text style={styles.grandTotalLabel}>Grand Total</Text>
                <Text style={styles.grandTotalValue}>
                  {formatMoney(totals.grandTotal * 100)}
                </Text>
              </View>

              <Pressable
                style={[
                  styles.placeAllButton,
                  (!allOrdersValid || placingAllOrders) && styles.placeAllButtonDisabled,
                ]}
                onPress={handlePlaceAllOrders}
                disabled={!allOrdersValid || placingAllOrders}
              >
                {placingAllOrders ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="send-check"
                      size={20}
                      color={theme.colors.textInverse}
                    />
                    <Text style={styles.placeAllText}>
                      Place All Orders ({totals.supplierCount})
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  headerRight: {
    width: 60,
    alignItems: "flex-end",
  },
  clearButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  clearButtonText: {
    fontSize: 14,
    color: theme.colors.error,
    fontWeight: "500",
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.border,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  browseButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  browseButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...theme.shadows.lg,
  },
  grandTotalSection: {
    flex: 1,
  },
  grandTotalLabel: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  placeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.success,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing.sm,
  },
  placeAllButtonDisabled: {
    backgroundColor: theme.colors.textTertiary,
    opacity: 0.6,
  },
  placeAllText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});

export default PurchaseCartModal;
