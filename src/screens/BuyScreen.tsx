// BuyScreen - V3.0.10 compliant
// Product catalog grid with search, category filter, and infinite scroll
// DEV-065: Added ProductDetailModal for explicit add-to-buy flow

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { theme } from "../theme";
import { CatalogProductCard } from "../components/buy/CatalogProductCard";
import { CategoryFilter } from "../components/buy/CategoryFilter";
import { PurchaseCartModal } from "../components/buy/PurchaseCartModal";
import { ProductDetailModal } from "../components/buy/ProductDetailModal";
import * as catalogApi from "../services/api/catalogApi";
import type { CatalogProduct } from "../services/api/catalogApi";
import { usePurchaseCartStore } from "../stores/purchaseCartStore";
import { getDeviceStoreId } from "../services/deviceSession";
import { fetchUiStatus } from "../services/api/uiStatusApi";

// =============================================================================
// TYPES
// =============================================================================

export interface BuyScreenProps {
  onOpenScanner?: () => void;
  onProductPress?: (product: CatalogProduct) => void;
}

// TICKET-003: Stock status filter type
type StockStatusFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

// =============================================================================
// CONSTANTS
// =============================================================================

const NUM_COLUMNS = 2;
// GL-CRIT-0089: Centralized pagination - consider using "../config/pagination"
const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// =============================================================================
// COMPONENT
// =============================================================================

