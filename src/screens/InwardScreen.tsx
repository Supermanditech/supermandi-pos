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
import { recordManualInward, type InventoryTransactionItem } from "../services/api/inventoryApi";
import { getCatalog, type CatalogProduct } from "../services/api/catalogApi";
import { getSuppliers, type Supplier } from "../services/api/suppliersApi";
import { getDeviceStoreId } from "../services/deviceSession";
import { formatMoney } from "../utils/money";
import { theme } from "../theme";

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
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={[styles.pickerSheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>Select Supplier</Text>

          <Pressable
            style={[styles.pickerOption, !selectedSupplier && styles.pickerOptionSelected]}
            onPress={() => {
              onSelect(null);
              onClose();
            }}
          >
            <Text style={styles.pickerOptionText}>No supplier (manual entry)</Text>
            {!selectedSupplier && (
              <MaterialCommunityIcons name="check" size={20} color={theme.colors.primary} />
            )}
          </Pressable>

          {suppliersLoading ? (
            <View style={styles.suppliersLoading}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.suppliersLoadingText}>Loading suppliers...</Text>
            </View>
          ) : suppliers.length === 0 ? (
            <Text style={styles.noSuppliersText}>No suppliers linked to this store</Text>
          ) : (
            suppliers.map((supplier) => (
              <Pressable
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
                  <MaterialCommunityIcons name="check" size={20} color={theme.colors.primary} />
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
  onRemove,
}: {
  item: InwardItem;
  onUpdateQty: (qty: number) => void;
  onUpdatePrice: (priceMinor: number) => void;
  onRemove: () => void;
}) {
  const [qtyText, setQtyText] = useState(String(item.quantity));
  const [priceText, setPriceText] = useState((item.purchasePriceMinor / 100).toFixed(2));

  useEffect(() => {
    setQtyText(String(item.quantity));
  }, [item.quantity]);

  useEffect(() => {
    setPriceText((item.purchasePriceMinor / 100).toFixed(2));
  }, [item.purchasePriceMinor]);

  const lineTotal = formatMoney(item.purchasePriceMinor * item.quantity, "INR");

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

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemBarcode} numberOfLines={1}>
          {item.barcode}
        </Text>
      </View>

      <View style={styles.itemControls}>
        <View style={styles.itemField}>
          <Text style={styles.itemFieldLabel}>Qty</Text>
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
          <Text style={styles.itemFieldLabel}>Price</Text>
          <TextInput
            style={[styles.itemInput, styles.itemInputWide]}
            value={priceText}
            onChangeText={setPriceText}
            onBlur={handlePriceBlur}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
        </View>

        <View style={styles.itemTotalBlock}>
          <Text style={styles.itemTotalLabel}>Total</Text>
          <Text style={styles.itemTotalValue}>{lineTotal}</Text>
        </View>

        <Pressable style={styles.removeButton} onPress={onRemove}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.colors.error} />
        </Pressable>
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
        console.log("[InwardScreen] Suppliers fetched:", apiSuppliers?.length ?? 0);
        if (mounted && Array.isArray(apiSuppliers)) {
          // Map API Supplier to InwardSupplier format
          setSuppliers(apiSuppliers.map(s => ({ id: s.id, name: s.name })));
        }
      } catch (error) {
        console.error("[InwardScreen] Failed to fetch suppliers:", error);
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
      console.error("Search failed:", error);
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

    addItem({
      id: product.id,
      barcode: product.primaryBarcode ?? product.id,
      name: product.name,
      quantity: 1,
      purchasePriceMinor: defaultPrice,
    });

    setSearchQuery("");
    setShowSearch(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const txItems: InventoryTransactionItem[] = items.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
        unitCost: item.purchasePriceMinor,
      }));

      const supplierNote = selectedSupplier
        ? `Supplier: ${selectedSupplier.name}. ${notes}`
        : notes || "Manual stock inward";

      await recordManualInward(txItems, supplierNote);

      Alert.alert(
        "Stock Inward Complete",
        `${itemCount} items added to inventory.`,
        [
          {
            text: "OK",
            onPress: () => {
              clearCart();
              onBack?.();
            },
          },
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Inward Failed", message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderSearchResult = ({ item }: { item: CatalogProduct }) => {
    const price = item.bestPrice > 0 ? formatMoney(item.bestPrice, "INR") : "--";

    return (
      <Pressable style={styles.searchRow} onPress={() => handleAddProduct(item)}>
        <MaterialCommunityIcons name="package-variant" size={18} color={theme.colors.primary} />
        <View style={styles.searchRowInfo}>
          <Text style={styles.searchRowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.searchRowMeta} numberOfLines={1}>
            {item.primaryBarcode ?? item.id}
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
            <Pressable style={styles.backButton} onPress={onBack}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.textPrimary} />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>Stock Inward</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Supplier Selector */}
        <Pressable style={styles.supplierSelector} onPress={() => setShowSupplierPicker(true)}>
          <MaterialCommunityIcons name="truck-delivery" size={18} color={theme.colors.primary} />
          <Text style={styles.supplierText} numberOfLines={1}>
            {selectedSupplier?.name ?? "Select supplier (optional)"}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, showSearch && styles.searchBarActive]}>
          <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textSecondary} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setShowSearch(true)}
            placeholder="Search product by name or barcode"
            placeholderTextColor={theme.colors.textTertiary}
            returnKeyType="search"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={[styles.scanButton, scanDisabled && styles.buttonDisabled]}
          onPress={onOpenScanner}
          disabled={scanDisabled}
        >
          <MaterialCommunityIcons name="barcode-scan" size={20} color={theme.colors.textInverse} />
        </Pressable>
      </View>

      {/* Search Results Dropdown */}
      {showSearch && (
        <>
          <Pressable style={styles.searchOverlay} onPress={() => setShowSearch(false)} />
          <View style={styles.searchDropdown}>
            {searchLoading ? (
              <View style={styles.searchLoading}>
                <ActivityIndicator color={theme.colors.primary} />
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
                <Text style={styles.searchEmptyText}>No products found</Text>
              </View>
            ) : (
              <View style={styles.searchEmpty}>
                <Text style={styles.searchEmptyText}>Type 2+ characters to search</Text>
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
            onRemove={() => removeItem(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="package-variant" size={48} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>{t('inward.noItems')}</Text>
            <Text style={styles.emptySubtitle}>{t('inward.addItemsHint')}</Text>
          </View>
        }
        ListHeaderComponent={
          items.length > 0 ? (
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>Items ({items.length})</Text>
              <Pressable onPress={clearCart}>
                <Text style={styles.clearText}>Clear all</Text>
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
            placeholder="Add notes (optional)"
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            numberOfLines={2}
          />
        </View>
      )}

      {/* Bottom Action Bar */}
      <View style={[styles.actionBar, { paddingBottom: 12 + insets.bottom }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total ({itemCount} items)</Text>
          <Text style={styles.totalValue}>{formatMoney(total, "INR")}</Text>
        </View>

        <Pressable
          style={[styles.submitButton, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.submitText}>Submit Inward</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
    color: theme.colors.textPrimary,
  },
  supplierSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  supplierText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchBarActive: {
    borderColor: theme.colors.primary,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 10,
  },
  searchDropdown: {
    position: "absolute",
    top: 140,
    left: 16,
    right: 16,
    maxHeight: 300,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    borderBottomColor: theme.colors.border,
  },
  searchRowInfo: {
    flex: 1,
  },
  searchRowName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  searchRowMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  searchRowPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primaryDark,
  },
  searchEmpty: {
    padding: 24,
    alignItems: "center",
  },
  searchEmptyText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
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
    color: theme.colors.textPrimary,
  },
  clearText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.error,
  },
  itemRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
  },
  itemInfo: {
    marginBottom: 10,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  itemBarcode: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
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
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  itemInput: {
    width: 50,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    textAlign: "center",
    color: theme.colors.textPrimary,
  },
  itemInputWide: {
    width: 70,
  },
  itemTotalBlock: {
    flex: 1,
    alignItems: "flex-end",
    gap: 4,
  },
  itemTotalLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  itemTotalValue: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.primaryDark,
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
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  notesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  notesInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: theme.colors.textPrimary,
    minHeight: 60,
    textAlignVertical: "top",
  },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
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
    color: theme.colors.textSecondary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.primaryDark,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitText: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.textInverse,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerSheet: {
    backgroundColor: theme.colors.surface,
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
    backgroundColor: theme.colors.border,
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pickerOptionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight + "15",
  },
  pickerOptionText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
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
    color: theme.colors.textSecondary,
  },
  noSuppliersText: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    textAlign: "center",
    paddingVertical: 16,
  },
});
