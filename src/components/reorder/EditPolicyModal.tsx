// EditPolicyModal - V3.0.9 compliant
// Modal for editing reorder policy (min, target, preferred supplier)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme, useThemeColors } from "../../theme";
import type { ReorderPolicy, UpdatePolicyRequest } from "../../services/api/reorderApi";
import * as catalogApi from "../../services/api/catalogApi";
import type { CatalogSupplier } from "../../services/api/catalogApi";
import { getDeviceStoreId } from "../../services/deviceSession";
// T-127: Modal back handler for Android hardware back button
import { useModalBackHandler } from "../../hooks/useModalBackHandler";

// =============================================================================
// TYPES
// =============================================================================

export interface EditPolicyModalProps {
  visible: boolean;
  policy: ReorderPolicy | null;
  onSave: (productId: string, updates: UpdatePolicyRequest) => Promise<void>;
  onClose: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EditPolicyModal({
  visible,
  policy,
  onSave,
  onClose,
}: EditPolicyModalProps) {
  // T-127: Close modal on Android hardware back button
  useModalBackHandler(visible, onClose);

  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);

  const insets = useSafeAreaInsets();

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [minThreshold, setMinThreshold] = useState("");
  const [targetStock, setTargetStock] = useState("");
  const [maxReorderQty, setMaxReorderQty] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [availableSuppliers, setAvailableSuppliers] = useState<CatalogSupplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load store ID
  useEffect(() => {
    getDeviceStoreId().then(setStoreId);
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (visible && policy) {
      setMinThreshold(String(policy.minThreshold));
      setTargetStock(String(policy.targetStock));
      setMaxReorderQty(policy.maxReorderQty ? String(policy.maxReorderQty) : "");
      setSelectedSupplierId(policy.preferredSupplierId);
      setError(null);
      loadSuppliers();
    }
  }, [visible, policy]);

  // Load available suppliers for this product
  const loadSuppliers = useCallback(async () => {
    if (!storeId || !policy) return;

    setLoadingSuppliers(true);

    try {
      const suppliers = await catalogApi.getProductSuppliers(storeId, policy.productId);
      setAvailableSuppliers(suppliers);
    } catch (err) {
      if (__DEV__) console.error("[EditPolicyModal] Failed to load suppliers:", err);
      // Keep empty list, user can still set other fields
    } finally {
      setLoadingSuppliers(false);
    }
  }, [storeId, policy]);

  // Reload suppliers when storeId becomes available
  useEffect(() => {
    if (storeId && visible && policy && availableSuppliers.length === 0) {
      loadSuppliers();
    }
  }, [storeId, visible, policy, availableSuppliers.length, loadSuppliers]);

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    const min = parseInt(minThreshold, 10);
    const target = parseInt(targetStock, 10);
    const maxQty = maxReorderQty ? parseInt(maxReorderQty, 10) : null;

    if (isNaN(min) || min < 0) {
      errors.push("Min threshold must be a positive number");
    }
    if (isNaN(target) || target < 0) {
      errors.push("Target stock must be a positive number");
    }
    if (!isNaN(min) && !isNaN(target) && target < min) {
      errors.push("Target stock must be greater than min threshold");
    }
    if (maxQty !== null && (isNaN(maxQty) || maxQty <= 0)) {
      errors.push("Max reorder qty must be a positive number");
    }