export function BuyScreen({ onOpenScanner, onProductPress }: BuyScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const searchInputRef = useRef<TextInput>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // State
  const [storeId, setStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // TICKET-003: Stock status filter
  const [selectedStockStatus, setSelectedStockStatus] = useState<StockStatusFilter>("all");

  // Cart store for quantity badges and cart modal
  const cartItems = usePurchaseCartStore((state) => state.items);
  const [cartModalVisible, setCartModalVisible] = useState(false);

  // DEV-065: Product detail modal for explicit add-to-buy flow
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // GL-AUD-007: BNPL badge state
  const [bnplEnabled, setBnplEnabled] = useState(false);

  // Get cart quantity for a product
  const getCartQuantity = useCallback(
    (productId: string): number => {
      return cartItems
        .filter((item) => item.productId === productId)
        .reduce((sum, item) => sum + item.quantity, 0);
    },
    [cartItems]
  );

  // Load store ID and features on mount
  useEffect(() => {
    getDeviceStoreId().then(setStoreId);
    // GL-AUD-007: Fetch BNPL status for badge
    fetchUiStatus().then((status) => {
      setBnplEnabled(status.features?.bnplEnabled ?? false);
    }).catch(() => {
      // Ignore errors - badge just won't show
    });
  }, []);

  // Debounce search query
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Load categories
  useEffect(() => {
    if (!storeId) return;

    setCategoriesLoading(true);
    catalogApi
      .getCategories(storeId)
      .then(setCategories)
      .catch((err) => {
        console.warn("[BuyScreen] Failed to load categories:", err);
      })
      .finally(() => setCategoriesLoading(false));
  }, [storeId]);

  // Load products when filters change
  useEffect(() => {
    if (!storeId) return;

    setPage(1);
    setHasMore(true);
    loadProducts(1, true);
  }, [storeId, debouncedQuery, selectedCategory]);

  // Load products function
  const loadProducts = useCallback(
    async (pageNum: number, replace: boolean) => {
      if (!storeId) return;

      if (replace) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const response = await catalogApi.getCatalog(storeId, {
          q: debouncedQuery || undefined,
          category: selectedCategory || undefined,
          page: pageNum,
          limit: PAGE_SIZE,
        });

        if (replace) {
          setProducts(response.data);
        } else {
          setProducts((prev) => [...prev, ...response.data]);
        }

        setHasMore(response.pagination.hasMore);
        setPage(pageNum);
      } catch (err) {
        console.error("[BuyScreen] Failed to load products:", err);
        setError("Failed to load products. Pull to refresh.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [storeId, debouncedQuery, selectedCategory]
  );

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    if (!storeId) return;

    setRefreshing(true);
    setPage(1);
    setHasMore(true);

    try {
      // Reload categories and products
      const [categoriesResult, productsResult] = await Promise.all([
        catalogApi.getCategories(storeId),
        catalogApi.getCatalog(storeId, {
          q: debouncedQuery || undefined,
          category: selectedCategory || undefined,
          page: 1,
          limit: PAGE_SIZE,
        }),
      ]);

      setCategories(categoriesResult);
      setProducts(productsResult.data);
      setHasMore(productsResult.pagination.hasMore);
      setError(null);
    } catch (err) {
      console.error("[BuyScreen] Refresh failed:", err);
      setError("Failed to refresh. Try again.");
    } finally {
      setRefreshing(false);
    }
  }, [storeId, debouncedQuery, selectedCategory]);

  // Load more on scroll
  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    loadProducts(page + 1, false);
  }, [loadingMore, hasMore, loading, page, loadProducts]);

  // DEV-065: Handle product press - opens detail modal for explicit add-to-buy
  const handleProductPress = useCallback(
    (product: CatalogProduct) => {
      // Open the product detail modal where user can explicitly add to cart
      setSelectedProduct(product);
      setDetailModalVisible(true);
      // Also trigger external callback if provided
      onProductPress?.(product);
    },
    [onProductPress]
  );

  // DEV-065: Close detail modal
  const handleCloseDetailModal = useCallback(() => {
    setDetailModalVisible(false);
    setSelectedProduct(null);
  }, []);

  // DEV-065: Handle view cart from detail modal
  const handleViewCartFromDetail = useCallback(() => {
    setDetailModalVisible(false);
    setSelectedProduct(null);
    setCartModalVisible(true);
  }, []);

  // Handle category select
  const handleCategorySelect = useCallback((category: string | null) => {
    setSelectedCategory(category);
  }, []);

  // TICKET-003: Handle stock status filter
  const handleStockStatusSelect = useCallback((status: StockStatusFilter) => {
    setSelectedStockStatus(status);
  }, []);

  // TICKET-003: Clear all filters
  const handleClearAllFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory(null);
    setSelectedStockStatus("all");
    searchInputRef.current?.clear();
  }, []);

  // TICKET-003: Client-side filtering for stock status
  const filteredProducts = useMemo(() => {
    if (selectedStockStatus === "all") {
      return products;
    }
    return products.filter((p) => p.stockStatus === selectedStockStatus);
  }, [products, selectedStockStatus]);

  // Handle search clear
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.clear();
  }, []);

  // Render product item
  const renderProduct = useCallback(
    ({ item }: { item: CatalogProduct }) => (
      <CatalogProductCard
        product={item}
        onPress={handleProductPress}
        cartQuantity={getCartQuantity(item.id)}
      />
    ),
    [handleProductPress, getCartQuantity]
  );

  // Key extractor
  const keyExtractor = useCallback((item: CatalogProduct) => item.id, []);

  // List footer component
  const ListFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      );
    }
    if (!hasMore && filteredProducts.length > 0) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>No more products</Text>
        </View>
      );
    }
    return null;
  }, [loadingMore, hasMore, filteredProducts.length]);

  // Empty state - TICKET-003: Updated to include stock filter
  const hasActiveFilters = debouncedQuery || selectedCategory || selectedStockStatus !== "all";
  const ListEmpty = useMemo(() => {
    if (loading) return null;

    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={48}
            color={theme.colors.error}
          />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons
          name="package-variant"
          size={48}
          color={theme.colors.textTertiary}
        />
        <Text style={styles.emptyText}>
          {hasActiveFilters
            ? t('buy.noProducts')
            : t('buy.noProductsAvailable')}
        </Text>
        {hasActiveFilters && (
          <Pressable style={styles.clearButton} onPress={handleClearAllFilters}>
            <Text style={styles.clearButtonText}>{t('buy.clearFilters')}</Text>
          </Pressable>
        )}
      </View>
    );
  }, [loading, error, hasActiveFilters, handleClearAllFilters, t]);

  // Calculate item layout for performance
  const getItemLayout = useCallback(
    (_data: ArrayLike<CatalogProduct> | null | undefined, index: number) => {
      const itemHeight = 180; // Approximate card height
      return {
        length: itemHeight,
        offset: itemHeight * Math.floor(index / NUM_COLUMNS),
        index,
      };
    },
    []
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={theme.colors.textTertiary}
            style={styles.searchIcon}
          />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={t('buy.searchProducts')}
            placeholderTextColor={theme.colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={handleClearSearch} style={styles.clearIcon}>
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

        {/* GL-AUD-007: BNPL Badge */}
        {bnplEnabled && (
          <View style={styles.bnplBadge}>
            <MaterialCommunityIcons
              name="credit-card-clock"
              size={14}
              color={theme.colors.success}
            />
            <Text style={styles.bnplBadgeText}>{t('buy.bnplAvailable', { defaultValue: 'BNPL' })}</Text>
          </View>
        )}
      </View>

      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={handleCategorySelect}
        loading={categoriesLoading}
      />

      {/* TICKET-003: Stock Status Filter */}
      <View style={styles.stockFilterContainer}>
        <Pressable
          style={[
            styles.stockChip,
            selectedStockStatus === "all" && styles.stockChipActive,
          ]}
          onPress={() => handleStockStatusSelect("all")}
        >
          <Text
            style={[
              styles.stockChipText,
              selectedStockStatus === "all" && styles.stockChipTextActive,
            ]}
          >
            {t('buy.stockAll', { defaultValue: 'All' })}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.stockChip,
            selectedStockStatus === "in_stock" && styles.stockChipActive,
          ]}
          onPress={() => handleStockStatusSelect("in_stock")}
        >
          <Text
            style={[
              styles.stockChipText,
              selectedStockStatus === "in_stock" && styles.stockChipTextActive,
            ]}
          >
            {t('buy.stockInStock', { defaultValue: 'In Stock' })}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.stockChip,
            selectedStockStatus === "low_stock" && styles.stockChipActive,
            selectedStockStatus === "low_stock" && styles.stockChipLow,
          ]}
          onPress={() => handleStockStatusSelect("low_stock")}
        >
          <Text
            style={[
              styles.stockChipText,
              selectedStockStatus === "low_stock" && styles.stockChipTextLow,
            ]}
          >
            {t('buy.stockLow', { defaultValue: 'Low' })}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.stockChip,
            selectedStockStatus === "out_of_stock" && styles.stockChipActive,
            selectedStockStatus === "out_of_stock" && styles.stockChipOut,
          ]}
          onPress={() => handleStockStatusSelect("out_of_stock")}
        >
          <Text
            style={[
              styles.stockChipText,
              selectedStockStatus === "out_of_stock" && styles.stockChipTextOut,
            ]}
          >
            {t('buy.stockOut', { defaultValue: 'Out' })}
          </Text>
        </Pressable>
      </View>

      {/* TICKET-003: Active Filters Display */}
      {hasActiveFilters && (
        <View style={styles.activeFiltersContainer}>
          <Text style={styles.activeFiltersLabel}>{t('buy.activeFilters', { defaultValue: 'Filters:' })}</Text>
          {debouncedQuery && (
            <View style={styles.activeFilterChip}>
              <Text style={styles.activeFilterText}>"{debouncedQuery}"</Text>
              <Pressable onPress={handleClearSearch}>
                <MaterialCommunityIcons name="close" size={14} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          )}
          {selectedCategory && (
            <View style={styles.activeFilterChip}>
              <Text style={styles.activeFilterText}>{selectedCategory}</Text>
              <Pressable onPress={() => setSelectedCategory(null)}>
                <MaterialCommunityIcons name="close" size={14} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          )}
          {selectedStockStatus !== "all" && (
            <View style={styles.activeFilterChip}>
              <Text style={styles.activeFilterText}>{selectedStockStatus.replace("_", " ")}</Text>
              <Pressable onPress={() => setSelectedStockStatus("all")}>
                <MaterialCommunityIcons name="close" size={14} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          )}
          <Pressable style={styles.clearAllButton} onPress={handleClearAllFilters}>
            <Text style={styles.clearAllText}>{t('buy.clearAll', { defaultValue: 'Clear All' })}</Text>
          </Pressable>
        </View>
      )}

      {/* Product Grid */}
      {loading && filteredProducts.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading catalog...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          renderItem={renderProduct}
          keyExtractor={keyExtractor}
          numColumns={NUM_COLUMNS}
          contentContainerStyle={[
            styles.gridContent,
            { paddingBottom: insets.bottom + theme.spacing.lg + 80 },
          ]}
          columnWrapperStyle={styles.row}
          getItemLayout={getItemLayout}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={ListEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
        />
      )}

      {/* Floating Cart Button */}
      {cartItems.length > 0 && (
        <Pressable
          style={[styles.cartFab, { bottom: insets.bottom + 16 }]}
          onPress={() => setCartModalVisible(true)}
        >
          <MaterialCommunityIcons
            name="cart"
            size={24}
            color={theme.colors.textInverse}
          />
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartItems.length}</Text>
          </View>
        </Pressable>
      )}

      {/* Purchase Cart Modal */}
      <PurchaseCartModal
        visible={cartModalVisible}
        onClose={() => setCartModalVisible(false)}
        onOrderPlaced={() => handleRefresh()}
        onAllOrdersPlaced={() => setCartModalVisible(false)}
      />

      {/* DEV-065: Product Detail Modal for explicit add-to-buy flow */}
      <ProductDetailModal
        visible={detailModalVisible}
        product={selectedProduct}
        onClose={handleCloseDetailModal}
        onViewCart={handleViewCartFromDetail}
      />
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.sm,
  },
  searchIcon: {
    marginRight: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  clearIcon: {
    padding: theme.spacing.xs,
  },
  scanButton: {
    width: 44,
    height: 44,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  // GL-AUD-007: BNPL Badge Styles
  bnplBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.md,
    gap: 4,
  },
  bnplBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.success,
  },
  gridContent: {
    paddingHorizontal: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
  },
  row: {
    justifyContent: "flex-start",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xxxl,
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.textTertiary,
    textAlign: "center",
  },
  clearButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.sm,
  },
  clearButtonText: {
    color: theme.colors.textInverse,
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  cartFab: {
    position: "absolute",
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.lg,
  },
  cartBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  // TICKET-003: Stock Filter Styles
  stockFilterContainer: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  stockChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stockChipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  stockChipLow: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: theme.colors.warning,
  },
  stockChipOut: {
    backgroundColor: theme.colors.errorSoft,
    borderColor: theme.colors.error,
  },
  stockChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  stockChipTextActive: {
    color: theme.colors.textInverse,
  },
  stockChipTextLow: {
    color: theme.colors.warning,
  },
  stockChipTextOut: {
    color: theme.colors.error,
  },
  activeFiltersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.xs,
  },
  activeFiltersLabel: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginRight: theme.spacing.xs,
  },
  activeFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.sm,
    gap: 4,
  },
  activeFilterText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  clearAllButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  clearAllText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.error,
  },
});

export default BuyScreen;
