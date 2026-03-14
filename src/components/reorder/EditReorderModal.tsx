// EditReorderModal - V3.0.9 compliant
// Modal for editing pending reorder quantity and supplier

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme, useThemeColors } from "../../theme";
import { formatMoney } from "../../utils/money";
import { QuantityPicker } from "../buy/QuantityPicker";
import type { PendingReorder } from "../../services/api/reorderApi";
import * as catalogApi from "../../services/api/catalogApi";
import type { CatalogSupplier } from "../../services/api/catalogApi";
import { getDeviceStoreId } from "../../services/deviceSession";
// T-127: Modal back handler for Android hardware back button
import { useModalBackHandler } from "../../hooks/useModalBackHandler";

// =============================================================================
// TYPES
// =============================================================================

export interface EditReorderModalProps {
  visible: boolean;
  item: PendingReorder | null;
  onSave: (updates: PendingReorderUpdates) => Promise<void>;
  onClose: () => void;
}

export interface PendingReorderUpdates {
  id: string;
  suggestedQuantity: number;
  suggestedSupplierId: string | null;
  suggestedSupplierName: string | null;
  suggestedUnitPrice: number | null;
  supplierProductId: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EditReorderModal({
  visible,
  item,
  onSave,
  onClose,
}: EditReorderModalProps) {
  // T-127: Close modal on Android hardware back button
  useModalBackHandler(visible, onClose);

  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);

