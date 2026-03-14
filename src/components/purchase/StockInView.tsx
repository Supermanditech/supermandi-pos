// StockInView - Fast Counter Purchase / Stock-In Component
// Scan products, enter qty/prices, submit to ledger

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

import { theme } from "../../theme";
import { getSuppliers, type Supplier } from "../../services/api/suppliersApi";
import { submitStockIn, type StockInPayload } from "../../services/api/stockInApi";
import { formatMoney } from "../../utils/money";

// =============================================================================
// TYPES
// =============================================================================

interface StockInItem {
  id: string;
  barcode: string;
  productName: string;
  quantity: number;
  unit: "pcs" | "kg" | "gm" | "ltr" | "ml";
  purchasePrice: number;
  sellPrice: number;
  isNew: boolean; // true if product not found in catalog
}

interface StockInViewProps {
  onBack?: () => void;
  onOpenScanner?: () => void;
  embedded?: boolean; // When true, no header - parent handles navigation
}

// =============================================================================
// CONSTANTS
// =============================================================================

const UNITS = [
  { value: "pcs", label: "Pcs" },
  { value: "kg", label: "Kg" },
  { value: "gm", label: "Gm" },
  { value: "ltr", label: "Ltr" },
  { value: "ml", label: "ml" },
] as const;

// =============================================================================
// COMPONENT
// =============================================================================

