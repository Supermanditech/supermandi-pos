// GCP-STG-0062: Barcode label sheet screen — fetches products, generates PDF, print/share
import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, ScrollView, ActivityIndicator, StyleSheet, Text, Alert } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { showToast } from "../../utils/showToast";
import {
  fetchBarcodeSheetItems,
  shareBarcodeSheetPdf,
  type BarcodeSheetItem,
  type BarcodeSheetItemWithCopies,
  type BarcodeSheetTier,
  inferCategory,
} from "../../services/barcodeSheet";

type Props = { onClose: () => void };

export default function BarcodeSheetScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BarcodeSheetItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<BarcodeSheetTier>("TIER_1");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchBarcodeSheetItems(tier)
      .then((data) => {
        setItems(data);
        setSelected(new Set(data.map((d) => d.barcode)));
      })
      .catch(() => showToast("Failed to load products"))
      .finally(() => setLoading(false));
  }, [tier]);

  const toggleItem = (barcode: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(barcode)) next.delete(barcode);
      else next.add(barcode);
      return next;
    });
  };

  const handleGenerate = async () => {
    const sheetItems: BarcodeSheetItemWithCopies[] = items
      .filter((i) => selected.has(i.barcode))
      .map((i) => ({ ...i, copies: 1, category: i.category ?? inferCategory(i.name) }));
    if (sheetItems.length === 0) { showToast("Select at least one product"); return; }
    setGenerating(true);
    try {
      await shareBarcodeSheetPdf(sheetItems, tier, "Barcode Labels");
      showToast("Barcode sheet ready");
    } catch (err: any) {
      if (err?.message === "sharing_unavailable") {
        Alert.alert("Sharing not available", "This device does not support file sharing.");
      } else {
        showToast("Failed to generate sheet");
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable>
        <Text style={styles.headerTitle}>Barcode Labels</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Tier toggle */}
      <View style={styles.tierRow}>
        <Pressable style={[styles.tierBtn, tier === "TIER_1" && styles.tierActive]} onPress={() => setTier("TIER_1")}>
          <Text style={[styles.tierText, tier === "TIER_1" && styles.tierTextActive]}>3 × 8 (Standard)</Text>
        </Pressable>
        <Pressable style={[styles.tierBtn, tier === "TIER_2" && styles.tierActive]} onPress={() => setTier("TIER_2")}>
          <Text style={[styles.tierText, tier === "TIER_2" && styles.tierTextActive]}>4 × 10 (Compact)</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={{ padding: 32, alignItems: "center" }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🏷️</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No products with barcodes</Text>
          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Add barcodes to products first</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={styles.selectInfo}>{selected.size} of {items.length} selected</Text>
          {items.map((item) => (
            <Pressable key={item.barcode} style={[styles.itemRow, selected.has(item.barcode) && styles.itemSelected]} onPress={() => toggleItem(item.barcode)}>
              <View style={[styles.check, selected.has(item.barcode) && styles.checkChecked]}>
                {selected.has(item.barcode) ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemBarcode}>{item.barcode}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Pressable style={[styles.generateBtn, (generating || selected.size === 0) && { opacity: 0.5 }]} onPress={handleGenerate} disabled={generating || selected.size === 0}>
          <Text style={styles.generateText}>{generating ? "Generating..." : `🏷️ Generate Sheet (${selected.size})`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: getScreenPadding(), paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    tierRow: { flexDirection: "row", gap: 8, padding: getScreenPadding(), paddingBottom: 0 },
    tierBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: "center" },
    tierActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    tierText: { fontSize: 12, fontWeight: "600", color: colors.textSecondary },
    tierTextActive: { color: colors.primary },
    list: { flex: 1, paddingHorizontal: getScreenPadding() },
    selectInfo: { fontSize: 12, color: colors.textTertiary, fontWeight: "600", marginTop: 12, marginBottom: 8 },
    itemRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.backgroundSecondary },
    itemSelected: { backgroundColor: colors.primaryLight },
    check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    checkChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkMark: { color: "#fff", fontSize: 14, fontWeight: "700" },
    itemName: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    itemBarcode: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
    footer: { padding: getScreenPadding(), borderTopWidth: 1, borderTopColor: colors.border },
    generateBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 14, alignItems: "center" },
    generateText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
