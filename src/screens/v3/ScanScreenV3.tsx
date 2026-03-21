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

// V3-FIX-157: Canonical scan-intent contract — all scan paths go through here
import { normalizeBarcode, isDuplicateScan, type ScanIntent } from "../../services/scanIntent";

// V3-FIX-157: ScanContext uses the canonical ScanIntent type plus legacy stock_in/new_product
export type ScanContext = ScanIntent | "new_product";

// V3-FIX-157: Map between canonical ScanIntent names and display labels
const SCAN_CONTEXT_LABELS: Record<ScanContext, string> = {
  sell_scan: "Sell",
  stock_in: "Stock In",
  supplier_catalog_procurement_scan: "Procurement",
  counter_purchase_scan: "Counter",
  new_product: "New Product",
};

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

export default function ScanScreenV3({ visible, defaultContext = "sell_scan", onClose, onProductFound, onNewProduct }: ScanScreenV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [context, setContext] = useState<ScanContext>(defaultContext);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  // V3-003: Real barcode lookup from productsStore + cartStore
  const getProductByBarcode = useProductsStore((s) => s.getProductByBarcode);
  const addItem = useCartStore((s) => s.addItem);

  // V3-FIX-157 + V3-FIX-160: One canonical scan pipeline for HID, camera, and manual entry
  const processScan = useCallback((rawBarcode: string) => {
    const code = normalizeBarcode(rawBarcode);
    if (!code) return;
    if (isDuplicateScan(code)) return;

    const product = getProductByBarcode(code);
    if (product) {
      setLastResult({
        barcode: code, productName: product.name,
        price: product.priceMinor, stock: product.stock ?? undefined, isNew: false,
      });

      if (context === "sell_scan") {
        // V3-HARDEN-171: Block sale of unconverted bulk products
        if (product.productMode === "LOOSE_BULK" && product.conversionConfirmed === false) {
          showToast("Retail setup needed — complete conversion setup before selling");
          setLastResult({ barcode: code, productName: product.name, price: product.priceMinor, stock: product.stock, isNew: false });
          return;
        }

        // V3-HARDEN-171: Loose/bulk parent barcode — show chooser, do NOT pre-add
        // Operator must pick quantity via presets or manual entry before anything is added to cart
        if (product.productMode === "LOOSE_BULK" && product.rateUnit) {
          setLastResult({
            barcode: code, productName: product.name,
            price: product.priceMinor, stock: product.stock, isNew: false,
          });
          showToast(`${product.name} — choose quantity below (per ${product.rateUnit})`);
          // Do NOT add to cart here — quick-qty presets in the result panel handle the add
          return;
        }

        // V3-FIX-160: SELL scan — add/increment cart through canonical path (packaged products)
        const existing = useCartStore.getState().items.find((i) => i.barcode === code);
        if (existing) {
          useCartStore.getState().updateQuantity(existing.id, existing.quantity + 1);
          showToast(`${product.name} ×${existing.quantity + 1}`);
        } else {
          addItem(buildCartItem(product));
          showToast(`${product.name} added to cart`);
        }
        onProductFound(code, context);
      } else if (context === "stock_in" || context === "counter_purchase_scan") {
        showToast(`${product.name} — ready for ${context === "counter_purchase_scan" ? "counter purchase" : "stock inward"}`);
        onProductFound(code, context);
      } else if (context === "supplier_catalog_procurement_scan") {
        // V3-HARDEN-158: Procurement scan found — route to detail
        showToast(`${product.name} — found in store`);
        onProductFound(code, context);
      }
      logger.debug("V3Scan", `found:${code},product:${product.name},context:${context}`);
    } else {
      // Not found — intent-specific behavior
      setLastResult({ barcode: code, isNew: true });
      logger.debug("V3Scan", `not_found:${code},context:${context}`);
    }
    setBarcodeInput("");
  }, [context, getProductByBarcode, addItem, onProductFound]);

  // Manual submit and camera use the same pipeline
  const handleScanSubmit = useCallback(() => {
    processScan(barcodeInput);
  }, [barcodeInput, processScan]);

  // V3-FIX-160: HID scanner uses the SAME canonical pipeline (no duplicate logic)
  useEffect(() => {
    if (!visible) return;
    const handler = (barcode: string) => {
      setBarcodeInput(barcode);
      setTimeout(() => processScan(barcode), 50);
    };
    setHidScanHandler(handler);
    return () => setHidScanHandler(null);
  }, [visible, processScan]);

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
        {defaultContext !== "sell_scan" ? (
          <View style={styles.contextRow}>
            <Text style={styles.contextLabel}>SCAN MODE</Text>
            <View style={styles.contextToggle}>
              {/* V3-FIX-157: All scan intents available in mode toggle — canonical names */}
              {(["sell_scan", "stock_in", "supplier_catalog_procurement_scan", "counter_purchase_scan", "new_product"] as ScanContext[]).map((ctx) => (
                <Pressable
                  key={ctx}
                  style={[styles.contextBtn, context === ctx && styles.contextBtnActive]}
                  onPress={() => setContext(ctx)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: context === ctx }}
                  testID={`scan-mode-${ctx}`}
                >
                  <Text style={[styles.contextText, context === ctx && styles.contextTextActive]}>
                    {SCAN_CONTEXT_LABELS[ctx] ?? ctx}
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
              <>
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
                {/* V3-HARDEN-171: Quick-qty presets for loose products */}
                {(() => {
                  const product = getProductByBarcode(lastResult.barcode);
                  if (!product || product.productMode !== 'LOOSE_BULK' || !product.rateUnit) return null;
                  // V3-HARDEN-171: Correct fractional quantities for loose sell
                  // For KG stock: 250g = 0.25 KG, 500g = 0.5 KG, 1kg = 1 KG, 5kg = 5 KG
                  // For LTR stock: 250ml = 0.25 LTR, 500ml = 0.5 LTR, 1L = 1 LTR
                  const presets = product.rateUnit === 'KG' || product.baseStockUnit === 'KG'
                    ? [{ label: '250g', qty: 0.25 }, { label: '500g', qty: 0.5 }, { label: '1kg', qty: 1 }, { label: '5kg', qty: 5 }]
                    : product.rateUnit === 'LTR' || product.baseStockUnit === 'LTR'
                    ? [{ label: '250ml', qty: 0.25 }, { label: '500ml', qty: 0.5 }, { label: '1L', qty: 1 }]
                    : [{ label: '1', qty: 1 }, { label: '6', qty: 6 }, { label: '12', qty: 12 }];
                  return (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 11, color: colors.textTertiary, width: '100%' }}>Quick add (per {product.rateUnit}):</Text>
                      {presets.map(p => (
                        <Pressable
                          key={p.label}
                          style={{ backgroundColor: colors.primary + '15', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.primary + '30' }}
                          onPress={() => {
                            // GCP-STG-0052: Validate stock before adding quick-qty preset
                            const currentStock = product.stock ?? 0;
                            const existing = useCartStore.getState().items.find(i => i.barcode === lastResult!.barcode);
                            const inCart = existing?.quantity ?? 0;
                            if (currentStock > 0 && inCart + p.qty > currentStock) {
                              showToast(`Only ${currentStock}${product.rateUnit ? product.rateUnit.toLowerCase() : ''} available`);
                            }
                            if (existing) {
                              useCartStore.getState().updateQuantity(existing.id, existing.quantity + p.qty);
                            } else {
                              addItem({ ...buildCartItem(product), quantity: p.qty });
                            }
                            showToast(`${product.name} +${p.qty} (${p.label})`);
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{p.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })()}
              </>
            ) : (
              <View style={styles.resultNew}>
                <Text style={styles.resultNewIcon}>⚠</Text>
                <View style={styles.resultInfo}>
                  <Text style={styles.resultNewTitle}>Product Not Found</Text>
                  <Text style={styles.resultBarcode}>{lastResult.barcode}</Text>
                </View>
                {/* V3-HARDEN-158: Procurement scan miss MUST NOT offer New Product */}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {context !== "supplier_catalog_procurement_scan" ? (
                    <Pressable
                      style={styles.createBtn}
                      onPress={() => { onNewProduct(lastResult.barcode); onClose(); }}
                      accessibilityLabel="Create new product"
                      testID="scan-new-product-btn"
                    >
                      <Text style={styles.createBtnText}>New Product</Text>
                    </Pressable>
                  ) : null}
                  {/* GCP-STG-0028: Continue button to dismiss not-found and scan next */}
                  <Pressable
                    style={styles.continueBtn}
                    onPress={() => { setLastResult(null); setBarcodeInput(""); }}
                    accessibilityLabel="Continue scanning"
                    testID="scan-continue-btn"
                  >
                    <Text style={styles.continueBtnText}>Continue</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <View style={styles.resultAction}>
              <Text style={styles.resultActionText}>
                {!lastResult.isNew
                  ? (context === "sell_scan" ? "✓ Added to cart!" : context === "stock_in" ? "✓ Stock recorded!" : context === "counter_purchase_scan" ? "✓ Ready for inward!" : context === "supplier_catalog_procurement_scan" ? "✓ Found in catalogue" : "✓ Product found")
                  : context === "supplier_catalog_procurement_scan" ? "Product not available in supplier catalogue" : "Tap Create to add this product to your store"}
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
    // GCP-STG-0028: Continue button alongside New Product
    continueBtn: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    continueBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
    resultAction: { marginTop: 12, backgroundColor: colors.successSoft, borderRadius: 10, padding: 10, alignItems: "center" },
    resultActionText: { color: colors.success, fontSize: 13, fontWeight: "700" },
  });
}
