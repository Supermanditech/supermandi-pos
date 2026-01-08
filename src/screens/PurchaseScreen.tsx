import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import * as productsApi from "../services/api/productsApi";
import { handleIncomingScan } from "../services/scan/handleScan";
import { offlineDb } from "../services/offline/localDb";
import { setLocalPrice, upsertLocalProduct } from "../services/offline/scan";
import { submitPurchaseDraft } from "../services/purchaseDraft";
import { usePurchaseDraftStore, type PurchaseDraftItem } from "../stores/purchaseDraftStore";
import {
  feedHidKey,
  feedHidText,
  submitHidBuffer,
  wasHidCommitRecent,
} from "../services/hidScannerService";
import { formatMoney } from "../utils/money";
import { theme } from "../theme";

type PurchaseScreenProps = {
  storeActive: boolean | null;
  scanDisabled: boolean;
  onOpenScanner: () => void;
};

type PurchaseItemUpdates = {
  quantity?: number;
  purchasePriceMinor?: number | null;
  sellingPriceMinor?: number | null;
};

type PurchaseItemRowProps = {
  item: PurchaseDraftItem;
  onUpdate: (barcode: string, updates: PurchaseItemUpdates) => void;
  onRemove: (barcode: string) => void;
};

type SkuItem = {
  productId?: string | null;
  barcode: string;
  name: string;
  currency: string | null;
  inventoryPriceMinor: number | null;
  variantPriceMinor: number | null;
  variantMrpMinor: number | null;
};

const resolveSkuPrice = (item: SkuItem) => {
  return productsApi.resolvePriceMinorFromSources({
    inventoryPrice: item.inventoryPriceMinor,
    variantPrice: item.variantPriceMinor,
    variantMrp: item.variantMrpMinor
  });
};

async function syncProductsToOffline(query?: string): Promise<SkuItem[]> {
  const trimmedQuery = query?.trim();
  try {
    const remote = await productsApi.listProducts(trimmedQuery ? { q: trimmedQuery } : undefined);
    const items: SkuItem[] = [];

    for (const product of remote) {
      const barcode = typeof product.barcode === "string" ? product.barcode.trim() : "";
      if (!barcode) continue;
      const currency = product.currency ?? "INR";
      const priceSources = productsApi.getProductPriceSources(product);
      const resolved = productsApi.resolvePriceMinorFromSources(priceSources);
      const resolvedPriceMinor = resolved.priceMinor > 0 ? resolved.priceMinor : null;

      items.push({
        productId: product.id,
        barcode,
        name: product.name,
        currency,
        inventoryPriceMinor: priceSources.inventoryPrice ?? null,
        variantPriceMinor: priceSources.variantPrice ?? null,
        variantMrpMinor: priceSources.variantMrp ?? null
      });

      await upsertLocalProduct(barcode, product.name, currency, null);
      if (resolvedPriceMinor !== null) {
        await setLocalPrice(barcode, resolvedPriceMinor);
      }
    }

    return items;
  } catch {
    return [];
  }
}

const PAGE_SIZE = 40;
const SCAN_SEGMENT_DOCKED_WIDTH = 64;

const mergeSkuItems = (prev: SkuItem[], incoming: SkuItem[]): SkuItem[] => {
  if (prev.length === 0 && incoming.length <= 1) return incoming;
  const merged = [...prev];
  const indexByBarcode = new Map<string, number>();
  merged.forEach((item, index) => indexByBarcode.set(item.barcode, index));

  for (const item of incoming) {
    const existingIndex = indexByBarcode.get(item.barcode);
    if (existingIndex === undefined) {
      indexByBarcode.set(item.barcode, merged.length);
      merged.push(item);
    } else {
      merged[existingIndex] = item;
    }
  }

  return merged;
};

const parsePriceInput = (text: string): number | null => {
  const normalized = text.replace(/[^0-9.]/g, "");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
};

