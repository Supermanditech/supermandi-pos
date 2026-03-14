// T-198: Opening Stock Ledger Creation from POS
// Initialize stock for products not yet in inventory via search/scan + quantity entry

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
// STG-397: Safe area handling for notched phones
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { theme, useThemeColors } from "../theme";
import { BackHeader } from "../components/ui/BackHeader";
import EmptyState from "../components/ui/EmptyState";
import { apiClient } from "../services/api/apiClient";
import { asError } from "../utils/errorUtils";

// =============================================================================
// TYPES
// =============================================================================

interface ProductSearchResult {
  id: string;
  name: string;
  barcode: string | null;
  hasExistingStock: boolean;
}

interface OpeningStockEntry {
  productId: string;
  productName: string;
  barcode: string | null;
  quantity: string; // kept as string for TextInput
}

interface OpeningStockSubmitItem {
  productId: string;
  quantity: number;
}

// =============================================================================
// API
// =============================================================================

interface SearchApiMatch {
  productId: string;
  barcode?: string;
  currentStock: number;
}

interface SearchApiGroup {
  groupId: string;
  displayName: string;
  matches: SearchApiMatch[];
}

async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  const response = await apiClient.get<{ success: boolean; data: SearchApiGroup[] }>(
    `/api/v1/pos/store-products/search?q=${encodeURIComponent(query)}&includeZeroStock=true`
  );
  const groups = response.data ?? [];
  return groups.flatMap((group) =>
    group.matches.map((match) => ({
      id: match.productId,
      name: group.displayName,
      barcode: match.barcode ?? null,
      hasExistingStock: match.currentStock > 0,
    }))
  );
}

async function submitOpeningStock(
  items: OpeningStockSubmitItem[]
): Promise<{ processedCount: number }> {
  const response = await apiClient.post<{ processedCount: number }>(
    "/api/v1/pos/inventory/opening-stock",
    { items }
  );
  return response;
}

// =============================================================================
// COMPONENT
// =============================================================================

interface OpeningStockScreenProps {
  onBack?: () => void;
}