export default function StockInView({ onBack, onOpenScanner, embedded = false }: StockInViewProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<TextInput>(null);

  // State
  const [items, setItems] = useState<StockInItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load suppliers on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const apiSuppliers = await getSuppliers();
        if (mounted && Array.isArray(apiSuppliers)) {
          setSuppliers(apiSuppliers);
        }
      } catch (error) {
        console.error("[StockInView] Failed to fetch suppliers:", error);
      } finally {
        if (mounted) {
          setSuppliersLoading(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Calculate totals
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPurchaseValue = items.reduce(
    (sum, item) => sum + item.quantity * item.purchasePrice,
    0
  );

  // Add new item (from scan or manual entry)
  const addItem = useCallback((barcode: string, productName?: string) => {
    const existingIndex = items.findIndex((i) => i.barcode === barcode);
    if (existingIndex >= 0) {
      // Increment quantity if already exists
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      // Add new item
      const newItem: StockInItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        barcode,
        productName: productName || "",
        quantity: 1,
        unit: "pcs",
        purchasePrice: 0,
        sellPrice: 0,
        isNew: !productName, // If no name provided, it's a new product
      };
      setItems((prev) => [newItem, ...prev]);
    }
    setSearchQuery("");
  }, [items]);

  // Update item field
  const updateItem = useCallback(
    (id: string, field: keyof StockInItem, value: string | number) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        )
      );
    },
    []
  );

  // Remove item
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Handle search/barcode input
  const handleSearchSubmit = useCallback(() => {
    const query = searchQuery.trim();
    if (query.length >= 3) {
      // Treat as barcode scan
      addItem(query);
    }
  }, [addItem, searchQuery]);

  // Submit stock-in
  const handleSubmit = useCallback(async () => {
    if (items.length === 0) {
      Alert.alert("No Items", "Add at least one item to stock in.");
      return;
    }

    // Validate all items have required fields
    const invalidItems = items.filter(
      (item) => !item.productName || item.purchasePrice <= 0 || item.sellPrice <= 0
    );
    if (invalidItems.length > 0) {
      Alert.alert(
        "Incomplete Items",
        "Please fill in product name, purchase price, and sell price for all items."
      );
      return;
    }

    setSubmitting(true);
    try {
      // Build API payload
      const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
      const payload: StockInPayload = {
        supplierId: selectedSupplierId ?? undefined,
        supplierName: selectedSupplier?.name,
        items: items.map((item) => ({
          barcode: item.barcode,
          productName: item.productName,
          quantity: item.quantity,
          buyPrice: item.purchasePrice,
          sellPrice: item.sellPrice,
          isNewProduct: item.isNew,
        })),
        totalAmount: totalPurchaseValue,
      };

      const result = await submitStockIn(payload);
      console.log("[StockInView] Stock-in submitted:", result);

      Alert.alert(
        "Stock In Complete",
        `${result.itemsProcessed} items added to inventory.\nTotal value: ${formatMoney(result.totalAmount)}`,
        [
          {
            text: "OK",
            onPress: () => {
              setItems([]);
              onBack?.();
            },
          },
        ]
      );
    } catch (error) {
      console.error("[StockInView] Submit failed:", error);
      Alert.alert("Error", "Failed to submit stock-in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [items, onBack, selectedSupplierId, suppliers, totalPurchaseValue]);

  // Render item row
  const renderItem = useCallback(
    ({ item }: { item: StockInItem }) => (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.itemBarcodeWrap}>
            <MaterialCommunityIcons
              name="barcode"
              size={14}
              color={theme.colors.textTertiary}
            />
            <Text style={styles.itemBarcode}>{item.barcode}</Text>
            {item.isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
          </View>
          <Pressable
            style={styles.removeButton}
            onPress={() => removeItem(item.id)}
          >
            <MaterialCommunityIcons
              name="close"
              size={18}
              color={theme.colors.error}
            />
          </Pressable>
        </View>

        {/* Product Name */}
        <TextInput
          style={[styles.itemNameInput, item.isNew && styles.inputHighlight]}
          placeholder="Product name"
          placeholderTextColor={theme.colors.textTertiary}
          value={item.productName}
          onChangeText={(text) => updateItem(item.id, "productName", text)}
        />

        {/* Quantity and Unit */}
        <View style={styles.itemRow}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Qty</Text>
            <View style={styles.qtyInputWrap}>
              <Pressable
                style={styles.qtyButton}
                onPress={() =>
                  updateItem(item.id, "quantity", Math.max(1, item.quantity - 1))
                }
              >
                <MaterialCommunityIcons name="minus" size={16} color={theme.colors.textPrimary} />
              </Pressable>
              <TextInput
                style={styles.qtyInput}
                keyboardType="numeric"
                value={String(item.quantity)}
                onChangeText={(text) => {
                  const num = parseInt(text, 10);
                  if (!isNaN(num) && num > 0) {
                    updateItem(item.id, "quantity", num);
                  }
                }}
              />
              <Pressable
                style={styles.qtyButton}
                onPress={() => updateItem(item.id, "quantity", item.quantity + 1)}
              >
                <MaterialCommunityIcons name="plus" size={16} color={theme.colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Unit</Text>
            <View style={styles.unitSelector}>
              {UNITS.slice(0, 3).map((unit) => (
                <Pressable
                  key={unit.value}
                  style={[
                    styles.unitOption,
                    item.unit === unit.value && styles.unitOptionActive,
                  ]}
                  onPress={() => updateItem(item.id, "unit", unit.value)}
                >
                  <Text
                    style={[
                      styles.unitOptionText,
                      item.unit === unit.value && styles.unitOptionTextActive,
                    ]}
                  >
                    {unit.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Prices */}
        <View style={styles.itemRow}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Purchase Price</Text>
            <View style={styles.priceInputWrap}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.priceInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textTertiary}
                value={item.purchasePrice > 0 ? String(item.purchasePrice) : ""}
                onChangeText={(text) => {
                  const num = parseFloat(text);
                  updateItem(item.id, "purchasePrice", isNaN(num) ? 0 : num);
                }}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Sell Price</Text>
            <View style={styles.priceInputWrap}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.priceInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.colors.textTertiary}
                value={item.sellPrice > 0 ? String(item.sellPrice) : ""}
                onChangeText={(text) => {
                  const num = parseFloat(text);
                  updateItem(item.id, "sellPrice", isNaN(num) ? 0 : num);
                }}
              />
            </View>
          </View>
        </View>

        {/* Item total */}
        <View style={styles.itemTotal}>
          <Text style={styles.itemTotalLabel}>Line Total:</Text>
          <Text style={styles.itemTotalValue}>
            {formatMoney(item.quantity * item.purchasePrice)}
          </Text>
        </View>
      </View>
    ),
    [removeItem, updateItem]
  );

  return (
    <View style={styles.container}>
      {/* Header - only show when not embedded */}
      {!embedded && onBack && (
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={20}
              color={theme.colors.textPrimary}
            />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Counter Purchase</Text>
          <View style={styles.headerSpacer} />
        </View>
      )}

      {/* Supplier Selector */}
      <View style={styles.supplierBar}>
        <Text style={styles.supplierLabel}>Supplier (optional):</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable
            style={[
              styles.supplierChip,
              !selectedSupplierId && styles.supplierChipActive,
            ]}
            onPress={() => setSelectedSupplierId(null)}
          >
            <Text
              style={[
                styles.supplierChipText,
                !selectedSupplierId && styles.supplierChipTextActive,
              ]}
            >
              None
            </Text>
          </Pressable>
          {suppliersLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginLeft: 8 }} />
          ) : (
            suppliers.map((supplier) => (
              <Pressable
                key={supplier.id}
                style={[
                  styles.supplierChip,
                  selectedSupplierId === supplier.id && styles.supplierChipActive,
                ]}
                onPress={() => setSelectedSupplierId(supplier.id)}
              >
                <Text
                  style={[
                    styles.supplierChipText,
                    selectedSupplierId === supplier.id && styles.supplierChipTextActive,
                  ]}
                >
                  {supplier.name}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      {/* Search/Scan Bar */}
      <View style={styles.searchBar}>
        <View style={styles.searchInputWrap}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={theme.colors.textTertiary}
          />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Scan barcode or enter product"
            placeholderTextColor={theme.colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="done"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={theme.colors.textTertiary}
              />
            </Pressable>
          )}
        </View>
        {onOpenScanner && (
          <Pressable style={styles.scanButton} onPress={onOpenScanner}>
            <MaterialCommunityIcons
              name="barcode-scan"
              size={24}
              color={theme.colors.textInverse}
            />
          </Pressable>
        )}
      </View>

      {/* Items List */}
      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="package-variant"
            size={64}
            color={theme.colors.textTertiary}
          />
          <Text style={styles.emptyTitle}>No items yet</Text>
          <Text style={styles.emptySubtitle}>
            Scan barcodes or type product codes to add items
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom Action Bar */}
      {items.length > 0 && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              {items.length} items • {totalItems} units
            </Text>
            <Text style={styles.summaryValue}>
              Total: {formatMoney(totalPurchaseValue)}
            </Text>
          </View>
          <Pressable
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={theme.colors.textInverse} />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="check"
                  size={20}
                  color={theme.colors.textInverse}
                />
                <Text style={styles.submitText}>Submit Stock In</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  headerSpacer: {
    width: 60,
  },
  supplierBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  supplierLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  supplierChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
  },
  supplierChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  supplierChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  supplierChipTextActive: {
    color: theme.colors.textInverse,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    gap: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  listContent: {
    padding: 16,
  },
  itemCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  itemBarcodeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  itemBarcode: {
    fontSize: 12,
    fontFamily: "monospace",
    color: theme.colors.textTertiary,
  },
  newBadge: {
    backgroundColor: theme.colors.warning,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  removeButton: {
    padding: 4,
  },
  itemNameInput: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 10,
  },
  inputHighlight: {
    borderWidth: 1,
    borderColor: theme.colors.warning,
  },
  itemRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  fieldGroup: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  qtyInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 8,
    overflow: "hidden",
  },
  qtyButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceAlt,
  },
  qtyInput: {
    flex: 1,
    height: 36,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  unitSelector: {
    flexDirection: "row",
    gap: 4,
  },
  unitOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  unitOptionActive: {
    backgroundColor: theme.colors.primary,
  },
  unitOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  unitOptionTextActive: {
    color: theme.colors.textInverse,
  },
  priceInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    height: 36,
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  itemTotal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 8,
  },
  itemTotalLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  itemTotalValue: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
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
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.primaryDark,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
});
