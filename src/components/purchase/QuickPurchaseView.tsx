// QuickPurchaseView - Fast Counter Stock-In
// Compact view for embedded use in PurchaseScreen

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
  purchasePrice: number;
  sellPrice: number;
  isNew: boolean;
}

interface QuickPurchaseViewProps {
  onOpenScanner?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function QuickPurchaseView({ onOpenScanner }: QuickPurchaseViewProps) {
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

  // Load suppliers
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const apiSuppliers = await getSuppliers();
        if (mounted && Array.isArray(apiSuppliers)) {
          setSuppliers(apiSuppliers);
        }
      } catch (error) {
        console.error("[QuickPurchaseView] Failed to fetch suppliers:", error);
      } finally {
        if (mounted) setSuppliersLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Totals
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0);

  // Add item
  const addItem = useCallback((barcode: string) => {
    const existing = items.findIndex((i) => i.barcode === barcode);
    if (existing >= 0) {
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === existing ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      const newItem: StockInItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        barcode,
        productName: "",
        quantity: 1,
        purchasePrice: 0,
        sellPrice: 0,
        isNew: true,
      };
      setItems((prev) => [newItem, ...prev]);
    }
    setSearchQuery("");
  }, [items]);

  // Update item
  const updateItem = useCallback((id: string, field: keyof StockInItem, value: string | number) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }, []);

  // Remove item
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Search submit
  const handleSearchSubmit = useCallback(() => {
    const query = searchQuery.trim();
    if (query.length >= 3) {
      addItem(query);
    }
  }, [addItem, searchQuery]);

  // Submit
  const handleSubmit = useCallback(async () => {
    if (items.length === 0) {
      Alert.alert("No Items", "Add at least one item.");
      return;
    }
    const invalid = items.filter((i) => !i.productName || i.purchasePrice <= 0 || i.sellPrice <= 0);
    if (invalid.length > 0) {
      Alert.alert("Incomplete", "Fill name, buy price, sell price for all items.");
      return;
    }

    setSubmitting(true);
    try {
      const supplier = suppliers.find((s) => s.id === selectedSupplierId);
      const payload: StockInPayload = {
        supplierId: selectedSupplierId ?? undefined,
        supplierName: supplier?.name,
        items: items.map((item) => ({
          barcode: item.barcode,
          productName: item.productName,
          quantity: item.quantity,
          buyPrice: item.purchasePrice,
          sellPrice: item.sellPrice,
          isNewProduct: item.isNew,
        })),
        totalAmount: totalValue,
      };
      const result = await submitStockIn(payload);
      Alert.alert("Done", `${result.itemsProcessed} items stocked in.\nTotal: ${formatMoney(result.totalAmount)}`);
      setItems([]);
    } catch (error) {
      Alert.alert("Error", "Failed to submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [items, selectedSupplierId, suppliers, totalValue]);

  // Render item
  const renderItem = useCallback(({ item }: { item: StockInItem }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemRow}>
        <View style={styles.barcodeWrap}>
          <MaterialCommunityIcons name="barcode" size={12} color={theme.colors.textTertiary} />
          <Text style={styles.barcodeText}>{item.barcode}</Text>
          {item.isNew && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
        </View>
        <Pressable onPress={() => removeItem(item.id)} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={16} color={theme.colors.error} />
        </Pressable>
      </View>
      <TextInput
        style={styles.nameInput}
        placeholder="Product name"
        placeholderTextColor={theme.colors.textTertiary}
        value={item.productName}
        onChangeText={(t) => updateItem(item.id, "productName", t)}
      />
      <View style={styles.priceRow}>
        <View style={styles.qtyWrap}>
          <Pressable style={styles.qtyBtn} onPress={() => updateItem(item.id, "quantity", Math.max(1, item.quantity - 1))}>
            <MaterialCommunityIcons name="minus" size={14} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <Pressable style={styles.qtyBtn} onPress={() => updateItem(item.id, "quantity", item.quantity + 1)}>
            <MaterialCommunityIcons name="plus" size={14} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.priceInput}>
          <Text style={styles.priceLabel}>Buy</Text>
          <TextInput
            style={styles.priceField}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.colors.textTertiary}
            value={item.purchasePrice > 0 ? String(item.purchasePrice) : ""}
            onChangeText={(t) => updateItem(item.id, "purchasePrice", parseFloat(t) || 0)}
          />
        </View>
        <View style={styles.priceInput}>
          <Text style={styles.priceLabel}>Sell</Text>
          <TextInput
            style={styles.priceField}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.colors.textTertiary}
            value={item.sellPrice > 0 ? String(item.sellPrice) : ""}
            onChangeText={(t) => updateItem(item.id, "sellPrice", parseFloat(t) || 0)}
          />
        </View>
      </View>
    </View>
  ), [removeItem, updateItem]);

  return (
    <View style={styles.container}>
      {/* Supplier Chips */}
      <View style={styles.supplierBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supplierScroll}>
          <Pressable
            style={[styles.supplierChip, !selectedSupplierId && styles.supplierChipActive]}
            onPress={() => setSelectedSupplierId(null)}
          >
            <Text style={[styles.supplierChipText, !selectedSupplierId && styles.supplierChipTextActive]}>None</Text>
          </Pressable>
          {suppliersLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginLeft: 8 }} />
          ) : (
            suppliers.map((s) => (
              <Pressable
                key={s.id}
                style={[styles.supplierChip, selectedSupplierId === s.id && styles.supplierChipActive]}
                onPress={() => setSelectedSupplierId(s.id)}
              >
                <Text style={[styles.supplierChipText, selectedSupplierId === s.id && styles.supplierChipTextActive]}>{s.name}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textTertiary} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Scan or type barcode"
          placeholderTextColor={theme.colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="done"
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <MaterialCommunityIcons name="close-circle" size={16} color={theme.colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* Items */}
      {items.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="package-variant" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>Scan or type barcode to add items</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Action Bar */}
      {items.length > 0 && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.summary}>
            <Text style={styles.summaryText}>{items.length} items • {totalItems} qty</Text>
            <Text style={styles.summaryTotal}>{formatMoney(totalValue)}</Text>
          </View>
          <Pressable
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={theme.colors.textInverse} />
            ) : (
              <Text style={styles.submitText}>Stock In</Text>
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
  supplierBar: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  supplierScroll: {
    gap: 8,
  },
  supplierChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  list: {
    padding: 12,
  },
  itemCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    marginBottom: 10,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  barcodeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  barcodeText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: theme.colors.textTertiary,
  },
  newBadge: {
    backgroundColor: theme.colors.warning,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginLeft: 4,
  },
  newBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  nameInput: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 6,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    minWidth: 24,
    textAlign: "center",
  },
  priceInput: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  priceField: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 12,
  },
  summary: {
    flex: 1,
  },
  summaryText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  summaryTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
});
