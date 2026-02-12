// ProductDetailModal - V3.0.9 compliant
// Modal showing product details with all suppliers

import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../theme";
import { formatMoney } from "../../utils/money";
import { SupplierRow } from "./SupplierRow";
import type { CatalogProduct, CatalogSupplier } from "../../services/api/catalogApi";
import { getStockStatusColor, getStockStatusLabel } from "../../services/api/catalogApi";
import { usePurchaseCartStore } from "../../stores/purchaseCartStore";

// =============================================================================
// TYPES
// =============================================================================

export interface ProductDetailModalProps {
  visible: boolean;
  product: CatalogProduct | null;
  onClose: () => void;
  onViewCart?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProductDetailModal({
  visible,
  product,
  onClose,
  onViewCart,
}: ProductDetailModalProps) {
  const insets = useSafeAreaInsets();
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);

  // Cart store
  const cartItems = usePurchaseCartStore((state) => state.items);
  const addItem = usePurchaseCartStore((state) => state.addItem);

  // Get cart quantity for a specific supplier product
  const getCartQuantityForSupplier = useCallback(
    (supplierProductId: string): number => {
      const item = cartItems.find((i) => i.supplierProductId === supplierProductId);
      return item?.quantity ?? 0;
    },
    [cartItems]
  );

  // Get total cart quantity for this product across all suppliers
  const totalCartQuantity = useMemo(() => {
    if (!product) return 0;
    return cartItems
      .filter((item) => item.productId === product.id)
      .reduce((sum, item) => sum + item.quantity, 0);
  }, [cartItems, product]);

  // Handle add to cart
  const handleAddToCart = useCallback(
    (params: {
      supplier: CatalogSupplier;
      quantity: number;
      productId: string;
      productName: string;
      barcode?: string;
    }) => {
      addItem({
        supplierProductId: params.supplier.supplierProductId,
        productId: params.productId,
        supplierId: params.supplier.supplierId,
        supplierName: params.supplier.supplierName,
        productName: params.productName,
        barcode: params.barcode,
        quantity: params.quantity,
        unitPrice: params.supplier.purchasePrice,
        mrp: params.supplier.mrp,
        moq: params.supplier.moq,
        minOrderValue: params.supplier.minOrderValue, // POS-BUY-003
      });

      // Collapse the row after adding
      setExpandedSupplierId(null);
    },
    [addItem]
  );

  // Toggle supplier expansion
  const handleToggleExpand = useCallback((supplierId: string) => {
    setExpandedSupplierId((prev) => (prev === supplierId ? null : supplierId));
  }, []);

  // Reset expansion when modal opens
  React.useEffect(() => {
    if (visible && product) {
      // Auto-expand preferred supplier or first supplier
      const preferred = product.suppliers.find((s) => s.isPreferred);
      setExpandedSupplierId(preferred?.supplierId ?? product.suppliers[0]?.supplierId ?? null);
    }
  }, [visible, product]);

  if (!product) return null;

