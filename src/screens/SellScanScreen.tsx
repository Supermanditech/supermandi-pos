import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useCartStore } from "../stores/cartStore";
import type { CartItem } from "../stores/cartStore";
import { formatMoney } from "../utils/money";
import * as productsApi from "../services/api/productsApi";
import { setLocalPrice, upsertLocalProduct } from "../services/offline/scan";
import { offlineDb } from "../services/offline/localDb";
import { handleScan as handleGlobalScan } from "../services/scan/handleScan";
import {
  feedHidKey,
  feedHidText,
  submitHidBuffer,
  wasHidCommitRecent,
} from "../services/hidScannerService";
import { theme } from "../theme";

type SellScanScreenProps = {
  storeActive: boolean | null;
  scanDisabled: boolean;
  onOpenScanner: () => void;
};

type RootStackParamList = {
  Payment: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "Payment">;

type SkuItem = {
  barcode: string;
  name: string;
  currency: string | null;
  priceMinor: number | null;
};

type DiscountType = "percentage" | "fixed";

async function syncProductsToOffline(query?: string): Promise<SkuItem[]> {
  const trimmedQuery = query?.trim();
  try {
    const remote = await productsApi.listProducts(trimmedQuery ? { q: trimmedQuery } : undefined);
    const items: SkuItem[] = [];

    for (const product of remote) {
      const barcode = typeof product.barcode === "string" ? product.barcode.trim() : "";
      if (!barcode) continue;
      const currency = product.currency ?? "INR";
      const resolvedPriceMinor = productsApi.resolveProductPriceMinor(product);
      const priceMinor = resolvedPriceMinor > 0 ? resolvedPriceMinor : null;

      items.push({
        barcode,
        name: product.name,
        currency,
        priceMinor
      });

      await upsertLocalProduct(barcode, product.name, currency, null);
      if (priceMinor !== null) {
        await setLocalPrice(barcode, priceMinor);
      }
    }

    return items;
  } catch {
    return [];
  }
}

const PAGE_SIZE = 40;
const NUM_COLUMNS = 2;
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

export default function SellScanScreen({
  storeActive,
  scanDisabled,
  onOpenScanner,
}: SellScanScreenProps) {
  const navigation = useNavigation<Nav>();
  const {
    items,
    total,
    subtotal,
    discount,
    discountTotal,
    mutationHistory,
    undoLastAction,
    locked,
    updateQuantity,
    applyDiscount,
    removeDiscount,
  } = useCartStore();

  const [catalogItems, setCatalogItems] = useState<SkuItem[]>([]);
  const [catalogPage, setCatalogPage] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogHasMore, setCatalogHasMore] = useState(true);

  const [lastAddMessage, setLastAddMessage] = useState<string | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [flashActive, setFlashActive] = useState(false);

  const [addExpanded, setAddExpanded] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SkuItem[]>([]);
  const [addPage, setAddPage] = useState(0);
  const [addLoading, setAddLoading] = useState(false);
  const [addHasMore, setAddHasMore] = useState(true);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");

  const addMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addInputRef = useRef<TextInput>(null);
  const lastAddQueryRef = useRef<string | null>(null);
  const suppressAddBlurRef = useRef(false);
  const suppressAddBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addFocusedRef = useRef(false);
  const addExpandedBeforeCartRef = useRef(false);
  const addFocusedBeforeCartRef = useRef(false);
  const cartOpeningRef = useRef(false);

  const currency = items[0]?.currency ?? "INR";
  const totalLabel = formatMoney(total, currency);
  const subtotalLabel = formatMoney(subtotal, currency);
  const discountAmountLabel = formatMoney(Math.max(0, discountTotal ?? 0), currency);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const canPay = itemCount > 0 && storeActive !== false && !locked;
  const canOpenCart = itemCount > 0;
  const canEditCart = storeActive !== false && !locked;
  const parseDiscountInput = (value: string) => {
    const normalized = value.replace(/[^0-9.]/g, "");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed;
  };
  const formatFixedDiscount = (minor: number) => {
    const major = minor / 100;
    return Number.isInteger(major) ? String(major) : major.toFixed(2);
  };
  const discountValueNumber = parseDiscountInput(discountValue);
  const discountValueMinor =
    discountType === "fixed" ? Math.round(discountValueNumber * 100) : discountValueNumber;
  const canApplyDiscount = canEditCart && discountValueMinor > 0;
  const canClearDiscount = canEditCart && Boolean(discount);

  const cartHint = locked
    ? "Cart locked"
    : itemCount === 0
      ? "Ready"
      : itemCount <= 2
        ? "Keep scanning"
        : "Review cart";

  const clearTimers = () => {
    if (addMessageTimerRef.current) {
      clearTimeout(addMessageTimerRef.current);
      addMessageTimerRef.current = null;
    }
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }
  };

  const handleUndo = () => {
    clearTimers();
    setLastAddMessage(null);
    setUndoVisible(false);
    undoLastAction();
  };

  const focusAddInput = () => {
    requestAnimationFrame(() => addInputRef.current?.focus());
  };

  const markAddInteraction = useCallback((durationMs = 400) => {
    suppressAddBlurRef.current = true;
    if (suppressAddBlurTimerRef.current) {
      clearTimeout(suppressAddBlurTimerRef.current);
    }
    suppressAddBlurTimerRef.current = setTimeout(() => {
      suppressAddBlurRef.current = false;
      suppressAddBlurTimerRef.current = null;
    }, durationMs);
  }, []);

  const openAddExpanded = () => {
    if (storeActive === false) return;
    setAddExpanded(true);
  };

  const handleAddQueryChange = (value: string) => {
    if (!scanDisabled) {
      feedHidText(value);
    }
    setAddQuery(value);
    if (!addExpanded) {
      setAddExpanded(true);
    }
  };

  const handleScanSubmit = (event?: { nativeEvent: { text: string } }) => {
    const raw = event?.nativeEvent?.text ?? addQuery;
    const trimmed = raw.trim();
    if (!trimmed) return;
    void handleGlobalScan(trimmed);
    setAddQuery("");
    setAddExpanded(true);
    focusAddInput();
  };

  const handleCameraPress = () => {
    if (scanDisabled) return;
    markAddInteraction(1000);
    onOpenScanner();
  };

  const handleAddKeyPress = (event: { nativeEvent: { key: string } }) => {
    if (scanDisabled) return;
    const scanValue = feedHidKey(event.nativeEvent.key);
    if (scanValue) {
      setAddQuery("");
      setAddExpanded(true);
      focusAddInput();
    }
  };

  const handleAddSubmitEditing = (event?: { nativeEvent: { text: string } }) => {
    if (!scanDisabled) {
      const scanValue = submitHidBuffer();
      if (scanValue || wasHidCommitRecent()) {
        setAddQuery("");
        setAddExpanded(true);
        focusAddInput();
        return;
      }
    }
    handleScanSubmit(event);
  };

  const loadCatalog = useCallback(async (reset: boolean) => {
    if (catalogLoading) return;
    if (!catalogHasMore && !reset) return;

    const page = reset ? 0 : catalogPage;
    const offset = page * PAGE_SIZE;

    setCatalogLoading(true);
    if (reset) {
      setCatalogItems([]);
    }

    const params: Array<string | number> = [PAGE_SIZE, offset];
    const sql = `
      SELECT
        p.barcode as barcode,
        p.name as name,
        p.currency as currency,
        pr.price_minor as priceMinor
      FROM offline_products p
      LEFT JOIN offline_prices pr ON pr.barcode = p.barcode
      ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.name ASC
      LIMIT ? OFFSET ?
    `;

    try {
      let rows = await offlineDb.all<SkuItem>(sql, params);
      if (reset && rows.length === 0) {
        const remote = await syncProductsToOffline();
        if (remote.length > 0) {
          rows = await offlineDb.all<SkuItem>(sql, params);
        }
      }
      setCatalogItems((prev) => mergeSkuItems(reset ? [] : prev, rows));
      setCatalogHasMore(rows.length === PAGE_SIZE);
      setCatalogPage(page + 1);
    } finally {
      setCatalogLoading(false);
    }
  }, [catalogHasMore, catalogLoading, catalogPage]);

  const loadAddResults = useCallback(async (reset: boolean) => {
    if (addLoading) return;
    if (!addHasMore && !reset) return;

    const query = addQuery.trim().toLowerCase();
    const page = reset ? 0 : addPage;
    const offset = page * PAGE_SIZE;

    setAddLoading(true);

    const params: Array<string | number> = [];
    let sql = `
      SELECT
        p.barcode as barcode,
        p.name as name,
        p.currency as currency,
        pr.price_minor as priceMinor
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
      setAddResults((prev) => mergeSkuItems(reset ? [] : prev, rows));
      setAddHasMore(rows.length === PAGE_SIZE);
      setAddPage(page + 1);
    } finally {
      setAddLoading(false);
    }
  }, [addHasMore, addLoading, addPage, addQuery]);

  const initialLoadRef = useRef(false);
  const addQueryNormalized = addQuery.trim().toLowerCase();

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    setCatalogHasMore(true);
    setCatalogPage(0);
    void loadCatalog(true);
  }, [loadCatalog]);

  useEffect(() => {
    if (!addExpanded) return;
    if (lastAddQueryRef.current === addQueryNormalized) return;
    lastAddQueryRef.current = addQueryNormalized;
    const timer = setTimeout(() => {
      setAddHasMore(true);
      setAddPage(0);
      void loadAddResults(true);
    }, 200);

    return () => clearTimeout(timer);
  }, [addExpanded, addQueryNormalized, loadAddResults]);

  useEffect(() => {
    if (!addExpanded) return;
    focusAddInput();
  }, [addExpanded]);

  useEffect(() => {
    if (!cartExpanded) return;
    if (discount) {
      setDiscountType(discount.type);
      setDiscountValue(
        discount.type === "fixed" ? formatFixedDiscount(discount.value) : String(discount.value)
      );
    } else {
      setDiscountType("percentage");
      setDiscountValue("");
    }
  }, [cartExpanded, discount]);

  useEffect(() => {
    if (cartExpanded) {
      cartOpeningRef.current = false;
    }
  }, [cartExpanded]);

  useEffect(() => {
    const lastMutation = mutationHistory[mutationHistory.length - 1];
    if (!lastMutation || lastMutation.type !== "UPSERT_ITEM") return;

    const currentItem = items.find((item) => item.id === lastMutation.itemId);
    if (!currentItem) return;

    const previousQty = lastMutation.previousItem?.quantity ?? 0;
    if (currentItem.quantity <= previousQty) return;

    const variantLabel =
      (currentItem.metadata?.variantName as string | undefined)
      ?? (currentItem.metadata?.variant as string | undefined)
      ?? currentItem.sku
      ?? "";
    const variantSuffix = variantLabel ? ` ${variantLabel}` : "";

    clearTimers();
    setLastAddMessage(`Added ${currentItem.name}${variantSuffix}`);
    setUndoVisible(true);
    setFlashActive(true);

    flashTimerRef.current = setTimeout(() => setFlashActive(false), 260);
    addMessageTimerRef.current = setTimeout(() => setLastAddMessage(null), 2000);
    undoTimerRef.current = setTimeout(() => setUndoVisible(false), 3000);
  }, [items, mutationHistory]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (suppressAddBlurTimerRef.current) {
        clearTimeout(suppressAddBlurTimerRef.current);
      }
    };
  }, []);

  const collapseAddExpanded = useCallback((blurInput: boolean) => {
    suppressAddBlurRef.current = false;
    setAddExpanded(false);
    if (blurInput) {
      addInputRef.current?.blur();
    }
  }, []);

  const handleOpenCart = () => {
    if (!canOpenCart) return;
    addExpandedBeforeCartRef.current = addExpanded;
    addFocusedBeforeCartRef.current = addFocusedRef.current;
    cartOpeningRef.current = true;
    setCartExpanded(true);
  };

  const closeCart = () => {
    setCartExpanded(false);
    const shouldRestoreSearch = addExpandedBeforeCartRef.current;
    setAddExpanded(shouldRestoreSearch);
    if (shouldRestoreSearch && addFocusedBeforeCartRef.current) {
      focusAddInput();
    }
  };

  const handleApplyDiscount = () => {
    if (!canApplyDiscount) return;
    applyDiscount({ type: discountType, value: discountValueMinor });
  };

  const handleClearDiscount = () => {
    if (!canClearDiscount) return;
    removeDiscount();
    setDiscountValue("");
  };

  const handleAddSku = (item: SkuItem) => {
    if (storeActive === false) return;

    useCartStore.getState().addItem({
      id: item.barcode,
      name: item.name,
      priceMinor: item.priceMinor ?? 0,
      currency: item.currency ?? "INR",
      barcode: item.barcode,
    });

    setCatalogItems((prev) => [item, ...prev.filter((entry) => entry.barcode !== item.barcode)]);

    const now = new Date().toISOString();
    void offlineDb.run(
      "UPDATE offline_products SET updated_at = ? WHERE barcode = ?",
      [now, item.barcode]
    );
  };

  const handleAddFromSearch = (item: SkuItem) => {
    handleAddSku(item);
    setAddQuery("");
    setAddExpanded(true);
    focusAddInput();
  };

  const renderSkuItem = ({ item }: { item: SkuItem }) => {
    const priceMinor = item.priceMinor ?? 0;
    const priceLabel = formatMoney(priceMinor, item.currency ?? "INR");

    return (
      <Pressable
        style={[styles.skuCard, storeActive === false && styles.skuCardDisabled]}
        onPress={() => handleAddSku(item)}
        disabled={storeActive === false}
      >
        <View style={styles.skuCardTop}>
          <MaterialCommunityIcons name="barcode" size={16} color={theme.colors.textSecondary} />
          <View style={styles.pricePill}>
            <Text style={styles.priceText}>{priceLabel}</Text>
          </View>
        </View>
        <Text style={styles.skuName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.skuBarcode} numberOfLines={1}>
          {item.barcode}
        </Text>
      </Pressable>
    );
  };

  const renderAddRow = ({ item }: { item: SkuItem }) => {
    const priceMinor = item.priceMinor ?? 0;
    const priceLabel = formatMoney(priceMinor, item.currency ?? "INR");

    return (
      <Pressable
        style={styles.addRow}
        onPressIn={() => markAddInteraction()}
        onPress={() => handleAddFromSearch(item)}
        accessibilityLabel={`Add ${item.name}`}
      >
        <MaterialCommunityIcons name="barcode" size={16} color={theme.colors.textSecondary} />
        <View style={styles.addRowInfo}>
          <Text style={styles.addRowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.addRowMeta} numberOfLines={1}>
            {item.barcode}
          </Text>
        </View>
        <View style={styles.addRowRight}>
          <Text style={styles.addRowPrice}>{priceLabel}</Text>
        </View>
      </Pressable>
    );
  };

  const renderCartItem = ({ item }: { item: CartItem }) => {
    const itemCurrency = item.currency ?? currency;
    const lineTotal = item.priceMinor * item.quantity;
    const lineTotalLabel = formatMoney(lineTotal, itemCurrency);
    const unitPriceLabel = formatMoney(item.priceMinor, itemCurrency);
    const controlsDisabled = !canEditCart;

    return (
      <View style={styles.cartItemRow}>
        <View style={styles.cartItemInfo}>
          <Text style={styles.cartItemName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cartItemMeta} numberOfLines={1}>
            {unitPriceLabel} x {item.quantity}
          </Text>
        </View>
        <View style={styles.cartItemControls}>
          <Pressable
            style={[styles.qtyButton, controlsDisabled && styles.qtyButtonDisabled]}
            onPress={() => updateQuantity(item.id, item.quantity - 1)}
            disabled={controlsDisabled}
            accessibilityLabel={`Decrease ${item.name}`}
          >
            <MaterialCommunityIcons name="minus" size={16} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={styles.qtyValue}>{item.quantity}</Text>
          <Pressable
            style={[styles.qtyButton, controlsDisabled && styles.qtyButtonDisabled]}
            onPress={() => updateQuantity(item.id, item.quantity + 1)}
            disabled={controlsDisabled}
            accessibilityLabel={`Increase ${item.name}`}
          >
            <MaterialCommunityIcons name="plus" size={16} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
        <Text style={styles.cartItemTotal}>{lineTotalLabel}</Text>
      </View>
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
          ref={addInputRef}
          style={styles.searchInput}
          value={addQuery}
          onChangeText={handleAddQueryChange}
          onFocus={() => {
            addFocusedRef.current = true;
            openAddExpanded();
          }}
          onBlur={() => {
            addFocusedRef.current = false;
            if (cartExpanded || cartOpeningRef.current) {
              return;
            }
            if (suppressAddBlurRef.current) {
              suppressAddBlurRef.current = false;
              focusAddInput();
              return;
            }
            if (!addQuery.trim()) {
              setAddExpanded(false);
            }
          }}
          onKeyPress={handleAddKeyPress}
          onSubmitEditing={handleAddSubmitEditing}
          placeholder="Search product"
          placeholderTextColor="#000000"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          blurOnSubmit={false}
          editable={storeActive !== false}
        />
        {addQuery ? (
          <Pressable
            onPressIn={() => markAddInteraction()}
            onPress={() => setAddQuery("")}
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
        onPressIn={() => markAddInteraction(1000)}
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

  const searchHeader = (
    <View style={styles.searchHeader}>
      {renderSearchBar(addExpanded ? "expanded" : "collapsed")}
      <View
        style={[styles.searchPanel, !addExpanded && styles.searchPanelCollapsed]}
        pointerEvents={addExpanded ? "auto" : "none"}
        onTouchStart={() => markAddInteraction()}
      >
        <Text style={styles.searchPanelTitle}>
          {addQuery.trim() ? "Search results" : "Recent products"}
        </Text>
        <FlatList
          data={addResults}
          keyExtractor={(item) => item.barcode}
          renderItem={renderAddRow}
          style={styles.searchPanelList}
          contentContainerStyle={styles.searchPanelListContent}
          ListEmptyComponent={
            !addLoading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {addQuery.trim() ? "No matches found." : "No recent products."}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            addLoading ? (
              <View style={styles.footerLoading}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (!addLoading && addHasMore) {
              void loadAddResults(false);
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

  const handleCheckout = () => {
    if (!canPay) return;
    setCartExpanded(false);
    navigation.navigate("Payment");
  };

  return (
    <View style={styles.container}>
      {searchHeader}
      {addExpanded ? (
        <Pressable
          style={styles.searchDismissOverlay}
          onPress={() => collapseAddExpanded(true)}
          accessibilityLabel="Close search"
        />
      ) : null}
      <FlatList
        data={catalogItems}
        keyExtractor={(item) => item.barcode}
        renderItem={renderSkuItem}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.skuRow}
        ListEmptyComponent={
          !catalogLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No SKUs</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          catalogLoading ? (
            <View style={styles.footerLoading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : null
        }
        onEndReached={() => {
          if (!catalogLoading && catalogHasMore) {
            void loadCatalog(false);
          }
        }}
        onEndReachedThreshold={0.3}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        removeClippedSubviews
        windowSize={7}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
      />

      <Pressable
        style={[
          styles.cartBar,
          flashActive && styles.cartBarFlash,
          !canOpenCart && styles.cartBarDisabled,
        ]}
        onPress={handleOpenCart}
        disabled={!canOpenCart}
        accessibilityLabel="View cart"
      >
        <View style={styles.cartBarTop}>
          <Text style={styles.cartBarCount}>
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </Text>
          <View style={styles.cartBarTopRight}>
            {locked ? (
              <View style={styles.cartBarLocked}>
                <Text style={styles.cartBarLockedText}>Locked</Text>
              </View>
            ) : null}
            <Text style={styles.cartBarTotal}>{totalLabel}</Text>
          </View>
        </View>
        <View style={styles.cartBarBottom}>
          <Text style={styles.cartBarHint} numberOfLines={1}>
            {lastAddMessage ?? cartHint}
          </Text>
          {undoVisible && !locked ? (
            <Pressable onPress={handleUndo} hitSlop={8}>
              <Text style={styles.cartBarUndo}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>

      <Modal
        visible={cartExpanded}
        transparent
        animationType="slide"
        onRequestClose={closeCart}
      >
        <Pressable style={styles.cartOverlay} onPress={closeCart}>
          <Pressable style={styles.cartSheet} onPress={() => {}}>
            <View style={styles.cartHandle} />
            <View style={styles.cartHeader}>
              <View>
                <Text style={styles.cartTitle}>Cart</Text>
                <Text style={styles.cartSubtitle}>{itemCount} items</Text>
              </View>
              <Pressable onPress={closeCart} hitSlop={8} accessibilityLabel="Close cart">
                <MaterialCommunityIcons name="close" size={18} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={renderCartItem}
              style={styles.cartList}
              contentContainerStyle={styles.cartListContent}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Cart empty</Text>
                </View>
              }
              removeClippedSubviews
              windowSize={7}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              updateCellsBatchingPeriod={50}
              keyboardShouldPersistTaps="handled"
            />

            <View style={styles.discountSection}>
              <View style={styles.discountHeader}>
                <Text style={styles.discountTitle}>Discount</Text>
                {discount ? (
                  <Text style={styles.discountApplied}>Applied</Text>
                ) : null}
              </View>
              <View style={styles.discountControls}>
                <View style={styles.discountToggle}>
                  <Pressable
                    style={[
                      styles.discountChip,
                      discountType === "percentage" && styles.discountChipActive
                    ]}
                    onPress={() => setDiscountType("percentage")}
                    disabled={!canEditCart}
                  >
                    <Text
                      style={[
                        styles.discountChipText,
                        discountType === "percentage" && styles.discountChipTextActive
                      ]}
                    >
                      PCT
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.discountChip,
                      discountType === "fixed" && styles.discountChipActive
                    ]}
                    onPress={() => setDiscountType("fixed")}
                    disabled={!canEditCart}
                  >
                    <Text
                      style={[
                        styles.discountChipText,
                        discountType === "fixed" && styles.discountChipTextActive
                      ]}
                    >
                      RS
                    </Text>
                  </Pressable>
                </View>
                <TextInput
                  style={[styles.discountInput, !canEditCart && styles.inputDisabled]}
                  value={discountValue}
                  onChangeText={setDiscountValue}
                  placeholder={discountType === "percentage" ? "Percent" : "Amount"}
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="numeric"
                  editable={canEditCart}
                />
              </View>
              <View style={styles.discountButtons}>
                <Pressable
                  style={[styles.discountButton, !canApplyDiscount && styles.ctaDisabled]}
                  onPress={handleApplyDiscount}
                  disabled={!canApplyDiscount}
                >
                  <Text style={styles.discountButtonText}>Apply</Text>
                </Pressable>
                <Pressable
                  style={[styles.discountButtonGhost, !canClearDiscount && styles.ctaDisabled]}
                  onPress={handleClearDiscount}
                  disabled={!canClearDiscount}
                >
                  <Text style={styles.discountButtonGhostText}>Clear</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.cartTotals}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{subtotalLabel}</Text>
              </View>
              {discountTotal ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Discount</Text>
                  <Text style={styles.totalValue}>-{discountAmountLabel}</Text>
                </View>
              ) : null}
              <View style={[styles.totalRow, styles.totalRowEmphasis]}>
                <Text style={styles.totalLabelStrong}>Total</Text>
                <Text style={styles.totalValueStrong}>{totalLabel}</Text>
              </View>
            </View>

            <Pressable
              style={[styles.totalCta, !canPay && styles.ctaDisabled]}
              onPress={handleCheckout}
              disabled={!canPay}
              accessibilityLabel="Total bill"
            >
              <Text style={styles.totalCtaText}>TOTAL BILL</Text>
              <Text style={styles.totalCtaAmount}>{totalLabel}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingBottom: 130,
  },
  searchHeader: {
    paddingHorizontal: 12,
    paddingTop: 12,
    marginBottom: 12,
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
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  addRowInfo: {
    flex: 1,
  },
  addRowName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  addRowMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  addRowRight: {
    alignItems: "flex-end",
  },
  addRowPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 15, 20, 0.55)",
    justifyContent: "flex-end",
  },
  cartSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
    maxHeight: "90%",
    ...theme.shadows.sm,
  },
  cartHandle: {
    alignSelf: "center",
    width: 46,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.border,
  },
  cartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cartTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  cartSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  cartList: {
    maxHeight: 280,
  },
  cartListContent: {
    paddingBottom: 4,
  },
  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cartItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  cartItemName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartItemMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  cartItemControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: 8,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonDisabled: {
    opacity: 0.5,
  },
  qtyValue: {
    minWidth: 18,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartItemTotal: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  discountSection: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  discountHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  discountTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  discountApplied: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  discountControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  discountToggle: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  discountChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  discountChipActive: {
    backgroundColor: theme.colors.primary,
  },
  discountChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  discountChipTextActive: {
    color: theme.colors.textInverse,
  },
  discountInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  discountButtons: {
    flexDirection: "row",
    gap: 10,
  },
  discountButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  discountButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  discountButtonGhost: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
  },
  discountButtonGhostText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  cartTotals: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    gap: 6,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalRowEmphasis: {
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  totalLabelStrong: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  totalValueStrong: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.primaryDark,
  },
  totalCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  totalCtaText: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.textInverse,
  },
  totalCtaAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.textInverse,
  },
  skuRow: {
    gap: 12,
  },
  skuCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 12,
    minHeight: 120,
  },
  skuCardDisabled: {
    opacity: 0.5,
  },
  skuCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  pricePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  priceText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  skuName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  skuBarcode: {
    marginTop: 6,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  footerLoading: {
    paddingVertical: 16,
  },
  cartBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    ...theme.shadows.sm,
    zIndex: 3,
  },
  cartBarFlash: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  cartBarDisabled: {
    opacity: 0.6,
  },
  cartBarTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cartBarTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cartBarLocked: {
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: theme.colors.warningSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cartBarLockedText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.warning,
  },
  cartBarCount: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  cartBarTotal: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.primaryDark,
  },
  cartBarBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  cartBarHint: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  cartBarUndo: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
});
