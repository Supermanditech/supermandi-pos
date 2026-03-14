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

import { useTranslation } from "react-i18next";
import { theme, useThemeColors } from "../theme";
import { GRNItemRow } from "../components/grn/GRNItemRow";
import * as orderApi from "../services/api/orderApi";
import type { PurchaseOrderWithItems, PurchaseOrderItem } from "../services/api/orderApi";
import { formatOrderNumber, getStatusLabel } from "../services/api/orderApi";
import { getDeviceStoreId } from "../services/deviceSession";
import { isOnline } from "../services/networkStatus";
import * as reorderApi from "../services/api/reorderApi";

// =============================================================================
// TYPES
// =============================================================================

// T-172: GRN item type for barcode label generation
export type GRNBarcodeItem = {
  barcode: string;
  name: string;
  sellPrice?: number | null;
  unit?: string | null;
  copies?: number;
};

export interface GRNScreenProps {
  orderId: string;
  onBack?: () => void;
  onSuccess?: () => void;
  // T-172: Navigate to barcode sheet with pre-selected GRN items
  onNavigateToBarcodeSheet?: (items: GRNBarcodeItem[]) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function GRNScreen({
  orderId,
  onBack,
  onSuccess,
  onNavigateToBarcodeSheet,
}: GRNScreenProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
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

  // GO-LIVE-248: Bulk selection state
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Load store ID on mount
  useEffect(() => {
    getDeviceStoreId().then(setStoreId).catch(() => {});
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
      if (__DEV__) console.error("[GRNScreen] Failed to load order:", err);
      const online = await isOnline();
      setError(online ? t("grn.loadError") : t("grn.offlineError"));
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
      Alert.alert(t("grn.notFoundTitle"), t("grn.notFoundMessage"));
    }

    setSearchQuery("");
  }, [order, searchQuery, receiveQuantities, handleReceiveQuantityChange]);