  const stockColor = getStockStatusColor(product.stockStatus);

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
          <Pressable style={styles.closeButton} onPress={onClose} accessibilityLabel="Close product details" accessibilityRole="button">
            <MaterialCommunityIcons
              name="close"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
          <Text style={styles.headerTitle}>Product Details</Text>
          <View style={styles.headerRight}>
            {totalCartQuantity > 0 && onViewCart && (
              <Pressable style={styles.cartButton} onPress={onViewCart} accessibilityLabel={`View cart, ${totalCartQuantity} items`} accessibilityRole="button">
                <MaterialCommunityIcons
                  name="cart"
                  size={20}
                  color={theme.colors.primary}
                />
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{totalCartQuantity}</Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Product Info */}
          <View style={styles.productInfo}>
            <Text style={styles.productName}>{product.name}</Text>

            {product.brand && (
              <Text style={styles.productBrand}>{product.brand}</Text>
            )}

            {product.description && (
              <Text style={styles.productDescription} numberOfLines={3}>
                {product.description}
              </Text>
            )}

            <View style={styles.productMeta}>
              {product.category && (
                <View style={styles.metaChip}>
                  <MaterialCommunityIcons
                    name="tag"
                    size={12}
                    color={theme.colors.textTertiary}
                  />
                  <Text style={styles.metaChipText}>{product.category}</Text>
                </View>
              )}

              {product.primaryBarcode && (
                <View style={styles.metaChip}>
                  <MaterialCommunityIcons
                    name="barcode"
                    size={12}
                    color={theme.colors.textTertiary}
                  />
                  <Text style={styles.metaChipText}>{product.primaryBarcode}</Text>
                </View>
              )}

              {product.unit && (
                <View style={styles.metaChip}>
                  <MaterialCommunityIcons
                    name="scale"
                    size={12}
                    color={theme.colors.textTertiary}
                  />
                  <Text style={styles.metaChipText}>{product.unit}</Text>
                </View>
              )}
            </View>

            {/* Summary stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Best Price</Text>
                <Text style={styles.statValue}>
                  {formatMoney(product.bestPrice)}
                </Text>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Min MOQ</Text>
                <Text style={styles.statValue}>{product.minMoq}</Text>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Status</Text>
                <View style={[styles.stockBadge, { backgroundColor: stockColor + "20" }]}>
                  <View style={[styles.stockDot, { backgroundColor: stockColor }]} />
                  <Text style={[styles.stockBadgeText, { color: stockColor }]}>
                    {getStockStatusLabel(product.stockStatus)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Suppliers Section */}
          <View style={styles.suppliersSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Suppliers ({product.supplierCount})
              </Text>
              <Text style={styles.sectionSubtitle}>
                Tap to expand and add to cart
              </Text>
            </View>

            <View style={styles.suppliersList}>
              {product.suppliers.length === 0 ? (
                <View style={styles.noSuppliersContainer}>
                  <MaterialCommunityIcons
                    name="truck-remove-outline"
                    size={32}
                    color={theme.colors.textTertiary}
                  />
                  <Text style={styles.noSuppliersText}>No suppliers available</Text>
                </View>
              ) : (
                product.suppliers.map((supplier) => (
                  <SupplierRow
                    key={supplier.supplierProductId}
                    supplier={supplier}
                    productId={product.id}
                    productName={product.name}
                    barcode={product.primaryBarcode}
                    cartQuantity={getCartQuantityForSupplier(supplier.supplierProductId)}
                    onAddToCart={handleAddToCart}
                    expanded={expandedSupplierId === supplier.supplierId}
                    onToggleExpand={() => handleToggleExpand(supplier.supplierId)}
                    bnplEligible={supplier.bnplEligible}
                  />
                ))
              )}
            </View>
          </View>
        </ScrollView>

        {/* Footer with cart button */}
        {totalCartQuantity > 0 && onViewCart && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
            <Pressable style={styles.viewCartButton} onPress={onViewCart}>
              <View style={styles.viewCartLeft}>
                <MaterialCommunityIcons
                  name="cart"
                  size={20}
                  color={theme.colors.textInverse}
                />
                <Text style={styles.viewCartCount}>
                  {totalCartQuantity} items in cart
                </Text>
              </View>
              <Text style={styles.viewCartText}>View Cart</Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={theme.colors.textInverse}
              />
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
    color: theme.colors.textPrimary,
  },
  headerRight: {
    width: 40,
    alignItems: "flex-end",
  },
  cartButton: {
    position: "relative",
    padding: theme.spacing.xs,
  },
  cartBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.full,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.md,
  },
  productInfo: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  productName: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  productBrand: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  productDescription: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  productMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    gap: 4,
  },
  metaChipText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  statItem: {
    alignItems: "center",
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  stockBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    gap: 4,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stockBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  suppliersSection: {
    marginBottom: theme.spacing.md,
  },
  sectionHeader: {
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  suppliersList: {
    gap: theme.spacing.sm,
  },
  noSuppliersContainer: {
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  noSuppliersText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  footer: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  viewCartButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
  },
  viewCartLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  viewCartCount: {
    fontSize: 14,
    color: theme.colors.textInverse,
  },
  viewCartText: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
});

export default ProductDetailModal;
