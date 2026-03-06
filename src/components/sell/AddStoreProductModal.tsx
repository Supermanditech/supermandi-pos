/**
 * AddStoreProductModal - SD-ONBOARD-002
 *
 * Modal for adding unknown barcodes to store catalog during SELL flow.
 * Two-speed capture:
 * - Fast Sell: Minimal fields for quick add (name, sell price, stock, unit)
 * - Digitisation: Full product capture (all fields including purchase price, variant, pack size)
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch
} from "react-native";
import {
  createStoreProduct,
  type StoreProductResponse,
  type ScanResolvePrefill,
  type DigitisationMode
} from "../../services/api/scanApi";
// T-127: Modal back handler for Android hardware back button
import { useModalBackHandler } from "../../hooks/useModalBackHandler";
import { colors } from "../../theme/colors";

export type AddStoreProductRequest = {
  barcode: string;
  prefill?: ScanResolvePrefill | null;
};

type AddStoreProductModalProps = {
  visible: boolean;
  request: AddStoreProductRequest | null;
  onClose: () => void;
  onSuccess: (product: StoreProductResponse, addToCart: boolean) => void;
};

const UNIT_OPTIONS = ["pcs", "kg", "g", "litre", "ml", "pack", "box", "dozen"];

type TabMode = "FAST_SELL" | "DIGITISATION";

export function AddStoreProductModal({
  visible,
  request,
  onClose,
  onSuccess
}: AddStoreProductModalProps) {
  // T-127: Close modal on Android hardware back button
  useModalBackHandler(visible, onClose);

  const [activeTab, setActiveTab] = useState<TabMode>("FAST_SELL");
  const [name, setName] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [initialStock, setInitialStock] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [variant, setVariant] = useState("");
  const [packSize, setPackSize] = useState("");
  const [description, setDescription] = useState("");
  const [stockUnknown, setStockUnknown] = useState(false);
  const [busy, setBusy] = useState(false);
  // ISSUE-145: Synchronous double-submit guard
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when request changes
  useEffect(() => {
    if (!request) return;

    const prefill = request.prefill;
    setActiveTab("FAST_SELL");
    setName(prefill?.name || "");
    setSellPrice("");
    setMrp("");
    setPurchasePrice("");
    setInitialStock("1");
    setUnit(prefill?.unit || "pcs");
    setVariant(prefill?.variant || "");
    // CONTRACT-LOCK-STORE-PROD-001: packSize is now number | null from backend
    setPackSize(prefill?.packSize != null ? String(prefill.packSize) : "");
    setDescription(prefill?.description || "");
    setStockUnknown(false);
    setError(null);
    busyRef.current = false; // ISSUE-145
    setBusy(false);
  }, [request]);

  const handleSellPriceChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    setSellPrice(cleaned);
    setError(null);
  }, []);

  const handleMrpChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    setMrp(cleaned);
  }, []);

  const handlePurchasePriceChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, "");
    setPurchasePrice(cleaned);
    setError(null);
  }, []);

  const handleStockChange = useCallback((text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "");
    setInitialStock(cleaned);
    setError(null);
  }, []);

  const handleStockUnknownToggle = useCallback((value: boolean) => {
    setStockUnknown(value);
    if (value) {
      setInitialStock("0");
    } else {
      setInitialStock("1");
    }
  }, []);

  const validateForm = useCallback((): string | null => {
    if (!request?.barcode) {
      return "Barcode is missing";
    }

    const parsedSellPrice = parseFloat(sellPrice);
    if (!sellPrice || isNaN(parsedSellPrice) || parsedSellPrice <= 0) {
      return "Please enter a valid sell price";
    }

    if (!stockUnknown) {
      const parsedStock = parseInt(initialStock, 10);
      if (isNaN(parsedStock) || parsedStock < 0) {
        return "Please enter a valid stock quantity";
      }
    }

    // Digitisation mode requires additional fields
    if (activeTab === "DIGITISATION") {
      const parsedPurchasePrice = parseFloat(purchasePrice);
      if (!purchasePrice || isNaN(parsedPurchasePrice) || parsedPurchasePrice < 0) {
        return "Please enter a valid purchase price";
      }
    }

    return null;
  }, [request, sellPrice, initialStock, stockUnknown, activeTab, purchasePrice]);

  const handleSubmit = useCallback(async (addToCart: boolean) => {
    // ISSUE-145: Synchronous double-submit guard
    if (busyRef.current) return;
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!request) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);

    try {
      // Convert rupees to paise (minor units)
      const sellPriceMinor = Math.round(parseFloat(sellPrice) * 100);
      const mrpMinor = mrp ? Math.round(parseFloat(mrp) * 100) : undefined;
      const purchasePriceMinor = purchasePrice ? Math.round(parseFloat(purchasePrice) * 100) : undefined;
      const stockQty = stockUnknown ? 0 : parseInt(initialStock, 10);

      const mode: DigitisationMode = activeTab;

      const result = await createStoreProduct({
        barcode: request.barcode,
        mode,
        name: name.trim() || `Item ${request.barcode.slice(-4)}`,
        sellPrice: sellPriceMinor,
        mrp: mrpMinor,
        purchasePrice: purchasePriceMinor,
        initialStockQty: stockQty,
        unit,
        variant: variant.trim() || undefined,
        // CONTRACT-LOCK-STORE-PROD-001: packSize expects number, convert from string
        packSize: packSize.trim() ? parseInt(packSize.trim(), 10) || undefined : undefined,
        brand: request.prefill?.brand,
        description: description.trim() || request.prefill?.description
      });

      if (result.success) {
        onSuccess(result.storeProduct, addToCart);
      } else {
        // Conflict - barcode already exists, use existing product
        onSuccess(result.existingProduct, addToCart);
      }
    } catch (err) {
      console.error("[AddStoreProductModal] Error creating product:", err);
      setError("Failed to add product. Please try again.");
    } finally {
      busyRef.current = false; // ISSUE-145
      setBusy(false);
    }
  }, [request, name, sellPrice, mrp, purchasePrice, initialStock, unit, variant, packSize, description, stockUnknown, activeTab, validateForm, onSuccess]);

  const handleSaveAndAddToCart = useCallback(() => {
    handleSubmit(true);
  }, [handleSubmit]);

  const handleSaveOnly = useCallback(() => {
    handleSubmit(false);
  }, [handleSubmit]);

  if (!visible || !request) {
    return null;
  }

  const hasPrefill = Boolean(request.prefill?.name);
  const prefillSource = request.prefill?.source;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.backdrop} onPress={onClose} disabled={busy} />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add product to store</Text>
            <Text style={styles.barcode}>{request.barcode}</Text>
            {hasPrefill && prefillSource === "platform_catalog" && (
              <Text style={styles.prefillHint}>Prefilled from SuperMandi catalog</Text>
            )}
            {hasPrefill && prefillSource === "other_store" && (
              <Text style={styles.prefillHint}>Prefilled from other store (no prices)</Text>
            )}
            {hasPrefill && prefillSource !== "platform_catalog" && prefillSource !== "other_store" && (
              <Text style={styles.prefillHint}>Found in barcode database</Text>
            )}
            {!hasPrefill && (
              <Text style={styles.notFoundHint}>Enter product details manually</Text>
            )}
          </View>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <Pressable
              style={[styles.tab, activeTab === "FAST_SELL" && styles.tabActive]}
              onPress={() => !busy && setActiveTab("FAST_SELL")}
              disabled={busy}
            >
              <Text style={[styles.tabText, activeTab === "FAST_SELL" && styles.tabTextActive]}>
                Fast Sell
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, activeTab === "DIGITISATION" && styles.tabActive]}
              onPress={() => !busy && setActiveTab("DIGITISATION")}
              disabled={busy}
            >
              <Text style={[styles.tabText, activeTab === "DIGITISATION" && styles.tabTextActive]}>
                Digitisation
              </Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Product Name */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Product name {activeTab === "DIGITISATION" && <Text style={styles.required}>*</Text>}
              </Text>
              <TextInput
                style={[styles.input, busy && styles.inputDisabled]}
                value={name}
                onChangeText={setName}
                placeholder={hasPrefill ? request.prefill?.name : "Enter product name"}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                editable={!busy}
              />
            </View>

            {/* Sell Price (Required) */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Sell price <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.priceInputRow}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={[styles.input, styles.priceInput, busy && styles.inputDisabled]}
                  value={sellPrice}
                  onChangeText={handleSellPriceChange}
                  placeholder="0.00"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="decimal-pad"
                  editable={!busy}
                  autoFocus
                />
              </View>
            </View>

            {/* Digitisation-only fields */}
            {activeTab === "DIGITISATION" && (
              <>
                {/* Purchase Price (Required for Digitisation) */}
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Purchase price <Text style={styles.required}>*</Text>
                  </Text>
                  <View style={styles.priceInputRow}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      style={[styles.input, styles.priceInput, busy && styles.inputDisabled]}
                      value={purchasePrice}
                      onChangeText={handlePurchasePriceChange}
                      placeholder="0.00"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="decimal-pad"
                      editable={!busy}
                    />
                  </View>
                </View>

                {/* MRP */}
                <View style={styles.field}>
                  <Text style={styles.label}>MRP (optional)</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      style={[styles.input, styles.priceInput, busy && styles.inputDisabled]}
                      value={mrp}
                      onChangeText={handleMrpChange}
                      placeholder="0.00"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="decimal-pad"
                      editable={!busy}
                    />
                  </View>
                </View>

                {/* Variant */}
                <View style={styles.field}>
                  <Text style={styles.label}>Variant (optional)</Text>
                  <TextInput
                    style={[styles.input, busy && styles.inputDisabled]}
                    value={variant}
                    onChangeText={setVariant}
                    placeholder="e.g., Red, Large, 500ml"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                    editable={!busy}
                  />
                </View>

                {/* Pack Size */}
                <View style={styles.field}>
                  <Text style={styles.label}>Pack size (optional)</Text>
                  <TextInput
                    style={[styles.input, busy && styles.inputDisabled]}
                    value={packSize}
                    onChangeText={setPackSize}
                    placeholder="e.g., 500g, 1L, 12 pcs"
                    placeholderTextColor={colors.textTertiary}
                    editable={!busy}
                  />
                </View>

                {/* Description */}
                <View style={styles.field}>
                  <Text style={styles.label}>Description (optional)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, busy && styles.inputDisabled]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Product description"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={2}
                    editable={!busy}
                  />
                </View>
              </>
            )}

            {/* Unit Selector */}
            <View style={styles.field}>
              <Text style={styles.label}>Unit</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.unitScroll}
              >
                {UNIT_OPTIONS.map((u) => (
                  <Pressable
                    key={u}
                    style={[
                      styles.unitChip,
                      unit === u && styles.unitChipSelected,
                      busy && styles.chipDisabled
                    ]}
                    onPress={() => !busy && setUnit(u)}
                  >
                    <Text style={[
                      styles.unitChipText,
                      unit === u && styles.unitChipTextSelected
                    ]}>
                      {u}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Initial Stock */}
            <View style={styles.field}>
              <View style={styles.stockHeader}>
                <Text style={styles.label}>
                  Initial stock <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.unknownToggle}>
                  <Text style={styles.unknownLabel}>I don't know</Text>
                  <Switch
                    value={stockUnknown}
                    onValueChange={handleStockUnknownToggle}
                    disabled={busy}
                    trackColor={{ false: colors.borderDark, true: colors.success }}
                    thumbColor={colors.surface}
                  />
                </View>
              </View>
              {!stockUnknown && (
                <TextInput
                  style={[styles.input, busy && styles.inputDisabled]}
                  value={initialStock}
                  onChangeText={handleStockChange}
                  placeholder="Enter quantity"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  editable={!busy}
                />
              )}
              {stockUnknown && (
                <Text style={styles.unknownStockNote}>
                  Stock will be marked as unknown. You can update it later.
                </Text>
              )}
            </View>
          </ScrollView>

          {/* Error Message */}
          {error && (
            <Text style={styles.error}>{error}</Text>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondaryButton, busy && styles.buttonDisabled]}
              onPress={handleSaveOnly}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>Save Only</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.button, styles.primaryButton, busy && styles.buttonDisabled]}
              onPress={handleSaveAndAddToCart}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Text style={styles.primaryButtonText}>Save & Add to Cart</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: Platform.OS === "ios" ? 34 : 16
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderDark,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary
  },
  barcode: {
    fontSize: 14,
    color: colors.textTertiary,
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace"
  },
  prefillHint: {
    fontSize: 12,
    color: colors.success,
    marginTop: 4
  },
  notFoundHint: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 4
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    alignItems: "center"
  },
  tabActive: {
    backgroundColor: colors.primary
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textTertiary
  },
  tabTextActive: {
    color: colors.textInverse
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16
  },
  field: {
    marginBottom: 16
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 8
  },
  required: {
    color: colors.error
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface
  },
  inputDisabled: {
    backgroundColor: colors.backgroundSecondary,
    color: colors.textTertiary
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: "top"
  },
  priceInputRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textTertiary,
    marginRight: 8
  },
  priceInput: {
    flex: 1
  },
  unitScroll: {
    flexDirection: "row"
  },
  unitChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.backgroundTertiary,
    marginRight: 8
  },
  unitChipSelected: {
    backgroundColor: colors.primary
  },
  chipDisabled: {
    opacity: 0.5
  },
  unitChipText: {
    fontSize: 14,
    color: colors.textTertiary
  },
  unitChipTextSelected: {
    color: colors.textInverse,
    fontWeight: "600"
  },
  stockHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  unknownToggle: {
    flexDirection: "row",
    alignItems: "center"
  },
  unknownLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginRight: 8
  },
  unknownStockNote: {
    fontSize: 12,
    color: colors.warning,
    fontStyle: "italic",
    marginTop: 4
  },
  error: {
    color: colors.error,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 20,
    marginBottom: 8
  },
  actions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButton: {
    backgroundColor: colors.primary
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary
  },
  buttonDisabled: {
    opacity: 0.6
  },
  primaryButtonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "600"
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "600"
  }
});
