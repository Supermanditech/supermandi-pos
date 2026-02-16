// OrderDetailScreen - V3.0.9 compliant
// Purchase order detail view with items and status timeline

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../theme";
import { formatMoney } from "../utils/money";
import { formatDate } from "../i18n/formatters";
import { StatusTimeline } from "../components/orders/StatusTimeline";
import * as orderApi from "../services/api/orderApi";
import type {
  PurchaseOrderWithItems,
  PurchaseOrderItem,
  OrderEvent,
  OrderStatus,
} from "../services/api/orderApi";
import {
  getStatusLabel,
  getStatusColor,
  formatOrderNumber,
  canCancel,
  canReceive,
  getOrderProgress,
} from "../services/api/orderApi";
import { getDeviceStoreId } from "../services/deviceSession";

// =============================================================================
// TYPES
// =============================================================================

export interface OrderDetailScreenProps {
  orderId: string;
  onBack?: () => void;
  onNavigateToGRN?: (order: PurchaseOrderWithItems) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function OrderDetailScreen({
  orderId,
  onBack,
  onNavigateToGRN,
}: OrderDetailScreenProps) {
  const insets = useSafeAreaInsets();

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [order, setOrder] = useState<PurchaseOrderWithItems | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // GO-LIVE-242: Tracking number state
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingEditing, setTrackingEditing] = useState(false);
  const [trackingSaving, setTrackingSaving] = useState(false);

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
      const [orderData, eventsData] = await Promise.all([
        orderApi.getOrder(storeId, orderId),
        orderApi.getOrderEvents(storeId, orderId),
      ]);
      setOrder(orderData);
      setEvents(eventsData);
    } catch (err) {
      console.error("[OrderDetailScreen] Failed to load order:", err);
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

  // GO-LIVE-242: Sync tracking number state when order loads
  useEffect(() => {
    if (order?.trackingNumber) {
      setTrackingNumber(order.trackingNumber);
    }
  }, [order?.trackingNumber]);

  // GO-LIVE-239: Auto-refresh for in-progress orders
  useEffect(() => {
    // Only auto-refresh if order is in a non-final status
    if (!order) return;
    const finalStatuses: OrderStatus[] = ["delivered", "cancelled"];
    if (finalStatuses.includes(order.status)) {
      return;
    }

    // Poll every 30 seconds for status updates
    const pollInterval = setInterval(() => {
      console.log("[OrderDetailScreen] GO-LIVE-239: Auto-refreshing order status");
      void loadOrder();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [order?.status, loadOrder]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (!storeId || !order || !canCancel(order.status)) return;

    Alert.alert(
      "Cancel Order",
      `Are you sure you want to cancel order ${formatOrderNumber(order.orderNumber)}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              const result = await orderApi.cancelOrder(storeId, orderId);
              if (result.data) {
                setOrder((prev) => (prev ? { ...prev, status: result.data!.status } : prev));
              }
              // Reload events
              const eventsData = await orderApi.getOrderEvents(storeId, orderId);
              setEvents(eventsData);
            } catch (err) {
              console.error("[OrderDetailScreen] Failed to cancel:", err);
              Alert.alert("Error", "Failed to cancel order. Please try again.");
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  }, [storeId, order, orderId]);

  // Handle receive (GRN)
  const handleReceive = useCallback(() => {
    if (order && onNavigateToGRN) {
      onNavigateToGRN(order);
    }
  }, [order, onNavigateToGRN]);

  // GO-LIVE-242: Handle tracking number save
  const handleSaveTracking = useCallback(async () => {
    if (!storeId || !order) return;
    const trimmed = trackingNumber.trim();
    if (!trimmed) {
      setTrackingEditing(false);
      setTrackingNumber(order.trackingNumber || "");
      return;
    }

    setTrackingSaving(true);
    try {
      const response = await orderApi.updateTracking(storeId, orderId, trimmed);
      if (response.success && response.data) {
        setOrder((prev) =>
          prev ? { ...prev, trackingNumber: response.data.trackingNumber } : prev
        );
      }
      setTrackingEditing(false);
      Alert.alert("Success", "Tracking number updated");
    } catch (err) {
      console.error("[OrderDetailScreen] Failed to update tracking:", err);
      Alert.alert("Error", "Failed to update tracking number");
    } finally {
      setTrackingSaving(false);
    }
  }, [storeId, order, orderId, trackingNumber]);

  // WhatsApp supplier about this order
  const handleWhatsAppSupplier = useCallback(() => {
    if (!order) return;
    const itemsSummary = order.items
      .slice(0, 5)
      .map((item) => `- ${item.productName} x${item.orderedQuantity}`)
      .join("\n");
    const moreItems = order.items.length > 5 ? `\n... and ${order.items.length - 5} more items` : "";
    const message = encodeURIComponent(
      `Hi, regarding order ${formatOrderNumber(order.orderNumber)} (${getStatusLabel(order.status)}):\n\n` +
      `Total: ${formatMoney(order.totalAmount)}\n` +
      `Items:\n${itemsSummary}${moreItems}\n\n` +
      `Please update on the status. Thank you.`
    );
    // supplierPhone not available on PurchaseOrder type — open without phone so user can pick contact
    const url = `whatsapp://send?text=${message}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("WhatsApp Not Found", "Please install WhatsApp to use this feature.");
    });
  }, [order]);

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
          <Text style={styles.headerTitle}>Order Details</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading order details...</Text>
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
          <Text style={styles.headerTitle}>Order Details</Text>
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

  const statusColor = getStatusColor(order.status);
  const statusLabel = getStatusLabel(order.status);
  const progress = getOrderProgress(order.status);
  const isReceivable = canReceive(order.status);
  const isCancellable = canCancel(order.status);

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
          <Text style={styles.headerTitle}>
            {formatOrderNumber(order.orderNumber)}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Bar */}
        {order.status !== "cancelled" && (
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress}%`, backgroundColor: statusColor },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{progress}% Complete</Text>
          </View>
        )}

        {/* Order Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons
              name="store"
              size={18}
              color={theme.colors.primary}
            />
            <Text style={styles.cardTitle}>Supplier</Text>
          </View>
          <Text style={styles.supplierName}>{order.supplierName}</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Order Type</Text>
              <Text style={styles.infoValue}>
                {order.orderType === "reorder" ? "Reorder" : "Manual"}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Created</Text>
              <Text style={styles.infoValue}>{formatDate(order.createdAt)}</Text>
            </View>
            {order.expectedDeliveryDate && (
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Expected Delivery</Text>
                <Text style={styles.infoValue}>
                  {formatDate(order.expectedDeliveryDate)}
                </Text>
              </View>
            )}
            {/* GO-LIVE-242: Editable tracking number */}
            <View style={styles.trackingSection}>
              <Text style={styles.infoLabel}>Tracking Number</Text>
              {trackingEditing ? (
                <View style={styles.trackingEditRow}>
                  <TextInput
                    style={styles.trackingInput}
                    value={trackingNumber}
                    onChangeText={setTrackingNumber}
                    placeholder="Enter tracking number"
                    placeholderTextColor={theme.colors.textTertiary}
                    autoFocus
                    editable={!trackingSaving}
                  />
                  <Pressable
                    style={styles.trackingSaveButton}
                    onPress={handleSaveTracking}
                    disabled={trackingSaving}
                  >
                    {trackingSaving ? (
                      <ActivityIndicator size="small" color={theme.colors.textInverse} />
                    ) : (
                      <MaterialCommunityIcons name="check" size={18} color={theme.colors.textInverse} />
                    )}
                  </Pressable>
                  <Pressable
                    style={styles.trackingCancelButton}
                    onPress={() => {
                      setTrackingEditing(false);
                      setTrackingNumber(order.trackingNumber || "");
                    }}
                    disabled={trackingSaving}
                  >
                    <MaterialCommunityIcons name="close" size={18} color={theme.colors.textSecondary} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={styles.trackingDisplayRow}
                  onPress={() => setTrackingEditing(true)}
                >
                  <Text style={[styles.infoValue, !order.trackingNumber && styles.trackingPlaceholder]}>
                    {order.trackingNumber || "Add tracking..."}
                  </Text>
                  <MaterialCommunityIcons name="pencil" size={14} color={theme.colors.primary} />
                </Pressable>
              )}
            </View>
          </View>

          {order.storeNotes && (
            <View style={styles.notesSection}>
              <Text style={styles.notesLabel}>Notes</Text>
              <Text style={styles.notesText}>{order.storeNotes}</Text>
            </View>
          )}
        </View>

        {/* Items Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons
              name="package-variant"
              size={18}
              color={theme.colors.primary}
            />
            <Text style={styles.cardTitle}>
              Items ({order.items.length})
            </Text>
          </View>

          {order.items.map((item, index) => (
            <OrderItemRow
              key={item.id}
              item={item}
              isLast={index === order.items.length - 1}
            />
          ))}

          {/* Total */}
          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>
              {formatMoney(order.totalAmount)}
            </Text>
          </View>
        </View>

        {/* Timeline Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons
              name="timeline-outline"
              size={18}
              color={theme.colors.primary}
            />
            <Text style={styles.cardTitle}>Timeline</Text>
          </View>

          <StatusTimeline events={events} currentStatus={order.status} />
        </View>
      </ScrollView>

      {/* Action Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        {isCancellable && (
          <Pressable
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color={theme.colors.error} />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="close-circle"
                  size={18}
                  color={theme.colors.error}
                />
                <Text style={styles.cancelButtonText}>Cancel Order</Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable style={styles.whatsappButton} onPress={handleWhatsAppSupplier}>
          <MaterialCommunityIcons
            name="whatsapp"
            size={18}
            color="#FFFFFF"
          />
        </Pressable>

        {isReceivable && onNavigateToGRN && (
          <Pressable style={styles.receiveButton} onPress={handleReceive}>
            <MaterialCommunityIcons
              name="package-down"
              size={18}
              color={theme.colors.textInverse}
            />
            <Text style={styles.receiveButtonText}>Receive Goods</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// =============================================================================
// ORDER ITEM ROW
// =============================================================================

interface OrderItemRowProps {
  item: PurchaseOrderItem;
  isLast: boolean;
}

function OrderItemRow({ item, isLast }: OrderItemRowProps) {
  const receivedPercent =
    item.orderedQuantity > 0
      ? Math.round((item.receivedQuantity / item.orderedQuantity) * 100)
      : 0;

  return (
    <View style={[styles.itemRow, !isLast && styles.itemRowBorder]}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.productName}
        </Text>
        {item.barcode && (
          <Text style={styles.itemBarcode}>{item.barcode}</Text>
        )}
        <View style={styles.itemQuantities}>
          <Text style={styles.itemQuantity}>
            Ordered: {item.orderedQuantity}
          </Text>
          {item.receivedQuantity > 0 && (
            <Text style={styles.itemReceived}>
              Received: {item.receivedQuantity} ({receivedPercent}%)
            </Text>
          )}
        </View>
      </View>

      <View style={styles.itemPrice}>
        <Text style={styles.itemUnitPrice}>
          {formatMoney(item.unitPrice)} x {item.orderedQuantity}
        </Text>
        <Text style={styles.itemTotal}>{formatMoney(item.totalPrice)}</Text>
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
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  content: {
    flex: 1,
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
  progressSection: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  progressBar: {
    height: 6,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 4,
    textAlign: "right",
  },
  card: {
    backgroundColor: theme.colors.surface,
    margin: theme.spacing.md,
    marginBottom: 0,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  supplierName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
  },
  infoItem: {
    minWidth: 100,
  },
  infoLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  notesSection: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  notesLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: theme.spacing.sm,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  itemInfo: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  itemBarcode: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  itemQuantities: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  itemQuantity: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  itemReceived: {
    fontSize: 12,
    color: theme.colors.success,
  },
  itemPrice: {
    alignItems: "flex-end",
  },
  itemUnitPrice: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  footer: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  cancelButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.error,
    gap: theme.spacing.xs,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.error,
  },
  whatsappButton: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
  },
  receiveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.success,
    gap: theme.spacing.xs,
  },
  receiveButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  // GO-LIVE-242: Tracking number styles
  trackingSection: {
    flex: 1,
    minWidth: "100%",
    marginTop: theme.spacing.sm,
  },
  trackingEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginTop: 4,
  },
  trackingInput: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    fontSize: 13,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  trackingSaveButton: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  trackingCancelButton: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  trackingDisplayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginTop: 4,
  },
  trackingPlaceholder: {
    color: theme.colors.textTertiary,
    fontStyle: "italic",
  },
});