  // Receive all items
  const handleReceiveAll = useCallback(() => {
    if (!order) return;

    Alert.alert(
      t("grn.receiveAll"),
      t("grn.receiveAllMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.yes"),
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

  // GO-LIVE-248: Bulk selection handlers
  const handleToggleBulkMode = useCallback(() => {
    setBulkMode((prev) => !prev);
    setSelectedItems(new Set());
  }, []);

  const handleToggleItemSelection = useCallback((itemId: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!order) return;
    // Select only items with remaining quantity
    const pendingItemIds = order.items
      .filter((item) => item.orderedQuantity - item.receivedQuantity > 0)
      .map((item) => item.id);
    setSelectedItems(new Set(pendingItemIds));
  }, [order]);

  const handleDeselectAll = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  const handleBulkSetRemaining = useCallback(() => {
    if (!order || selectedItems.size === 0) return;

    const newQuantities = { ...receiveQuantities };
    order.items.forEach((item) => {
      if (selectedItems.has(item.id)) {
        const remaining = item.orderedQuantity - item.receivedQuantity;
        newQuantities[item.id] = Math.max(0, remaining);
      }
    });
    setReceiveQuantities(newQuantities);
    setBulkMode(false);
    setSelectedItems(new Set());
  }, [order, selectedItems, receiveQuantities]);

  const handleBulkSetPercent = useCallback((percent: number) => {
    if (!order || selectedItems.size === 0) return;

    const newQuantities = { ...receiveQuantities };
    order.items.forEach((item) => {
      if (selectedItems.has(item.id)) {
        const remaining = item.orderedQuantity - item.receivedQuantity;
        newQuantities[item.id] = Math.round(remaining * (percent / 100));
      }
    });
    setReceiveQuantities(newQuantities);
    setBulkMode(false);
    setSelectedItems(new Set());
  }, [order, selectedItems, receiveQuantities]);

  const handleBulkClear = useCallback(() => {
    if (selectedItems.size === 0) return;

    const newQuantities = { ...receiveQuantities };
    selectedItems.forEach((itemId) => {
      newQuantities[itemId] = 0;
    });
    setReceiveQuantities(newQuantities);
    setBulkMode(false);
    setSelectedItems(new Set());
  }, [selectedItems, receiveQuantities]);

  // SA-P1-004: Check for excess items (receiveQty > remaining)
  const excessItems = useMemo(() => {
    if (!order) return [];
    return order.items.filter((item) => {
      const qty = receiveQuantities[item.id] || 0;
      const remaining = item.orderedQuantity - item.receivedQuantity;
      return qty > 0 && qty > Math.max(0, remaining);
    });
  }, [order, receiveQuantities]);

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
      Alert.alert(t("common.error"), t("grn.enterQuantities"));
      return;
    }

    // SA-P1-004: Proceed with submission (possibly after excess warning)
    const doSubmit = async () => {
      setSubmitting(true);
      try {
        const result = await orderApi.receiveGoods(storeId, orderId, {
          items,
          notes: notes.trim() || undefined,
        });

        // T-172: Build barcode items from received goods for label generation
        const receivedBarcodeItems: GRNBarcodeItem[] = [];
        if (order && onNavigateToBarcodeSheet) {
          for (const updatedItem of result.data.itemsUpdated) {
            const orderItem = order.items.find((oi) => oi.id === updatedItem.id);
            if (orderItem?.barcode) {
              receivedBarcodeItems.push({
                barcode: orderItem.barcode,
                name: orderItem.productName,
                sellPrice: null,
                unit: null,
                copies: receiveQuantities[orderItem.id] || 1,
              });
            }
          }
        }

        // STG-422: Mark linked reorders as fulfilled when GRN completes
        if (
          result.data.order.status === "delivered" &&
          order?.sourceReorderIds &&
          order.sourceReorderIds.length > 0
        ) {
          // Fire-and-forget — don't block GRN success on reorder fulfillment
          for (const reorderId of order.sourceReorderIds) {
            reorderApi
              .markReorderFulfilled(storeId, reorderId)
              .catch((fulfillErr) => {
                if (__DEV__)
                  console.warn("[GRNScreen] Failed to mark reorder fulfilled:", fulfillErr);
              });
          }
        }

        // T-172: Show success with barcode label generation prompt
        const successButtons: Array<{ text: string; onPress?: () => void; style?: "cancel" | "default" | "destructive" }> = [];

        if (receivedBarcodeItems.length > 0 && onNavigateToBarcodeSheet) {
          successButtons.push({
            text: t("grn.generateLabels"),
            onPress: () => onNavigateToBarcodeSheet(receivedBarcodeItems),
          });
          successButtons.push({
            text: t("grn.skip"),
            style: "cancel",
            onPress: () => onSuccess?.(),
          });
        } else {
          successButtons.push({
            text: t("common.ok"),
            onPress: () => onSuccess?.(),
          });
        }

        Alert.alert(
          t("grn.successTitle"),
          `${t("grn.receivedMessage", { count: result.data.itemsUpdated.length, status: getStatusLabel(result.data.order.status) })}${
            receivedBarcodeItems.length > 0 ? t("grn.generateLabelsPrompt") : ""
          }`,
          successButtons
        );
      } catch (err) {
        if (__DEV__) console.error("[GRNScreen] Failed to receive:", err);
        const online = await isOnline();
        Alert.alert(
          online ? t("common.error") : t("grn.offline"),
          online ? t("grn.receiveFailed") : t("grn.receiveFailedOffline")
        );
      } finally {
        setSubmitting(false);
      }
    };

    // SA-P1-004: Show excess warning if any items exceed ordered qty
    if (excessItems.length > 0) {
      Alert.alert(
        t("grn.excessWarning"),
        t("grn.excessWarningMessage", { count: excessItems.length, qty: totals.receivingQty, items: totals.receivingItems }),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("grn.continueAnyway"), style: "destructive", onPress: doSubmit },
        ]
      );
    } else {
      Alert.alert(
        t("grn.confirmReceive"),
        t("grn.confirmReceiveMessage", { qty: totals.receivingQty, items: totals.receivingItems }),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("grn.receive"), onPress: doSubmit },
        ]
      );
    }
  }, [storeId, order, canSubmit, receiveQuantities, totals, notes, orderId, onSuccess, onNavigateToBarcodeSheet, excessItems]);

  // Styles (dynamic, theme-aware)
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Render item
  const renderItem = useCallback(
    ({ item }: { item: PurchaseOrderItem }) => (
      <View style={styles.itemRowContainer}>
        {/* GO-LIVE-248: Bulk selection checkbox */}
        {bulkMode && (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selectedItems.has(item.id) }}
            accessibilityLabel={`Select ${item.productName || "item"}`}
            style={styles.bulkCheckbox}
            onPress={() => handleToggleItemSelection(item.id)}
          >
            <MaterialCommunityIcons
              name={selectedItems.has(item.id) ? "checkbox-marked" : "checkbox-blank-outline"}
              size={24}
              color={selectedItems.has(item.id) ? colors.primary : colors.textTertiary}
            />
          </Pressable>
        )}
        <View style={[styles.itemRowContent, bulkMode && styles.itemRowContentBulk]}>
          <GRNItemRow
            item={item}
            receiveQuantity={receiveQuantities[item.id] || 0}
            onReceiveQuantityChange={handleReceiveQuantityChange}
            isHighlighted={highlightedItemId === item.id}
          />
        </View>
      </View>
    ),
    [receiveQuantities, handleReceiveQuantityChange, highlightedItemId, bulkMode, selectedItems, handleToggleItemSelection]
  );

  // Key extractor
  const keyExtractor = useCallback((item: PurchaseOrderItem) => item.id, []);

  // Render loading state
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          {onBack && (
            <Pressable accessibilityLabel="Go back" accessibilityRole="button" style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={colors.textPrimary}
              />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>{t("grn.title")}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t("grn.loadingOrder")}</Text>
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
            <Pressable accessibilityLabel="Go back" accessibilityRole="button" style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons
                name="arrow-left"
                size={24}
                color={colors.textPrimary}
              />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>{t("grn.title")}</Text>
        </View>
        <View style={styles.errorContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={colors.error}
          />
          <Text style={styles.errorText}>{error || t("grn.orderNotFound")}</Text>
          <Pressable testID="grn-retry-button" accessibilityRole="button" style={styles.retryButton} onPress={loadOrder}>
            <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
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
          <Pressable accessibilityLabel="Go back" accessibilityRole="button" style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={24}
              color={colors.textPrimary}
            />
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{t("grn.title")}</Text>
          <Text style={styles.headerDescription}>{t("grn.description")}</Text>
          <Text style={styles.headerSubtitle}>
            {formatOrderNumber(order.orderNumber)} | {order.supplierName}
          </Text>
          {/* T-249: Reorder context badge */}
          {order.orderType === "reorder" && (
            <View style={styles.reorderBadge}>
              <MaterialCommunityIcons name="autorenew" size={12} color={colors.primary} />
              <Text style={styles.reorderBadgeText}>
                {t("grn.autoReorder")}{order.sourceReorderIds?.length ? ` (${order.sourceReorderIds.length} ${t("grn.items").toLowerCase()})` : ""}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons
            name="barcode-scan"
            size={20}
            color={colors.textTertiary}
          />
          <TextInput
            testID="grn-search-input"
            style={styles.searchInput}
            placeholder={t("grn.searchPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Search purchase orders"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={colors.textTertiary}
              />
            </Pressable>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {/* GO-LIVE-248: Bulk mode toggle */}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: bulkMode }}
            accessibilityLabel="Toggle bulk selection mode"
            style={[styles.quickAction, bulkMode && styles.quickActionActive]}
            onPress={handleToggleBulkMode}
          >
            <MaterialCommunityIcons
              name={bulkMode ? "checkbox-multiple-marked" : "checkbox-multiple-blank-outline"}
              size={16}
              color={bulkMode ? colors.textInverse : colors.primary}
            />
            <Text style={[styles.quickActionText, bulkMode && styles.quickActionTextActive]}>
              {bulkMode ? t("grn.done") : t("grn.bulk")}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.quickAction} onPress={handleReceiveAll}>
            <MaterialCommunityIcons
              name="check-all"
              size={16}
              color={colors.primary}
            />
            <Text style={styles.quickActionText}>{t("grn.all")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.quickAction} onPress={handleClearAll}>
            <MaterialCommunityIcons
              name="refresh"
              size={16}
              color={colors.textSecondary}
            />
            <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>
              {t("common.clear")}
            </Text>
          </Pressable>
        </View>

        {/* GO-LIVE-248: Bulk selection bar */}
        {bulkMode && (
          <View style={styles.bulkSelectionBar}>
            <Pressable accessibilityRole="button" style={styles.bulkSelectButton} onPress={handleSelectAll}>
              <Text style={styles.bulkSelectButtonText}>{t("grn.selectAllPending")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.bulkSelectButton} onPress={handleDeselectAll}>
              <Text style={styles.bulkSelectButtonText}>{t("grn.deselectAll")}</Text>
            </Pressable>
            <Text style={styles.bulkSelectedCount}>
              {t("grn.selectedCount", { count: selectedItems.size })}
            </Text>
          </View>
        )}
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      {/* Notes Input */}
      <View style={styles.notesContainer}>
        <TextInput
          style={styles.notesInput}
          placeholder={t("grn.notesPlaceholder")}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="GRN notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
        />
      </View>

      {/* GO-LIVE-248: Bulk Action Bar */}
      {bulkMode && selectedItems.size > 0 && (
        <View style={styles.bulkActionBar}>
          <Text style={styles.bulkActionTitle}>{t("grn.setReceiveQty")}</Text>
          <View style={styles.bulkActionButtons}>
            <Pressable
              accessibilityRole="button"
              style={styles.bulkActionButton}
              onPress={handleBulkSetRemaining}
            >
              <Text style={styles.bulkActionButtonText}>100%</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.bulkActionButton}
              onPress={() => handleBulkSetPercent(50)}
            >
              <Text style={styles.bulkActionButtonText}>50%</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.bulkActionButton}
              onPress={() => handleBulkSetPercent(25)}
            >
              <Text style={styles.bulkActionButtonText}>25%</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.bulkActionButton, styles.bulkActionButtonClear]}
              onPress={handleBulkClear}
            >
              <Text style={[styles.bulkActionButtonText, styles.bulkActionButtonTextClear]}>
                {t("common.clear")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        {/* Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t("grn.items")}</Text>
            <Text style={styles.summaryValue}>
              {totals.receivingItems} / {totals.totalItems}
            </Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{t("grn.quantity")}</Text>
            <Text style={styles.summaryValue}>{totals.receivingQty}</Text>
          </View>
        </View>

        {/* Submit Button */}
        <Pressable
          testID="grn-submit-button"
          accessibilityRole="button"
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <>
              <MaterialCommunityIcons
                name="package-down"
                size={20}
                color={colors.textInverse}
              />
              <Text style={styles.submitButtonText}>
                {totals.receivingItems > 0 ? t("grn.receiveButton", { count: totals.receivingItems }) : t("grn.receive")}
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

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.textPrimary,
  },
  headerDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  // T-249: Reorder context badge
  reorderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  reorderBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textTertiary,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
  },
  errorText: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: theme.spacing.md,
  },
  retryButton: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textInverse,
  },
  searchContainer: {
    backgroundColor: colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
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
    color: colors.primary,
  },
  listContent: {
    padding: theme.spacing.md,
  },
  notesContainer: {
    backgroundColor: colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notesInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
    minHeight: 40,
    maxHeight: 60,
    textAlignVertical: "top",
  },
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    fontSize: 12,
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: colors.backgroundTertiary,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textInverse,
  },
  // GO-LIVE-248: Bulk mode styles
  quickActionActive: {
    backgroundColor: colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  quickActionTextActive: {
    color: colors.textInverse,
  },
  bulkSelectionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bulkSelectButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
  },
  bulkSelectButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.primary,
  },
  bulkSelectedCount: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  itemRowContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bulkCheckbox: {
    paddingTop: theme.spacing.md,
    paddingRight: theme.spacing.sm,
  },
  itemRowContent: {
    flex: 1,
  },
  itemRowContentBulk: {
    flex: 1,
  },
  bulkActionBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bulkActionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  bulkActionButtons: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  bulkActionButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
  },
  bulkActionButtonClear: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bulkActionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textInverse,
  },
  bulkActionButtonTextClear: {
    color: colors.textSecondary,
  },
  });
}
