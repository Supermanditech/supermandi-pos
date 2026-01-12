// GRNItemRow - V3.0.9 compliant
// Row component for displaying and editing a GRN item

import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";
import { ReceiveQuantityInput } from "./ReceiveQuantityInput";
import type { PurchaseOrderItem } from "../../services/api/orderApi";

// =============================================================================
// TYPES
// =============================================================================

export interface GRNItemRowProps {
  item: PurchaseOrderItem;
  receiveQuantity: number;
  onReceiveQuantityChange: (itemId: string, quantity: number) => void;
  isHighlighted?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function GRNItemRow({
  item,
  receiveQuantity,
  onReceiveQuantityChange,
  isHighlighted,
}: GRNItemRowProps) {
  const remainingQuantity = item.orderedQuantity - item.receivedQuantity;
  const isFullyReceived = remainingQuantity <= 0;

  const handleQuantityChange = useCallback(
    (quantity: number) => {
      onReceiveQuantityChange(item.id, quantity);
    },
    [item.id, onReceiveQuantityChange]
  );

  // Calculate status color
  const statusInfo = useMemo(() => {
    if (isFullyReceived) {
      return {
        color: theme.colors.success,
        label: "Received",
        icon: "check-circle" as const,
      };
    }
    if (item.receivedQuantity > 0) {
      return {
        color: theme.colors.warning,
        label: "Partial",
        icon: "progress-check" as const,
      };
    }
    return {
      color: theme.colors.textTertiary,
      label: "Pending",
      icon: "clock-outline" as const,
    };
  }, [isFullyReceived, item.receivedQuantity]);

  return (
    <View
      style={[
        styles.container,
        isHighlighted && styles.containerHighlighted,
        isFullyReceived && styles.containerCompleted,
      ]}
    >
      {/* Product Info */}
      <View style={styles.productInfo}>
        <View style={styles.productHeader}>
          <Text
            style={[styles.productName, isFullyReceived && styles.productNameCompleted]}
            numberOfLines={2}
          >
            {item.productName}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.color + "20" }]}>
            <MaterialCommunityIcons
              name={statusInfo.icon}
              size={12}
              color={statusInfo.color}
            />
            <Text style={[styles.statusText, { color: statusInfo.color }]}>
              {statusInfo.label}
            </Text>
          </View>
        </View>

        {item.barcode && (
          <Text style={styles.barcode}>{item.barcode}</Text>
        )}

        {/* Quantity Info */}
        <View style={styles.quantityInfo}>
          <View style={styles.quantityItem}>
            <Text style={styles.quantityLabel}>Ordered</Text>
            <Text style={styles.quantityValue}>{item.orderedQuantity}</Text>
          </View>
          <View style={styles.quantityDivider} />
          <View style={styles.quantityItem}>
            <Text style={styles.quantityLabel}>Received</Text>
            <Text style={[styles.quantityValue, styles.quantityReceived]}>
              {item.receivedQuantity}
            </Text>
          </View>
          <View style={styles.quantityDivider} />
          <View style={styles.quantityItem}>
            <Text style={styles.quantityLabel}>Remaining</Text>
            <Text
              style={[
                styles.quantityValue,
                remainingQuantity > 0 && styles.quantityRemaining,
              ]}
            >
              {remainingQuantity}
            </Text>
          </View>
        </View>
      </View>

      {/* Receive Input */}
      <View style={styles.receiveSection}>
        <Text style={styles.receiveSectionLabel}>Receive Now</Text>
        <ReceiveQuantityInput
          value={receiveQuantity}
          onChange={handleQuantityChange}
          max={remainingQuantity}
          disabled={isFullyReceived}
        />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          {/* Already received portion */}
          <View
            style={[
              styles.progressFill,
              styles.progressReceived,
              {
                width: `${(item.receivedQuantity / item.orderedQuantity) * 100}%`,
              },
            ]}
          />
          {/* Currently receiving portion */}
          {receiveQuantity > 0 && (
            <View
              style={[
                styles.progressFill,
                styles.progressReceiving,
                {
                  width: `${(receiveQuantity / item.orderedQuantity) * 100}%`,
                },
              ]}
            />
          )}
        </View>
        <Text style={styles.progressText}>
          {item.receivedQuantity + receiveQuantity} / {item.orderedQuantity}
        </Text>
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
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  containerHighlighted: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
    backgroundColor: theme.colors.accentSoft,
  },
  containerCompleted: {
    opacity: 0.7,
    backgroundColor: theme.colors.successSoft,
  },
  productInfo: {
    marginBottom: theme.spacing.md,
  },
  productHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    marginBottom: 4,
  },
  productName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  productNameCompleted: {
    color: theme.colors.textSecondary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    gap: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  barcode: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.sm,
  },
  quantityInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  quantityItem: {
    flex: 1,
    alignItems: "center",
  },
  quantityDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.border,
  },
  quantityLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    textTransform: "uppercase",
  },
  quantityValue: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  quantityReceived: {
    color: theme.colors.success,
  },
  quantityRemaining: {
    color: theme.colors.warning,
  },
  receiveSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  receiveSectionLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: theme.colors.backgroundTertiary,
    borderRadius: 3,
    flexDirection: "row",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  progressReceived: {
    backgroundColor: theme.colors.success,
  },
  progressReceiving: {
    backgroundColor: theme.colors.primary,
  },
  progressText: {
    fontSize: 11,
    fontWeight: "500",
    color: theme.colors.textTertiary,
    minWidth: 50,
    textAlign: "right",
  },
});

export default GRNItemRow;
