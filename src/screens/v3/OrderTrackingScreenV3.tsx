import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Circle, Line } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { cardElevation } from "../../theme/brand";
import {
  getOrder,
  getOrderEvents,
  getStatusLabel,
  formatOrderNumber,
} from "../../services/api/orderApi";
import type {
  PurchaseOrderWithItems,
  OrderEvent,
  OrderStatus,
} from "../../services/api/orderApi";
import { getCachedSession } from "../../services/deviceSession";
import { logger } from "../../services/logger";

// GCP-STG-0748: POS Order Tracking screen with 5-step status timeline

type OrderTrackingScreenV3Props = {
  orderId: string;
  onClose: () => void;
};

// The 5 tracking steps in order
const TRACKING_STEPS: { key: OrderStatus; label: string }[] = [
  { key: "submitted", label: "Submitted" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "Packed / Shipped" },
  { key: "partial_received", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_ORDER: OrderStatus[] = [
  "draft",
  "submitted",
  "confirmed",
  "shipped",
  "partial_received",
  "delivered",
];

function getStepState(
  stepKey: OrderStatus,
  currentStatus: OrderStatus
): "complete" | "current" | "pending" {
  const stepIdx = STATUS_ORDER.indexOf(stepKey);
  const currentIdx = STATUS_ORDER.indexOf(currentStatus);
  if (currentIdx < 0 || stepIdx < 0) return "pending";
  if (stepIdx < currentIdx) return "complete";
  if (stepIdx === currentIdx) return "current";
  return "pending";
}

function estimateDelivery(
  order: PurchaseOrderWithItems,
  events: OrderEvent[]
): string | null {
  // If already delivered, show actual date
  if (order.actualDeliveryDate) {
    return formatDate(order.actualDeliveryDate);
  }
  // If expected delivery date is set, use it
  if (order.expectedDeliveryDate) {
    return formatDate(order.expectedDeliveryDate);
  }
  // Estimate from dispatch (shipped) event + 3 day SLA
  const shippedEvent = events.find((e) => e.toStatus === "shipped");
  if (shippedEvent) {
    const shippedDate = new Date(shippedEvent.createdAt);
    shippedDate.setDate(shippedDate.getDate() + 3);
    return formatDate(shippedDate.toISOString());
  }
  return null;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function OrderTrackingScreenV3({
  orderId,
  onClose,
}: OrderTrackingScreenV3Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [order, setOrder] = useState<PurchaseOrderWithItems | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = getCachedSession();
      const storeId = session?.storeId;
      if (!storeId) {
        setError("No store session found");
        setLoading(false);
        return;
      }
      const [orderData, eventsData] = await Promise.all([
        getOrder(storeId, orderId),
        getOrderEvents(storeId, orderId),
      ]);
      setOrder(orderData);
      setEvents(eventsData);
    } catch (err: any) {
      logger.debug("OrderTrackingV3", `load_failed:${String(err)}`);
      setError(err?.message ?? "Failed to load order tracking");
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const estimatedDelivery =
    order && events.length > 0 ? estimateDelivery(order, events) : null;

  // Find timestamp for each step from events
  const stepTimestamps = useMemo(() => {
    const map: Partial<Record<OrderStatus, string>> = {};
    for (const event of events) {
      if (event.toStatus && !map[event.toStatus]) {
        map[event.toStatus] = event.createdAt;
      }
    }
    return map;
  }, [events]);

  // ---- RENDER: Loading state ----
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header onClose={onClose} colors={colors} styles={styles} />
        <View style={styles.centerContent}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
            testID="tracking-loading"
          />
          <Text style={styles.loadingText}>Loading order tracking...</Text>
        </View>
      </View>
    );
  }

  // ---- RENDER: Error state ----
  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header onClose={onClose} colors={colors} styles={styles} />
        <View style={styles.centerContent}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={loadData}
            accessibilityRole="button"
            testID="tracking-retry"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- RENDER: Empty state ----
  if (!order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header onClose={onClose} colors={colors} styles={styles} />
        <View style={styles.centerContent}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text>
          <Text style={styles.emptyText}>Order not found</Text>
        </View>
      </View>
    );
  }

  // ---- RENDER: Data state ----
  const isCancelled = order.status === "cancelled";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header onClose={onClose} colors={colors} styles={styles} />
      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Order Summary Card */}
        <View style={styles.summaryCard} testID="tracking-summary">
          <Text style={styles.poNumber}>
            {formatOrderNumber(order.orderNumber)}
          </Text>
          <Text style={styles.supplierName}>{order.supplierName}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Items</Text>
            <Text style={styles.summaryValue}>{order.itemCount}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValue}>
              {"\u20B9"}
              {Math.round(order.totalAmount / 100).toLocaleString("en-IN")}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Status</Text>
            <Text
              style={[
                styles.summaryValue,
                {
                  color: isCancelled
                    ? colors.error
                    : order.status === "delivered"
                    ? colors.success
                    : colors.primary,
                },
              ]}
            >
              {getStatusLabel(order.status)}
            </Text>
          </View>
          {order.trackingNumber ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tracking</Text>
              <Text style={styles.summaryValue}>
                {order.trackingNumber}
                {order.carrier ? ` (${order.carrier})` : ""}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Estimated Delivery */}
        {estimatedDelivery && !isCancelled ? (
          <View style={styles.deliveryCard} testID="tracking-eta">
            <Svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.primary}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Circle cx="12" cy="12" r="10" />
              <Path d="M12 6v6l4 2" />
            </Svg>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.deliveryLabel}>
                {order.status === "delivered"
                  ? "Delivered on"
                  : "Estimated Delivery"}
              </Text>
              <Text style={styles.deliveryDate}>{estimatedDelivery}</Text>
            </View>
          </View>
        ) : null}

        {/* Cancelled banner */}
        {isCancelled ? (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledText}>This order was cancelled</Text>
          </View>
        ) : null}

        {/* Status Stepper */}
        {!isCancelled ? (
          <View style={styles.stepperSection}>
            <Text style={styles.sectionTitle}>ORDER PROGRESS</Text>
            <View style={styles.stepper} testID="tracking-stepper">
              {TRACKING_STEPS.map((step, idx) => {
                const state = getStepState(step.key, order.status);
                const isLast = idx === TRACKING_STEPS.length - 1;
                const timestamp = stepTimestamps[step.key];
                return (
                  <View key={step.key} style={styles.stepRow}>
                    {/* Circle + connecting line */}
                    <View style={styles.stepIndicator}>
                      <View
                        style={[
                          styles.stepCircle,
                          state === "complete" && {
                            backgroundColor: colors.success,
                            borderColor: colors.success,
                          },
                          state === "current" && {
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                          },
                          state === "pending" && {
                            backgroundColor: colors.backgroundSecondary,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        {state === "complete" ? (
                          <Svg
                            width={12}
                            height={12}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#fff"
                            strokeWidth={3}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <Path d="M20 6L9 17l-5-5" />
                          </Svg>
                        ) : state === "current" ? (
                          <View style={styles.currentDot} />
                        ) : null}
                      </View>
                      {!isLast ? (
                        <View
                          style={[
                            styles.stepLine,
                            {
                              backgroundColor:
                                state === "complete"
                                  ? colors.success
                                  : colors.border,
                            },
                          ]}
                        />
                      ) : null}
                    </View>
                    {/* Label + timestamp */}
                    <View style={styles.stepContent}>
                      <Text
                        style={[
                          styles.stepLabel,
                          state === "current" && {
                            color: colors.primary,
                            fontWeight: "800",
                          },
                          state === "complete" && {
                            color: colors.success,
                          },
                          state === "pending" && {
                            color: colors.textTertiary,
                          },
                        ]}
                      >
                        {step.label}
                      </Text>
                      {timestamp ? (
                        <Text style={styles.stepTime}>
                          {formatDateTime(timestamp)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Status History */}
        {events.length > 0 ? (
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>STATUS HISTORY</Text>
            {events.map((event) => (
              <View
                key={event.id}
                style={styles.historyRow}
                testID="tracking-history-item"
              >
                <View style={styles.historyDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyTransition}>
                    {event.fromStatus
                      ? `${getStatusLabel(event.fromStatus)} → ${getStatusLabel(
                          event.toStatus!
                        )}`
                      : getStatusLabel(event.toStatus!) ?? event.eventType}
                  </Text>
                  {event.metadata?.note ? (
                    <Text style={styles.historyNote}>
                      {String(event.metadata.note)}
                    </Text>
                  ) : null}
                  <Text style={styles.historyTime}>
                    {formatDateTime(event.createdAt)} ·{" "}
                    {event.actorType === "supplier"
                      ? "Supplier"
                      : event.actorType === "system"
                      ? "System"
                      : "You"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ---- Header sub-component ----
function Header({
  onClose,
  colors,
  styles,
}: {
  onClose: () => void;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onClose}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        testID="tracking-back"
      >
        <Svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textInverse}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M19 12H5M12 19l-7-7 7-7" />
        </Svg>
      </Pressable>
      <Text style={styles.headerTitle}>Order Tracking</Text>
    </View>
  );
}

// ---- Styles ----
function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      backgroundColor: colors.primary,
      paddingHorizontal: getScreenPadding(),
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    backButton: { padding: 4 },
    headerTitle: {
      color: colors.textInverse,
      fontSize: 17,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    body: { flex: 1 },
    centerContent: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
    },
    loadingText: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 12,
    },
    errorIcon: {
      fontSize: 32,
      fontWeight: "900",
      color: colors.error,
      width: 48,
      height: 48,
      lineHeight: 48,
      textAlign: "center",
      borderRadius: 24,
      backgroundColor: colors.errorSoft,
      marginBottom: 12,
      overflow: "hidden",
    },
    errorText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.error,
      textAlign: "center",
      marginBottom: 16,
    },
    retryButton: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    emptyText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
    },

    // Summary card
    summaryCard: {
      margin: getScreenPadding(),
      padding: 16,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      ...cardElevation.subtle,
    },
    poNumber: {
      fontSize: 18,
      fontWeight: "900",
      color: colors.primary,
      marginBottom: 2,
    },
    supplierName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 12,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
    },
    summaryLabel: { fontSize: 13, color: colors.textTertiary },
    summaryValue: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },

    // Delivery estimate
    deliveryCard: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: getScreenPadding(),
      marginBottom: 8,
      padding: 14,
      backgroundColor: colors.primaryLight,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    deliveryLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.textTertiary,
    },
    deliveryDate: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.primary,
      marginTop: 1,
    },

    // Cancelled
    cancelledBanner: {
      marginHorizontal: getScreenPadding(),
      marginBottom: 8,
      padding: 14,
      backgroundColor: colors.errorSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.error,
      alignItems: "center",
    },
    cancelledText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.error,
    },

    // Stepper
    stepperSection: {
      marginHorizontal: getScreenPadding(),
      marginTop: 8,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.textTertiary,
      letterSpacing: 0.8,
      marginBottom: 12,
    },
    stepper: { paddingLeft: 4 },
    stepRow: { flexDirection: "row", minHeight: 56 },
    stepIndicator: { width: 28, alignItems: "center" },
    stepCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    currentDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: "#fff",
    },
    stepLine: {
      width: 2,
      flex: 1,
      marginVertical: 3,
      alignSelf: "center",
    },
    stepContent: { flex: 1, marginLeft: 10, paddingBottom: 12 },
    stepLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    stepTime: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 2,
    },

    // History
    historySection: {
      marginHorizontal: getScreenPadding(),
      marginTop: 8,
      marginBottom: 16,
    },
    historyRow: {
      flexDirection: "row",
      marginBottom: 12,
      alignItems: "flex-start",
    },
    historyDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginTop: 5,
      marginRight: 10,
    },
    historyTransition: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    historyNote: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      fontStyle: "italic",
    },
    historyTime: {
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 2,
    },
  });
}
