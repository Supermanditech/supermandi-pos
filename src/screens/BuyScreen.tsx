// BuyScreen - V3.0.10 compliant
// Product catalog grid with search, category filter, and infinite scroll
// DEV-065: Added ProductDetailModal for explicit add-to-buy flow

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import { theme, useThemeColors } from "../theme";
// STG-395: Responsive columns for tablets
import { getResponsiveColumns } from "../utils/layout";
import { getDeviceTypeFromDimensions } from "../utils/deviceType";
import { CatalogProductCard } from "../components/buy/CatalogProductCard";
import { CategoryFilter } from "../components/buy/CategoryFilter";
import { PurchaseCartModal } from "../components/buy/PurchaseCartModal";
import { ProductDetailModal } from "../components/buy/ProductDetailModal";
import * as catalogApi from "../services/api/catalogApi";
import type { CatalogProduct } from "../services/api/catalogApi";
import { usePurchaseCartStore } from "../stores/purchaseCartStore";
import { getDeviceStoreId } from "../services/deviceSession";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { LIST_PAGE_SIZE, shouldStopPagination } from "../config/pagination";
// T-146: Offline catalog browsing
import { isOnline, subscribeNetworkStatus } from "../services/networkStatus";
import {
  cacheCatalogProducts,
  getCachedCatalog,
  cacheCatalogCategories,
  getCachedCategories,
  getCacheAge,
  searchCachedProducts,
} from "../services/catalogCache";

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

// STG-395: Default columns — overridden by responsive hook in component
const NUM_COLUMNS_DEFAULT = 2;
// GO-LIVE-170: Use centralized pagination config
const PAGE_SIZE = LIST_PAGE_SIZE;
// STG-344: Reduced from 400ms to 200ms for faster search response
const SEARCH_DEBOUNCE_MS = 200;

// STG-343: Detect barcode-like input (8-14 digit numeric string)
const BARCODE_REGEX = /^\d{8,14}$/;

// STG-345: Recent searches AsyncStorage key and max items
const RECENT_SEARCHES_KEY = "buy_recent_searches";
const MAX_RECENT_SEARCHES = 5;

// =============================================================================
// COMPONENT
// =============================================================================

