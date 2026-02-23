// PendingReorderCard - V3.0.9 compliant
// Card showing pending reorder with selection checkbox

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { theme } from "../../theme";
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
  const isCritical = isCriticallyLow(item);
  const estimatedTotal = getEstimatedTotal(item);

  return (
    <Pressable
      style={[
        styles.container,
        selected && styles.containerSelected,
        isCritical && styles.containerCritical,
      ]}
      onPress={() => onToggleSelect(item.id)}
    >
      {/* Checkbox */}
      <Pressable
        style={styles.checkboxContainer}
        onPress={() => onToggleSelect(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && (
            <MaterialCommunityIcons
              name="check"
              size={16}
              color={theme.colors.textInverse}
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
                color={theme.colors.error}
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
              color={theme.colors.textTertiary}
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
              color={theme.colors.textTertiary}
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
              color={theme.colors.textTertiary}
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
                style={styles.actionButton}
                onPress={() => onEdit(item)}
                hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
              >
                <MaterialCommunityIcons
                  name="pencil"
                  size={18}
                  color={theme.colors.primary}
                />
              </Pressable>
            )}
            <Pressable
              style={styles.actionButton}
              onPress={() => onDismiss(item)}
              hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
            >
              <MaterialCommunityIcons
                name="close-circle-outline"
                size={18}
                color={theme.colors.error}
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

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  containerSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.accentSoft,
  },
  containerCritical: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
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
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
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
    color: theme.colors.textPrimary,
    marginRight: theme.spacing.sm,
  },
  criticalBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.errorSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
    gap: 2,
  },
  criticalText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.error,
  },
  barcode: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.sm,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
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
    color: theme.colors.textTertiary,
  },
  stockValue: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  stockValueCritical: {
    color: theme.colors.error,
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
    color: theme.colors.textTertiary,
  },
  suggestionItem: {
    flex: 1,
  },
  suggestionLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
  suggestionValue: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  supplierName: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.primary,
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
    color: theme.colors.textTertiary,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  actionsSection: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  actionButton: {
    padding: theme.spacing.xs,
  },
});

export default PendingReorderCard;
