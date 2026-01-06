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
import { buildCustomSkuBarcode } from "../utils/customSku";
import { offlineDb } from "../services/offline/localDb";
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

const PAGE_SIZE = 40;
const NUM_COLUMNS = 2;
const CUSTOM_UNITS = ["g", "kg", "ml", "l", "pcs"] as const;
type CustomUnit = (typeof CUSTOM_UNITS)[number];

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

  const [addOverlayOpen, setAddOverlayOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<SkuItem[]>([]);
  const [addPage, setAddPage] = useState(0);
  const [addLoading, setAddLoading] = useState(false);
  const [addHasMore, setAddHasMore] = useState(true);
  const [selectedAddItems, setSelectedAddItems] = useState<Record<string, SkuItem>>({});
  const [cartExpanded, setCartExpanded] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [customSkuOpen, setCustomSkuOpen] = useState(false);
  const [customSkuQty, setCustomSkuQty] = useState("1");
  const [customSkuUnit, setCustomSkuUnit] = useState<CustomUnit>("pcs");
  const [customSkuPrice, setCustomSkuPrice] = useState("");
  const [customSkuError, setCustomSkuError] = useState<string | null>(null);

  const addMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currency = items[0]?.currency ?? "INR";
  const totalLabel = formatMoney(total, currency);
  const subtotalLabel = formatMoney(subtotal, currency);
  const discountAmountLabel = formatMoney(Math.max(0, discountTotal ?? 0), currency);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const canPay = itemCount > 0 && storeActive !== false && !locked;
  const canOpenCart = itemCount > 0;
  const canEditCart = storeActive !== false && !locked;
  const selectedAddCount = Object.keys(selectedAddItems).length;
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
  const parseCustomQuantity = (value: string) => {
    const normalized = value.replace(/[^0-9.]/g, "");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed);
  };
  const parseCustomPrice = (value: string) => {
    const normalized = value.replace(/[^0-9.]/g, "");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  };
  const customSkuReady =
    canEditCart && parseCustomQuantity(customSkuQty) > 0 && parseCustomPrice(customSkuPrice) > 0;
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
      const rows = await offlineDb.all<SkuItem>(sql, params);
      setCatalogItems((prev) => (reset ? rows : [...prev, ...rows]));
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
    if (reset) {
      setAddResults([]);
    }

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
      const rows = await offlineDb.all<SkuItem>(sql, params);
      setAddResults((prev) => (reset ? rows : [...prev, ...rows]));
      setAddHasMore(rows.length === PAGE_SIZE);
      setAddPage(page + 1);
    } finally {
      setAddLoading(false);
    }
  }, [addHasMore, addLoading, addPage, addQuery]);

  const initialLoadRef = useRef(false);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    setCatalogHasMore(true);
    setCatalogPage(0);
    void loadCatalog(true);
  }, [loadCatalog]);

  useEffect(() => {
    if (!addOverlayOpen) return;
    const timer = setTimeout(() => {
      setAddHasMore(true);
      setAddPage(0);
      void loadAddResults(true);
    }, 200);

    return () => clearTimeout(timer);
  }, [addOverlayOpen, addQuery, loadAddResults]);

  useEffect(() => {
    if (addOverlayOpen) return;
    setAddQuery("");
    setAddResults([]);
    setAddPage(0);
    setAddHasMore(true);
    setAddLoading(false);
    setSelectedAddItems({});
  }, [addOverlayOpen]);

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

  const handleAddPress = () => {
    setAddOverlayOpen(true);
  };

  const closeAddOverlay = () => {
    setAddOverlayOpen(false);
  };

  const handleOpenCustomSku = () => {
    if (!canEditCart) return;
    if (addOverlayOpen) {
      setAddOverlayOpen(false);
    }
    if (cartExpanded) {
      setCartExpanded(false);
    }
    setCustomSkuError(null);
    setCustomSkuOpen(true);
  };

  const closeCustomSku = () => {
    setCustomSkuOpen(false);
    setCustomSkuError(null);
  };

  const resetCustomSku = () => {
    setCustomSkuQty("1");
    setCustomSkuUnit("pcs");
    setCustomSkuPrice("");
  };

  const handleCustomSkuSubmit = () => {
    if (!customSkuReady) {
      setCustomSkuError("Enter quantity and price.");
      return;
    }

    const quantity = parseCustomQuantity(customSkuQty);
    const priceMinor = parseCustomPrice(customSkuPrice);
    const suffix = Date.now().toString().slice(-6);
    const barcode = buildCustomSkuBarcode(`manual_${suffix}`);
    const unitLabel = customSkuUnit.toUpperCase();

    useCartStore.getState().addItem({
      id: barcode,
      name: `Custom SKU (${unitLabel})`,
      priceMinor,
      currency,
      barcode,
      quantity,
      metadata: {
        unit: customSkuUnit,
      },
    });

    resetCustomSku();
    setCustomSkuOpen(false);
  };

  const handleOpenCart = () => {
    if (!canOpenCart) return;
    if (addOverlayOpen) {
      setAddOverlayOpen(false);
    }
    setCartExpanded(true);
  };

  const closeCart = () => {
    setCartExpanded(false);
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

  const toggleAddSelection = (item: SkuItem) => {
    setSelectedAddItems((prev) => {
      const next = { ...prev };
      if (next[item.barcode]) {
        delete next[item.barcode];
      } else {
        next[item.barcode] = item;
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    if (storeActive === false || selectedAddCount === 0) return;
    Object.values(selectedAddItems).forEach((item) => handleAddSku(item));
    setSelectedAddItems({});
    setAddOverlayOpen(false);
  };

  const renderSkuItem = ({ item }: { item: SkuItem }) => {
    const priceLabel =
      item.priceMinor === null
        ? "--"
        : formatMoney(item.priceMinor, item.currency ?? "INR");

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
    const priceLabel =
      item.priceMinor === null
        ? "--"
        : formatMoney(item.priceMinor, item.currency ?? "INR");
    const selected = Boolean(selectedAddItems[item.barcode]);

    return (
      <Pressable
        style={[styles.addRow, selected && styles.addRowSelected]}
        onPress={() => toggleAddSelection(item)}
        accessibilityLabel={`Select ${item.name}`}
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
          <MaterialCommunityIcons
            name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
            size={18}
            color={selected ? theme.colors.primary : theme.colors.textSecondary}
          />
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

  const header = (
    <View>
      <Pressable
        style={[styles.scanPad, scanDisabled && styles.ctaDisabled]}
        onPress={onOpenScanner}
        disabled={scanDisabled}
        accessibilityLabel="Open scanner"
      >
        <View style={styles.scanLeft}>
          <MaterialCommunityIcons name="barcode-scan" size={24} color={theme.colors.primary} />
        </View>
        <View style={styles.scanCenter}>
          <Text style={styles.scanTitle}>Scan here</Text>
        </View>
        <View style={styles.scanRight}>
          <MaterialCommunityIcons name="qrcode-scan" size={22} color={theme.colors.primary} />
        </View>
      </Pressable>

      <Pressable
        style={[styles.addItemsButton, storeActive === false && styles.ctaDisabled]}
        onPress={handleAddPress}
        disabled={storeActive === false}
      >
        <Text style={styles.addItemsText}>+ ADD ITEMS</Text>
      </Pressable>

      <Pressable
        style={[styles.customSkuButton, !canEditCart && styles.ctaDisabled]}
        onPress={handleOpenCustomSku}
        disabled={!canEditCart}
      >
        <Text style={styles.customSkuText}>CUSTOM SKU</Text>
      </Pressable>
    </View>
  );

  const handleCheckout = () => {
    if (!canPay) return;
    setCartExpanded(false);
    navigation.navigate("Payment");
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={catalogItems}
        keyExtractor={(item) => item.barcode}
        renderItem={renderSkuItem}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.skuRow}
        ListHeaderComponent={header}
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
        visible={addOverlayOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAddOverlay}
      >
        <Pressable style={styles.addOverlay} onPress={closeAddOverlay}>
          <Pressable style={styles.addCard} onPress={() => {}}>
            <View style={styles.addHeader}>
              <Text style={styles.addTitle}>Add items</Text>
              <Pressable onPress={closeAddOverlay} hitSlop={8} accessibilityLabel="Close add items">
                <MaterialCommunityIcons name="close" size={18} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.addSearchRow}>
              <MaterialCommunityIcons name="magnify" size={18} color={theme.colors.textSecondary} />
              <TextInput
                style={styles.addSearchInput}
                value={addQuery}
                onChangeText={setAddQuery}
                placeholder="Search SKU"
                placeholderTextColor={theme.colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {addQuery ? (
                <Pressable onPress={() => setAddQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                  <MaterialCommunityIcons
                    name="close-circle"
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
              ) : null}
            </View>

            <FlatList
              data={addResults}
              keyExtractor={(item) => item.barcode}
              renderItem={renderAddRow}
              style={styles.addList}
              contentContainerStyle={styles.addListContent}
              ListEmptyComponent={
                !addLoading ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No SKUs</Text>
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
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              updateCellsBatchingPeriod={50}
              keyboardShouldPersistTaps="handled"
            />

            <Pressable
              style={[
                styles.addCta,
                (selectedAddCount === 0 || storeActive === false) && styles.ctaDisabled,
              ]}
              onPress={handleAddSelected}
              disabled={selectedAddCount === 0 || storeActive === false}
              accessibilityLabel="Add selected items"
            >
              <Text style={styles.addCtaText}>{`Add to Bill (${selectedAddCount})`}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={customSkuOpen}
        transparent
        animationType="fade"
        onRequestClose={closeCustomSku}
      >
        <Pressable style={styles.customSkuOverlay} onPress={closeCustomSku}>
          <Pressable style={styles.customSkuCard} onPress={() => {}}>
            <View style={styles.customSkuHeader}>
              <Text style={styles.customSkuTitle}>Custom SKU</Text>
              <Pressable onPress={closeCustomSku} hitSlop={8} accessibilityLabel="Close custom SKU">
                <MaterialCommunityIcons name="close" size={18} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.customSkuRow}>
              <View style={styles.customSkuField}>
                <Text style={styles.customSkuLabel}>Quantity</Text>
                <TextInput
                  style={styles.customSkuInput}
                  value={customSkuQty}
                  onChangeText={(value) => {
                    setCustomSkuQty(value);
                    if (customSkuError) setCustomSkuError(null);
                  }}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.customSkuField}>
                <Text style={styles.customSkuLabel}>Unit</Text>
                <View style={styles.customSkuUnits}>
                  {CUSTOM_UNITS.map((unit) => {
                    const active = unit === customSkuUnit;
                    return (
                      <Pressable
                        key={unit}
                        style={[styles.customSkuUnitChip, active && styles.customSkuUnitChipActive]}
                        onPress={() => {
                          setCustomSkuUnit(unit);
                          if (customSkuError) setCustomSkuError(null);
                        }}
                      >
                        <Text style={[styles.customSkuUnitText, active && styles.customSkuUnitTextActive]}>
                          {unit.toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={styles.customSkuField}>
              <Text style={styles.customSkuLabel}>Price</Text>
              <TextInput
                style={styles.customSkuInput}
                value={customSkuPrice}
                onChangeText={(value) => {
                  setCustomSkuPrice(value);
                  if (customSkuError) setCustomSkuError(null);
                }}
                placeholder="Price"
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="numeric"
              />
            </View>

            {customSkuError ? <Text style={styles.customSkuError}>{customSkuError}</Text> : null}

            <Pressable
              style={[styles.customSkuCta, !customSkuReady && styles.ctaDisabled]}
              onPress={handleCustomSkuSubmit}
              disabled={!customSkuReady}
              accessibilityLabel="Add custom SKU"
            >
              <Text style={styles.customSkuCtaText}>Add to Bill</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
  listContent: {
    padding: 12,
    paddingBottom: 130,
  },
  scanPad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  scanLeft: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  scanCenter: {
    flex: 1,
    alignItems: "flex-start",
    gap: 2,
    paddingHorizontal: 12,
  },
  scanTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  scanSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  scanRight: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  addItemsButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  addItemsText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.textInverse,
  },
  customSkuButton: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  customSkuText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.textSecondary,
  },
  addOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 15, 20, 0.55)",
    justifyContent: "center",
    padding: 16,
  },
  addCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    maxHeight: "85%",
    width: "100%",
    gap: 12,
    ...theme.shadows.sm,
  },
  addHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  addSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addSearchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    paddingVertical: 0,
  },
  addList: {
    flex: 1,
  },
  addListContent: {
    paddingVertical: 4,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  addRowSelected: {
    backgroundColor: theme.colors.surfaceAlt,
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
    gap: 6,
  },
  addRowPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  addCta: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  addCtaText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.textInverse,
  },
  customSkuOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 15, 20, 0.55)",
    justifyContent: "center",
    padding: 16,
  },
  customSkuCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
    ...theme.shadows.sm,
  },
  customSkuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customSkuTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  customSkuRow: {
    flexDirection: "row",
    gap: 12,
  },
  customSkuField: {
    flex: 1,
    gap: 6,
  },
  customSkuLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  customSkuInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  customSkuUnits: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  customSkuUnitChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.surfaceAlt,
  },
  customSkuUnitChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  customSkuUnitText: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  customSkuUnitTextActive: {
    color: theme.colors.textInverse,
  },
  customSkuError: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.warning,
  },
  customSkuCta: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  customSkuCtaText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.textInverse,
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
