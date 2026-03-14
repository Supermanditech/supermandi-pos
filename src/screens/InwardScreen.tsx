// InwardScreen - Manual Stock Inward
// GO-LIVE-004: Scan → Qty → Purchase Price → Supplier → Submit to Ledger

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useTranslation } from "react-i18next";

import { useInwardStore, type InwardItem, type InwardSupplier } from "../stores/inwardStore";
import { recordManualInward, type InventoryTransactionItem, getStockBatch } from "../services/api/inventoryApi";
import { getCatalog, type CatalogProduct } from "../services/api/catalogApi";
import { getSuppliers, type Supplier } from "../services/api/suppliersApi";
import { getDeviceStoreId } from "../services/deviceSession";
import { formatMoney } from "../utils/money";
import { theme, useThemeColors } from "../theme";

// GO-LIVE-235: High stock threshold for warning
const HIGH_STOCK_THRESHOLD = 100;

interface InwardScreenProps {
  storeActive: boolean | null;
  scanDisabled: boolean;
  onOpenScanner: () => void;
  onBack?: () => void;
}

// TICKET-001: SupplierPicker now uses API-fetched suppliers
function SupplierPicker({
  selectedSupplier,
  onSelect,
  visible,
  onClose,
  suppliers,
  suppliersLoading,
}: {
  selectedSupplier: InwardSupplier | null;
  onSelect: (supplier: InwardSupplier | null) => void;
  visible: boolean;
  onClose: () => void;
  suppliers: InwardSupplier[];
  suppliersLoading: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.pickerSheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>{t("inward.selectSupplierTitle")}</Text>

          <Pressable
            accessibilityRole="button"
            style={[styles.pickerOption, !selectedSupplier && styles.pickerOptionSelected]}
            onPress={() => {
              onSelect(null);
              onClose();
            }}
          >
            <Text style={styles.pickerOptionText}>{t("inward.noSupplier")}</Text>
            {!selectedSupplier && (
              <MaterialCommunityIcons name="check" size={20} color={colors.primary} />
            )}
          </Pressable>

          {suppliersLoading ? (
            <View style={styles.suppliersLoading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.suppliersLoadingText}>{t("inward.loadingSuppliers")}</Text>
            </View>
          ) : suppliers.length === 0 ? (
            <Text style={styles.noSuppliersText}>{t("inward.noSuppliers")}</Text>
          ) : (
            suppliers.map((supplier) => (
              <Pressable
                accessibilityRole="button"
                key={supplier.id}
                style={[
                  styles.pickerOption,
                  selectedSupplier?.id === supplier.id && styles.pickerOptionSelected,
                ]}
                onPress={() => {
                  onSelect(supplier);
                  onClose();
                }}
              >
                <Text style={styles.pickerOptionText}>{supplier.name}</Text>
                {selectedSupplier?.id === supplier.id && (
                  <MaterialCommunityIcons name="check" size={20} color={colors.primary} />
                )}
              </Pressable>
            ))
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

function InwardItemRow({
  item,
  onUpdateQty,
  onUpdatePrice,
  onUpdateBatch,
  onUpdateExpiry,
  onRemove,
}: {
  item: InwardItem;
  onUpdateQty: (qty: number) => void;
  onUpdatePrice: (priceMinor: number) => void;
  onUpdateBatch: (batchNumber: string) => void;
  onUpdateExpiry: (expiryDate: string) => void;
  onRemove: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [qtyText, setQtyText] = useState(String(item.quantity));
  const [priceText, setPriceText] = useState((item.purchasePriceMinor / 100).toFixed(2));
  // SCALE-C1: batch_number and expiry_date fields (optional)
  const [batchText, setBatchText] = useState(item.batchNumber ?? "");
  const [expiryText, setExpiryText] = useState(item.expiryDate ?? "");

  useEffect(() => {
    setQtyText(String(item.quantity));
  }, [item.quantity]);

  useEffect(() => {
    setPriceText((item.purchasePriceMinor / 100).toFixed(2));
  }, [item.purchasePriceMinor]);

  const lineTotal = formatMoney(item.purchasePriceMinor * item.quantity, "INR");

  // GO-LIVE-241: Calculate price difference from market rate
  const marketPrice = item.marketPriceMinor;
  const priceDiff = marketPrice ? ((item.purchasePriceMinor - marketPrice) / marketPrice) * 100 : null;
  const isPriceGood = priceDiff !== null && priceDiff <= 0;
  const isPriceBad = priceDiff !== null && priceDiff > 10; // More than 10% above market

  const handleQtyBlur = () => {
    const parsed = parseInt(qtyText, 10);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdateQty(parsed);
    } else {
      setQtyText(String(item.quantity));
    }
  };

  const handlePriceBlur = () => {
    const parsed = parseFloat(priceText);
    if (!isNaN(parsed) && parsed > 0) {
      onUpdatePrice(Math.round(parsed * 100));
    } else {
      setPriceText((item.purchasePriceMinor / 100).toFixed(2));
    }
  };

  // SCALE-C1: Batch number blur — trim and propagate (empty string treated as no-op)
  const handleBatchBlur = () => {
    const trimmed = batchText.trim();
    onUpdateBatch(trimmed);
  };

  // SCALE-C1: Expiry date blur — validate DD-MM-YYYY and convert to YYYY-MM-DD ISO
  const handleExpiryBlur = () => {
    const trimmed = expiryText.trim();
    if (!trimmed) {
      onUpdateExpiry("");
      return;
    }
    // Accept DD-MM-YYYY and convert to ISO
    const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
    if (ddmmyyyy) {
      const [, dd, mm, yyyy] = ddmmyyyy;
      onUpdateExpiry(`${yyyy}-${mm}-${dd}`);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      // Already ISO format
      onUpdateExpiry(trimmed);
    } else {
      // Invalid — clear
      setExpiryText("");
      onUpdateExpiry("");
    }
  };

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.itemMetaRow}>
          <Text style={styles.itemBarcode} numberOfLines={1}>
            {item.barcode}
          </Text>
          {/* GO-LIVE-241: Market price comparison badge */}
          {marketPrice && marketPrice > 0 && (
            <View style={[
              styles.marketBadge,
              isPriceGood && styles.marketBadgeGood,
              isPriceBad && styles.marketBadgeBad,
            ]}>
              <MaterialCommunityIcons
                name={isPriceGood ? "trending-down" : isPriceBad ? "trending-up" : "minus"}
                size={10}
                color={isPriceGood ? colors.success : isPriceBad ? colors.error : colors.textSecondary}
              />
              <Text style={[
                styles.marketBadgeText,
                isPriceGood && styles.marketBadgeTextGood,
                isPriceBad && styles.marketBadgeTextBad,
              ]}>
                {priceDiff !== null && priceDiff !== 0
                  ? t("inward.vsMarket", { pct: `${priceDiff > 0 ? "+" : ""}${priceDiff.toFixed(0)}` })
                  : t("inward.atMarket")
                }
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.itemControls}>
        <View style={styles.itemField}>
          <Text style={styles.itemFieldLabel}>{t("inward.qty")}</Text>
          <TextInput
            style={styles.itemInput}
            value={qtyText}
            onChangeText={setQtyText}
            onBlur={handleQtyBlur}
            keyboardType="numeric"
            selectTextOnFocus
          />
        </View>

        <View style={styles.itemField}>
          <Text style={styles.itemFieldLabel}>{t("inward.price")}</Text>
          <TextInput
            style={[styles.itemInput, styles.itemInputWide, isPriceBad && styles.itemInputWarning]}
            value={priceText}
            onChangeText={setPriceText}
            onBlur={handlePriceBlur}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
        </View>

        <View style={styles.itemTotalBlock}>
          <Text style={styles.itemTotalLabel}>{t("inward.total")}</Text>
          <Text style={styles.itemTotalValue}>{lineTotal}</Text>
        </View>

        <Pressable accessibilityLabel="Remove item" accessibilityRole="button" style={styles.removeButton} onPress={onRemove}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
        </Pressable>
      </View>

      {/* SCALE-C1: Optional batch/expiry fields for FEFO tracking */}
      <View style={styles.batchExpiryRow}>
        <View style={styles.batchField}>
          <Text style={styles.itemFieldLabel}>{t("inward.batchNumber")}</Text>
          <TextInput
            testID="batch-number-input"
            style={styles.batchInput}
            value={batchText}
            onChangeText={setBatchText}
            onBlur={handleBatchBlur}
            placeholder="e.g. MH-2026-03"
            placeholderTextColor={colors.textTertiary}
            keyboardType="default"
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.expiryField}>
          <Text style={styles.itemFieldLabel}>{t("inward.expiryDate")}</Text>
          <TextInput
            testID="expiry-date-input"
            style={styles.batchInput}
            value={expiryText}
            onChangeText={setExpiryText}
            onBlur={handleExpiryBlur}
            placeholder="DD-MM-YYYY"
            placeholderTextColor={colors.textTertiary}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        </View>
      </View>
    </View>
  );
}

export default function InwardScreen({
  storeActive,
  scanDisabled,
  onOpenScanner,
  onBack,
}: InwardScreenProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    items,
    selectedSupplier,
    notes,
    addItem,
    updateItem,
    removeItem,
    setSupplier,
    setNotes,
    clearCart,
    getTotal,
    getItemCount,
  } = useInwardStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // ISSUE-139: Ref-based double-submit guard (synchronous, not subject to React batching)
  const submittingRef = useRef(false);
  const searchInputRef = useRef<TextInput>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // TICKET-001: Fetch suppliers from API
  const [suppliers, setSuppliers] = useState<InwardSupplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const apiSuppliers = await getSuppliers();
        if (__DEV__) console.log("[InwardScreen] Suppliers fetched:", apiSuppliers?.length ?? 0);
        if (mounted && Array.isArray(apiSuppliers)) {
          // Map API Supplier to InwardSupplier format
          setSuppliers(apiSuppliers.map(s => ({ id: s.id, name: s.name })));
        }
      } catch (error) {
        if (__DEV__) console.error("[InwardScreen] Failed to fetch suppliers:", error);
      } finally {
        if (mounted) {
          setSuppliersLoading(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  const total = getTotal();
  const itemCount = getItemCount();
  const canSubmit = items.length > 0 && storeActive !== false && !submitting;

  // Search products
  const searchProducts = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) {
        setSearchResults([]);
        return;
      }

      const response = await getCatalog(storeId, { q: query, limit: 20 });
      setSearchResults(response.data);
    } catch (error) {
      if (__DEV__) console.error("Search failed:", error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (showSearch && searchQuery.trim().length >= 2) {
      searchDebounceRef.current = setTimeout(() => {
        searchProducts(searchQuery);
      }, 300);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, showSearch, searchProducts]);

  const handleAddProduct = (product: CatalogProduct) => {
    const bestSupplier = product.suppliers[0];
    const defaultPrice = bestSupplier?.purchasePrice ?? product.bestPrice ?? 0;
    // GO-LIVE-241: Use bestPrice as market reference
    const marketPrice = product.bestPrice ?? bestSupplier?.purchasePrice ?? 0;

    addItem({
      id: product.id,
      barcode: product.primaryBarcode ?? product.id,
      name: product.name,
      quantity: 1,
      purchasePriceMinor: defaultPrice,
      marketPriceMinor: marketPrice > 0 ? marketPrice : undefined,
    });

    setSearchQuery("");
    setShowSearch(false);
  };

  // GO-LIVE-235: Check inventory levels and warn if high stock
  const checkInventoryAndSubmit = async () => {
    if (!canSubmit) return;
    // ISSUE-139: Synchronous double-submit guard
    if (submittingRef.current) return;
    submittingRef.current = true;

    setSubmitting(true);
    try {
      // ISSUE-092: Add 10s timeout to stock check to prevent indefinite blocking
      const productIds = items.map((item) => item.id);
      const stockPromise = getStockBatch(productIds);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Stock check timed out")), 10000)
      );
      const stockResult = await Promise.race([stockPromise, timeoutPromise]);

      // Find items with high stock
      const highStockItems: string[] = [];
      for (const item of items) {
        const stock = stockResult[item.id];
        if (stock && stock.currentQty >= HIGH_STOCK_THRESHOLD) {
          highStockItems.push(`${item.name} (current: ${stock.currentQty})`);
        }
      }

      if (highStockItems.length > 0) {
        // Show warning but allow proceeding
        Alert.alert(
          t("inward.highStockWarning", "High Stock Warning"),
          t("inward.highStockMessage", "The following items already have high stock levels:\n\n{{items}}\n\nAre you sure you want to add more?", { items: highStockItems.join("\n") }),
          [
            { text: t("common.cancel", "Cancel"), style: "cancel", onPress: () => { submittingRef.current = false; setSubmitting(false); } },
            { text: t("inward.proceedAnyway", "Proceed Anyway"), onPress: () => doSubmit() },
          ]
        );
      } else {
        await doSubmit();
      }
    } catch (error) {
      // R6.POS.001: Block submission on stock check failure — no bypass allowed
      if (__DEV__) console.warn("[InwardScreen] Stock check failed:", error);
      submittingRef.current = false;
      setSubmitting(false);
      Alert.alert(
        t("inward.stockCheckFailed"),
        t("inward.stockCheckFailedMessage"),
        [
          { text: t("common.ok"), style: "cancel" },
        ]
      );
    }
  };

  const doSubmit = async () => {
    try {
      // SCALE-C1: Include batchNumber and expiryDate for FEFO tracking
      const txItems: InventoryTransactionItem[] = items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        unitCost: item.purchasePriceMinor,
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate || null,
      }));

      // ITER2-001 (AUD-074-A): Pass supplier object separately for structured storage
      // Notes field is now clean, supplier info stored in backend with structured format
      const userNotes = notes || "Manual stock inward";
      await recordManualInward(txItems, userNotes, selectedSupplier);

      Alert.alert(
        t("inward.successTitle"),
        t("inward.successMessage", { count: itemCount }),
        [
          {
            text: t("common.ok"),
            onPress: () => {
              clearCart();
              onBack?.();
            },
          },
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      Alert.alert(t("inward.failedTitle"), message);
    } finally {
      submittingRef.current = false; // ISSUE-139
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    void checkInventoryAndSubmit();
  };

  const renderSearchResult = ({ item }: { item: CatalogProduct }) => {
    const price = item.bestPrice > 0 ? formatMoney(item.bestPrice, "INR") : "--";

    return (
      <Pressable accessibilityRole="button" style={styles.searchRow} onPress={() => handleAddProduct(item)}>
        <MaterialCommunityIcons name="package-variant" size={18} color={colors.primary} />
        <View style={styles.searchRowInfo}>
          <Text style={styles.searchRowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.searchRowMeta} numberOfLines={1}>
            {item.primaryBarcode ?? item.name ?? item.id}
          </Text>
        </View>
        <Text style={styles.searchRowPrice}>{price}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
        <View style={styles.headerRow}>
          {onBack && (
            <Pressable accessibilityLabel="Go back" accessibilityRole="button" style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={colors.textPrimary} />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>{t("inward.title")}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Supplier Selector */}
        <Pressable accessibilityRole="button" style={styles.supplierSelector} onPress={() => setShowSupplierPicker(true)}>
          <MaterialCommunityIcons name="truck-delivery" size={18} color={colors.primary} />
          <Text style={styles.supplierText} numberOfLines={1}>
            {selectedSupplier?.name ?? t("inward.selectSupplier")}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, showSearch && styles.searchBarActive]}>
          <MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setShowSearch(true)}
            placeholder={t("inward.searchProduct")}
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
          />
          {searchQuery ? (
            <Pressable accessibilityLabel="Clear search" accessibilityRole="button" onPress={() => setSearchQuery("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          accessibilityLabel="Scan barcode"
          accessibilityRole="button"
          style={[styles.scanButton, scanDisabled && styles.buttonDisabled]}
          onPress={onOpenScanner}
          disabled={scanDisabled}
        >
          <MaterialCommunityIcons name="barcode-scan" size={20} color={colors.textInverse} />
        </Pressable>
      </View>

      {/* Search Results Dropdown */}
      {showSearch && (
        <>
          <Pressable accessibilityRole="button" style={styles.searchOverlay} onPress={() => setShowSearch(false)} />
          <View style={styles.searchDropdown}>
            {searchLoading ? (
              <View style={styles.searchLoading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                renderItem={renderSearchResult}
                style={styles.searchList}
                keyboardShouldPersistTaps="handled"
              />
            ) : searchQuery.trim().length >= 2 ? (
              <View style={styles.searchEmpty}>
                <Text style={styles.searchEmptyText}>{t("inward.noProducts")}</Text>
              </View>
            ) : (
              <View style={styles.searchEmpty}>
                <Text style={styles.searchEmptyText}>{t("inward.typeToSearch")}</Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* Cart Items */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <InwardItemRow
            item={item}
            onUpdateQty={(qty) => updateItem(item.id, { quantity: qty })}
            onUpdatePrice={(price) => updateItem(item.id, { purchasePriceMinor: price })}
            onUpdateBatch={(batchNumber) => updateItem(item.id, { batchNumber: batchNumber || null })}
            onUpdateExpiry={(expiryDate) => updateItem(item.id, { expiryDate: expiryDate || null })}
            onRemove={() => removeItem(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="package-variant" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>{t('inward.noItems')}</Text>
            <Text style={styles.emptySubtitle}>{t('inward.addItemsHint')}</Text>
          </View>
        }
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>{t("inward.itemsCount", { count: items.length })}</Text>
              <Pressable accessibilityRole="button" onPress={clearCart}>
                <Text style={styles.clearText}>{t("inward.clearAll")}</Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      {/* Notes Input */}
      {items.length > 0 && (
        <View style={styles.notesContainer}>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("inward.addNotes")}
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={2}
          />
        </View>
      )}

      {/* Bottom Action Bar */}
      <View style={[styles.actionBar, { paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t("inward.totalItems", { count: itemCount })}</Text>
          <Text style={styles.totalValue}>{formatMoney(total, "INR")}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          style={[styles.submitButton, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.submitText}>{t("inward.submitInward")}</Text>
          )}
        </Pressable>
      </View>

      {/* Supplier Picker Modal - TICKET-001: Using API suppliers */}
      <SupplierPicker
        selectedSupplier={selectedSupplier}
        onSelect={setSupplier}
        visible={showSupplierPicker}
        onClose={() => setShowSupplierPicker(false)}
        suppliers={suppliers}
        suppliersLoading={suppliersLoading}
      />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  supplierSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  supplierText: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchBarActive: {
    borderColor: colors.primary,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayLight,
    zIndex: 10,
  },
  searchDropdown: {
    position: "absolute",
    top: 140,
    left: 16,
    right: 16,
    maxHeight: 300,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 20,
    ...theme.shadows.md,
  },
  searchLoading: {
    padding: 24,
    alignItems: "center",
  },
  searchList: {
    maxHeight: 280,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchRowInfo: {
    flex: 1,
  },
  searchRowName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  searchRowMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  searchRowPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primaryDark,
  },
  searchEmpty: {
    padding: 24,
    alignItems: "center",
  },
  searchEmptyText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 200,
  },
  cartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  cartTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  clearText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.error,
  },
  itemRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  itemInfo: {
    marginBottom: 10,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  itemBarcode: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  // GO-LIVE-241: Market price comparison styles
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  marketBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
  },
  marketBadgeGood: {
    backgroundColor: colors.successSoft,
  },
  marketBadgeBad: {
    backgroundColor: colors.errorSoft,
  },
  marketBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  marketBadgeTextGood: {
    color: colors.success,
  },
  marketBadgeTextBad: {
    color: colors.error,
  },
  itemInputWarning: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  itemControls: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  itemField: {
    gap: 4,
  },
  itemFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  itemInput: {
    width: 50,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    textAlign: "center",
    color: colors.textPrimary,
  },
  itemInputWide: {
    width: 70,
  },
  // SCALE-C1: Batch number + expiry date fields
  batchExpiryRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  batchField: {
    flex: 2,
    gap: 4,
  },
  expiryField: {
    flex: 1,
    gap: 4,
  },
  batchInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: colors.textPrimary,
  },
  itemTotalBlock: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  itemTotalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  itemTotalValue: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primaryDark,
  },
  removeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  notesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  notesInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.textPrimary,
    minHeight: 60,
    textAlignVertical: "top",
  },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    ...theme.shadows.lg,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primaryDark,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.textInverse,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.overlay,
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  pickerHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 12,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight + "15",
  },
  pickerOptionText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  // TICKET-001: Supplier loading styles
  suppliersLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    gap: 10,
  },
  suppliersLoadingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  noSuppliersText: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: "center",
    paddingVertical: 16,
  },
}); }