    return errors;
  }, [minThreshold, targetStock, maxReorderQty]);

  const isValid = validationErrors.length === 0;

  // Check if anything changed
  const hasChanges = useMemo(() => {
    if (!policy) return false;

    const min = parseInt(minThreshold, 10);
    const target = parseInt(targetStock, 10);

    const maxQty = maxReorderQty ? parseInt(maxReorderQty, 10) : null;

    const minChanged = min !== policy.minThreshold;
    const targetChanged = target !== policy.targetStock;
    const maxQtyChanged = maxQty !== policy.maxReorderQty;
    const supplierChanged = selectedSupplierId !== policy.preferredSupplierId;

    return minChanged || targetChanged || maxQtyChanged || supplierChanged;
  }, [policy, minThreshold, targetStock, maxReorderQty, selectedSupplierId]);

  // Get selected supplier name
  const selectedSupplierName = useMemo(() => {
    if (!selectedSupplierId) return null;
    const supplier = availableSuppliers.find((s) => s.supplierId === selectedSupplierId);
    return supplier?.supplierName ?? policy?.preferredSupplierName ?? null;
  }, [selectedSupplierId, availableSuppliers, policy]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!policy || !isValid || !hasChanges) return;

    setSaving(true);
    setError(null);

    try {
      const updates: UpdatePolicyRequest = {
        minThreshold: parseInt(minThreshold, 10),
        targetStock: parseInt(targetStock, 10),
        maxReorderQty: maxReorderQty ? parseInt(maxReorderQty, 10) : null,
        preferredSupplierId: selectedSupplierId,
      };

      await onSave(policy.productId, updates);
      onClose();
    } catch (err) {
      if (__DEV__) console.error("[EditPolicyModal] Failed to save:", err);
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [policy, isValid, hasChanges, minThreshold, targetStock, selectedSupplierId, onSave, onClose]);

  // Handle supplier select
  const handleSupplierSelect = useCallback((supplierId: string | null) => {
    setSelectedSupplierId(supplierId);
  }, []);

  if (!policy) return null;

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
          <Text style={styles.headerTitle}>Edit Policy</Text>
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
            <Text style={styles.productName}>{policy.productName}</Text>
            {policy.barcode && (
              <Text style={styles.barcode}>{policy.barcode}</Text>
            )}
            <View style={styles.currentStockRow}>
              <MaterialCommunityIcons
                name="package-variant"
                size={16}
                color={tc.textTertiary}
              />
              <Text style={styles.currentStockText}>
                Current Stock: <Text style={styles.currentStockValue}>{policy.currentStock}</Text>
              </Text>
            </View>
          </View>

          {/* Thresholds Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stock Thresholds</Text>

            {/* Min Threshold Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Minimum Stock Level</Text>
              <Text style={styles.inputDescription}>
                Trigger reorder suggestion when stock falls below this level
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={minThreshold}
                  onChangeText={setMinThreshold}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={tc.textTertiary}
                />
                <Text style={styles.inputUnit}>units</Text>
              </View>
            </View>

            {/* Target Stock Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Target Stock Level</Text>
              <Text style={styles.inputDescription}>
                Recommended quantity to bring stock up to this level
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={targetStock}
                  onChangeText={setTargetStock}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={tc.textTertiary}
                />
                <Text style={styles.inputUnit}>units</Text>
              </View>
            </View>

            {/* Max Reorder Qty Input (T-242) */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Max Reorder Quantity</Text>
              <Text style={styles.inputDescription}>
                Cap suggested quantity at this limit (leave blank for no limit)
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={maxReorderQty}
                  onChangeText={setMaxReorderQty}
                  keyboardType="number-pad"
                  placeholder="No limit"
                  placeholderTextColor={tc.textTertiary}
                />
                <Text style={styles.inputUnit}>units</Text>
              </View>
            </View>

            {/* Visual Guide */}
            <View style={styles.thresholdGuide}>
              <View style={styles.guideBar}>
                <View
                  style={[
                    styles.guideSection,
                    styles.guideCritical,
                    { flex: 1 },
                  ]}
                />
                <View
                  style={[
                    styles.guideSection,
                    styles.guideLow,
                    { flex: 2 },
                  ]}
                />
                <View
                  style={[
                    styles.guideSection,
                    styles.guideTarget,
                    { flex: 3 },
                  ]}
                />
              </View>
              <View style={styles.guideLabels}>
                <Text style={styles.guideLabel}>0</Text>
                <Text style={styles.guideLabel}>Min: {minThreshold || "?"}</Text>
                <Text style={styles.guideLabel}>Target: {targetStock || "?"}</Text>
              </View>
            </View>
          </View>

          {/* Preferred Supplier Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferred Supplier</Text>
            <Text style={styles.sectionDescription}>
              This supplier will be used for reorder suggestions
            </Text>

            {loadingSuppliers ? (
              <View style={styles.loadingSuppliers}>
                <ActivityIndicator size="small" color={tc.primary} />
                <Text style={styles.loadingText}>Loading suppliers...</Text>
              </View>
            ) : (
              <View style={styles.supplierList}>
                {/* No Preference Option */}
                <Pressable
                  style={[
                    styles.supplierOption,
                    !selectedSupplierId && styles.supplierOptionSelected,
                  ]}
                  onPress={() => handleSupplierSelect(null)}
                >
                  <View style={styles.supplierRadio}>
                    <View
                      style={[
                        styles.radioOuter,
                        !selectedSupplierId && styles.radioOuterSelected,
                      ]}
                    >
                      {!selectedSupplierId && <View style={styles.radioInner} />}
                    </View>
                  </View>
                  <View style={styles.supplierInfo}>
                    <Text
                      style={[
                        styles.supplierName,
                        !selectedSupplierId && styles.supplierNameSelected,
                      ]}
                    >
                      No preference (auto-select best price)
                    </Text>
                  </View>
                </Pressable>

                {/* Available Suppliers */}
                {availableSuppliers.map((supplier) => {
                  const isSelected = selectedSupplierId === supplier.supplierId;

                  return (
                    <Pressable
                      key={supplier.supplierId}
                      style={[
                        styles.supplierOption,
                        isSelected && styles.supplierOptionSelected,
                      ]}
                      onPress={() => handleSupplierSelect(supplier.supplierId)}
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
                        <Text
                          style={[
                            styles.supplierName,
                            isSelected && styles.supplierNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {supplier.supplierName}
                        </Text>
                        <Text style={styles.supplierMeta}>
                          MOQ: {supplier.moq} | Stock: {supplier.stockQuantity}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}

                {availableSuppliers.length === 0 && (
                  <View style={styles.noSuppliers}>
                    <MaterialCommunityIcons
                      name="store-off"
                      size={20}
                      color={tc.textTertiary}
                    />
                    <Text style={styles.noSuppliersText}>
                      No linked suppliers for this product
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <View style={styles.validationErrors}>
              {validationErrors.map((err, idx) => (
                <View key={idx} style={styles.validationError}>
                  <MaterialCommunityIcons
                    name="alert-circle"
                    size={14}
                    color={tc.error}
                  />
                  <Text style={styles.validationErrorText}>{err}</Text>
                </View>
              ))}
            </View>
          )}

          {/* API Error */}
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
              (!hasChanges || !isValid || saving) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges || !isValid || saving}
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
      marginBottom: theme.spacing.sm,
    },
    currentStockRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    currentStockText: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    currentStockValue: {
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
      marginBottom: theme.spacing.xs,
    },
    sectionDescription: {
      fontSize: 12,
      color: colors.textTertiary,
      marginBottom: theme.spacing.md,
    },
    inputGroup: {
      marginBottom: theme.spacing.md,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.textSecondary,
      marginBottom: 2,
    },
    inputDescription: {
      fontSize: 11,
      color: colors.textTertiary,
      marginBottom: theme.spacing.sm,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    inputUnit: {
      fontSize: 13,
      color: colors.textTertiary,
      paddingRight: theme.spacing.md,
    },
    thresholdGuide: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
    },
    guideBar: {
      flexDirection: "row",
      height: 8,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: theme.spacing.xs,
    },
    guideSection: {
      height: "100%",
    },
    guideCritical: {
      backgroundColor: colors.errorSoft,
    },
    guideLow: {
      backgroundColor: colors.warningSoft,
    },
    guideTarget: {
      backgroundColor: colors.successSoft,
    },
    guideLabels: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    guideLabel: {
      fontSize: 10,
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
    supplierName: {
      fontSize: 14,
      fontWeight: "500",
      color: colors.textPrimary,
    },
    supplierNameSelected: {
      color: colors.primary,
    },
    supplierMeta: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    noSuppliers: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    noSuppliersText: {
      fontSize: 13,
      color: colors.textTertiary,
    },
    validationErrors: {
      marginBottom: theme.spacing.md,
    },
    validationError: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.errorSoft,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    validationErrorText: {
      fontSize: 12,
      color: colors.error,
      flex: 1,
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

export default EditPolicyModal;
