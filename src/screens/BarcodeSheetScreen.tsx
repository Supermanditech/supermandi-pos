// BarcodeSheetScreen — T-166 through T-172
// Category filtering, custom selection, preview, print settings, batch printing, enriched labels
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  BARCODE_CATEGORIES,
  calculateLabelsPerRow,
  fetchBarcodeSheetItems,
  getBarcodeSheetCapacity,
  getTotalLabelCount,
  inferCategory,
  loadPrintSettings,
  savePrintSettings,
  shareBarcodeSheetPdf,
  type BarcodeCategory,
  type BarcodeSheetItem,
  type BarcodeSheetItemWithCopies,
  type BarcodeSheetTier,
  type LabelSize,
  type PaperSize,
  type PrintSettings,
} from "../services/barcodeSheet";
import { theme, useThemeColors } from "../theme";
import { asError } from "../utils/errorUtils";

// GO-LIVE-243: Persist barcode sheet tier preference
const BARCODE_TIER_KEY = "supermandi.barcode.tier.v1";
// T-167: Max products per sheet in custom selection mode
const MAX_CUSTOM_SELECTION = 100;

// T-172: Route params type for GRN pre-selection
type BarcodeSheetRouteParams = {
  grnItems?: Array<{
    barcode: string;
    name: string;
    sellPrice?: number | null;
    unit?: string | null;
    copies?: number;
  }>;
};

