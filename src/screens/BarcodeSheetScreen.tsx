import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  fetchBarcodeSheetItems,
  getBarcodeSheetCapacity,
  shareBarcodeSheetPdf,
  type BarcodeSheetItem,
  type BarcodeSheetTier
} from "../services/barcodeSheet";
import { theme } from "../theme";

// GO-LIVE-243: Persist barcode sheet tier preference
const BARCODE_TIER_KEY = "supermandi.barcode.tier.v1";

export default function BarcodeSheetScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const [activeTier, setActiveTier] = useState<BarcodeSheetTier | null>(null);
  const [items, setItems] = useState<BarcodeSheetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"download" | "whatsapp" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // GL-BARCODE-001: Track if we've tried fetching (to distinguish initial vs empty state)
  const [hasFetched, setHasFetched] = useState(false);

  // GO-LIVE-243: Load saved tier preference on mount
  useEffect(() => {
    void (async () => {
      try {
        const savedTier = await AsyncStorage.getItem(BARCODE_TIER_KEY);
        if (savedTier === "TIER_1" || savedTier === "TIER_2") {
          setActiveTier(savedTier);
        }
      } catch (e) {
        console.warn("[BarcodeSheet] Failed to load saved tier:", e);
      }
    })();
  }, []);

  const handleGenerate = async (tier: BarcodeSheetTier) => {
    setActiveTier(tier);
    // GO-LIVE-243: Persist tier preference
    try {
      await AsyncStorage.setItem(BARCODE_TIER_KEY, tier);
    } catch (e) {
      console.warn("[BarcodeSheet] Failed to save tier preference:", e);
    }
    setLoading(true);
    setError(null);
    setPreviewPage(0); // AUDIT-POS-010: Reset pagination on new generation
    try {
      const results = await fetchBarcodeSheetItems(tier);
      setItems(results);
      setHasFetched(true);
      // GL-BARCODE-001: Don't set error for empty results - show empty state CTA instead
    } catch {
      setItems([]);
      setHasFetched(true);
      setError(t("barcodeSheet.loadError", "Unable to load products for barcode sheets."));
    } finally {
      setLoading(false);
    }
  };

  // GL-BARCODE-001: Navigate to SELL tab to add products
  const handleAddProducts = () => {
    // Go back to POS root which shows SELL tab
    navigation.goBack();
  };

  const handleDownload = async () => {
    if (!activeTier || items.length === 0) return;
    if (actionLoading) return;
    setActionLoading("download");
    try {
      await shareBarcodeSheetPdf(items, activeTier, "Save Barcode Sheet PDF");
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "share_failed";
      if (message === "sharing_unavailable") {
        Alert.alert("Download unavailable", "Sharing is not available on this device.");
      } else {
        Alert.alert("Download failed", "Unable to export the barcode sheet.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleWhatsApp = async () => {
    if (!activeTier || items.length === 0) return;
    if (actionLoading) return;
    setActionLoading("whatsapp");
    try {
      await shareBarcodeSheetPdf(items, activeTier, "Send Barcode Sheet via WhatsApp");
    } catch (e: any) {
      const message = e?.message ? String(e.message) : "share_failed";
      if (message === "sharing_unavailable") {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
      } else {
        Alert.alert("Share failed", "Unable to share the barcode sheet.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  // AUDIT-POS-010: Client-side pagination for barcode preview
  const PAGE_SIZE = 10;
  const [previewPage, setPreviewPage] = useState(0);
  const previewTitle = activeTier === "TIER_2" ? "Tier 2 Sheet" : "Tier 1 Sheet";
  const actionDisabled = !activeTier || items.length === 0 || loading;
  const actionIconColor = actionDisabled ? theme.colors.textTertiary : theme.colors.textInverse;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const previewItems = useMemo(
    () => items.slice(previewPage * PAGE_SIZE, (previewPage + 1) * PAGE_SIZE),
    [items, previewPage]
  );
  const previewCount = items.length;
  const sheetCapacity = activeTier ? getBarcodeSheetCapacity(activeTier) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Barcode Sheet Generator</Text>
        <Text style={styles.subtitle}>Generate, preview, and share barcode sheets.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Generate Sheets</Text>
        <View style={styles.tierGrid}>
          <Pressable
            style={[styles.tierCard, activeTier === "TIER_1" && styles.tierCardActive]}
            onPress={() => handleGenerate("TIER_1")}
          >
            <MaterialCommunityIcons name="layers" size={20} color={theme.colors.primary} />
            <Text style={styles.tierTitle}>Tier 1 Sheet</Text>
            <Text style={styles.tierSubtitle}>Standard barcode labels</Text>
          </Pressable>
          <Pressable
            style={[styles.tierCard, activeTier === "TIER_2" && styles.tierCardActive]}
            onPress={() => handleGenerate("TIER_2")}
          >
            <MaterialCommunityIcons name="layers-triple" size={20} color={theme.colors.primary} />
            <Text style={styles.tierTitle}>Tier 2 Sheet</Text>
            <Text style={styles.tierSubtitle}>Dense barcode labels</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preview</Text>
        <View style={styles.previewCard}>
          {loading ? (
            <View style={styles.previewEmpty}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={styles.previewEmptyText}>Generating preview...</Text>
            </View>
          ) : error ? (
            <View style={styles.previewEmpty}>
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color={theme.colors.warning} />
              <Text style={styles.previewEmptyText}>{error}</Text>
            </View>
          ) : items.length > 0 ? (
            <View style={styles.previewContent}>
              <View style={styles.previewSheet}>
                <MaterialCommunityIcons name="barcode" size={28} color={theme.colors.primary} />
                <Text style={styles.previewTitle}>{previewTitle}</Text>
                <Text style={styles.previewMeta}>
                  {previewCount} labels ready (capacity {sheetCapacity})
                </Text>
              </View>
              <View style={styles.previewGrid}>
                {previewItems.map((item) => (
                  <View key={item.barcode} style={styles.previewChip}>
                    <MaterialCommunityIcons name="barcode" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.previewChipText} numberOfLines={1}>
                      {item.name || item.barcode}
                    </Text>
                  </View>
                ))}
                {/* AUDIT-POS-010: Pagination controls for large barcode sets */}
                {items.length > PAGE_SIZE && (
                  <View style={styles.paginationRow}>
                    <Pressable
                      style={[styles.paginationBtn, previewPage === 0 && styles.paginationBtnDisabled]}
                      onPress={() => setPreviewPage(p => Math.max(0, p - 1))}
                      disabled={previewPage === 0}
                      accessibilityLabel="Previous page"
                    >
                      <MaterialCommunityIcons name="chevron-left" size={18} color={previewPage === 0 ? theme.colors.textTertiary : theme.colors.primary} />
                      <Text style={[styles.paginationText, previewPage === 0 && styles.paginationTextDisabled]}>Prev</Text>
                    </Pressable>
                    <Text style={styles.paginationInfo}>
                      {previewPage + 1} / {totalPages}
                    </Text>
                    <Pressable
                      style={[styles.paginationBtn, previewPage >= totalPages - 1 && styles.paginationBtnDisabled]}
                      onPress={() => setPreviewPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={previewPage >= totalPages - 1}
                      accessibilityLabel="Next page"
                    >
                      <Text style={[styles.paginationText, previewPage >= totalPages - 1 && styles.paginationTextDisabled]}>Next</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={previewPage >= totalPages - 1 ? theme.colors.textTertiary : theme.colors.primary} />
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          ) : hasFetched ? (
            /* GL-BARCODE-001: Empty state with CTA for stores with no products */
            <View style={styles.previewEmpty}>
              <MaterialCommunityIcons name="package-variant" size={32} color={theme.colors.textTertiary} />
              <Text style={styles.emptyTitle}>
                {t("barcodeSheet.emptyTitle", "No Products Yet")}
              </Text>
              <Text style={styles.emptyDescription}>
                {t("barcodeSheet.emptyDescription", "Add products by scanning barcodes in the SELL tab. Once added, you can generate barcode sheets here.")}
              </Text>
              <Pressable style={styles.addProductsButton} onPress={handleAddProducts}>
                <MaterialCommunityIcons name="plus" size={16} color={theme.colors.textInverse} />
                <Text style={styles.addProductsText}>
                  {t("barcodeSheet.addProducts", "Add Products")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.previewEmpty}>
              <MaterialCommunityIcons name="file-outline" size={26} color={theme.colors.textTertiary} />
              <Text style={styles.previewEmptyText}>
                {t("barcodeSheet.generatePrompt", "Generate a sheet to preview.")}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <Pressable
          style={[styles.actionButton, styles.downloadButton, actionDisabled && styles.actionButtonDisabled]}
          onPress={handleDownload}
          disabled={actionDisabled}
        >
          <MaterialCommunityIcons name="download" size={18} color={actionIconColor} />
          <Text style={[styles.actionText, actionDisabled && styles.actionTextDisabled]}>
            {actionLoading === "download" ? "Preparing..." : "Download PDF"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.whatsAppButton, actionDisabled && styles.actionButtonDisabled]}
          onPress={handleWhatsApp}
          disabled={actionDisabled}
        >
          <MaterialCommunityIcons name="whatsapp" size={18} color={actionIconColor} />
          <Text style={[styles.actionText, actionDisabled && styles.actionTextDisabled]}>
            {actionLoading === "whatsapp" ? "Sharing..." : "Send via WhatsApp"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  section: {
    marginBottom: 18,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  tierGrid: {
    flexDirection: "row",
    gap: 12,
  },
  tierCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  tierCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceAlt,
  },
  tierTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  tierSubtitle: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  previewCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
    width: "100%",
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.textPrimary,
  },
  previewMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  previewGrid: {
    marginTop: 12,
    width: "100%",
    gap: 8,
  },
  previewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  previewChipText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  previewMoreText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  previewEmpty: {
    alignItems: "center",
    gap: 8,
  },
  previewEmptyText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  downloadButton: {
    backgroundColor: theme.colors.primary,
  },
  whatsAppButton: {
    backgroundColor: theme.colors.success,
  },
  actionButtonDisabled: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.textInverse,
  },
  actionTextDisabled: {
    color: theme.colors.textSecondary,
  },
  // GL-BARCODE-001: Empty state styles
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  emptyDescription: {
    fontSize: 12,
    color: theme.colors.textSecondary,
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
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
  },
  addProductsText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
  // AUDIT-POS-010: Pagination styles
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
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  paginationBtnDisabled: {
    opacity: 0.4,
  },
  paginationText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
  },
  paginationTextDisabled: {
    color: theme.colors.textTertiary,
  },
  paginationInfo: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
});
