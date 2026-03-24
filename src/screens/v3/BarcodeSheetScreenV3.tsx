// GCP-STG-0062: Barcode label sheet screen — fetches products, generates PDF, print/share
// GCP-STG-0536: ESC/POS barcode label printing — Print Label + Print All Labels buttons
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Pressable, ScrollView, ActivityIndicator, StyleSheet, Text, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { printBarcodeLabel } from "../../services/printerService";

type Props = { onClose: () => void };

export default function BarcodeSheetScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BarcodeSheetItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<BarcodeSheetTier>("TIER_1");
  const [generating, setGenerating] = useState(false);
  // GCP-STG-0536: Label printing state
  const [printingBarcode, setPrintingBarcode] = useState<string | null>(null);
  const [printingAll, setPrintingAll] = useState(false);

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

  // GCP-STG-0536: Print a single barcode label via ESC/POS
  const handlePrintLabel = useCallback(async (item: BarcodeSheetItem) => {
    setPrintingBarcode(item.barcode);
    try {
      const price = item.sellPrice != null ? item.sellPrice / 100 : undefined;
      const ok = await printBarcodeLabel(item.barcode, item.name, price);
      if (ok) {
        showToast("Label printed!");
      } else {
        showToast("No printer connected");
      }
    } catch {
      showToast("Print failed");
    } finally {
      setPrintingBarcode(null);
    }
  }, []);

  // GCP-STG-0536: Print all selected labels with 500ms delay between each
  const handlePrintAllLabels = useCallback(async () => {
    const selectedItems = items.filter((i) => selected.has(i.barcode));
    if (selectedItems.length === 0) {
      showToast("Select at least one product");
      return;
    }
    setPrintingAll(true);
    let printed = 0;
    let failed = 0;
    try {
      for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        const price = item.sellPrice != null ? item.sellPrice / 100 : undefined;
        try {
          const ok = await printBarcodeLabel(item.barcode, item.name, price);
          if (ok) {
            printed++;
          } else {
            failed++;
            // If first label fails (no printer), abort batch
            if (i === 0) {
              showToast("No printer connected");
              return;
            }
          }
        } catch {
          failed++;
        }
        // 500ms delay between labels to avoid overwhelming the printer
        if (i < selectedItems.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      if (failed === 0) {
        showToast(`${printed} labels printed!`);
      } else {
        showToast(`${printed} printed, ${failed} failed`);
      }
    } finally {
      setPrintingAll(false);
    }
  }, [items, selected]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>{"<-"}</Text></Pressable>
        <Text style={styles.headerTitle}>Barcode Labels</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Tier toggle */}
      <View style={styles.tierRow}>
        <Pressable style={[styles.tierBtn, tier === "TIER_1" && styles.tierActive]} onPress={() => setTier("TIER_1")}>
          <Text style={[styles.tierText, tier === "TIER_1" && styles.tierTextActive]}>3 x 8 (Standard)</Text>
        </Pressable>
        <Pressable style={[styles.tierBtn, tier === "TIER_2" && styles.tierActive]} onPress={() => setTier("TIER_2")}>
          <Text style={[styles.tierText, tier === "TIER_2" && styles.tierTextActive]}>4 x 10 (Compact)</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : items.length === 0 ? (
        <View style={{ padding: 32, alignItems: "center" }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>LABELS</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No products with barcodes</Text>
          <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Add barcodes to products first</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={styles.selectInfo}>{selected.size} of {items.length} selected</Text>
          {items.map((item) => (
            <Pressable key={item.barcode} style={[styles.itemRow, selected.has(item.barcode) && styles.itemSelected]} onPress={() => toggleItem(item.barcode)}>
              <View style={[styles.check, selected.has(item.barcode) && styles.checkChecked]}>
                {selected.has(item.barcode) ? <Text style={styles.checkMark}>V</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemBarcode}>{item.barcode}</Text>
              </View>
              {/* GCP-STG-0536: Per-item Print Label button */}
              <Pressable
                style={[styles.printLabelBtn, printingBarcode === item.barcode && { opacity: 0.5 }]}
                onPress={() => handlePrintLabel(item)}
                disabled={printingBarcode != null || printingAll}
              >
                {printingBarcode === item.barcode ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.printLabelText}>Print</Text>
                )}
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* GCP-STG-0536: Print All Labels button */}
        <Pressable
          style={[styles.printAllBtn, (printingAll || selected.size === 0 || printingBarcode != null) && { opacity: 0.5 }]}
          onPress={handlePrintAllLabels}
          disabled={printingAll || selected.size === 0 || printingBarcode != null}
        >
          {printingAll ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.printAllText}>Printing labels...</Text>
            </View>
          ) : (
            <Text style={styles.printAllText}>{`Print Labels (${selected.size})`}</Text>
          )}
        </Pressable>
        <View style={{ height: 8 }} />
        <Pressable style={[styles.generateBtn, (generating || selected.size === 0) && { opacity: 0.5 }]} onPress={handleGenerate} disabled={generating || selected.size === 0}>
          <Text style={styles.generateText}>{generating ? "Generating..." : `Generate Sheet (${selected.size})`}</Text>
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
    // GCP-STG-0536: Print Label button styles
    printLabelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, minWidth: 52, alignItems: "center", justifyContent: "center" },
    printLabelText: { fontSize: 11, fontWeight: "700", color: colors.primary },
    printAllBtn: { backgroundColor: colors.textPrimary, padding: 14, borderRadius: 14, alignItems: "center" },
    printAllText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    footer: { padding: getScreenPadding(), borderTopWidth: 1, borderTopColor: colors.border },
    generateBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 14, alignItems: "center" },
    generateText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  });
}