export default function BarcodeSheetScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { width: screenWidth } = useWindowDimensions();
  const isTablet = screenWidth >= 600;
  const previewColumns = isTablet ? 3 : 2;

  // Core state
  const [activeTier, setActiveTier] = useState<BarcodeSheetTier | null>(null);
  const [allItems, setAllItems] = useState<BarcodeSheetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"download" | "whatsapp" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // T-166: Category filter
  const [selectedCategory, setSelectedCategory] = useState<BarcodeCategory>("All");

  // T-167: Custom selection mode
  const [customMode, setCustomMode] = useState(false);
  const [selectedBarcodes, setSelectedBarcodes] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // T-169: Print settings
  const [printSettings, setPrintSettings] = useState<PrintSettings>({
    paperSize: "A4",
    labelSize: "Medium",
    labelsPerRow: 3,
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // T-170: Copies per item
  const [copiesMap, setCopiesMap] = useState<Record<string, number>>({});

  // T-168: Preview pagination
  const PAGE_SIZE = 12;
  const [previewPage, setPreviewPage] = useState(0);

  // STG-490: Product list pagination for large lists
  const PRODUCT_PAGE_SIZE = 50;
  const [productListLimit, setProductListLimit] = useState(PRODUCT_PAGE_SIZE);

  // T-172: Check for GRN pre-selection on mount
  const grnItems = (route.params as BarcodeSheetRouteParams)?.grnItems;

  // Load saved tier and print settings on mount
  useEffect(() => {
    void (async () => {
      try {
        const savedTier = await AsyncStorage.getItem(BARCODE_TIER_KEY);
        if (savedTier === "TIER_1" || savedTier === "TIER_2") {
          setActiveTier(savedTier);
        }
      } catch (e) {
        if (__DEV__) console.warn("[BarcodeSheet] Failed to load saved tier:", e);
      }
      const settings = await loadPrintSettings();
      setPrintSettings(settings);
    })();
  }, []);

  // T-172: Handle GRN pre-selection
  useEffect(() => {
    if (!grnItems || grnItems.length === 0) return;

    const items: BarcodeSheetItem[] = grnItems
      .filter((item) => item.barcode && item.barcode.trim().length > 0)
      .map((item) => ({
        barcode: item.barcode,
        name: item.name,
        sellPrice: item.sellPrice ?? null,
        unit: item.unit ?? null,
        category: inferCategory(item.name),
      }));

    if (items.length === 0) return;

    setAllItems(items);
    setHasFetched(true);
    setCustomMode(true);
    // Pre-select all GRN items
    setSelectedBarcodes(new Set(items.map((i) => i.barcode)));
    // T-172: Pre-fill copies from received quantity
    const copies: Record<string, number> = {};
    for (const grnItem of grnItems) {
      if (grnItem.barcode && grnItem.copies && grnItem.copies > 0) {
        copies[grnItem.barcode] = Math.min(grnItem.copies, 50);
      }
    }
    setCopiesMap(copies);
    // Auto-set tier
    if (!activeTier) {
      setActiveTier("TIER_1");
    }
  }, [grnItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // T-166: Items filtered by category
  const categoryFilteredItems = useMemo(() => {
    if (selectedCategory === "All") return allItems;
    return allItems.filter((item) => {
      const cat = item.category || inferCategory(item.name);
      return cat === selectedCategory;
    });
  }, [allItems, selectedCategory]);

  // T-167: Items filtered by search (in custom mode)
  const searchFilteredItems = useMemo(() => {
    if (!searchQuery.trim()) return categoryFilteredItems;
    const q = searchQuery.toLowerCase().trim();
    return categoryFilteredItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q)
    );
  }, [categoryFilteredItems, searchQuery]);

  // T-167/T-168: Final items for preview and PDF
  const finalItems: BarcodeSheetItemWithCopies[] = useMemo(() => {
    let items: BarcodeSheetItem[];
    if (customMode) {
      // Only selected items
      items = categoryFilteredItems.filter((item) => selectedBarcodes.has(item.barcode));
    } else {
      items = categoryFilteredItems;
    }
    return items.map((item) => ({
      ...item,
      category: item.category || inferCategory(item.name),
      copies: copiesMap[item.barcode] ?? 1,
    }));
  }, [categoryFilteredItems, customMode, selectedBarcodes, copiesMap]);

  // T-170: Total label count
  const totalLabelCount = useMemo(() => getTotalLabelCount(finalItems), [finalItems]);
  const totalProductCount = finalItems.length;

  // T-168: Paginated preview items
  const totalPages = Math.max(1, Math.ceil(finalItems.length / PAGE_SIZE));
  const previewItems = useMemo(
    () => finalItems.slice(previewPage * PAGE_SIZE, (previewPage + 1) * PAGE_SIZE),
    [finalItems, previewPage]
  );

  const handleGenerate = async (tier: BarcodeSheetTier) => {
    setActiveTier(tier);
    try {
      await AsyncStorage.setItem(BARCODE_TIER_KEY, tier);
    } catch (e) {
      if (__DEV__) console.warn("[BarcodeSheet] Failed to save tier preference:", e);
    }
    setLoading(true);
    setError(null);
    setPreviewPage(0);
    try {
      const results = await fetchBarcodeSheetItems(tier);
      // T-171: Enrich with inferred categories
      const enriched = results.map((item) => ({
        ...item,
        category: item.category || inferCategory(item.name),
      }));
      setAllItems(enriched);
      setHasFetched(true);
      // Reset selection when regenerating
      if (!customMode) {
        setSelectedBarcodes(new Set());
      }
    } catch {
      setAllItems([]);
      setHasFetched(true);
      setError(t("barcodeSheet.loadError", "Unable to load products for barcode sheets."));
    } finally {
      setLoading(false);
    }
  };

  const handleAddProducts = () => {
    navigation.goBack();
  };

  const handleDownload = async () => {
    if (!activeTier || finalItems.length === 0) return;
    if (actionLoading) return;
    setActionLoading("download");
    try {
      await shareBarcodeSheetPdf(finalItems, activeTier, "Save Barcode Sheet PDF", printSettings);
    } catch (_e: unknown) {
    const e = asError(_e);
      const message = e?.message ? String(e.message) : "share_failed";
      if (message === "sharing_unavailable") {
        Alert.alert(t("barcodeSheet.downloadUnavailableTitle"), t("barcodeSheet.downloadUnavailableMessage"));
      } else {
        Alert.alert(t("barcodeSheet.downloadFailedTitle"), t("barcodeSheet.downloadFailedMessage"));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleWhatsApp = async () => {
    if (!activeTier || finalItems.length === 0) return;
    if (actionLoading) return;
    setActionLoading("whatsapp");
    try {
      await shareBarcodeSheetPdf(finalItems, activeTier, "Send Barcode Sheet via WhatsApp", printSettings);
    } catch (_e: unknown) {
    const e = asError(_e);
      const message = e?.message ? String(e.message) : "share_failed";
      if (message === "sharing_unavailable") {
        Alert.alert(t("barcodeSheet.shareUnavailableTitle"), t("barcodeSheet.shareUnavailableMessage"));
      } else {
        Alert.alert(t("barcodeSheet.shareFailedTitle"), t("barcodeSheet.shareFailedMessage"));
      }
    } finally {
      setActionLoading(null);
    }
  };

  // T-167: Toggle item selection
  const toggleSelection = useCallback((barcode: string) => {
    setSelectedBarcodes((prev) => {
      const next = new Set(prev);
      if (next.has(barcode)) {
        next.delete(barcode);
      } else {
        if (next.size >= MAX_CUSTOM_SELECTION) {
          Alert.alert(t("barcodeSheet.limitReachedTitle"), t("barcodeSheet.limitReachedMessage", { max: MAX_CUSTOM_SELECTION }));
          return prev;
        }
        next.add(barcode);
      }
      return next;
    });
  }, []);

  // T-167: Select all / Deselect all
  const handleSelectAll = useCallback(() => {
    const barcodes = searchFilteredItems
      .slice(0, MAX_CUSTOM_SELECTION)
      .map((item) => item.barcode);
    setSelectedBarcodes(new Set(barcodes));
  }, [searchFilteredItems]);

  const handleDeselectAll = useCallback(() => {
    setSelectedBarcodes(new Set());
  }, []);

  // T-170: Update copies for an item
  const updateCopies = useCallback((barcode: string, delta: number) => {
    setCopiesMap((prev) => {
      const current = prev[barcode] ?? 1;
      const next = Math.max(1, Math.min(50, current + delta));
      return { ...prev, [barcode]: next };
    });
  }, []);

  // T-169: Save print settings
  const handleSaveSettings = useCallback(async (newSettings: PrintSettings) => {
    setPrintSettings(newSettings);
    await savePrintSettings(newSettings);
    setShowSettingsModal(false);
  }, []);

  const previewTitle = activeTier === "TIER_2" ? t("barcodeSheet.tier2Sheet") : t("barcodeSheet.tier1Sheet");
  const actionDisabled = !activeTier || finalItems.length === 0 || loading;
  const actionIconColor = actionDisabled ? colors.textTertiary : colors.textInverse;
  const sheetCapacity = activeTier ? getBarcodeSheetCapacity(activeTier) : 0;

  // T-171: Format price for display in preview
  const formatPrice = (price: number | null | undefined): string => {
    if (price == null || price <= 0) return "";
    return `\u20B9${(price / 100).toFixed(2)}`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("barcodeSheet.generatorTitle")}</Text>
        <Text style={styles.subtitle}>{t("barcodeSheet.generatorSubtitle")}</Text>
      </View>

      {/* Tier Selection */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("barcodeSheet.generateSheets")}</Text>
          {/* T-169: Settings gear button */}
          <Pressable
            accessibilityRole="button"
            style={styles.settingsButton}
            onPress={() => setShowSettingsModal(true)}
            accessibilityLabel={t("barcodeSheet.printSettings")}
          >
            <MaterialCommunityIcons name="cog-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.tierGrid}>
          <Pressable
            accessibilityRole="button"
            style={[styles.tierCard, activeTier === "TIER_1" && styles.tierCardActive]}
            onPress={() => handleGenerate("TIER_1")}
          >
            <MaterialCommunityIcons name="layers" size={20} color={colors.primary} />
            <Text style={styles.tierTitle}>{t("barcodeSheet.tier1Sheet")}</Text>
            <Text style={styles.tierSubtitle}>{t("barcodeSheet.tier1Subtitle")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.tierCard, activeTier === "TIER_2" && styles.tierCardActive]}
            onPress={() => handleGenerate("TIER_2")}
          >
            <MaterialCommunityIcons name="layers-triple" size={20} color={colors.primary} />
            <Text style={styles.tierTitle}>{t("barcodeSheet.tier2Sheet")}</Text>
            <Text style={styles.tierSubtitle}>{t("barcodeSheet.tier2Subtitle")}</Text>
          </Pressable>
        </View>
      </View>

      {/* T-166: Category Filter */}
      {hasFetched && allItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("barcodeSheet.filterByCategory")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            {BARCODE_CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={cat}
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => {
                    setSelectedCategory(cat);
                    setPreviewPage(0);
                  }}
                >
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* T-167: Custom Selection Mode Toggle + Search */}
      {hasFetched && allItems.length > 0 && (
        <View style={styles.section}>
          <View style={styles.customModeRow}>
            <Pressable
              accessibilityRole="switch"
              style={[styles.customModeToggle, customMode && styles.customModeToggleActive]}
              onPress={() => {
                setCustomMode((prev) => !prev);
                if (!customMode) {
                  // Entering custom mode - select all by default
                  const barcodes = categoryFilteredItems
                    .slice(0, MAX_CUSTOM_SELECTION)
                    .map((item) => item.barcode);
                  setSelectedBarcodes(new Set(barcodes));
                }
                setPreviewPage(0);
              }}
            >
              <MaterialCommunityIcons
                name={customMode ? "checkbox-multiple-marked" : "checkbox-multiple-blank-outline"}
                size={16}
                color={customMode ? colors.textInverse : colors.primary}
              />
              <Text style={[styles.customModeText, customMode && styles.customModeTextActive]}>
                {t("barcodeSheet.customSelection")}
              </Text>
            </Pressable>
            {customMode && (
              <Text style={styles.selectionCount}>
                {t("barcodeSheet.selectedCount", { count: selectedBarcodes.size, max: MAX_CUSTOM_SELECTION })}
              </Text>
            )}
          </View>

          {/* T-167: Search + Selection controls */}
          {customMode && (
            <View style={styles.customControls}>
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={18} color={colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("barcodeSheet.searchPlaceholder")}
                  placeholderTextColor={colors.textTertiary}
                  value={searchQuery}
                  onChangeText={(text) => { setSearchQuery(text); setProductListLimit(PRODUCT_PAGE_SIZE); }}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                  <Pressable accessibilityRole="button" onPress={() => setSearchQuery("")}>
                    <MaterialCommunityIcons name="close-circle" size={16} color={colors.textTertiary} />
                  </Pressable>
                )}
              </View>
              <View style={styles.selectionActions}>
                <Pressable accessibilityRole="button" style={styles.selectionBtn} onPress={handleSelectAll}>
                  <Text style={styles.selectionBtnText}>{t("barcodeSheet.selectAll")}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" style={styles.selectionBtn} onPress={handleDeselectAll}>
                  <Text style={styles.selectionBtnText}>{t("barcodeSheet.deselectAll")}</Text>
                </Pressable>
              </View>

              {/* T-167: Product list with checkboxes + T-170: Copies stepper */}
              <View style={styles.productListContainer}>
                {searchFilteredItems.length === 0 ? (
                  <View style={styles.emptySearch}>
                    <Text style={styles.emptySearchText}>{t("barcodeSheet.noProductsMatch")}</Text>
                  </View>
                ) : (
                  searchFilteredItems.slice(0, productListLimit).map((item) => {
                    const isSelected = selectedBarcodes.has(item.barcode);
                    const copies = copiesMap[item.barcode] ?? 1;
                    return (
                      <View key={item.barcode} style={styles.productRow}>
                        <Pressable
                          accessibilityRole="checkbox"
                          style={styles.productCheckArea}
                          onPress={() => toggleSelection(item.barcode)}
                        >
                          <MaterialCommunityIcons
                            name={isSelected ? "checkbox-marked" : "checkbox-blank-outline"}
                            size={20}
                            color={isSelected ? colors.primary : colors.textTertiary}
                          />
                          <View style={styles.productInfo}>
                            <Text style={styles.productName} numberOfLines={1}>
                              {item.name || item.barcode}
                            </Text>
                            <View style={styles.productMeta}>
                              <Text style={styles.productBarcode} numberOfLines={1}>
                                {item.barcode}
                              </Text>
                              {/* T-171: Show price in product list */}
                              {item.sellPrice != null && item.sellPrice > 0 && (
                                <Text style={styles.productPrice}>
                                  {formatPrice(item.sellPrice)}
                                </Text>
                              )}
                            </View>
                          </View>
                        </Pressable>

                        {/* T-170: Copies stepper */}
                        {isSelected && (
                          <View style={styles.copiesStepper}>
                            <Pressable
                              accessibilityRole="button"
                              style={styles.stepperBtn}
                              onPress={() => updateCopies(item.barcode, -1)}
                              disabled={copies <= 1}
                            >
                              <MaterialCommunityIcons
                                name="minus"
                                size={14}
                                color={copies <= 1 ? colors.textTertiary : colors.primary}
                              />
                            </Pressable>
                            <Text style={styles.stepperValue}>{copies}</Text>
                            <Pressable
                              accessibilityRole="button"
                              style={styles.stepperBtn}
                              onPress={() => updateCopies(item.barcode, 1)}
                              disabled={copies >= 50}
                            >
                              <MaterialCommunityIcons
                                name="plus"
                                size={14}
                                color={copies >= 50 ? colors.textTertiary : colors.primary}
                              />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
                {searchFilteredItems.length > productListLimit && (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.loadMoreBtn}
                    onPress={() => setProductListLimit((prev) => prev + PRODUCT_PAGE_SIZE)}
                  >
                    <Text style={styles.loadMoreText}>
                      {t("barcodeSheet.loadMore", { count: searchFilteredItems.length - productListLimit })}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {/* T-168: Preview Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("barcodeSheet.preview")}</Text>
        <View style={styles.previewCard}>
          {loading ? (
            <View style={styles.previewEmpty}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.previewEmptyText}>{t("barcodeSheet.generatingPreview")}</Text>
            </View>
          ) : error ? (
            <View style={styles.previewEmpty}>
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color={colors.warning} />
              <Text style={styles.previewEmptyText}>{error}</Text>
            </View>
          ) : finalItems.length > 0 ? (
            <View style={styles.previewContent}>
              <View style={styles.previewSheet}>
                <MaterialCommunityIcons name="barcode" size={28} color={colors.primary} />
                <Text style={styles.previewTitle}>{previewTitle}</Text>
                <Text style={styles.previewMeta}>
                  {/* T-170: Show total labels vs products */}
                  {t("barcodeSheet.labelsSummary", { labels: totalLabelCount, products: totalProductCount })}
                  {sheetCapacity > 0 ? ` | ${t("barcodeSheet.capacity", { count: sheetCapacity })}` : ""}
                </Text>
              </View>

              {/* T-168: Grid preview */}
              <View style={[styles.previewGrid, { flexDirection: "row", flexWrap: "wrap" }]}>
                {previewItems.map((item, idx) => {
                  const isDeselectable = customMode;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={`${item.barcode}-${idx}`}
                      style={[
                        styles.previewCell,
                        { width: `${Math.floor(100 / previewColumns)}%` },
                      ]}
                      onPress={isDeselectable ? () => toggleSelection(item.barcode) : undefined}
                    >
                      <View style={styles.previewCellInner}>
                        {/* T-171: Category header */}
                        {item.category && item.category !== "All" && (
                          <Text style={styles.previewCellCategory} numberOfLines={1}>
                            {item.category}
                          </Text>
                        )}
                        <Text style={styles.previewCellName} numberOfLines={1}>
                          {item.name || t("barcodeSheet.unnamed")}
                        </Text>
                        <MaterialCommunityIcons name="barcode" size={22} color={colors.textSecondary} />
                        <Text style={styles.previewCellCode} numberOfLines={1}>
                          {item.barcode}
                        </Text>
                        {/* T-171: Price and unit */}
                        {(item.sellPrice != null && item.sellPrice > 0) && (
                          <Text style={styles.previewCellPrice}>
                            {formatPrice(item.sellPrice)}
                            {item.unit ? ` / ${item.unit}` : ""}
                          </Text>
                        )}
                        {/* T-170: Copies badge */}
                        {item.copies > 1 && (
                          <View style={styles.copiesBadge}>
                            <Text style={styles.copiesBadgeText}>x{item.copies}</Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* Pagination */}
              {finalItems.length > PAGE_SIZE && (
                <View style={styles.paginationRow}>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.paginationBtn, previewPage === 0 && styles.paginationBtnDisabled]}
                    onPress={() => setPreviewPage((p) => Math.max(0, p - 1))}
                    disabled={previewPage === 0}
                    accessibilityLabel={t("barcodeSheet.previousPage")}
                  >
                    <MaterialCommunityIcons
                      name="chevron-left"
                      size={18}
                      color={previewPage === 0 ? colors.textTertiary : colors.primary}
                    />
                    <Text style={[styles.paginationText, previewPage === 0 && styles.paginationTextDisabled]}>
                      {t("barcodeSheet.prev")}
                    </Text>
                  </Pressable>
                  <Text style={styles.paginationInfo}>
                    {previewPage + 1} / {totalPages}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.paginationBtn, previewPage >= totalPages - 1 && styles.paginationBtnDisabled]}
                    onPress={() => setPreviewPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={previewPage >= totalPages - 1}
                    accessibilityLabel={t("barcodeSheet.nextPage")}
                  >
                    <Text
                      style={[
                        styles.paginationText,
                        previewPage >= totalPages - 1 && styles.paginationTextDisabled,
                      ]}
                    >
                      {t("barcodeSheet.next")}
                    </Text>
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={18}
                      color={previewPage >= totalPages - 1 ? colors.textTertiary : colors.primary}
                    />
                  </Pressable>
                </View>
              )}

              {/* T-168: Showing N labels text */}
              <Text style={styles.showingLabelsText}>
                {t("barcodeSheet.showingLabels", { count: totalLabelCount })}
              </Text>
            </View>
          ) : hasFetched ? (
            <View style={styles.previewEmpty}>
              <MaterialCommunityIcons name="package-variant" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>
                {t("barcodeSheet.emptyTitle", "No Products Yet")}
              </Text>
              <Text style={styles.emptyDescription}>
                {t(
                  "barcodeSheet.emptyDescription",
                  "Add products by scanning barcodes in the SELL tab. Once added, you can generate barcode sheets here."
                )}
              </Text>
              <Pressable accessibilityRole="button" style={styles.addProductsButton} onPress={handleAddProducts}>
                <MaterialCommunityIcons name="plus" size={16} color={colors.textInverse} />
                <Text style={styles.addProductsText}>
                  {t("barcodeSheet.addProducts", "Add Products")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.previewEmpty}>
              <MaterialCommunityIcons name="file-outline" size={26} color={colors.textTertiary} />
              <Text style={styles.previewEmptyText}>
                {t("barcodeSheet.generatePrompt", "Generate a sheet to preview.")}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("barcodeSheet.actions")}</Text>
        <Pressable
          accessibilityRole="button"
          style={[styles.actionButton, styles.downloadButton, actionDisabled && styles.actionButtonDisabled]}
          onPress={handleDownload}
          disabled={actionDisabled}
        >
          <MaterialCommunityIcons name="download" size={18} color={actionIconColor} />
          <Text style={[styles.actionText, actionDisabled && styles.actionTextDisabled]}>
            {actionLoading === "download" ? t("barcodeSheet.preparing") : t("barcodeSheet.downloadPdf")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.actionButton, styles.whatsAppButton, actionDisabled && styles.actionButtonDisabled]}
          onPress={handleWhatsApp}
          disabled={actionDisabled}
        >
          <MaterialCommunityIcons name="whatsapp" size={18} color={actionIconColor} />
          <Text style={[styles.actionText, actionDisabled && styles.actionTextDisabled]}>
            {actionLoading === "whatsapp" ? t("barcodeSheet.sharing") : t("barcodeSheet.sendViaWhatsApp")}
          </Text>
        </Pressable>
      </View>

      {/* T-169: Print Settings Modal */}
      <PrintSettingsModal
        visible={showSettingsModal}
        settings={printSettings}
        onSave={handleSaveSettings}
        onClose={() => setShowSettingsModal(false)}
      />
    </ScrollView>
  );
}

// =============================================================================
// T-169: Print Settings Modal Component
// =============================================================================

function PrintSettingsModal({
  visible,
  settings,
  onSave,
  onClose,
}: {
  visible: boolean;
  settings: PrintSettings;
  onSave: (settings: PrintSettings) => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const modalStyles = useMemo(() => createModalStyles(colors), [colors]);
  const [paperSize, setPaperSize] = useState<PaperSize>(settings.paperSize);
  const [labelSize, setLabelSize] = useState<LabelSize>(settings.labelSize);
  const [labelsPerRow, setLabelsPerRow] = useState(settings.labelsPerRow);

  useEffect(() => {
    setPaperSize(settings.paperSize);
    setLabelSize(settings.labelSize);
    setLabelsPerRow(settings.labelsPerRow);
  }, [settings]);

  // Auto-calculate labels per row when paper or label size changes
  useEffect(() => {
    const auto = calculateLabelsPerRow(paperSize, labelSize);
    setLabelsPerRow(auto);
  }, [paperSize, labelSize]);

  const paperSizes: PaperSize[] = ["A4", "Letter", "Custom"];
  const labelSizes: LabelSize[] = ["Small", "Medium", "Large"];
  const labelDescriptions: Record<LabelSize, string> = {
    Small: "25 x 15 mm",
    Medium: "38 x 25 mm",
    Large: "50 x 30 mm",
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.card}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>{t("barcodeSheet.printSettings")}</Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Paper Size */}
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t("barcodeSheet.paperSize")}</Text>
            <View style={modalStyles.chipRow}>
              {paperSizes.map((ps) => (
                <Pressable
                  accessibilityRole="button"
                  key={ps}
                  style={[modalStyles.chip, paperSize === ps && modalStyles.chipActive]}
                  onPress={() => setPaperSize(ps)}
                >
                  <Text style={[modalStyles.chipText, paperSize === ps && modalStyles.chipTextActive]}>
                    {ps}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Label Size */}
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t("barcodeSheet.labelSize")}</Text>
            <View style={modalStyles.chipRow}>
              {labelSizes.map((ls) => (
                <Pressable
                  accessibilityRole="button"
                  key={ls}
                  style={[modalStyles.chip, labelSize === ls && modalStyles.chipActive]}
                  onPress={() => setLabelSize(ls)}
                >
                  <View style={modalStyles.chipContent}>
                    <Text style={[modalStyles.chipText, labelSize === ls && modalStyles.chipTextActive]}>
                      {ls}
                    </Text>
                    <Text style={[modalStyles.chipSubtext, labelSize === ls && modalStyles.chipSubtextActive]}>
                      {labelDescriptions[ls]}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Labels per row (auto) */}
          <View style={modalStyles.fieldGroup}>
            <Text style={modalStyles.fieldLabel}>{t("barcodeSheet.labelsPerRow")}</Text>
            <Text style={modalStyles.fieldValue}>{t("barcodeSheet.labelsPerRowValue", { count: labelsPerRow })}</Text>
          </View>

          {/* Save */}
          <Pressable
            accessibilityRole="button"
            style={modalStyles.saveButton}
            onPress={() => onSave({ paperSize, labelSize, labelsPerRow })}
          >
            <Text style={modalStyles.saveButtonText}>{t("barcodeSheet.saveSettings")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  header: {
    gap: 6,
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: 18,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  // T-169: Settings gear button
  settingsButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tierGrid: {
    flexDirection: "row",
    gap: 12,
  },
  tierCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  tierCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceAlt,
  },
  tierTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  tierSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
  },

  // T-166: Category filter styles
  categoryRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  categoryChipTextActive: {
    color: colors.textInverse,
  },

  // T-167: Custom selection mode styles
  customModeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customModeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  customModeToggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  customModeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
  customModeTextActive: {
    color: colors.textInverse,
  },
  selectionCount: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  customControls: {
    gap: 10,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    paddingVertical: 4,
  },
  selectionActions: {
    flexDirection: "row",
    gap: 8,
  },
  selectionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectionBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },

  // T-167: Product list
  productListContainer: {
    maxHeight: 400,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  loadMoreBtn: {
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productCheckArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  productMeta: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  productBarcode: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  productPrice: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
  },
  emptySearch: {
    padding: 20,
    alignItems: "center",
  },
  emptySearchText: {
    fontSize: 12,
    color: colors.textTertiary,
  },

  // T-170: Copies stepper
  copiesStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
  },
  stepperBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  stepperValue: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textPrimary,
    minWidth: 22,
    textAlign: "center",
  },

  // T-168: Preview styles
  previewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    minHeight: 160,
    justifyContent: "center",
  },
  previewContent: {
    alignItems: "center",
  },
  previewSheet: {
    alignItems: "center",
    gap: 6,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    width: "100%",
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  previewMeta: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  previewGrid: {
    marginTop: 12,
    width: "100%",
  },
  // T-168: Preview cell styles
  previewCell: {
    padding: 4,
  },
  previewCellInner: {
    alignItems: "center",
    gap: 3,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 90,
  },
  previewCellCategory: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewCellName: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  previewCellCode: {
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  previewCellPrice: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.success,
  },
  // T-170: Copies badge in preview
  copiesBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  copiesBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textInverse,
  },
  showingLabelsText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: "center",
  },
  previewEmpty: {
    alignItems: "center",
    gap: 8,
  },
  previewEmptyText: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Actions
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  downloadButton: {
    backgroundColor: colors.primary,
  },
  whatsAppButton: {
    backgroundColor: colors.success,
  },
  actionButtonDisabled: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textInverse,
  },
  actionTextDisabled: {
    color: colors.textSecondary,
  },

  // Empty state styles
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
    marginTop: 4,
  },
  emptyDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  addProductsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
  },
  addProductsText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textInverse,
  },

  // Pagination styles
  paginationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 8,
    paddingVertical: 4,
  },
  paginationBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  paginationBtnDisabled: {
    opacity: 0.5,
  },
  paginationText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  paginationTextDisabled: {
    color: colors.textTertiary,
  },
  paginationInfo: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
}); }

// T-169: Modal styles
function createModalStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  fieldValue: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipContent: {
    alignItems: "center",
    gap: 2,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: colors.textInverse,
  },
  chipSubtext: {
    fontSize: 11,
    color: colors.textTertiary,
  },
  chipSubtextActive: {
    color: colors.textInverse,
    opacity: 0.8,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textInverse,
  },
}); }
