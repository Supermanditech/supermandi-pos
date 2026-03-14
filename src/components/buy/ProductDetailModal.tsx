// ProductDetailModal - V3.0.9 compliant
// Modal showing product details with all suppliers

import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
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
import { useTranslation } from "react-i18next";
import { SupplierRow } from "./SupplierRow";
import type { CatalogProduct, CatalogSupplier } from "../../services/api/catalogApi";
import { usePurchaseCartStore } from "../../stores/purchaseCartStore";
// T-127: Modal back handler for Android hardware back button
import { useModalBackHandler } from "../../hooks/useModalBackHandler";

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
  // T-127: Close modal on Android hardware back button
  useModalBackHandler(visible, onClose);

  const tc = useThemeColors();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(tc), [tc]);

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

  // T-142: Compute total available quantity from all suppliers
  const totalAvailableQty = product.suppliers.reduce(
    (sum, s) => sum + (s.stockQuantity || 0),
    0
  );
  const stockColor =
    totalAvailableQty <= 0
      ? tc.error
      : totalAvailableQty < 10
        ? tc.warning
        : tc.success;

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
              color={tc.textPrimary}
            />
          </Pressable>
          <Text style={styles.headerTitle}>Product Details</Text>
          <View style={styles.headerRight}>
            {totalCartQuantity > 0 && onViewCart && (
              <Pressable style={styles.cartButton} onPress={onViewCart} accessibilityLabel={`View cart, ${totalCartQuantity} items`} accessibilityRole="button">
                <MaterialCommunityIcons
                  name="cart"
                  size={20}
                  color={tc.primary}
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
                    color={tc.textTertiary}
                  />
                  <Text style={styles.metaChipText}>{product.category}</Text>
                </View>
              )}

              {product.primaryBarcode && (
                <View style={styles.metaChip}>
                  <MaterialCommunityIcons
                    name="barcode"
                    size={12}
                    color={tc.textTertiary}
                  />
                  <Text style={styles.metaChipText}>{product.primaryBarcode}</Text>
                </View>
              )}

              {/* STG-355: Variant/pack size fallback — show unit or fallback */}
              <View style={styles.metaChip}>
                <MaterialCommunityIcons
                  name="scale"
                  size={12}
                  color={tc.textTertiary}
                />
                <Text style={styles.metaChipText}>
                  {product.unit || t('purchase.variantFallback', 'Standard')}
                </Text>
              </View>

              {/* STG-355: Pack size fallback */}
              <View style={styles.metaChip}>
                <MaterialCommunityIcons
                  name="package-variant"
                  size={12}
                  color={tc.textTertiary}
                />
                <Text style={styles.metaChipText}>
                  {product.packSize
                    ? `${product.packSize} ${product.unit || 'units'}`
                    : t('purchase.packSizeFallback', '1 unit')}
                </Text>
              </View>
            </View>

            {/* Summary stats — STG-354: "Purchase Price" label */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>{t('purchase.purchasePrice', 'Purchase Price')}</Text>
                <Text style={styles.statValue}>
                  {formatMoney(product.bestPrice)}
                </Text>
              </View>

              {/* T-141: Always show MOQ with unit */}
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Min MOQ</Text>
                <Text style={styles.statValue}>
                  {product.minMoq || 1}{product.unit ? ` ${product.unit}` : ""}
                </Text>
              </View>

              {/* T-142: Show actual available quantity */}
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Available</Text>
                <View style={[styles.stockBadge, { backgroundColor: stockColor + "20" }]}>
                  <View style={[styles.stockDot, { backgroundColor: stockColor }]} />
                  <Text style={[styles.stockBadgeText, { color: stockColor }]}>
                    {totalAvailableQty} available
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* STG-358: Supplier Comparison Table */}
          {product.suppliers.length > 1 && (
            <View style={styles.comparisonSection}>
              <Text style={styles.comparisonTitle}>
                {t('purchase.supplierComparison', 'Supplier Comparison')}
              </Text>
              {/* Table header */}
              <View style={styles.comparisonHeaderRow}>
                <Text style={[styles.comparisonHeaderCell, styles.comparisonNameCell]}>
                  {t('purchase.supplierName', 'Supplier')}
                </Text>
                <Text style={styles.comparisonHeaderCell}>
                  {t('purchase.supplierComparisonPrice', 'Price')}
                </Text>
                <Text style={styles.comparisonHeaderCell}>
                  {t('purchase.supplierComparisonMoq', 'MOQ')}
                </Text>
                <Text style={styles.comparisonHeaderCell}>
                  {t('purchase.supplierComparisonDelivery', 'Delivery')}
                </Text>
              </View>
              {/* Table rows */}
              {product.suppliers.map((s) => (
                <View key={s.supplierProductId} style={styles.comparisonRow}>
                  <View style={[styles.comparisonCell, styles.comparisonNameCell]}>
                    <Text style={styles.comparisonCellText} numberOfLines={1}>
                      {s.supplierName}
                    </Text>
                    {/* STG-407: BNPL badge with terms */}
                    {s.bnplEligible && (
                      <Pressable
                        style={styles.bnplBadgeInline}
                        onPress={() => Alert.alert(
                          t('purchase.bnplBadgeLabel', 'BNPL'),
                          s.bnplMaxDays
                            ? t('purchase.bnplTerms', { days: s.bnplMaxDays })
                            : t('purchase.bnplTermsDefault', 'Buy Now Pay Later available')
                        )}
                        accessibilityLabel="BNPL terms"
                        accessibilityRole="button"
                      >
                        <Text style={styles.bnplBadgeInlineText}>BNPL</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={[styles.comparisonCell, styles.comparisonCellText]}>
                    {formatMoney(s.purchasePrice)}
                  </Text>
                  <Text style={[styles.comparisonCell, styles.comparisonCellText]}>
                    {s.moq}
                  </Text>
                  <Text style={[styles.comparisonCell, styles.comparisonCellText]}>
                    {t('purchase.supplierComparisonDeliveryDefault', 'Standard')}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* STG-352: MOV display per supplier */}
          {product.suppliers.some((s) => s.minOrderValue && s.minOrderValue > 0) && (
            <View style={styles.movSection}>
              {product.suppliers
                .filter((s) => s.minOrderValue && s.minOrderValue > 0)
                .map((s) => (
                  <View key={`mov-${s.supplierProductId}`} style={styles.movRow}>
                    <MaterialCommunityIcons name="information-outline" size={14} color={tc.textTertiary} />
                    <Text style={styles.movText}>
                      {s.supplierName}: {t('purchase.movLabel', 'Min Order Value')} {formatMoney(s.minOrderValue!)}
                    </Text>
                  </View>
                ))}
            </View>
          )}

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
                    color={tc.textTertiary}
                  />
                  <Text style={styles.noSuppliersText}>
                    {t('buy.noSuppliersFound', 'No suppliers found for this product.')}
                  </Text>
                  <Text style={[styles.noSuppliersText, { fontSize: 12, marginTop: 4 }]}>
                    {t('buy.noSuppliersHint', 'Ask your admin to add suppliers for this product.')}
                  </Text>
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
                  color={tc.textInverse}
                />
                <Text style={styles.viewCartCount}>
                  {totalCartQuantity} items in cart
                </Text>
              </View>
              <Text style={styles.viewCartText}>View Cart</Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={tc.textInverse}
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
      backgroundColor: colors.error,
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
      color: colors.textInverse,
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: theme.spacing.md,
    },
    productInfo: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    productName: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    productBrand: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    productDescription: {
      fontSize: 14,
      color: colors.textTertiary,
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
      backgroundColor: colors.backgroundSecondary,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
      borderRadius: theme.borderRadius.sm,
      gap: 4,
    },
    metaChipText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingTop: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    statItem: {
      alignItems: "center",
    },
    statLabel: {
      // STG-353: MOQ font size fix — minimum 12
      fontSize: 12,
      color: colors.textTertiary,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
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
      color: colors.textPrimary,
      marginBottom: 2,
    },
    sectionSubtitle: {
      fontSize: 13,
      color: colors.textTertiary,
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
      color: colors.textTertiary,
    },
    footer: {
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.md,
    },
    viewCartButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.primary,
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
      color: colors.textInverse,
    },
    viewCartText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textInverse,
    },
    // STG-358: Supplier Comparison Table styles
    comparisonSection: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    comparisonTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    comparisonHeaderRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: theme.spacing.xs,
      marginBottom: theme.spacing.xs,
    },
    comparisonHeaderCell: {
      flex: 1,
      fontSize: 12,
      fontWeight: "600",
      color: colors.textTertiary,
    },
    comparisonNameCell: {
      flex: 1.5,
    },
    comparisonRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    comparisonCell: {
      flex: 1,
    },
    comparisonCellText: {
      fontSize: 13,
      color: colors.textPrimary,
    },
    // STG-407: BNPL badge inline
    bnplBadgeInline: {
      backgroundColor: colors.successSoft,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: theme.borderRadius.sm,
      marginTop: 2,
      alignSelf: "flex-start",
    },
    bnplBadgeInlineText: {
      fontSize: 9,
      fontWeight: "700",
      color: colors.success,
    },
    // STG-352: MOV section
    movSection: {
      backgroundColor: colors.warningSoft,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.sm,
      marginBottom: theme.spacing.md,
      gap: 4,
    },
    movRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    movText: {
      fontSize: 12,
      color: colors.textSecondary,
      flex: 1,
    },
  });
}

export default ProductDetailModal;
