import React, { useMemo, useState, useCallback, useEffect } from "react";
import { View, Pressable, TextInput, StyleSheet, Text, Modal } from "react-native";
import Svg, { Rect, Path, Line } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { showToast } from "../../utils/showToast";
import { useProductsStore } from "../../stores/productsStore";
import { useCartStore } from "../../stores/cartStore";
import { setHidScanHandler } from "../../services/hidScannerService";
import { buildCartItem } from "../../services/cartPayload";
import { logger } from "../../services/logger";

// V3-003: Context-aware barcode scan — wired to real productsStore + cartStore

export type ScanContext = "sell" | "stock_in" | "new_product";

type ScanScreenV3Props = {
  visible: boolean;
  defaultContext?: ScanContext;
  onClose: () => void;
  onProductFound: (barcode: string, context: ScanContext) => void;
  onNewProduct: (barcode: string) => void;
};

type ScanResult = {
  barcode: string;
  productName?: string;
  price?: number;
  stock?: number;
  isNew: boolean;
};

export default function ScanScreenV3({ visible, defaultContext = "sell", onClose, onProductFound, onNewProduct }: ScanScreenV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [context, setContext] = useState<ScanContext>(defaultContext);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  // V3-003: Real barcode lookup from productsStore + cartStore
  const getProductByBarcode = useProductsStore((s) => s.getProductByBarcode);
  const addItem = useCartStore((s) => s.addItem);

  const handleScanSubmit = useCallback(() => {
    const code = barcodeInput.trim();
    if (!code) return;

    // Look up barcode in store's product database
    const product = getProductByBarcode(code);
    if (product) {
      const result: ScanResult = {
        barcode: code,
        productName: product.name,
        price: product.priceMinor,
        stock: product.stock ?? undefined,
        isNew: false,
      };
      setLastResult(result);

      if (context === "sell") {
        // Add to cart
        const existing = useCartStore.getState().items.find((i) => i.barcode === code);
        if (existing) {
          useCartStore.getState().updateQuantity(existing.id, existing.quantity + 1);
          showToast(`${product.name} ×${existing.quantity + 1}`);
        } else {
          // V3-FIX-120: Use canonical cart payload
          addItem(buildCartItem(product));
          showToast(`${product.name} added to cart`);
        }
        onProductFound(code, context);
      } else if (context === "stock_in") {
        showToast(`${product.name} — ready for stock inward`);
        onProductFound(code, context);
      }
      logger.debug("V3Scan", `found:${code},product:${product.name},context:${context}`);
    } else {
      // Product not found — show new product prompt
      setLastResult({ barcode: code, isNew: true });
      logger.debug("V3Scan", `not_found:${code}`);
    }
    setBarcodeInput("");
  }, [barcodeInput, context, getProductByBarcode, addItem, onProductFound]);

  // DA-028: Wire HID scanner service — hardware barcodes auto-submit
  useEffect(() => {
    if (!visible) return;
    const handler = (barcode: string) => {
      setBarcodeInput(barcode);
      // Auto-submit after short delay for HID scanner
      setTimeout(() => {
        const code = barcode.trim();
        if (!code) return;
        const product = getProductByBarcode(code);
        if (product) {
          if (context === "sell") {
            const existing = useCartStore.getState().items.find((i) => i.barcode === code);
            if (existing) {
              useCartStore.getState().updateQuantity(existing.id, existing.quantity + 1);
              showToast(`${product.name} ×${existing.quantity + 1}`);
            } else {
              // V3-FIX-120: Use canonical cart payload
              addItem(buildCartItem(product));
              showToast(`${product.name} added to cart`);
            }
            onProductFound(code, context);
          } else {
            showToast(`${product.name} — ${context}`);
            onProductFound(code, context);
          }
          setLastResult({ barcode: code, productName: product.name, price: product.priceMinor, stock: product.stock ?? undefined, isNew: false });
        } else {
          setLastResult({ barcode: code, isNew: true });
        }
        setBarcodeInput("");
      }, 50);
    };
    setHidScanHandler(handler);
    return () => setHidScanHandler(null);
  }, [visible, context, getProductByBarcode, addItem, onProductFound]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={onClose} accessibilityLabel="Close scanner">
            <Text style={styles.backText}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Scan Barcode</Text>
          <View style={{ width: 30 }} />
        </View>

        {/* Camera viewfinder area */}
        <View style={styles.viewfinder}>
          <View style={styles.scanFrame}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            {/* Scan line animation placeholder */}
            <View style={styles.scanLine} />
          </View>
          <Text style={styles.viewfinderText}>Point camera at barcode</Text>
          <View style={styles.hidStatus}>
            <View style={styles.hidDot} />
            <Text style={styles.hidText}>HID Scanner Active</Text>
          </View>
        </View>

        {/* Manual barcode input */}
        <View style={styles.inputArea}>
          <View style={styles.inputRow}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2}>
              <Rect x={3} y={3} width={18} height={18} rx={2} />
              <Line x1={7} y1={7} x2={7} y2={7.01} strokeWidth={3} />
              <Line x1={7} y1={12} x2={17} y2={12} />
              <Line x1={7} y1={17} x2={7} y2={17.01} strokeWidth={3} />
            </Svg>
            <TextInput
              style={styles.barcodeInput}
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              placeholder="Type barcode or scan with HID..."
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              returnKeyType="go"
              onSubmitEditing={handleScanSubmit}
              autoFocus
            />
            <Pressable style={styles.submitBtn} onPress={handleScanSubmit}>
              <Text style={styles.submitText}>↵</Text>
            </Pressable>
          </View>
        </View>

        {/* V3-FIX-069: Context toggle only visible for non-sell entry points */}
        {defaultContext !== "sell" ? (
          <View style={styles.contextRow}>
            <Text style={styles.contextLabel}>SCAN MODE</Text>
            <View style={styles.contextToggle}>
              {(["sell", "stock_in", "new_product"] as ScanContext[]).map((ctx) => (
                <Pressable
                  key={ctx}
                  style={[styles.contextBtn, context === ctx && styles.contextBtnActive]}
                  onPress={() => setContext(ctx)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: context === ctx }}
                >
                  <Text style={[styles.contextText, context === ctx && styles.contextTextActive]}>
                    {ctx === "sell" ? "Sell" : ctx === "stock_in" ? "Stock In" : "New Product"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Last scan result */}
        {lastResult ? (
          <View style={styles.resultPanel}>
            {!lastResult.isNew ? (
              <View style={styles.resultFound}>
                <View style={styles.resultEmoji}><Text style={{ fontSize: 28 }}>🍪</Text></View>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName}>{lastResult.productName}</Text>
                  <Text style={styles.resultBarcode}>{lastResult.barcode}</Text>
                </View>
                <View style={styles.resultRight}>
                  <Text style={styles.resultPrice}>₹{((lastResult.price ?? 0) / 100).toFixed(0)}</Text>
                  <Text style={styles.resultStock}>Stock: {lastResult.stock}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.resultNew}>
                <Text style={styles.resultNewIcon}>⚠</Text>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultNewTitle}>Product Not Found</Text>
                  <Text style={styles.resultBarcode}>{lastResult.barcode}</Text>
                </View>
                <Pressable
                  style={styles.createBtn}
                  onPress={() => { onNewProduct(lastResult.barcode); onClose(); }}
                  accessibilityLabel="Create new product"
                >
                  <Text style={styles.createBtnText}>New Product</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.resultAction}>
              <Text style={styles.resultActionText}>
                {!lastResult.isNew
                  ? (context === "sell" ? "✓ Added to cart!" : context === "stock_in" ? "✓ Stock recorded!" : "✓ Product found")
                  : "Tap Create to add this product to your store"}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0F172A" },
    header: { flexDirection: "row", alignItems: "center", padding: getScreenPadding(), paddingTop: 48 },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    // Viewfinder
    viewfinder: { flex: 1, alignItems: "center", justifyContent: "center" },
    scanFrame: { width: 220, height: 220, borderWidth: 2, borderColor: "rgba(37,99,235,0.5)", borderRadius: 18, position: "relative" },
    corner: { position: "absolute", width: 24, height: 24, borderColor: "#fff" },
    cornerTL: { top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
    cornerTR: { top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
    cornerBL: { bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
    cornerBR: { bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
    scanLine: { position: "absolute", top: "50%", left: 16, right: 16, height: 2, backgroundColor: colors.primary, borderRadius: 1 },
    viewfinderText: { color: "#fff", fontSize: 14, fontWeight: "500", marginTop: 20 },
    hidStatus: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
    hidDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ADE80" },
    hidText: { color: "#4ADE80", fontSize: 12, fontWeight: "600" },
    // Input
    inputArea: { paddingHorizontal: getScreenPadding(), paddingBottom: 8 },
    inputRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1E293B", borderRadius: 14, paddingHorizontal: getScreenPadding(), borderWidth: 2, borderColor: colors.primary },
    barcodeInput: { flex: 1, paddingVertical: 12, fontSize: 14, fontWeight: "600", color: "#fff" },
    submitBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },
    // Context
    contextRow: { paddingHorizontal: getScreenPadding(), paddingVertical: 10 },
    contextLabel: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.4)", letterSpacing: 0.5, marginBottom: 6 },
    contextToggle: { flexDirection: "row", gap: 8 },
    contextBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.08)" },
    contextBtnActive: { backgroundColor: colors.primary },
    contextText: { fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.5)" },
    contextTextActive: { color: "#fff" },
    contextHint: { fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 4 },
    // Result
    resultPanel: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: getScreenPadding() },
    resultFound: { flexDirection: "row", alignItems: "center", gap: 12 },
    resultEmoji: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" },
    resultInfo: { flex: 1 },
    resultName: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, letterSpacing: -0.3 },
    resultBarcode: { fontSize: 11, color: colors.textTertiary, marginTop: 1 },
    resultRight: { alignItems: "flex-end" },
    resultPrice: { fontSize: 20, fontWeight: "900", color: colors.primary },
    resultStock: { fontSize: 11, color: colors.success, fontWeight: "600" },
    resultNew: { flexDirection: "row", alignItems: "center", gap: 12 },
    resultNewIcon: { fontSize: 28 },
    resultNewTitle: { fontSize: 16, fontWeight: "800", color: colors.warning },
    createBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    createBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
    resultAction: { marginTop: 12, backgroundColor: colors.successSoft, borderRadius: 10, padding: 10, alignItems: "center" },
    resultActionText: { color: colors.success, fontSize: 13, fontWeight: "700" },
  });
}
