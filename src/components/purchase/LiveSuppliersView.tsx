// LiveSuppliersView - Browse Supplier SKU Catalog
// Shows SKU cards with photo placeholder, product details, supplier prices

import React, { useCallback, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import { usePurchaseCartStore } from "../../stores/purchaseCartStore";

// =============================================================================
// TYPES
// =============================================================================

interface SupplierPrice {
  supplierId: string;
  supplierName: string;
  price: number;
  moq: number;
  inStock: boolean;
}

interface SKUItem {
  id: string;
  sku: string;
  productName: string;
  packSize: string;
  unitPrice: number;
  photoUrl?: string;
  suppliers: SupplierPrice[];
}

interface LiveSuppliersViewProps {
  onOpenScanner?: () => void;
  onItemsAdded?: (count: number) => void;
}

// =============================================================================
// MOCK DATA (Demo Mode)
// =============================================================================

const MOCK_SKU_DATA: SKUItem[] = [
  {
    id: "1",
    sku: "TUR-DAL-1KG",
    productName: "Toor Dal Premium",
    packSize: "1 kg",
    unitPrice: 145,
    suppliers: [
      { supplierId: "s1", supplierName: "Agro Fresh", price: 142, moq: 10, inStock: true },
      { supplierId: "s2", supplierName: "KisanMart", price: 145, moq: 5, inStock: true },
      { supplierId: "s3", supplierName: "FarmDirect", price: 148, moq: 20, inStock: false },
    ],
  },
  {
    id: "2",
    sku: "RCE-BAS-5KG",
    productName: "Basmati Rice",
    packSize: "5 kg",
    unitPrice: 89,
    suppliers: [
      { supplierId: "s1", supplierName: "Agro Fresh", price: 425, moq: 10, inStock: true },
      { supplierId: "s4", supplierName: "RiceKing", price: 410, moq: 15, inStock: true },
    ],
  },
  {
    id: "3",
    sku: "OIL-SUN-1L",
    productName: "Sunflower Oil",
    packSize: "1 L",
    unitPrice: 125,
    suppliers: [
      { supplierId: "s2", supplierName: "KisanMart", price: 122, moq: 12, inStock: true },
      { supplierId: "s5", supplierName: "OilWorld", price: 120, moq: 24, inStock: true },
    ],
  },
  {
    id: "4",
    sku: "SUG-WHT-1KG",
    productName: "White Sugar",
    packSize: "1 kg",
    unitPrice: 45,
    suppliers: [
      { supplierId: "s1", supplierName: "Agro Fresh", price: 42, moq: 25, inStock: true },
      { supplierId: "s3", supplierName: "FarmDirect", price: 44, moq: 20, inStock: true },
    ],
  },
  {
    id: "5",
    sku: "ATA-CHK-5KG",
    productName: "Chakki Atta",
    packSize: "5 kg",
    unitPrice: 52,
    suppliers: [
      { supplierId: "s2", supplierName: "KisanMart", price: 248, moq: 10, inStock: true },
      { supplierId: "s4", supplierName: "RiceKing", price: 255, moq: 8, inStock: false },
    ],
  },
  {
    id: "6",
    sku: "SAL-IOD-1KG",
    productName: "Iodised Salt",
    packSize: "1 kg",
    unitPrice: 22,
    suppliers: [
      { supplierId: "s1", supplierName: "Agro Fresh", price: 20, moq: 50, inStock: true },
    ],
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

export default function LiveSuppliersView({ onOpenScanner, onItemsAdded }: LiveSuppliersViewProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Purchase cart store
  const addCartItem = usePurchaseCartStore((state) => state.addItem);

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItems, setSelectedItems] = useState<Map<string, { supplierId: string; qty: number }>>(new Map());
  const [isAdding, setIsAdding] = useState(false);

  // Filter SKUs based on search
  const filteredSKUs = MOCK_SKU_DATA.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.productName.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q)
    );
  });

  // Get best price for an item
  const getBestPrice = (suppliers: SupplierPrice[]) => {
    const inStockSuppliers = suppliers.filter((s) => s.inStock);
    if (inStockSuppliers.length === 0) return null;
    return inStockSuppliers.reduce((min, s) => (s.price < min.price ? s : min), inStockSuppliers[0]);
  };

  // Add item to order
  const handleAddItem = useCallback((itemId: string, supplierId: string) => {
    setSelectedItems((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(itemId);
      if (existing && existing.supplierId === supplierId) {
        newMap.set(itemId, { supplierId, qty: existing.qty + 1 });
      } else {
        newMap.set(itemId, { supplierId, qty: 1 });
      }
      return newMap;
    });
  }, []);

  // Remove item from order
  const handleRemoveItem = useCallback((itemId: string) => {
    setSelectedItems((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(itemId);
      if (existing && existing.qty > 1) {
        newMap.set(itemId, { ...existing, qty: existing.qty - 1 });
      } else {
        newMap.delete(itemId);
      }
      return newMap;
    });
  }, []);

  // Calculate order total
  const orderTotal = Array.from(selectedItems.entries()).reduce((total, [itemId, { supplierId, qty }]) => {
    const item = MOCK_SKU_DATA.find((i) => i.id === itemId);
    if (!item) return total;
    const supplier = item.suppliers.find((s) => s.supplierId === supplierId);
    if (!supplier) return total;
    return total + supplier.price * qty;
  }, 0);

  const totalQty = Array.from(selectedItems.values()).reduce((sum, { qty }) => sum + qty, 0);

  // Handle Add to Order - GL-RJ-002 fix
  const handleAddToOrder = useCallback(async () => {
    if (selectedItems.size === 0 || isAdding) return;

    setIsAdding(true);

    try {
      // Transfer selected items to purchase cart
      let addedCount = 0;

      for (const [itemId, { supplierId, qty }] of selectedItems.entries()) {
        const item = MOCK_SKU_DATA.find((i) => i.id === itemId);
        if (!item) continue;

        const supplier = item.suppliers.find((s) => s.supplierId === supplierId);
        if (!supplier) continue;

        // Add to purchase cart store
        addCartItem({
          supplierProductId: `${supplierId}-${item.id}`,
          productId: item.id,
          supplierId: supplier.supplierId,
          supplierName: supplier.supplierName,
          productName: item.productName,
          barcode: item.sku,
          unitPrice: supplier.price,
          moq: supplier.moq,
          quantity: qty,
        });

        addedCount += qty;
      }

      // Clear local selection
      setSelectedItems(new Map());

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Show success toast
      if (Platform.OS === "android") {
        ToastAndroid.show(
          `${addedCount} item${addedCount > 1 ? "s" : ""} added to cart`,
          ToastAndroid.SHORT
        );
      }

      // Notify parent for navigation/badge update
      onItemsAdded?.(addedCount);
    } catch (error) {
      console.error("Failed to add items to order:", error);
      if (Platform.OS === "android") {
        ToastAndroid.show("Failed to add items", ToastAndroid.SHORT);
      }
    } finally {
      setIsAdding(false);
    }
  }, [selectedItems, isAdding, addCartItem, onItemsAdded]);

  // Render SKU card
  const renderSKUCard = useCallback(({ item }: { item: SKUItem }) => {
    const bestPrice = getBestPrice(item.suppliers);
    const selected = selectedItems.get(item.id);
    const selectedSupplier = selected ? item.suppliers.find((s) => s.supplierId === selected.supplierId) : null;

    return (
      <View style={styles.skuCard}>
        {/* Top Row: Photo + Details */}
        <View style={styles.skuTopRow}>
          {/* Product Photo Placeholder */}
          <View style={styles.photoPlaceholder}>
            <MaterialCommunityIcons name="camera-plus" size={24} color={theme.colors.textTertiary} />
          </View>

          {/* Product Details */}
          <View style={styles.skuDetails}>
            <Text style={styles.productName} numberOfLines={1}>{item.productName}</Text>
            <Text style={styles.skuCode}>{item.sku}</Text>
            <View style={styles.skuMeta}>
              <Text style={styles.metaText}>{item.packSize}</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{formatMoney(item.unitPrice)}/unit</Text>
              {bestPrice && (
                <>
                  <Text style={styles.metaDot}>•</Text>
                  <Text style={styles.moqText}>MOQ {bestPrice.moq}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Supplier Prices Row */}
        <View style={styles.supplierRow}>
          {item.suppliers.slice(0, 3).map((supplier) => (
            <Pressable
              key={supplier.supplierId}
              style={[
                styles.supplierChip,
                !supplier.inStock && styles.supplierChipDisabled,
                selected?.supplierId === supplier.supplierId && styles.supplierChipSelected,
              ]}
              onPress={() => supplier.inStock && handleAddItem(item.id, supplier.supplierId)}
              disabled={!supplier.inStock}
            >
              <Text
                style={[
                  styles.supplierName,
                  !supplier.inStock && styles.supplierNameDisabled,
                  selected?.supplierId === supplier.supplierId && styles.supplierNameSelected,
                ]}
                numberOfLines={1}
              >
                {supplier.supplierName}
              </Text>
              <Text
                style={[
                  styles.supplierPrice,
                  !supplier.inStock && styles.supplierPriceDisabled,
                  selected?.supplierId === supplier.supplierId && styles.supplierPriceSelected,
                ]}
              >
                {formatMoney(supplier.price)}
              </Text>
            </Pressable>
          ))}

          {/* Qty controls if selected */}
          {selected && (
            <View style={styles.qtyControls}>
              <Pressable style={styles.qtyBtn} onPress={() => handleRemoveItem(item.id)}>
                <MaterialCommunityIcons name="minus" size={14} color={theme.colors.textPrimary} />
              </Pressable>
              <Text style={styles.qtyText}>{selected.qty}</Text>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => handleAddItem(item.id, selected.supplierId)}
              >
                <MaterialCommunityIcons name="plus" size={14} color={theme.colors.textPrimary} />
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }, [selectedItems, handleAddItem, handleRemoveItem]);

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search SKU or product"
          placeholderTextColor={theme.colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")}>
            <MaterialCommunityIcons name="close-circle" size={16} color={theme.colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* SKU List */}
      {filteredSKUs.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="package-variant-closed" size={48} color={theme.colors.textTertiary} />
          <Text style={styles.emptyText}>No SKUs found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSKUs}
          renderItem={renderSKUCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + (totalQty > 0 ? 90 : 20) }]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Order Bar */}
      {totalQty > 0 && (
        <View style={[styles.orderBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.orderSummary}>
            <Text style={styles.orderText}>{totalQty} items</Text>
            <Text style={styles.orderTotal}>{formatMoney(orderTotal)}</Text>
          </View>
          <Pressable
            style={[styles.orderBtn, isAdding && styles.orderBtnDisabled]}
            onPress={handleAddToOrder}
            disabled={isAdding}
          >
            <Text style={styles.orderBtnText}>
              {isAdding ? "Adding..." : "Add to Order"}
            </Text>
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
    paddingTop: 0,
  },
  skuCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 10,
    marginBottom: 10,
  },
  skuTopRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  photoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  skuDetails: {
    flex: 1,
    justifyContent: "center",
  },
  productName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  skuCode: {
    fontSize: 11,
    fontFamily: "monospace",
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  skuMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  metaDot: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginHorizontal: 4,
  },
  moqText: {
    fontSize: 10,
    fontWeight: "600",
    color: theme.colors.warning,
  },
  supplierRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  supplierChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  supplierChipDisabled: {
    opacity: 0.5,
  },
  supplierChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  supplierName: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginBottom: 1,
  },
  supplierNameDisabled: {
    color: theme.colors.textTertiary,
  },
  supplierNameSelected: {
    color: theme.colors.textInverse,
  },
  supplierPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  supplierPriceDisabled: {
    color: theme.colors.textTertiary,
  },
  supplierPriceSelected: {
    color: theme.colors.textInverse,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 6,
    marginLeft: "auto",
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
    minWidth: 20,
    textAlign: "center",
  },
  orderBar: {
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
  orderSummary: {
    flex: 1,
  },
  orderText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  orderBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  orderBtnDisabled: {
    opacity: 0.6,
  },
  orderBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
});
