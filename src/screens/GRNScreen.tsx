// GRNScreen - V3.0.9 compliant
// Goods Receiving Note screen for receiving purchase order items

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../theme";
import { GRNItemRow } from "../components/grn/GRNItemRow";
import * as orderApi from "../services/api/orderApi";
import type { PurchaseOrderWithItems, PurchaseOrderItem } from "../services/api/orderApi";
import { formatOrderNumber, getStatusLabel } from "../services/api/orderApi";
import { getDeviceStoreId } from "../services/deviceSession";

// =============================================================================
// TYPES
// =============================================================================

export interface GRNScreenProps {
  orderId: string;
  onBack?: () => void;
  onSuccess?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function GRNScreen({
  orderId,
  onBack,
  onSuccess,
}: GRNScreenProps) {
  const insets = useSafeAreaInsets();

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [order, setOrder] = useState<PurchaseOrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Receive quantities per item
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});

  // Barcode search
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  // Notes
  const [notes, setNotes] = useState("");

  // Load store ID on mount
  useEffect(() => {
    getDeviceStoreId().then(setStoreId);
  }, []);

  // Load order data
  const loadOrder = useCallback(async () => {
    if (!storeId) return;

    setLoading(true);
    setError(null);

    try {
      const orderData = await orderApi.getOrder(storeId, orderId);
      setOrder(orderData);

      // Initialize receive quantities to 0
      const initialQuantities: Record<string, number> = {};
      orderData.items.forEach((item) => {
        initialQuantities[item.id] = 0;
      });
      setReceiveQuantities(initialQuantities);
    } catch (err) {
      console.error("[GRNScreen] Failed to load order:", err);
      setError("Failed to load order details");
    } finally {
      setLoading(false);
    }
  }, [storeId, orderId]);

  // Initial load
  useEffect(() => {
    if (storeId) {
      loadOrder();
    }
  }, [storeId, loadOrder]);

  // Handle receive quantity change
  const handleReceiveQuantityChange = useCallback(
    (itemId: string, quantity: number) => {
      setReceiveQuantities((prev) => ({
        ...prev,
        [itemId]: quantity,
      }));
    },
    []
  );

  // Calculate totals
  const totals = useMemo(() => {
    if (!order) return { totalItems: 0, receivingItems: 0, receivingQty: 0 };

    let receivingItems = 0;
    let receivingQty = 0;

    Object.entries(receiveQuantities).forEach(([itemId, qty]) => {
      if (qty > 0) {
        receivingItems++;
        receivingQty += qty;
      }
    });

    return {
      totalItems: order.items.length,
      receivingItems,
      receivingQty,
    };
  }, [order, receiveQuantities]);

  // Check if can submit
  const canSubmit = totals.receivingItems > 0 && !submitting;

  // Handle barcode search
  const handleSearch = useCallback(() => {
    if (!order || !searchQuery.trim()) {
      setHighlightedItemId(null);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const foundItem = order.items.find(
      (item) =>
        item.barcode?.toLowerCase() === query ||
        item.productName.toLowerCase().includes(query)
    );

    if (foundItem) {
      setHighlightedItemId(foundItem.id);
      // Auto-set remaining quantity if not fully received
      const remaining = foundItem.orderedQuantity - foundItem.receivedQuantity;
      if (remaining > 0 && receiveQuantities[foundItem.id] === 0) {
        handleReceiveQuantityChange(foundItem.id, remaining);
      }
    } else {
      setHighlightedItemId(null);
      Alert.alert("Not Found", "No item found with that barcode or name.");
    }

    setSearchQuery("");
  }, [order, searchQuery, receiveQuantities, handleReceiveQuantityChange]);

  // Receive all items
  const handleReceiveAll = useCallback(() => {
    if (!order) return;

    Alert.alert(
      "Receive All",
      "Set all remaining quantities to be received?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes",
          onPress: () => {
            const newQuantities: Record<string, number> = {};
            order.items.forEach((item) => {
              const remaining = item.orderedQuantity - item.receivedQuantity;
              newQuantities[item.id] = Math.max(0, remaining);
            });
            setReceiveQuantities(newQuantities);
          },
        },
      ]
    );
  }, [order]);

  // Clear all
  const handleClearAll = useCallback(() => {
    if (!order) return;

    const newQuantities: Record<string, number> = {};
    order.items.forEach((item) => {
      newQuantities[item.id] = 0;
    });
    setReceiveQuantities(newQuantities);
    setHighlightedItemId(null);
  }, [order]);

  // Submit GRN
  const handleSubmit = useCallback(async () => {
    if (!storeId || !order || !canSubmit) return;

    // Build items array
    const items = Object.entries(receiveQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([itemId, qty]) => ({
        orderItemId: itemId,
        quantityReceived: qty,
      }));

    if (items.length === 0) {
      Alert.alert("Error", "Please enter quantities to receive.");
      return;
    }

    Alert.alert(
      "Confirm Receive",
      `Receive ${totals.receivingQty} units across ${totals.receivingItems} items?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Receive",
          onPress: async () => {
            setSubmitting(true);

            try {
              const result = await orderApi.receiveGoods(storeId, orderId, {
                items,
                notes: notes.trim() || undefined,
              });

              Alert.alert(
                "Success",
                `Received ${result.data.itemsUpdated.length} items. Order status: ${getStatusLabel(result.data.order.status)}`,
                [
                  {
                    text: "OK",
                    onPress: () => onSuccess?.(),
                  },
                ]
              );
            } catch (err) {
              console.error("[GRNScreen] Failed to receive:", err);
              Alert.alert(
                "Error",
                "Failed to receive goods. Please try again."
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  }, [storeId, order, canSubmit, receiveQuantities, totals, notes, orderId, onSuccess]);

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: PurchaseOrderItem }) => (
      <GRNItemRow
        item={item}
        receiveQuantity={receiveQuantities[item.id] || 0}
        onReceiveQuantityChange={handleReceiveQuantityChange}
        isHighlighted={highlightedItemId === item.id}
      />
    ),
    [receiveQuantities, handleReceiveQuantityChange, highlightedItemId]
  );

  // Key extractor
  const keyExtractor = useCallback((item: PurchaseOrderItem) => item.id, []);

  // Render loading state
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {onBack && (
            <Pressable style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={theme.colors.textPrimary}
              />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>Receive Goods</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading order...</Text>
        </View>
      </View>
    );
  }

  // Render error state
  if (error || !order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {onBack && (
            <Pressable style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={theme.colors.textPrimary}
              />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>Receive Goods</Text>
        </View>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={theme.colors.error}
          />
          <Text style={styles.errorText}>{error || "Order not found"}</Text>
          <Pressable style={styles.retryButton} onPress={loadOrder}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Receive Goods</Text>
          <Text style={styles.headerSubtitle}>
            {formatOrderNumber(order.orderNumber)} | {order.supplierName}
          </Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons
            name="barcode-scan"
            size={20}
            color={theme.colors.textTertiary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Scan barcode or search..."
            placeholderTextColor={theme.colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={theme.colors.textTertiary}
              />
            </Pressable>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Pressable style={styles.quickAction} onPress={handleReceiveAll}>
            <MaterialCommunityIcons
              name="check-all"
              size={16}
              color={theme.colors.primary}
            />
            <Text style={styles.quickActionText}>All</Text>
          </Pressable>
          <Pressable style={styles.quickAction} onPress={handleClearAll}>
            <MaterialCommunityIcons
              name="refresh"
              size={16}
              color={theme.colors.textSecondary}
            />
            <Text style={[styles.quickActionText, { color: theme.colors.textSecondary }]}>
              Clear
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Items List */}
      <FlatList
        data={order.items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 180 },
        ]}
        showsVerticalScrollIndicator={false}
      />

      {/* Notes Input */}
      <View style={styles.notesContainer}>
        <TextInput
          style={styles.notesInput}
          placeholder="Add notes (optional)..."
          placeholderTextColor={theme.colors.textTertiary}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
        />
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Items</Text>
            <Text style={styles.summaryValue}>
              {totals.receivingItems} / {totals.totalItems}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Quantity</Text>
            <Text style={styles.summaryValue}>{totals.receivingQty}</Text>
          </View>
        </View>

        {/* Submit Button */}
        <Pressable
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={theme.colors.textInverse} />
          ) : (
            <>
              <MaterialCommunityIcons
                name="package-down"
                size={20}
                color={theme.colors.textInverse}
              />
              <Text style={styles.submitButtonText}>
                Receive {totals.receivingItems > 0 ? `(${totals.receivingItems})` : ""}
              </Text>
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
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    marginRight: theme.spacing.sm,
    padding: theme.spacing.xs,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: "center",
    marginTop: theme.spacing.md,
  },
  retryButton: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  searchContainer: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    paddingVertical: theme.spacing.xs,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  quickAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.primary,
  },
  listContent: {
    padding: theme.spacing.md,
  },
  notesContainer: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  notesInput: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    fontSize: 13,
    color: theme.colors.textPrimary,
    minHeight: 40,
    maxHeight: 60,
    textAlignVertical: "top",
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...theme.shadows.lg,
  },
  summary: {
    flexDirection: "row",
    justifyContent: "center",
    gap: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.success,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: theme.colors.backgroundTertiary,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});
