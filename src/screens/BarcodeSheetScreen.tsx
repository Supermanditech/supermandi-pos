import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  fetchBarcodeSheetItems,
  getBarcodeSheetCapacity,
  shareBarcodeSheetPdf,
  type BarcodeSheetItem,
  type BarcodeSheetTier
} from "../services/barcodeSheet";
import { theme } from "../theme";

export default function BarcodeSheetScreen() {
  const [activeTier, setActiveTier] = useState<BarcodeSheetTier | null>(null);
  const [items, setItems] = useState<BarcodeSheetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"download" | "whatsapp" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (tier: BarcodeSheetTier) => {
    setActiveTier(tier);
    setLoading(true);
    setError(null);
    try {
      const results = await fetchBarcodeSheetItems(tier);
      if (results.length === 0) {
        setError("No products available for barcode sheets.");
      }
      setItems(results);
    } catch {
      setItems([]);
      setError("Unable to load products for barcode sheets.");
    } finally {
      setLoading(false);
    }
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

  const previewTitle = activeTier === "TIER_2" ? "Tier 2 Sheet" : "Tier 1 Sheet";
  const actionDisabled = !activeTier || items.length === 0 || loading;
  const actionIconColor = actionDisabled ? theme.colors.textTertiary : theme.colors.textInverse;
  const previewItems = useMemo(() => items.slice(0, 6), [items]);
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
                {previewCount > previewItems.length ? (
                  <Text style={styles.previewMoreText}>
                    +{previewCount - previewItems.length} more labels
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.previewEmpty}>
              <MaterialCommunityIcons name="file-outline" size={26} color={theme.colors.textTertiary} />
              <Text style={styles.previewEmptyText}>Generate a sheet to preview.</Text>
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
});
