// OrderCard - V3.0.9 compliant
// Card component for displaying a purchase order summary

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import type { PurchaseOrder, OrderStatus } from "../../services/api/orderApi";
import {
  getStatusLabel,
  getStatusColor,
  formatOrderNumber,
  canReceive,
} from "../../services/api/orderApi";

// =============================================================================
// TYPES
// =============================================================================

export interface OrderCardProps {
  order: PurchaseOrder;
  onPress: (order: PurchaseOrder) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function OrderCard({ order, onPress }: OrderCardProps) {
  const statusColor = getStatusColor(order.status);
  const statusLabel = getStatusLabel(order.status);
  const isReceivable = canReceive(order.status);

  const formattedDate = formatDate(order.createdAt);
  const formattedAmount = formatMoney(order.totalAmount);

  return (
    <Pressable
      style={styles.container}
      onPress={() => onPress(order)}
    >
      {/* Status Indicator */}
      <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />

      {/* Main Content */}
      <View style={styles.content}>
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.orderInfo}>
            <Text style={styles.orderNumber}>
              {formatOrderNumber(order.orderNumber)}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
          <View style={styles.dateContainer}>
            <MaterialCommunityIcons
              name="calendar-outline"
              size={12}
              color={theme.colors.textTertiary}
            />
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>
        </View>

        {/* Supplier Row */}
        <View style={styles.supplierRow}>
          <MaterialCommunityIcons
            name="store"
            size={14}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.supplierName} numberOfLines={1}>
            {order.supplierName}
          </Text>
        </View>

        {/* Footer Row */}
        <View style={styles.footerRow}>
          <View style={styles.itemsInfo}>
            <Text style={styles.itemsCount}>
              {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
            </Text>
            {order.orderType === "reorder" && (
              <View style={styles.reorderBadge}>
                <MaterialCommunityIcons
                  name="autorenew"
                  size={10}
                  color={theme.colors.accent}
                />
                <Text style={styles.reorderText}>Reorder</Text>
              </View>
            )}
          </View>

          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Total</Text>
            <Text style={styles.amountValue}>{formattedAmount}</Text>
          </View>
        </View>

        {/* Receivable Indicator */}
        {isReceivable && (
          <View style={styles.receivableRow}>
            <MaterialCommunityIcons
              name="package-variant"
              size={14}
              color={theme.colors.success}
            />
            <Text style={styles.receivableText}>Ready to receive</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={16}
              color={theme.colors.success}
            />
          </View>
        )}

        {/* Expected Delivery */}
        {order.expectedDeliveryDate && !["received", "cancelled"].includes(order.status) && (
          <View style={styles.deliveryRow}>
            <MaterialCommunityIcons
              name="truck-delivery-outline"
              size={12}
              color={theme.colors.textTertiary}
            />
            <Text style={styles.deliveryText}>
              Expected: {formatDate(order.expectedDeliveryDate)}
            </Text>
          </View>
        )}
      </View>

      {/* Chevron */}
      <View style={styles.chevronContainer}>
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={theme.colors.textTertiary}
        />
      </View>
    </Pressable>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
    overflow: "hidden",
  },
  statusIndicator: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: theme.spacing.sm,
  },
  orderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dateText: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  supplierRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  supplierName: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemsInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  itemsCount: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  reorderBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    gap: 2,
  },
  reorderText: {
    fontSize: 10,
    fontWeight: "500",
    color: theme.colors.accent,
  },
  amountContainer: {
    alignItems: "flex-end",
  },
  amountLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
  amountValue: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  receivableRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.successSoft,
    marginTop: theme.spacing.sm,
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    gap: theme.spacing.xs,
  },
  receivableText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: theme.colors.success,
  },
  deliveryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: theme.spacing.sm,
    gap: 4,
  },
  deliveryText: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },
  chevronContainer: {
    justifyContent: "center",
    paddingRight: theme.spacing.sm,
  },
});

export default OrderCard;