export function BuyScreen({ onOpenScanner, onProductPress }: BuyScreenProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // STG-395: Responsive columns
  const NUM_COLUMNS = useMemo(() => getResponsiveColumns(width), [width]);
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

  // STG-343/STG-348: Barcode detection state
  const [isBarcodeQuery, setIsBarcodeQuery] = useState(false);
  const [barcodeLookupLoading, setBarcodeLookupLoading] = useState(false);

  // STG-345: Recent searches state
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecentSearches, setShowRecentSearches] = useState(false);

  // Cart store for quantity badges and cart modal
  const cartItems = usePurchaseCartStore((state) => state.items);
  const [cartModalVisible, setCartModalVisible] = useState(false);

  // DEV-065: Product detail modal for explicit add-to-buy flow
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // GL-AUD-007: BNPL badge state
  const [bnplEnabled, setBnplEnabled] = useState(false);

  // LIVE.NAV.POS.BUY_CART_GUARD.001: Navigation guard when cart has items
  const navigation = useNavigation<any>();
  useEffect(() => {
    if (cartItems.length === 0) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      // AUD-004: RESET = tab switch (allow without confirm).
      // GO_BACK / POP / POP_TO_TOP = back-navigation (block with confirm dialog).
      if (e.data.action.type === 'RESET') return;
      e.preventDefault();
      Alert.alert(
        t('cart_has_items', 'Cart has items'),
        t('buy_cart_leave_warning', 'Your purchase cart will be saved. Do you want to leave?'),
        [
          { text: t('stay', 'Stay'), style: 'cancel' as const },
          { text: t('leave', 'Leave'), style: 'destructive' as const, onPress: () => navigation.dispatch(e.data.action) },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, cartItems.length, t]);

  // T-146: Offline catalog browsing state
  const [isOffline, setIsOffline] = useState(false);
  const [cacheAge, setCacheAge] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState(false);

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
    getDeviceStoreId().then(setStoreId).catch(() => {});
    // GL-AUD-007: Fetch BNPL status for badge
    fetchUiStatus().then((status) => {
      setBnplEnabled(status.features?.bnplEnabled ?? false);
    }).catch(() => {
      // Ignore errors - badge just won't show
    });
  }, []);

  // STG-345: Load recent searches on mount
  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY).then((val) => {
      if (val) {
        try { setRecentSearches(JSON.parse(val)); } catch { /* ignore */ }
      }
    });
  }, []);

  // STG-345: Save a search term to recent searches
  const saveRecentSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  }, [recentSearches]);

  // STG-343: Detect barcode-like input
  useEffect(() => {
    setIsBarcodeQuery(BARCODE_REGEX.test(searchQuery.trim()));
  }, [searchQuery]);

  // T-146: Subscribe to network status changes
  useEffect(() => {
    // Check initial state
    isOnline().then((online) => setIsOffline(!online)).catch(() => {});
    // Subscribe to changes
    const unsubscribe = subscribeNetworkStatus((online) => {
      setIsOffline(!online);
      if (online && usingCache && storeId) {
        // Back online — auto-refresh to get fresh data
        setUsingCache(false);
        setCacheAge(null);
      }
    });
    return unsubscribe;
  }, [usingCache, storeId]);

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
  // T-146: Enhanced with offline cache support
  useEffect(() => {
    if (!storeId) return;

    setCategoriesLoading(true);
    catalogApi
      .getBuyCatalogCategories(storeId)
      .then((cats) => {
        setCategories(cats);
        // T-146: Cache categories on success
        void cacheCatalogCategories(storeId, cats);
      })
      .catch(async (err) => {
        if (__DEV__) console.warn("[BuyScreen] Failed to load buy categories:", err);
        // T-146: Fall back to cached categories
        const cached = await getCachedCategories(storeId);
        if (cached && cached.length > 0) {
          setCategories(cached);
        }
      })
      .finally(() => setCategoriesLoading(false));
  }, [storeId]);

  // Load products function
  // T-146: Enhanced with offline cache support
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
        // STG-343: If query looks like a barcode, do barcode-specific lookup
        const isBarcode = BARCODE_REGEX.test((debouncedQuery || "").trim());
        if (isBarcode && replace) {
          setBarcodeLookupLoading(true);
        }

        const response = await catalogApi.getBuyCatalog(storeId, {
          q: debouncedQuery || undefined,
          category: selectedCategory || undefined,
          // STG-343: Pass barcode param when detected
          barcode: isBarcode ? debouncedQuery.trim() : undefined,
          // STG-346: Pass stock status filter to server for correct pagination
          stockStatus: selectedStockStatus !== "all" ? selectedStockStatus : undefined,
          page: pageNum,
          limit: PAGE_SIZE,
        });

        // STG-348: Clear barcode loading
        setBarcodeLookupLoading(false);

        if (replace) {
          setProducts(response.data);
        } else {
          setProducts((prev) => [...prev, ...response.data]);
        }

        setHasMore(response.pagination.hasMore);
        setPage(pageNum);

        // T-146: Cache products on successful fetch
        setUsingCache(false);
        setCacheAge(null);
        if (response.data.length > 0) {
          void cacheCatalogProducts(storeId, response.data);
        }
      } catch (err) {
        if (__DEV__) console.error("[BuyScreen] Failed to load products:", err);
        // STG-348: Clear barcode loading on error
        setBarcodeLookupLoading(false);

        // T-146: Fall back to cached data when offline or API fails
        if (replace && pageNum === 1) {
          const cached = await getCachedCatalog(storeId);
          if (cached && cached.length > 0) {
            const filtered = searchCachedProducts(
              cached,
              debouncedQuery || undefined,
              selectedCategory || undefined
            );
            setProducts(filtered);
            setHasMore(false); // No pagination for cached data
            setUsingCache(true);
            const age = await getCacheAge(storeId);
            setCacheAge(age);
            setError(null); // Clear error since we have cache
            return;
          }
        }

        setError(t('buy.failedToLoad'));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [storeId, debouncedQuery, selectedCategory, selectedStockStatus, t]
  );

  // Load products when filters change
  // UIUX-POS-007: loadProducts must be in deps to avoid stale closure on rapid filter changes
  useEffect(() => {
    if (!storeId) return;

    setPage(1);
    setHasMore(true);
    loadProducts(1, true);
    // STG-345: Save search term to recent searches on debounced query change
    if (debouncedQuery && debouncedQuery.length >= 2) {
      void saveRecentSearch(debouncedQuery);
    }
  }, [storeId, debouncedQuery, selectedCategory, loadProducts, saveRecentSearch]);

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    if (!storeId) return;

    setRefreshing(true);
    setPage(1);
    setHasMore(true);

    try {
      // Reload categories and products
      const [categoriesResult, productsResult] = await Promise.all([
        catalogApi.getBuyCatalogCategories(storeId),
        catalogApi.getBuyCatalog(storeId, {
          q: debouncedQuery || undefined,
          category: selectedCategory || undefined,
          // STG-346: Pass stock status filter on refresh too
          stockStatus: selectedStockStatus !== "all" ? selectedStockStatus : undefined,
          page: 1,
          limit: PAGE_SIZE,
        }),
      ]);

      setCategories(categoriesResult);
      setProducts(productsResult.data);
      setHasMore(productsResult.pagination.hasMore);
      setError(null);
    } catch (err) {
      if (__DEV__) console.error("[BuyScreen] Refresh failed:", err);
      setError(t('buy.failedToRefresh'));
    } finally {
      setRefreshing(false);
    }
  }, [storeId, debouncedQuery, selectedCategory, selectedStockStatus, t]);

  // Load more on scroll
  // GO-LIVE-170: Added pagination safeguard to prevent infinite loops
  const handleLoadMore = useCallback(() => {
    if (loadingMore || loading) return;
    if (shouldStopPagination(page, hasMore)) return;
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

  // TICKET-003 + STG-346: Stock status filter is now sent to server for correct pagination.
  // Keep client-side filter as fallback for cached/offline data.
  const filteredProducts = useMemo(() => {
    if (selectedStockStatus === "all" || !usingCache) {
      return products;
    }
    // Only apply client-side filter when using cached data (server already filters otherwise)
    return products.filter((p) => p.stockStatus === selectedStockStatus);
  }, [products, selectedStockStatus, usingCache]);

  // Handle search clear
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setShowRecentSearches(false);
    searchInputRef.current?.clear();
  }, []);

  // STG-345: Handle tapping a recent search chip
  const handleRecentSearchTap = useCallback((term: string) => {
    setSearchQuery(term);
    setShowRecentSearches(false);
  }, []);

  // STG-345: Handle search input focus — show recent searches
  const handleSearchFocus = useCallback(() => {
    if (recentSearches.length > 0 && searchQuery.length === 0) {
      setShowRecentSearches(true);
    }
  }, [recentSearches.length, searchQuery.length]);

  // STG-345: Handle search input change — show/hide suggestions
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (text.length === 0 && recentSearches.length > 0) {
      setShowRecentSearches(true);
    } else {
      setShowRecentSearches(false);
    }
  }, [recentSearches.length]);

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

  // Styles (dynamic, theme-aware)
  const styles = useMemo(() => createStyles(colors), [colors]);

  // List footer component
  const ListFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    if (!hasMore && filteredProducts.length > 0) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('buy.noMoreProducts')}</Text>
        </View>
      );
    }
    return null;
  }, [loadingMore, hasMore, filteredProducts.length, t]);

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
            color={colors.error}
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
          color={colors.textTertiary}
        />
        <Text style={styles.emptyText}>
          {hasActiveFilters
            ? t('buy.noProducts')
            : t('buy.noProductsAvailable')}
        </Text>
        {hasActiveFilters && (
          <Pressable accessibilityRole="button" style={styles.clearButton} onPress={handleClearAllFilters}>
            <Text style={styles.clearButtonText}>{t('buy.clearFilters')}</Text>
          </Pressable>
        )}
      </View>
    );
  }, [loading, error, hasActiveFilters, handleClearAllFilters, t]);

  // Calculate item layout for performance
  // STG-395: Include NUM_COLUMNS in deps since it's now dynamic
  const getItemLayout = useCallback(
    (_data: ArrayLike<CatalogProduct> | null | undefined, index: number) => {
      const itemHeight = 180; // Approximate card height
      return {
        length: itemHeight,
        offset: itemHeight * Math.floor(index / NUM_COLUMNS),
        index,
      };
    },
    [NUM_COLUMNS]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search Header */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons
            name={isBarcodeQuery ? "barcode" : "magnify"}
            size={20}
            color={isBarcodeQuery ? colors.primary : colors.textTertiary}
            style={styles.searchIcon}
          />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={t('buy.searchProducts')}
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={handleSearchChange}
            onFocus={handleSearchFocus}
            onBlur={() => {
              // Delay hiding so chip press registers
              setTimeout(() => setShowRecentSearches(false), 200);
            }}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {/* STG-348: Barcode lookup spinner */}
          {barcodeLookupLoading && (
            <View style={styles.barcodeLookupIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.barcodeLookupText}>{t('buy.lookingUpBarcode', 'Looking up barcode...')}</Text>
            </View>
          )}
          {searchQuery.length > 0 && !barcodeLookupLoading && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={handleClearSearch} style={styles.clearIcon}>
              <MaterialCommunityIcons
                name="close-circle"
                size={18}
                color={colors.textTertiary}
              />
            </Pressable>
          )}
        </View>

        {onOpenScanner && (
          <Pressable accessibilityRole="button" accessibilityLabel="Scan barcode" style={styles.scanButton} onPress={onOpenScanner}>
            <MaterialCommunityIcons
              name="barcode-scan"
              size={24}
              color={colors.textInverse}
            />
          </Pressable>
        )}

        {/* GL-AUD-007: BNPL Badge — STG-287: Changed to "Pay Later" for clarity */}
        {bnplEnabled && (
          <Pressable
            accessibilityRole="button"
            style={styles.bnplBadge}
            onPress={() => Alert.alert(
              t('buy.payLaterTitle', { defaultValue: 'Pay Later' }),
              t('buy.payLaterDescription', { defaultValue: 'Buy Now Pay Later (BNPL) — purchase stock now and pay within the due date.' })
            )}
            accessibilityLabel={t('buy.payLaterAccessibility', { defaultValue: 'Pay Later available. Tap for details.' })}
          >
            <MaterialCommunityIcons
              name="credit-card-clock"
              size={14}
              color={colors.success}
            />
            <Text style={styles.bnplBadgeText}>{t('buy.bnplAvailable')}</Text>
          </Pressable>
        )}
      </View>

      {/* STG-345: Recent searches suggestions */}
      {showRecentSearches && recentSearches.length > 0 && (
        <View style={styles.recentSearchesContainer}>
          <Text style={styles.recentSearchesLabel}>{t('buy.recentSearches', 'Recent searches')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentSearchesScroll}>
            {recentSearches.map((term) => (
              <Pressable
                key={term}
                accessibilityRole="button"
                style={styles.recentSearchChip}
                onPress={() => handleRecentSearchTap(term)}
              >
                <MaterialCommunityIcons name="history" size={14} color={colors.textSecondary} />
                <Text style={styles.recentSearchChipText}>{term}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

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
          accessibilityRole="button"
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
          accessibilityRole="button"
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
          accessibilityRole="button"
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
          accessibilityRole="button"
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

      {/* T-146: Offline / Cache Banner */}
      {(isOffline || usingCache) && (
        <View style={styles.offlineBanner}>
          <MaterialCommunityIcons
            name={isOffline ? "wifi-off" : "database-clock-outline"}
            size={16}
            color={colors.warning}
          />
          <Text style={styles.offlineBannerText}>
            {isOffline
              ? t('buy.offlineCachedCatalog')
              : t('buy.showingCachedData', { age: cacheAge ? ` (${cacheAge})` : '' })}
          </Text>
          {!isOffline && (
            <Pressable
              accessibilityRole="button"
              style={styles.offlineRefreshButton}
              onPress={handleRefresh}
            >
              <Text style={styles.offlineRefreshText}>{t('common.refresh')}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* TICKET-003: Active Filters Display */}
      {hasActiveFilters && (
        <View style={styles.activeFiltersContainer}>
          <Text style={styles.activeFiltersLabel}>{t('buy.activeFilters', { defaultValue: 'Filters:' })}</Text>
          {debouncedQuery && (
            <View style={styles.activeFilterChip}>
              <Text style={styles.activeFilterText}>"{debouncedQuery}"</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove search filter" onPress={handleClearSearch}>
                <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
          {selectedCategory && (
            <View style={styles.activeFilterChip}>
              <Text style={styles.activeFilterText}>{selectedCategory}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove category filter" onPress={() => setSelectedCategory(null)}>
                <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
          {selectedStockStatus !== "all" && (
            <View style={styles.activeFilterChip}>
              <Text style={styles.activeFilterText}>{selectedStockStatus.replace("_", " ")}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove stock filter" onPress={() => setSelectedStockStatus("all")}>
                <MaterialCommunityIcons name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
          <Pressable accessibilityRole="button" style={styles.clearAllButton} onPress={handleClearAllFilters}>
            <Text style={styles.clearAllText}>{t('buy.clearAll', { defaultValue: 'Clear All' })}</Text>
          </Pressable>
        </View>
      )}

      {/* Product Grid */}
      {loading && filteredProducts.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('buy.loadingCatalog')}</Text>
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
              colors={[colors.primary]}
              tintColor={colors.primary}
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
          accessibilityLabel="Open cart"
          accessibilityRole="button"
          style={[styles.cartFab, { bottom: insets.bottom + 16 }]}
          onPress={() => setCartModalVisible(true)}
        >
          <MaterialCommunityIcons
            name="cart"
            size={24}
            color={colors.textInverse}
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

function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: theme.spacing.sm,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
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
    color: colors.textPrimary,
  },
  clearIcon: {
    padding: theme.spacing.xs,
  },
  scanButton: {
    width: 44,
    height: 44,
    backgroundColor: colors.primary,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  // GL-AUD-007: BNPL Badge Styles
  bnplBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.md,
    gap: 4,
  },
  bnplBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
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
    color: colors.textTertiary,
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
    color: colors.textTertiary,
    textAlign: "center",
  },
  clearButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.sm,
  },
  clearButtonText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  cartFab: {
    position: "absolute",
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textInverse,
  },
  // TICKET-003: Stock Filter Styles
  stockFilterContainer: {
    flexDirection: "row",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: theme.spacing.sm,
  },
  stockChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stockChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  stockChipLow: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warning,
  },
  stockChipOut: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
  },
  stockChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  stockChipTextActive: {
    color: colors.textInverse,
  },
  stockChipTextLow: {
    color: colors.warning,
  },
  stockChipTextOut: {
    color: colors.error,
  },
  activeFiltersContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.background,
    gap: theme.spacing.xs,
  },
  activeFiltersLabel: {
    fontSize: 12,
    color: colors.textTertiary,
    marginRight: theme.spacing.xs,
  },
  activeFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: theme.borderRadius.sm,
    gap: 4,
  },
  activeFilterText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  clearAllButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  clearAllText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.error,
  },
  // T-146: Offline banner styles
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning + "40",
    gap: theme.spacing.sm,
  },
  offlineBannerText: {
    flex: 1,
    fontSize: 12,
    color: colors.warning,
    fontWeight: "500",
  },
  offlineRefreshButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: colors.warning + "20",
  },
  offlineRefreshText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.warning,
  },
  // STG-348: Barcode lookup indicator styles
  barcodeLookupIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: theme.spacing.xs,
  },
  barcodeLookupText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "500",
  },
  // STG-345: Recent searches styles
  recentSearchesContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  recentSearchesLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: theme.spacing.xs,
    fontWeight: "500",
  },
  recentSearchesScroll: {
    flexDirection: "row",
  },
  recentSearchChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: theme.borderRadius.full,
    marginRight: theme.spacing.sm,
    gap: 4,
  },
  recentSearchChipText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
}); }

export default BuyScreen;
