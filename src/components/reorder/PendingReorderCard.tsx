// PendingReorderCard - V3.0.9 compliant
// Card showing pending reorder with selection checkbox

import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { theme, useThemeColors } from "../../theme";
import { formatMoney } from "../../utils/money";
import type { PendingReorder } from "../../services/api/reorderApi";
import { isCriticallyLow, getEstimatedTotal } from "../../services/api/reorderApi";

// =============================================================================
// TYPES
// =============================================================================

export interface PendingReorderCardProps {
  item: PendingReorder;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDismiss: (item: PendingReorder) => void;
  onEdit?: (item: PendingReorder) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PendingReorderCard({
  item,
  selected,
  onToggleSelect,
  onDismiss,
  onEdit,
}: PendingReorderCardProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);

  const isCritical = isCriticallyLow(item);
  const estimatedTotal = getEstimatedTotal(item);

  return (
    <Pressable
      accessibilityLabel={`${item.productName}, ${t("reorder.suggestedQty")} ${item.suggestedQuantity}`}
      style={[
        styles.container,
        selected && styles.containerSelected,
        isCritical && styles.containerCritical,
      ]}
      onPress={() => onToggleSelect(item.id)}
    >
      {/* Checkbox */}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${t("reorder.selectItem")} ${item.productName}`}
        accessibilityState={{ checked: selected }}
        style={styles.checkboxContainer}
        onPress={() => onToggleSelect(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && (
            <MaterialCommunityIcons
              name="check"
              size={16}
              color={tc.textInverse}
            />
          )}
        </View>
      </Pressable>

      {/* Content */}
      <View style={styles.content}>
        {/* Product Name and Critical Badge */}
        <View style={styles.headerRow}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.productName}
          </Text>
          {isCritical && (
            <View style={styles.criticalBadge}>
              <MaterialCommunityIcons
                name="alert"
                size={12}
                color={tc.error}
              />
              <Text style={styles.criticalText}>{t("reorder.critical")}</Text>
            </View>
          )}
        </View>

        {/* Barcode */}
        {item.barcode && (
          <Text style={styles.barcode}>{item.barcode}</Text>
        )}

        {/* Stock Info */}
        <View style={styles.stockRow}>
          <View style={styles.stockItem}>
            <Text style={styles.stockLabel}>{t("reorder.current")}</Text>
            <Text style={[styles.stockValue, isCritical && styles.stockValueCritical]}>
              {item.currentStock}
            </Text>
          </View>
          <View style={styles.stockArrow}>
            <MaterialCommunityIcons
              name="arrow-right"
              size={16}
              color={tc.textTertiary}
            />
          </View>
          <View style={styles.stockItem}>
            <Text style={styles.stockLabel}>{t("reorder.min")}</Text>
            <Text style={styles.stockValue}>{item.minThreshold}</Text>
          </View>
          <View style={styles.stockArrow}>
            <MaterialCommunityIcons
              name="arrow-right"
              size={16}
              color={tc.textTertiary}
            />
          </View>
          <View style={styles.stockItem}>
            <Text style={styles.stockLabel}>{t("reorder.target")}</Text>
            <Text style={styles.stockValue}>{item.targetStock}</Text>
          </View>
        </View>

        {/* Suggestion Row */}
        <View style={styles.suggestionRow}>
          <View style={styles.suggestionItem}>
            <Text style={styles.suggestionLabel}>{t("reorder.suggestedQty")}</Text>
            <Text style={styles.suggestionValue}>{item.suggestedQuantity}</Text>
          </View>

          {item.suggestedSupplierName && (
            <View style={styles.suggestionItem}>
              <Text style={styles.suggestionLabel}>{t("reorder.supplier")}</Text>
              <Text style={styles.supplierName} numberOfLines={1}>
                {item.suggestedSupplierName}
              </Text>
            </View>
          )}

          {item.suggestedUnitPrice !== null && (
            <View style={styles.suggestionItem}>
              <Text style={styles.suggestionLabel}>{t("reorder.unitPrice")}</Text>
              <Text style={styles.suggestionValue}>
                {formatMoney(item.suggestedUnitPrice)}
              </Text>
            </View>
          )}
        </View>

        {/* Payment Terms (T-240) */}
        {item.paymentTerms && (
          <View style={styles.paymentTermsRow}>
            <MaterialCommunityIcons
              name="credit-card-outline"
              size={14}
              color={tc.textTertiary}
            />
            <Text style={styles.paymentTermsText}>
              {t("reorder.paymentTerms")}: {item.paymentTerms}
            </Text>
          </View>
        )}

        {/* Total and Actions */}
        <View style={styles.footerRow}>
          <View style={styles.totalSection}>
            {estimatedTotal > 0 && (
              <>
                <Text style={styles.totalLabel}>{t("reorder.estTotal")}</Text>
                <Text style={styles.totalValue}>
                  {formatMoney(estimatedTotal)}
                </Text>
              </>
            )}
          </View>

          <View style={styles.actionsSection}>
            {onEdit && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t("reorder.editItem")} ${item.productName}`}
                style={styles.actionButton}
                onPress={() => onEdit(item)}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
              >
                <MaterialCommunityIcons
                  name="pencil"
                  size={18}
                  color={tc.primary}
                />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("reorder.dismissItem")} ${item.productName}`}
              style={styles.actionButton}
              onPress={() => onDismiss(item)}
              hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
            >
              <MaterialCommunityIcons
                name="close-circle-outline"
                size={18}
                color={tc.error}
              />
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// =============================================================================
// STYLES
// =============================================================================

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    containerSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.accentSoft,
    },
    containerCritical: {
      borderLeftWidth: 4,
      borderLeftColor: colors.error,
    },
    checkboxContainer: {
      marginRight: theme.spacing.md,
      justifyContent: "flex-start",
      paddingTop: 2,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: theme.borderRadius.sm,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    content: {
      flex: 1,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    productName: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
      marginRight: theme.spacing.sm,
    },
    criticalBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.errorSoft,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.sm,
      gap: 2,
    },
    criticalText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.error,
    },
    barcode: {
      fontSize: 11,
      color: colors.textTertiary,
      marginBottom: theme.spacing.sm,
    },
    stockRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.backgroundSecondary,
      borderRadius: theme.borderRadius.sm,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    stockItem: {
      alignItems: "center",
      flex: 1,
    },
    stockArrow: {
      paddingHorizontal: 4,
    },
    stockLabel: {
      fontSize: 10,
      color: colors.textTertiary,
    },
    stockValue: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    stockValueCritical: {
      color: colors.error,
    },
    suggestionRow: {
      flexDirection: "row",
      gap: theme.spacing.md,
      marginBottom: theme.spacing.xs,
    },
    paymentTermsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginBottom: theme.spacing.sm,
    },
    paymentTermsText: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    suggestionItem: {
      flex: 1,
    },
    suggestionLabel: {
      fontSize: 10,
      color: colors.textTertiary,
    },
    suggestionValue: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    supplierName: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.primary,
    },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    totalSection: {
      flex: 1,
    },
    totalLabel: {
      fontSize: 10,
      color: colors.textTertiary,
    },
    totalValue: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    actionsSection: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    actionButton: {
      padding: theme.spacing.xs,
    },
  });
}

export default PendingReorderCard;