export default function OpeningStockScreen({
  onBack,
}: OpeningStockScreenProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  // STG-397: Safe area insets for notched phones
  const insets = useSafeAreaInsets();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // UIUX-POS-018: useRef for debounce timer so it can be properly cancelled
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Entries to submit
  const [entries, setEntries] = useState<OpeningStockEntry[]>([]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  const handleSearch = useCallback(async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    setSearching(true);
    try {
      const results = await searchProducts(trimmed);
      setSearchResults(results);
    } catch (_e: unknown) {
    const e = asError(_e);
      if (__DEV__) console.error("[OpeningStockScreen] Search failed:", e);
      Alert.alert(t("openingStock.searchFailedTitle"), e?.message || t("openingStock.searchFailedMessage"));
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Debounced search
  // UIUX-POS-018: Use ref for timeout ID so previous timer is properly cancelled
  const handleSearchQueryChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      // Cancel previous timer
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      if (text.trim().length >= 2) {
        searchTimerRef.current = setTimeout(async () => {
          setSearching(true);
          try {
            const results = await searchProducts(text.trim());
            setSearchResults(results);
          } catch {
            // Silent fail for auto-search
          } finally {
            setSearching(false);
          }
        }, 500);
      } else {
        setSearchResults([]);
      }
    },
    []
  );

  // ==========================================================================
  // ADD PRODUCT TO ENTRIES
  // ==========================================================================

  const handleAddProduct = useCallback(
    (product: ProductSearchResult) => {
      if (product.hasExistingStock) {
        Alert.alert(
          t("openingStock.alreadyHasStockTitle"),
          t("openingStock.alreadyHasStockMessage", { name: product.name })
        );
        return;
      }

      // Check if already added
      if (entries.some((e) => e.productId === product.id)) {
        Alert.alert(t("openingStock.alreadyAddedTitle"), t("openingStock.alreadyAddedMessage", { name: product.name }));
        return;
      }

      setEntries((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          quantity: "",
        },
      ]);

      // Clear search
      setSearchQuery("");
      setSearchResults([]);
    },
    [entries]
  );

  // ==========================================================================
  // UPDATE QUANTITY
  // ==========================================================================

  const handleUpdateQuantity = useCallback(
    (productId: string, quantity: string) => {
      // Only allow numeric input
      const cleaned = quantity.replace(/[^0-9]/g, "");
      setEntries((prev) =>
        prev.map((e) =>
          e.productId === productId ? { ...e, quantity: cleaned } : e
        )
      );
    },
    []
  );

  // ==========================================================================
  // REMOVE ENTRY
  // ==========================================================================

  const handleRemoveEntry = useCallback((productId: string) => {
    setEntries((prev) => prev.filter((e) => e.productId !== productId));
  }, []);

  // ==========================================================================
  // SUBMIT
  // ==========================================================================

  const validEntries = entries.filter(
    (e) => e.quantity && parseInt(e.quantity, 10) > 0
  );

  const handleSubmit = useCallback(async () => {
    if (validEntries.length === 0) {
      Alert.alert(
        t("openingStock.noEntriesTitle"),
        t("openingStock.noEntriesMessage")
      );
      return;
    }

    Alert.alert(
      t("openingStock.confirmTitle"),
      t("openingStock.confirmMessage", { count: validEntries.length }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.submit"),
          onPress: async () => {
            setSubmitting(true);
            setProgress(t("openingStock.processing", { current: 0, total: validEntries.length }));

            // STG-455: Hoist interval so it's accessible in finally block
            let progressInterval: ReturnType<typeof setInterval> | null = null;
            try {
              const items: OpeningStockSubmitItem[] = validEntries.map(
                (e) => ({
                  productId: e.productId,
                  quantity: parseInt(e.quantity, 10),
                })
              );

              // Simulate progress updates
              let progressCount = 0;
              progressInterval = setInterval(() => {
                progressCount = Math.min(progressCount + 1, items.length);
                setProgress(t("openingStock.processing", { current: progressCount, total: items.length }));
              }, 300);

              const result = await submitOpeningStock(items);

              setProcessedCount(result.processedCount);
              setSuccess(true);
            } catch (_e: unknown) {
    const e = asError(_e);
              if (__DEV__) console.error("[OpeningStockScreen] Submit failed:", e);
              Alert.alert(
                t("openingStock.submissionFailedTitle"),
                e?.message || t("openingStock.submissionFailedMessage")
              );
            } finally {
              // STG-455: Always clear progress interval, even on error
              if (progressInterval) clearInterval(progressInterval);
              setSubmitting(false);
              setProgress(null);
            }
          },
        },
      ]
    );
  }, [validEntries]);

  // ==========================================================================
  // RESET
  // ==========================================================================

  const handleReset = useCallback(() => {
    setEntries([]);
    setSearchQuery("");
    setSearchResults([]);
    setSuccess(false);
    setProcessedCount(0);
  }, []);

  // ==========================================================================
  // STYLES
  // ==========================================================================

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // Intro
    introCard: {
      flexDirection: "row",
      alignItems: "center",
      margin: theme.spacing.md,
      padding: theme.spacing.md,
      backgroundColor: colors.primaryLight,
      borderRadius: theme.borderRadius.lg,
      gap: theme.spacing.sm,
    },
    introText: {
      flex: 1,
      fontSize: 13,
      color: colors.primaryDark,
      lineHeight: 18,
    },
    // Search
    searchContainer: {
      paddingHorizontal: theme.spacing.md,
      zIndex: 10,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      gap: theme.spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.textPrimary,
      paddingVertical: 2,
    },
    searchResults: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
      ...theme.shadows.md,
    },
    searchResultItem: {
      flexDirection: "row",
      alignItems: "center",
      padding: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    searchResultInfo: {
      flex: 1,
    },
    searchResultName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    searchResultBarcode: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    hasStockBadge: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
      backgroundColor: colors.warningSoft,
      borderRadius: theme.borderRadius.sm,
    },
    hasStockText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.warning,
    },
    // Entries
    entriesContent: {
      padding: theme.spacing.md,
      paddingBottom: theme.spacing.xl,
    },
    entryCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      gap: theme.spacing.sm,
    },
    entryInfo: {
      flex: 1,
    },
    entryName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    entryBarcode: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    qtyInput: {
      width: 72,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      textAlign: "center",
    },
    removeButton: {
      padding: 4,
    },
    // Footer
    footer: {
      marginTop: theme.spacing.md,
    },
    footerInfo: {
      fontSize: 12,
      color: colors.textTertiary,
      textAlign: "center",
      marginBottom: theme.spacing.sm,
    },
    progressContainer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    progressText: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.primary,
    },
    submitButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      gap: theme.spacing.xs,
    },
    submitButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textInverse,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    // Success
    successContainer: {
      flex: 1,
      justifyContent: "center",
      padding: theme.spacing.md,
    },
    successCard: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.xl,
      alignItems: "center",
      ...theme.shadows.md,
    },
    successIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.successSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.md,
    },
    successTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    successSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: theme.spacing.lg,
    },
    resetButton: {
      backgroundColor: colors.primary,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.borderRadius.md,
    },
    resetButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textInverse,
    },
  }), [colors]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Success state
  if (success) {
    return (
      <View style={styles.container}>
        <BackHeader title={t("openingStock.title")} onBack={onBack} />
        <View style={styles.successContainer}>
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <MaterialCommunityIcons
                name="check"
                size={36}
                color={colors.success}
              />
            </View>
            <Text style={styles.successTitle}>{t("openingStock.stockInitialized")}</Text>
            <Text style={styles.successSubtitle}>
              {t("openingStock.stockInitializedMessage", { count: processedCount })}
            </Text>
            <Pressable accessibilityRole="button" style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>{t("openingStock.addMoreProducts")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <BackHeader title={t("openingStock.title")} onBack={onBack} subtitle={t("openingStock.subtitle")} />

      {/* Intro */}
      <View style={styles.introCard}>
        <MaterialCommunityIcons
          name="package-variant"
          size={24}
          color={colors.primary}
        />
        <Text style={styles.introText}>
          {t("openingStock.introText")}
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color={colors.textTertiary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder={t("openingStock.searchPlaceholder")}
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Search products"
            value={searchQuery}
            onChangeText={handleSearchQueryChange}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          {searching && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
        </View>

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((product) => (
              <Pressable
                accessibilityRole="button"
                key={product.id}
                style={styles.searchResultItem}
                onPress={() => handleAddProduct(product)}
              >
                <View style={styles.searchResultInfo}>
                  <Text style={styles.searchResultName} numberOfLines={1}>
                    {product.name}
                  </Text>
                  {product.barcode && (
                    <Text style={styles.searchResultBarcode}>
                      {product.barcode}
                    </Text>
                  )}
                </View>
                {product.hasExistingStock ? (
                  <View style={styles.hasStockBadge}>
                    <Text style={styles.hasStockText}>{t("openingStock.hasStock")}</Text>
                  </View>
                ) : (
                  <MaterialCommunityIcons
                    name="plus-circle-outline"
                    size={22}
                    color={colors.primary}
                  />
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Entries */}
      {entries.length === 0 ? (
        <EmptyState
          icon="package-variant-plus"
          title={t("openingStock.emptyTitle")}
          description={t("openingStock.emptyDescription")}
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.productId}
          contentContainerStyle={styles.entriesContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View style={styles.entryCard}>
              <View style={styles.entryInfo}>
                <Text style={styles.entryName} numberOfLines={1}>
                  {item.productName}
                </Text>
                {item.barcode && (
                  <Text style={styles.entryBarcode}>{item.barcode}</Text>
                )}
              </View>
              <TextInput
                style={styles.qtyInput}
                value={item.quantity}
                onChangeText={(text) =>
                  handleUpdateQuantity(item.productId, text)
                }
                placeholder={t("openingStock.qty")}
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel={`Quantity for ${item.productName}`}
                keyboardType="numeric"
                maxLength={6}
              />
              <Pressable
                accessibilityLabel="Remove entry"
                accessibilityRole="button"
                style={styles.removeButton}
                onPress={() => handleRemoveEntry(item.productId)}
              >
                <MaterialCommunityIcons
                  name="close-circle"
                  size={22}
                  color={colors.error}
                />
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={styles.footerInfo}>
                {t("openingStock.productsReady", { valid: validEntries.length, total: entries.length })}
              </Text>

              {/* Submit progress */}
              {submitting && progress && (
                <View style={styles.progressContainer}>
                  <ActivityIndicator
                    size="small"
                    color={colors.primary}
                  />
                  <Text style={styles.progressText}>{progress}</Text>
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                style={[
                  styles.submitButton,
                  (validEntries.length === 0 || submitting) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={validEntries.length === 0 || submitting}
              >
                {submitting ? (
                  <ActivityIndicator
                    size="small"
                    color={colors.textInverse}
                  />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="check-all"
                      size={18}
                      color={colors.textInverse}
                    />
                    <Text style={styles.submitButtonText}>
                      {t("openingStock.submitButton", { count: validEntries.length })}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}