  const insets = useSafeAreaInsets();

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedSupplier, setSelectedSupplier] = useState<CatalogSupplier | null>(null);
  const [availableSuppliers, setAvailableSuppliers] = useState<CatalogSupplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load store ID
  useEffect(() => {
    getDeviceStoreId().then(setStoreId);
  }, []);

  // Reset state when modal opens
  // ISSUE-141: Removed loadSuppliers() from here — second effect handles all supplier loading
  useEffect(() => {
    if (visible && item) {
      setQuantity(item.suggestedQuantity);
      setSelectedSupplier(null);
      setAvailableSuppliers([]);
      setError(null);
    }
  }, [visible, item]);

  // Load available suppliers for this product
  const loadSuppliers = useCallback(async () => {
    if (!storeId || !item) return;

    setLoadingSuppliers(true);
    setError(null);

    try {
      const suppliers = await catalogApi.getProductSuppliers(storeId, item.productId);
      setAvailableSuppliers(suppliers);

      // Select current supplier if available
      if (item.suggestedSupplierId) {
        const current = suppliers.find((s) => s.supplierId === item.suggestedSupplierId);
        if (current) {
          setSelectedSupplier(current);
        } else if (suppliers.length > 0) {
          setSelectedSupplier(suppliers[0]);
        }
      } else if (suppliers.length > 0) {
        setSelectedSupplier(suppliers[0]);
      }
    } catch (err) {
      if (__DEV__) console.error("[EditReorderModal] Failed to load suppliers:", err);
      setError("Failed to load suppliers");

      // Create a placeholder supplier from current data
      if (item.suggestedSupplierId && item.suggestedSupplierName) {
        setSelectedSupplier({
          supplierId: item.suggestedSupplierId,
          supplierName: item.suggestedSupplierName,
          supplierProductId: item.supplierProductId || "",
          purchasePrice: item.suggestedUnitPrice || 0,
          moq: 1,
          stockQuantity: 0,
          stockStatus: "unknown",
          isPreferred: false,
        });
      }
    } finally {
      setLoadingSuppliers(false);
    }
  }, [storeId, item]);

  // Reload suppliers when storeId becomes available
  useEffect(() => {
    if (storeId && visible && item && availableSuppliers.length === 0) {
      loadSuppliers();
    }
  }, [storeId, visible, item, availableSuppliers.length, loadSuppliers]);

  // Calculate prices
  const originalTotal = useMemo(() => {
    if (!item || !item.suggestedUnitPrice) return 0;
    return item.suggestedQuantity * item.suggestedUnitPrice;
  }, [item]);

  const newUnitPrice = selectedSupplier?.purchasePrice ?? item?.suggestedUnitPrice ?? 0;
  const newTotal = quantity * newUnitPrice;
  const priceDifference = newTotal - originalTotal;

  // Check if anything changed
  const hasChanges = useMemo(() => {
    if (!item) return false;
    const qtyChanged = quantity !== item.suggestedQuantity;
    const supplierChanged = selectedSupplier?.supplierId !== item.suggestedSupplierId;
    return qtyChanged || supplierChanged;
  }, [item, quantity, selectedSupplier]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!item || !hasChanges) return;

    setSaving(true);
    setError(null);

    try {
      await onSave({
        id: item.id,
        suggestedQuantity: quantity,
        suggestedSupplierId: selectedSupplier?.supplierId ?? null,
        suggestedSupplierName: selectedSupplier?.supplierName ?? null,
        suggestedUnitPrice: selectedSupplier?.purchasePrice ?? null,
        supplierProductId: selectedSupplier?.supplierProductId ?? null,
      });
      onClose();
    } catch (err) {
      if (__DEV__) console.error("[EditReorderModal] Failed to save:", err);
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [item, hasChanges, quantity, selectedSupplier, onSave, onClose]);

  // Handle supplier select
  const handleSupplierSelect = useCallback((supplier: CatalogSupplier) => {
    setSelectedSupplier(supplier);
  }, []);

  if (!item) return null;

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
              color={tc.textPrimary}
            />
          </Pressable>
          <Text style={styles.headerTitle}>Edit Reorder</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Product Info */}
          <View style={styles.productCard}>
            <Text style={styles.productName}>{item.productName}</Text>
            {item.barcode && (
              <Text style={styles.barcode}>{item.barcode}</Text>
            )}
            <View style={styles.stockInfo}>
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Current Stock</Text>
                <Text style={styles.stockValue}>{item.currentStock}</Text>
              </View>
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Min Threshold</Text>
                <Text style={styles.stockValue}>{item.minThreshold}</Text>
              </View>
              <View style={styles.stockItem}>
                <Text style={styles.stockLabel}>Target Stock</Text>
                <Text style={styles.stockValue}>{item.targetStock}</Text>
              </View>
            </View>
          </View>

          {/* Quantity Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Order Quantity</Text>
            <View style={styles.quantityRow}>
              <QuantityPicker
                value={quantity}
                onChange={setQuantity}
                moq={1}
              />
              <View style={styles.quantityInfo}>
                <Text style={styles.quantityInfoLabel}>
                  Originally: {item.suggestedQuantity} units
                </Text>
              </View>
            </View>
          </View>

          {/* Supplier Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Supplier</Text>

            {loadingSuppliers ? (
              <View style={styles.loadingSuppliers}>
                <ActivityIndicator size="small" color={tc.primary} />
                <Text style={styles.loadingText}>Loading suppliers...</Text>
              </View>
            ) : availableSuppliers.length === 0 ? (
              <View style={styles.noSuppliers}>
                <MaterialCommunityIcons
                  name="store-off"
                  size={24}
                  color={tc.textTertiary}
                />
                <Text style={styles.noSuppliersText}>
                  No other suppliers available
                </Text>
                {selectedSupplier && (
                  <Text style={styles.currentSupplierText}>
                    Current: {selectedSupplier.supplierName}
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.supplierList}>
                {availableSuppliers.map((supplier) => {
                  const isSelected = selectedSupplier?.supplierId === supplier.supplierId;
                  const isOriginal = supplier.supplierId === item.suggestedSupplierId;

                  return (
                    <Pressable
                      key={supplier.supplierId}
                      style={[
                        styles.supplierOption,
                        isSelected && styles.supplierOptionSelected,
                      ]}
                      onPress={() => handleSupplierSelect(supplier)}
                    >
                      <View style={styles.supplierRadio}>
                        <View
                          style={[
                            styles.radioOuter,
                            isSelected && styles.radioOuterSelected,
                          ]}
                        >
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                      </View>

                      <View style={styles.supplierInfo}>
                        <View style={styles.supplierNameRow}>
                          <Text
                            style={[
                              styles.supplierName,
                              isSelected && styles.supplierNameSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {supplier.supplierName}
                          </Text>
                          {isOriginal && (
                            <View style={styles.originalBadge}>
                              <Text style={styles.originalBadgeText}>Current</Text>
                            </View>
                          )}
                          {supplier.isPreferred && (
                            <View style={styles.preferredBadge}>
                              <MaterialCommunityIcons
                                name="star"
                                size={10}
                                color={tc.warning}
                              />
                            </View>
                          )}
                        </View>

                        <View style={styles.supplierMeta}>
                          <Text style={styles.supplierPrice}>
                            {formatMoney(supplier.purchasePrice)}
                          </Text>
                          <Text style={styles.supplierStock}>
                            Stock: {supplier.stockQuantity}
                          </Text>
                          <Text style={styles.supplierMoq}>
                            MOQ: {supplier.moq}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Price Impact */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Price Impact</Text>
            <View style={styles.priceImpactCard}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Unit Price</Text>
                <Text style={styles.priceValue}>
                  {formatMoney(newUnitPrice)}
                </Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Quantity</Text>
                <Text style={styles.priceValue}>{"\u00D7"} {quantity}</Text>
              </View>
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.totalLabel}>New Total</Text>
                <Text style={styles.totalValue}>
                  {formatMoney(newTotal)}
                </Text>
              </View>
              {priceDifference !== 0 && (
                <View style={styles.differenceRow}>
                  <Text style={styles.differenceLabel}>
                    {priceDifference > 0 ? "Increase" : "Savings"}
                  </Text>
                  <Text
                    style={[
                      styles.differenceValue,
                      priceDifference > 0
                        ? styles.differenceIncrease
                        : styles.differenceSavings,
                    ]}
                  >
                    {priceDifference > 0 ? "+" : ""}
                    {formatMoney(priceDifference)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons
                name="alert-circle"
                size={16}
                color={tc.error}
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <Pressable
            style={styles.cancelButton}
            onPress={onClose}
            disabled={saving}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>

          <Pressable
            style={[
              styles.saveButton,
              (!hasChanges || saving) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={tc.textInverse} />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="check"
                  size={18}
                  color={tc.textInverse}
                />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
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
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
      color: colors.textPrimary,
    },
    headerRight: {
      width: 40,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: theme.spacing.md,
    },
    productCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    productName: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    barcode: {
      fontSize: 12,
      color: colors.textTertiary,
      marginBottom: theme.spacing.md,
    },
    stockInfo: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingTop: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    stockItem: {
      alignItems: "center",
    },
    stockLabel: {
      fontSize: 11,
      color: colors.textTertiary,
      marginBottom: 2,
    },
    stockValue: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    section: {
      marginBottom: theme.spacing.lg,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    quantityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
    },
    quantityInfo: {
      flex: 1,
    },
    quantityInfoLabel: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    loadingSuppliers: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    loadingText: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    noSuppliers: {
      alignItems: "center",
      padding: theme.spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
    },
    noSuppliersText: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: theme.spacing.sm,
    },
    currentSupplierText: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: theme.spacing.xs,
    },
    supplierList: {
      gap: theme.spacing.sm,
    },
    supplierOption: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: theme.spacing.md,
    },
    supplierOptionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.accentSoft,
    },
    supplierRadio: {
      marginRight: theme.spacing.md,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    radioOuterSelected: {
      borderColor: colors.primary,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    supplierInfo: {
      flex: 1,
    },
    supplierNameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: 4,
    },
    supplierName: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.textPrimary,
      flexShrink: 1,
    },
    supplierNameSelected: {
      color: colors.primary,
    },
    originalBadge: {
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.sm,
    },
    originalBadgeText: {
      fontSize: 10,
      color: colors.textTertiary,
    },
    preferredBadge: {
      backgroundColor: colors.warningSoft,
      padding: 4,
      borderRadius: theme.borderRadius.sm,
    },
    supplierMeta: {
      flexDirection: "row",
      gap: theme.spacing.md,
    },
    supplierPrice: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
    },
    supplierStock: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    supplierMoq: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    priceImpactCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
    },
    priceRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.sm,
    },
    priceLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    priceValue: {
      fontSize: 14,
      color: colors.textPrimary,
    },
    priceDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: theme.spacing.sm,
    },
    totalLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    totalValue: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    differenceRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: theme.spacing.sm,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    differenceLabel: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    differenceValue: {
      fontSize: 14,
      fontWeight: "600",
    },
    differenceIncrease: {
      color: colors.error,
    },
    differenceSavings: {
      color: colors.success,
    },
    errorContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.errorSoft,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    errorText: {
      fontSize: 13,
      color: colors.error,
      flex: 1,
    },
    footer: {
      flexDirection: "row",
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    cancelButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    saveButton: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.borderRadius.md,
      backgroundColor: colors.primary,
      gap: theme.spacing.xs,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textInverse,
    },
  });
}

export default EditReorderModal;
