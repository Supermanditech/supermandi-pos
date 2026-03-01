// PolicyRow - V3.0.9 compliant
// Row component for displaying a reorder policy

import React, { useMemo } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme, useThemeColors } from "../../theme";
import type { ReorderPolicy } from "../../services/api/reorderApi";

// =============================================================================
// TYPES
// =============================================================================

export interface PolicyRowProps {
  policy: ReorderPolicy;
  onEdit: (policy: ReorderPolicy) => void;
  onToggleEnabled: (policy: ReorderPolicy, enabled: boolean) => void;
  disabled?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PolicyRow({
  policy,
  onEdit,
  onToggleEnabled,
  disabled,
}: PolicyRowProps) {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);

  const stockStatus = getStockStatus(policy);

  return (
    <View style={styles.container}>
      {/* Main Content */}
      <Pressable
        style={styles.content}
        onPress={() => onEdit(policy)}
        disabled={disabled}
      >
        {/* Product Info */}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>
            {policy.productName}
          </Text>
          {policy.barcode && (
            <Text style={styles.barcode}>{policy.barcode}</Text>
          )}
        </View>

        {/* Stock Info */}
        <View style={styles.stockInfo}>
          <View style={styles.stockRow}>
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>Current</Text>
              <Text
                style={[
                  styles.stockValue,
                  stockStatus === "low" && styles.stockValueLow,
                  stockStatus === "critical" && styles.stockValueCritical,
                ]}
              >
                {policy.currentStock}
              </Text>
            </View>
            <View style={styles.stockDivider} />
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>Min</Text>
              <Text style={styles.stockValue}>{policy.minThreshold}</Text>
            </View>
            <View style={styles.stockDivider} />
            <View style={styles.stockItem}>
              <Text style={styles.stockLabel}>Target</Text>
              <Text style={styles.stockValue}>{policy.targetStock}</Text>
            </View>
            {policy.maxReorderQty != null && (
              <>
                <View style={styles.stockDivider} />
                <View style={styles.stockItem}>
                  <Text style={styles.stockLabel}>Max</Text>
                  <Text style={styles.stockValue}>{policy.maxReorderQty}</Text>
                </View>
              </>
            )}
          </View>

          {/* Preferred Supplier */}
          {policy.preferredSupplierName && (
            <View style={styles.supplierRow}>
              <MaterialCommunityIcons
                name="store"
                size={12}
                color={tc.textTertiary}
              />
              <Text style={styles.supplierName} numberOfLines={1}>
                {policy.preferredSupplierName}
              </Text>
            </View>
          )}
        </View>

        {/* Edit Indicator */}
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={tc.textTertiary}
        />
      </Pressable>

      {/* Enable Toggle */}
      <View style={styles.toggleContainer}>
        <Switch
          value={policy.isEnabled}
          onValueChange={(value) => onToggleEnabled(policy, value)}
          trackColor={{
            false: tc.borderDark,
            true: tc.primaryLight,
          }}
          thumbColor={
            policy.isEnabled ? tc.primary : tc.surface
          }
          disabled={disabled}
        />
      </View>

      {/* Status Badge */}
      {stockStatus !== "ok" && (
        <View
          style={[
            styles.statusBadge,
            stockStatus === "critical" && styles.statusBadgeCritical,
            stockStatus === "low" && styles.statusBadgeLow,
          ]}
        >
          <MaterialCommunityIcons
            name={stockStatus === "critical" ? "alert" : "alert-circle-outline"}
            size={10}
            color={
              stockStatus === "critical"
                ? tc.error
                : tc.warning
            }
          />
        </View>
      )}
    </View>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

type StockStatus = "ok" | "low" | "critical";

function getStockStatus(policy: ReorderPolicy): StockStatus {
  if (policy.currentStock <= 0) return "critical";
  if (policy.currentStock < policy.minThreshold * 0.5) return "critical";
  if (policy.currentStock < policy.minThreshold) return "low";
  return "ok";
}

// =============================================================================
// STYLES
// =============================================================================

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingRight: theme.spacing.md,
    },
    content: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      paddingLeft: theme.spacing.md,
    },
    productInfo: {
      flex: 1,
      marginRight: theme.spacing.sm,
    },
    productName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    barcode: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    stockInfo: {
      alignItems: "flex-end",
      marginRight: theme.spacing.sm,
    },
    stockRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.backgroundSecondary,
      borderRadius: theme.borderRadius.sm,
      paddingVertical: 4,
      paddingHorizontal: theme.spacing.sm,
    },
    stockItem: {
      alignItems: "center",
      minWidth: 36,
    },
    stockDivider: {
      width: 1,
      height: 20,
      backgroundColor: colors.border,
      marginHorizontal: theme.spacing.xs,
    },
    stockLabel: {
      fontSize: 9,
      color: colors.textTertiary,
      textTransform: "uppercase",
    },
    stockValue: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    stockValueLow: {
      color: colors.warning,
    },
    stockValueCritical: {
      color: colors.error,
    },
    supplierRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 4,
      gap: 4,
    },
    supplierName: {
      fontSize: 11,
      color: colors.textTertiary,
      maxWidth: 100,
    },
    toggleContainer: {
      paddingLeft: theme.spacing.sm,
    },
    statusBadge: {
      position: "absolute",
      top: 8,
      left: 8,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.warningSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    statusBadgeCritical: {
      backgroundColor: colors.errorSoft,
    },
    statusBadgeLow: {
      backgroundColor: colors.warningSoft,
    },
  });
}

export default PolicyRow;