const parseQuantityInput = (text: string): number => {
  const value = Math.round(Number(text));
  if (!Number.isFinite(value) || value <= 0) return 1;
  return value;
};

const formatPriceInput = (minor: number | null): string => {
  if (!minor || minor <= 0) return "";
  return (minor / 100).toFixed(2);
};

function PurchaseItemRow({ item, onUpdate, onRemove }: PurchaseItemRowProps) {
  const [qty, setQty] = useState(String(item.quantity));
  const [purchasePrice, setPurchasePrice] = useState(formatPriceInput(item.purchasePriceMinor));
  const [sellingPrice, setSellingPrice] = useState(formatPriceInput(item.sellingPriceMinor));

  useEffect(() => {
    setQty(String(item.quantity));
  }, [item.quantity]);

  useEffect(() => {
    setPurchasePrice(formatPriceInput(item.purchasePriceMinor));
  }, [item.purchasePriceMinor]);

  useEffect(() => {
    setSellingPrice(formatPriceInput(item.sellingPriceMinor));
  }, [item.sellingPriceMinor]);

  const statusComplete = item.status === "COMPLETE";

  return (
    <View style={styles.sheetRow}>
      <View style={[styles.sheetCell, styles.sheetCellItem]}>
        <Text style={styles.sheetItemName} numberOfLines={1}>
          {item.name || item.barcode}
        </Text>
        <Text style={styles.sheetItemBarcode} numberOfLines={1}>
          {item.barcode}
        </Text>
      </View>
      <View style={[styles.sheetCell, styles.sheetCellQty]}>
        <TextInput
          style={[styles.sheetInput, styles.sheetInputCenter]}
          value={qty}
          onChangeText={setQty}
          onEndEditing={() => onUpdate(item.barcode, { quantity: parseQuantityInput(qty) })}
          keyboardType="numeric"
        />
      </View>
      <View style={[styles.sheetCell, styles.sheetCellPrice]}>
        <TextInput
          style={[styles.sheetInput, styles.sheetInputRight]}
          value={purchasePrice}
          onChangeText={setPurchasePrice}
          onEndEditing={() => onUpdate(item.barcode, { purchasePriceMinor: parsePriceInput(purchasePrice) })}
          keyboardType="numeric"
        />
      </View>
      <View style={[styles.sheetCell, styles.sheetCellPrice]}>
        <TextInput
          style={[styles.sheetInput, styles.sheetInputRight]}
          value={sellingPrice}
          onChangeText={setSellingPrice}
          onEndEditing={() => onUpdate(item.barcode, { sellingPriceMinor: parsePriceInput(sellingPrice) })}
          keyboardType="numeric"
        />
      </View>
      <View style={[styles.sheetCell, styles.sheetCellStatus]}>
        <View
          style={[
            styles.sheetStatusDot,
            statusComplete ? styles.sheetStatusDotComplete : styles.sheetStatusDotIncomplete
          ]}
        />
        <Text
          style={[
            styles.sheetStatusText,
            statusComplete ? styles.sheetStatusTextComplete : styles.sheetStatusTextIncomplete
          ]}
          numberOfLines={1}
        >
          {statusComplete ? "Complete" : "Incomplete"}
        </Text>
      </View>
      <Pressable
        style={[styles.sheetCell, styles.sheetCellRemove, styles.sheetCellLast]}
        onPress={() => onRemove(item.barcode)}
        accessibilityLabel={`Remove ${item.name || item.barcode}`}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

export default function PurchaseScreen({ storeActive, scanDisabled, onOpenScanner }: PurchaseScreenProps) {
  const { items, updateItem, remove, hasIncomplete } = usePurchaseDraftStore();
  const hasOpenItems = hasIncomplete();

  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SkuItem[]>([]);
  const [searchPage, setSearchPage] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(true);
  const searchInputRef = useRef<TextInput>(null);
  const lastSearchQueryRef = useRef<string | null>(null);
  const suppressSearchBlurRef = useRef(false);
  const suppressSearchBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceLogRef = useRef<Set<string>>(new Set());

  const totalMinor = useMemo(() => {
    return items.reduce((sum, item) => {
      const price = item.purchasePriceMinor ?? 0;
      return sum + price * item.quantity;
    }, 0);
  }, [items]);

  const currency = items[0]?.currency ?? "INR";
  const totalLabel = formatMoney(totalMinor, currency);

  const submitDisabled = items.length === 0 || hasOpenItems || storeActive === false;
  const searchQueryNormalized = searchQuery.trim().toLowerCase();

  const focusSearchInput = () => {
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const logPriceDebug = useCallback((item: SkuItem, resolved: productsApi.PriceResolution) => {
    const productId = item.productId ?? item.barcode;
    const key = `${productId}:${resolved.priceMinor}:${resolved.inventoryPrice ?? "null"}:${resolved.variantPrice ?? "null"}:${resolved.mrp ?? "null"}`;
    if (priceLogRef.current.has(key)) return;
    priceLogRef.current.add(key);
    console.log(
      `[PRICE_DEBUG] ${productId} ${resolved.priceMinor} ${resolved.inventoryPrice ?? "null"} ${resolved.variantPrice ?? "null"} ${resolved.mrp ?? "null"}`
    );
  }, []);

  const markSearchInteraction = useCallback((durationMs = 400) => {
    suppressSearchBlurRef.current = true;
    if (suppressSearchBlurTimerRef.current) {
      clearTimeout(suppressSearchBlurTimerRef.current);
    }
    suppressSearchBlurTimerRef.current = setTimeout(() => {
      suppressSearchBlurRef.current = false;
      suppressSearchBlurTimerRef.current = null;
    }, durationMs);
  }, []);

  const openSearch = () => {
    if (storeActive === false) return;
    setSearchExpanded(true);
  };

  const handleSearchChange = (value: string) => {
    if (!scanDisabled) {
      feedHidText(value);
    }
    setSearchQuery(value);
    if (!searchExpanded) {
      setSearchExpanded(true);
    }
  };

  const handleSearchSubmit = (event?: { nativeEvent: { text: string } }) => {
    const raw = event?.nativeEvent?.text ?? searchQuery;
    const trimmed = raw.trim();
    if (!trimmed) return;
    void handleIncomingScan(trimmed);
    setSearchQuery("");
    setSearchExpanded(true);
    focusSearchInput();
  };

  const handleSearchKeyPress = (event: { nativeEvent: { key: string } }) => {
    if (scanDisabled) return;
    const scanValue = feedHidKey(event.nativeEvent.key);
    if (scanValue) {
      void handleIncomingScan(scanValue);
      setSearchQuery("");
      setSearchExpanded(true);
      focusSearchInput();
    }
  };

  const handleSearchSubmitEditing = (event?: { nativeEvent: { text: string } }) => {
    if (!scanDisabled) {
      const scanValue = submitHidBuffer();
      if (scanValue || wasHidCommitRecent()) {
        if (scanValue) {
          void handleIncomingScan(scanValue);
        }
        setSearchQuery("");
        setSearchExpanded(true);
        focusSearchInput();
        return;
      }
    }
    handleSearchSubmit(event);
  };

  const handleCameraPress = () => {
    if (scanDisabled) return;
    markSearchInteraction(1000);
    onOpenScanner();
  };

  const loadSearchResults = useCallback(async (reset: boolean) => {
    if (searchLoading) return;
    if (!searchHasMore && !reset) return;

    const query = searchQuery.trim().toLowerCase();
    const page = reset ? 0 : searchPage;
    const offset = page * PAGE_SIZE;

    setSearchLoading(true);

    const params: Array<string | number> = [];
    let sql = `
      SELECT
        p.barcode as barcode,
        p.name as name,
        p.currency as currency,
        pr.price_minor as inventoryPriceMinor,
        NULL as variantPriceMinor,
        NULL as variantMrpMinor
      FROM offline_products p
      LEFT JOIN offline_prices pr ON pr.barcode = p.barcode
    `;

    if (query.length > 0) {
      const like = `%${query}%`;
      sql += " WHERE lower(p.name) LIKE ? OR lower(p.barcode) LIKE ?";
      params.push(like, like);
    }

    sql += " ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.name ASC LIMIT ? OFFSET ?";
    params.push(PAGE_SIZE, offset);

    try {
      let rows = await offlineDb.all<SkuItem>(sql, params);
      if (reset && rows.length === 0) {
        const remote = await syncProductsToOffline(query);
        if (remote.length > 0) {
          rows = await offlineDb.all<SkuItem>(sql, params);
        }
      }
      setSearchResults((prev) => mergeSkuItems(reset ? [] : prev, rows));
      setSearchHasMore(rows.length === PAGE_SIZE);
      setSearchPage(page + 1);
    } finally {
      setSearchLoading(false);
    }
  }, [searchHasMore, searchLoading, searchPage, searchQuery]);

  useEffect(() => {
    if (!searchExpanded) return;
    if (lastSearchQueryRef.current === searchQueryNormalized) return;
    lastSearchQueryRef.current = searchQueryNormalized;
    const timer = setTimeout(() => {
      setSearchHasMore(true);
      setSearchPage(0);
      void loadSearchResults(true);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchExpanded, searchQueryNormalized, loadSearchResults]);

  useEffect(() => {
    if (!searchExpanded) return;
    focusSearchInput();
  }, [searchExpanded]);

  useEffect(() => {
    return () => {
      if (suppressSearchBlurTimerRef.current) {
        clearTimeout(suppressSearchBlurTimerRef.current);
      }
    };
  }, []);

  const collapseSearchExpanded = useCallback((blurInput: boolean) => {
    suppressSearchBlurRef.current = false;
    setSearchExpanded(false);
    if (blurInput) {
      searchInputRef.current?.blur();
    }
  }, []);

  const handleAddFromSearch = (item: SkuItem) => {
    if (storeActive === false) return;
    const resolved = resolveSkuPrice(item);
    usePurchaseDraftStore.getState().addOrUpdate({
      id: item.barcode,
      barcode: item.barcode,
      name: item.name,
      currency: item.currency ?? "INR",
      sellingPriceMinor: resolved.priceMinor,
      purchasePriceMinor: null
    });
    setSearchQuery("");
    setSearchExpanded(true);
    focusSearchInput();
  };

  const renderSearchRow = ({ item }: { item: SkuItem }) => {
    const resolved = resolveSkuPrice(item);
    logPriceDebug(item, resolved);
    const priceLabel = formatMoney(resolved.priceMinor, item.currency ?? "INR");

    return (
      <Pressable
        style={styles.searchRow}
        onPressIn={() => markSearchInteraction()}
        onPress={() => handleAddFromSearch(item)}
        accessibilityLabel={`Add ${item.name}`}
      >
        <MaterialCommunityIcons name="barcode" size={16} color={theme.colors.textSecondary} />
        <View style={styles.searchRowInfo}>
          <Text style={styles.searchRowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.searchRowMeta} numberOfLines={1}>
            {item.barcode}
          </Text>
        </View>
        <View style={styles.searchRowRight}>
          <Text style={styles.searchRowPrice}>{priceLabel}</Text>
        </View>
      </Pressable>
    );
  };
  const renderSearchBar = (variant: "collapsed" | "expanded") => (
    <View
      style={[
        styles.searchBar,
        variant === "expanded" && styles.searchBarExpanded,
        storeActive === false && styles.searchBarDisabled,
      ]}
    >
      <View
        style={[
          styles.searchSegment,
          variant === "expanded" && styles.searchSegmentExpanded,
        ]}
      >
        <MaterialCommunityIcons name="magnify" size={18} color="#000000" />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={handleSearchChange}
          onFocus={openSearch}
          onBlur={() => {
            if (suppressSearchBlurRef.current) {
              suppressSearchBlurRef.current = false;
              focusSearchInput();
              return;
            }
            if (!searchQuery.trim()) {
              setSearchExpanded(false);
            }
          }}
          onKeyPress={handleSearchKeyPress}
          onSubmitEditing={handleSearchSubmitEditing}
          placeholder="Search product"
          placeholderTextColor="#000000"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          blurOnSubmit={false}
          editable={storeActive !== false}
        />
        {searchQuery ? (
          <Pressable
            onPressIn={() => markSearchInteraction()}
            onPress={() => setSearchQuery("")}
            hitSlop={8}
            accessibilityLabel="Clear search"
          >
            <MaterialCommunityIcons
              name="close-circle"
              size={18}
              color="#000000"
            />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        style={[
          styles.scanSegment,
          variant === "expanded" && styles.scanSegmentExpanded,
          scanDisabled && styles.ctaDisabled,
        ]}
        onPressIn={() => markSearchInteraction(1000)}
        onPress={handleCameraPress}
        disabled={scanDisabled}
        accessibilityLabel="Open camera scanner"
      >
        <MaterialCommunityIcons name="camera" size={18} color={theme.colors.textInverse} />
        {variant === "collapsed" ? (
          <Text style={styles.scanSegmentText} numberOfLines={1}>
            Scan product here
          </Text>
        ) : null}
      </Pressable>
    </View>
  );

  const handleSubmit = async () => {
    try {
      const result = await submitPurchaseDraft();
      Alert.alert("Purchase submitted", `Purchase ID ${result.purchaseId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "purchase_failed";
      if (message === "purchase_incomplete") {
        Alert.alert("Complete required fields", "Fill quantity, purchase, and selling price for all items.");
        return;
      }
      if (message === "purchase_empty") {
        Alert.alert("No items", "Scan items before submitting a purchase.");
        return;
      }
      Alert.alert("Purchase failed", "Unable to submit purchase. Try again.");
    }
  };

  const searchHeader = (
    <View style={styles.searchHeader}>
      {renderSearchBar(searchExpanded ? "expanded" : "collapsed")}
      <View
        style={[styles.searchPanel, !searchExpanded && styles.searchPanelCollapsed]}
        pointerEvents={searchExpanded ? "auto" : "none"}
        onTouchStart={() => markSearchInteraction()}
      >
        <Text style={styles.searchPanelTitle}>
          {searchQuery.trim() ? "Search results" : "Recent products"}
        </Text>
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.barcode}
          renderItem={renderSearchRow}
          style={styles.searchPanelList}
          contentContainerStyle={styles.searchPanelListContent}
          ListEmptyComponent={
            !searchLoading ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {searchQuery.trim() ? "No matches found." : "No recent products."}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            searchLoading ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (!searchLoading && searchHasMore) {
              void loadSearchResults(false);
            }
          }}
          onEndReachedThreshold={0.3}
          removeClippedSubviews
          windowSize={7}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        />
      </View>
    </View>
  );

  const listHeader = (
    <View>
      <View style={styles.draftHeader}>
        <Text style={styles.draftTitle}>Invoice Data Sheet</Text>
        <View style={styles.draftMeta}>
          <Text style={styles.draftMetaText}>{items.length} items</Text>
          <Text style={styles.draftTotal}>{totalLabel}</Text>
        </View>
      </View>

      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellItem, styles.sheetHeaderCellLeft]}>
          Item
        </Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellQty]}>Qty</Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellPrice]}>Purchase</Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellPrice]}>Selling</Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellStatus]}>Status</Text>
        <Text style={[styles.sheetHeaderCell, styles.sheetCellRemove, styles.sheetCellLast]}> </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {searchHeader}
      {searchExpanded ? (
        <Pressable
          style={styles.searchDismissOverlay}
          onPress={() => collapseSearchExpanded(true)}
          accessibilityLabel="Close search"
        />
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.barcode}
        renderItem={({ item }) => (
          <PurchaseItemRow
            item={item}
            onUpdate={updateItem}
            onRemove={remove}
          />
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No drafts yet.</Text>
            <Text style={styles.emptySubtext}>Scan items to start a purchase draft.</Text>
          </View>
        }
        contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.listContent}
        style={styles.list}
      />

      <View style={styles.actionBar}>
        {storeActive === false ? (
          <Text style={styles.actionHint}>Store is inactive. Purchase is disabled.</Text>
        ) : hasOpenItems ? (
          <Text style={styles.actionHint}>Complete all item fields to submit.</Text>
        ) : null}
        <Pressable
          style={[styles.submitButton, submitDisabled && styles.ctaDisabled]}
          onPress={handleSubmit}
          disabled={submitDisabled}
        >
          <Text style={styles.submitText}>Submit Purchase</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  list: {
    position: "relative",
    zIndex: 0,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 170,
  },
  emptyContent: {
    paddingHorizontal: 12,
    paddingBottom: 170,
  },
  searchHeader: {
    paddingHorizontal: 12,
    paddingTop: 12,
    marginBottom: 16,
    position: "relative",
    zIndex: 2,
  },
  searchDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceAlt,
    position: "relative",
    overflow: "hidden",
  },
  searchBarExpanded: {
    borderColor: theme.colors.primary,
  },
  searchBarDisabled: {
    opacity: 0.6,
  },
  searchSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchSegmentExpanded: {
    paddingRight: SCAN_SEGMENT_DOCKED_WIDTH + 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#000000",
    paddingVertical: 0,
  },
  scanSegment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
  },
  scanSegmentExpanded: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: SCAN_SEGMENT_DOCKED_WIDTH,
    paddingHorizontal: 0,
    justifyContent: "center",
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
  scanSegmentText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  searchPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    padding: 10,
    gap: 8,
    ...theme.shadows.sm,
  },
  searchPanelCollapsed: {
    display: "none",
  },
  searchPanelTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  searchPanelList: {
    maxHeight: 260,
  },
  searchPanelListContent: {
    paddingVertical: 4,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchRowInfo: {
    flex: 1,
  },
  searchRowName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  searchRowMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  searchRowRight: {
    alignItems: "flex-end",
  },
  searchRowPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  footerLoading: {
    paddingVertical: 16,
  },
  draftHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  draftTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  draftMeta: {
    alignItems: "flex-end",
  },
  draftMetaText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  draftTotal: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.primaryDark,
  },
  sheetHeader: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  sheetHeaderCell: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    textAlign: "center",
  },
  sheetHeaderCellLeft: {
    textAlign: "left",
  },
  sheetRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  sheetCell: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: "center",
  },
  sheetCellItem: {
    flex: 1.8,
    minWidth: 140,
    alignItems: "flex-start",
  },
  sheetCellQty: {
    flex: 0.6,
    minWidth: 60,
  },
  sheetCellPrice: {
    flex: 0.9,
    minWidth: 86,
  },
  sheetCellStatus: {
    flex: 0.9,
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sheetCellRemove: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCellLast: {
    borderRightWidth: 0,
  },
  sheetItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  sheetItemBarcode: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  sheetInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  sheetInputCenter: {
    textAlign: "center",
  },
  sheetInputRight: {
    textAlign: "right",
  },
  sheetStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  sheetStatusDotComplete: {
    backgroundColor: theme.colors.success,
  },
  sheetStatusDotIncomplete: {
    backgroundColor: theme.colors.warning,
  },
  sheetStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  sheetStatusTextComplete: {
    color: theme.colors.success,
  },
  sheetStatusTextIncomplete: {
    color: theme.colors.warning,
  },
  empty: {
    alignItems: "center",
    marginTop: 24,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  actionBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 10,
    ...theme.shadows.sm,
    zIndex: 3,
  },
  actionHint: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.warning,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 12,
  },
  submitText: {
    color: theme.colors.textInverse,
    fontWeight: "800",
    fontSize: 14,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
});
