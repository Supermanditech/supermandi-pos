import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { View, Pressable, TextInput, StyleSheet, Text, Modal } from "react-native";
import Svg, { Rect, Path, Line } from "react-native-svg";
import { useTranslation } from "react-i18next";
// GCP-STG-0035: Camera preview for barcode scanning
import { CameraView, useCameraPermissions } from "expo-camera";
// GCP-STG-0414: Safe area insets for dynamic paddingTop
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as Haptics from "expo-haptics";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { showToast } from "../../utils/showToast";
import { useProductsStore, type Product } from "../../stores/productsStore";
import { useCartStore } from "../../stores/cartStore";
// GCP-STG-0532: Settings for scan tutorial flag
import { useSettingsStore } from "../../stores/settingsStore";
import { setHidScanHandler } from "../../services/hidScannerService";
import { buildCartItem } from "../../services/cartPayload";
import { logger } from "../../services/logger";
// GCP-STG-0322: Supplier catalog fallback for procurement scan
import { buyBarcodeSearch } from "../../services/api/catalogApi";
import { getDeviceStoreId } from "../../services/deviceSession";

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
  // GCP-STG-0316: Optional callback to open search-by-name on scan miss
  onSearchByName?: (scannedBarcode: string) => void;
};

type ScanResult = {
  barcode: string;
  productName?: string;
  price?: number;
  stock?: number;
  isNew: boolean;
  // GCP-STG-0322: Supplier catalog fallback metadata
  isSupplierCatalog?: boolean;
  supplierName?: string;
  supplierCount?: number;
};

export default function ScanScreenV3({ visible, defaultContext = "sell_scan", onClose, onProductFound, onNewProduct, onSearchByName }: ScanScreenV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  // GCP-STG-0414: Use safe area insets instead of hardcoded paddingTop
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [context, setContext] = useState<ScanContext>(defaultContext);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  // GCP-STG-0322: Loading state for supplier catalog fallback search
  const [supplierSearching, setSupplierSearching] = useState(false);
  // GCP-STG-0035: Camera permissions + barcode scanning
  const [cameraPermission, requestPermission] = useCameraPermissions();
  // GCP-STG-0509: Camera torch toggle
  const [torchOn, setTorchOn] = useState(false);
  // GCP-STG-0520: Camera scan cooldown to prevent rapid-fire duplicate scans
  const scanCooldownRef = useRef(false);
  // GCP-STG-0530: Low-light warning after 5s of no scans
  const [showLightHint, setShowLightHint] = useState(false);
  // GCP-STG-0532: First-time scan tutorial overlay
  const [showTutorial, setShowTutorial] = useState(false);
  // GCP-STG-0533: Visual scan success flash
  const [scanFlash, setScanFlash] = useState(false);
  const hasSeenScanTutorial = useSettingsStore((s) => s.hasSeenScanTutorial);

  // V3-003: Real barcode lookup from productsStore + cartStore
  const getProductByBarcode = useProductsStore((s) => s.getProductByBarcode);
  // GCP-STG-0521: Plural lookup for disambiguation when multiple products share a barcode
  const getProductsByBarcode = useProductsStore((s) => s.getProductsByBarcode);
  const addItem = useCartStore((s) => s.addItem);
  // GCP-STG-0521: Disambiguation state for multiple products with same barcode
  const [disambiguationMatches, setDisambiguationMatches] = useState<Product[]>([]);
  // GCP-STG-0525: Running total in scan screen — mini cart summary
  const cartItems = useCartStore((s) => s.items);
  const cartTotal = cartItems.reduce((sum, i) => sum + i.priceMinor * i.quantity, 0);

  // GCP-STG-0322: Async supplier catalog fallback when local lookup misses in procurement mode
  const searchSupplierCatalog = useCallback(async (barcode: string) => {
    setSupplierSearching(true);
    try {
      const storeId = await getDeviceStoreId();
      if (!storeId) {
        logger.debug("V3Scan", `supplier_fallback:no_storeId,barcode:${barcode}`);
        setLastResult({ barcode, isNew: true });
        return;
      }
      const product = await buyBarcodeSearch(storeId, barcode);
      if (product) {
        setLastResult({
          barcode,
          productName: product.name,
          price: product.bestPrice,
          isNew: false,
          isSupplierCatalog: true,
          supplierName: product.suppliers?.[0]?.supplierName ?? undefined,
          supplierCount: product.supplierCount ?? product.suppliers?.length ?? 0,
        });
        showToast(`${product.name} — found in supplier catalogue`);
        onProductFound(barcode, "supplier_catalog_procurement_scan");
        logger.debug("V3Scan", `supplier_fallback:found,barcode:${barcode},product:${product.name}`);
      } else {
        setLastResult({ barcode, isNew: true });
        logger.debug("V3Scan", `supplier_fallback:not_found,barcode:${barcode}`);
      }
    } catch (err) {
      logger.debug("V3Scan", `supplier_fallback:error,barcode:${barcode},err:${err}`);
      setLastResult({ barcode, isNew: true });
    } finally {
      setSupplierSearching(false);
    }
  }, [onProductFound]);

  // GCP-STG-0532: Show tutorial on first visit
  useEffect(() => {
    if (visible && !hasSeenScanTutorial) setShowTutorial(true);
  }, [visible, hasSeenScanTutorial]);

  // GCP-STG-0530: Show low-light hint after 5s if camera is active without torch
  useEffect(() => {
    if (!visible || !cameraPermission?.granted || torchOn) { setShowLightHint(false); return; }
    const timer = setTimeout(() => setShowLightHint(true), 5000);
    return () => clearTimeout(timer);
  }, [visible, cameraPermission?.granted, torchOn, lastResult]);

  // V3-FIX-157 + V3-FIX-160: One canonical scan pipeline for HID, camera, and manual entry
  const processScan = useCallback((rawBarcode: string) => {
    // GCP-STG-0520: Camera scan cooldown — prevent rapid-fire scans within 1.5s
    if (scanCooldownRef.current) return;
    scanCooldownRef.current = true;
    setTimeout(() => { scanCooldownRef.current = false; }, 1500);

    const code = normalizeBarcode(rawBarcode);
    if (!code) return;
    if (isDuplicateScan(code)) return;

    // GCP-STG-0521: Check for multiple products with the same barcode
    const matches = getProductsByBarcode ? getProductsByBarcode(code) : [];
    const product = getProductByBarcode(code);

    // GCP-STG-0521: If multiple products share this barcode, show disambiguation picker
    if (matches.length > 1 && context === "sell_scan") {
      setDisambiguationMatches(matches);
      setLastResult({
        barcode: code, productName: `${matches.length} products found`, isNew: false,
      });
      showToast(`${matches.length} products match barcode — choose one`);
      setBarcodeInput("");
      return;
    }

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
      // GCP-STG-0533: Visual scan success flash on viewfinder frame
      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 300);
      // GCP-STG-0516: Haptic feedback on successful scan
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      // GCP-STG-0522: Scan beep alternative — double haptic pulse
      try { setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 80); } catch {}
      logger.debug("V3Scan", `found:${code},product:${product.name},context:${context}`);
    } else {
      // Not found — intent-specific behavior
      // GCP-STG-0322: In procurement mode, fallback to supplier catalog search before giving up
      if (context === "supplier_catalog_procurement_scan") {
        searchSupplierCatalog(code);
        logger.debug("V3Scan", `not_found_local:${code},context:${context},trying_supplier_catalog`);
      } else {
        setLastResult({ barcode: code, isNew: true });
        // GCP-STG-0529: Auto-populate barcode digits for search fallback
        setBarcodeInput(code);
        logger.debug("V3Scan", `not_found:${code},context:${context}`);
      }
    }
    // GCP-STG-0529: Only clear input on found — not-found branch populates it above
    if (getProductByBarcode(code)) setBarcodeInput("");
  }, [context, getProductByBarcode, getProductsByBarcode, addItem, onProductFound, searchSupplierCatalog]);

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

        {/* GCP-STG-0525: Running cart total */}
        {cartItems.length > 0 && context === "sell_scan" ? (
          <View style={styles.cartSummary}>
            <Text style={styles.cartSummaryText}>Cart: {cartItems.length} item{cartItems.length !== 1 ? "s" : ""} · ₹{(cartTotal / 100).toFixed(0)}</Text>
          </View>
        ) : null}

        {/* GCP-STG-0035: Camera viewfinder with live preview */}
        <View style={styles.viewfinder}>
          {cameraPermission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torchOn}
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr", "itf14", "datamatrix", "codabar"] }}
              onBarcodeScanned={(result) => {
                if (result.data) processScan(result.data);
              }}
            />
          ) : (
            <Pressable style={styles.permissionPrompt} onPress={requestPermission}>
              <Text style={styles.viewfinderText}>
                {cameraPermission === null ? "Loading camera..." : "Tap to enable camera"}
              </Text>
            </Pressable>
          )}
          {/* GCP-STG-0509: Torch toggle button */}
          <Pressable
            style={styles.torchBtn}
            onPress={() => setTorchOn((prev) => !prev)}
            accessibilityLabel={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
            testID="torch-toggle-btn"
          >
            <Text style={{ fontSize: 20 }}>{torchOn ? "🔦" : "🔦"}</Text>
            <Text style={styles.torchText}>{torchOn ? "ON" : "OFF"}</Text>
          </Pressable>
          <View style={[styles.scanFrame, scanFlash && { borderColor: '#22C55E', borderWidth: 3 }]} pointerEvents="none">
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <View style={styles.scanLine} />
          </View>
          {/* GCP-STG-0530: Low-light warning hint */}
          {showLightHint ? <Text style={styles.lightHint}>Low light? Tap flashlight to enable</Text> : null}
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

        {/* GCP-STG-0322: Supplier catalog search loading indicator */}
        {supplierSearching ? (
          <View style={styles.resultPanel}>
            <View style={styles.resultNew}>
              <Text style={{ fontSize: 28 }}>🔍</Text>
              <View style={styles.resultInfo}>
                <Text style={styles.resultNewTitle}>Searching supplier catalogue...</Text>
                <Text style={styles.resultBarcode}>Looking up barcode in linked suppliers</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* GCP-STG-0521: Disambiguation picker when multiple products share a barcode */}
        {disambiguationMatches.length > 1 ? (
          <View style={styles.resultPanel}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.textPrimary, marginBottom: 8 }}>
              Multiple products found — select one:
            </Text>
            {disambiguationMatches.map((p, idx) => (
              <Pressable
                key={p.id}
                testID={`disambiguation-item-${idx}`}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  paddingVertical: 10, paddingHorizontal: 8,
                  borderBottomWidth: idx < disambiguationMatches.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
                onPress={() => {
                  // Add selected product to cart
                  const existing = useCartStore.getState().items.find(i => i.barcode === p.barcode || i.id === p.id);
                  if (existing) {
                    useCartStore.getState().updateQuantity(existing.id, existing.quantity + 1);
                    showToast(`${p.name} x${existing.quantity + 1}`);
                  } else {
                    addItem(buildCartItem(p));
                    showToast(`${p.name} added to cart`);
                  }
                  setDisambiguationMatches([]);
                  setLastResult({
                    barcode: p.barcode ?? p.id, productName: p.name,
                    price: p.priceMinor, stock: p.stock ?? undefined, isNew: false,
                  });
                  onProductFound(p.barcode ?? p.id, context);
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 16 }}>🍪</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.textPrimary }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary }}>
                    {[p.brand, p.unit, p.netContentValue && p.netContentUnit ? `${p.netContentValue}${p.netContentUnit}` : null].filter(Boolean).join(" · ") || p.id}
                  </Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: "900", color: colors.primary }}>
                  ₹{((p.priceMinor ?? 0) / 100).toFixed(0)}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={{ marginTop: 8, alignItems: "center", paddingVertical: 8 }}
              onPress={() => { setDisambiguationMatches([]); setLastResult(null); }}
              testID="disambiguation-cancel"
            >
              <Text style={{ color: colors.textTertiary, fontSize: 13, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Last scan result */}
        {!supplierSearching && disambiguationMatches.length <= 1 && lastResult ? (
          <View style={styles.resultPanel}>
            {!lastResult.isNew ? (
              <>
                <View style={styles.resultFound}>
                  <View style={styles.resultEmoji}><Text style={{ fontSize: 28 }}>{lastResult.isSupplierCatalog ? '📦' : '🍪'}</Text></View>
                  <View style={styles.resultInfo}>
                    <Text style={styles.resultName}>{lastResult.productName}</Text>
                    <Text style={styles.resultBarcode}>{lastResult.barcode}</Text>
                    {/* GCP-STG-0322: Show supplier origin when found via supplier catalog fallback */}
                    {lastResult.isSupplierCatalog ? (
                      <Text style={[styles.resultBarcode, { color: colors.primary, fontWeight: "600", marginTop: 2 }]}>
                        {lastResult.supplierName ? `via ${lastResult.supplierName}` : "Supplier catalogue"}{lastResult.supplierCount && lastResult.supplierCount > 1 ? ` (+${lastResult.supplierCount - 1} more)` : ""}
                      </Text>
                    ) : null}
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
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
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
                  {/* GCP-STG-0316: Search by Name fallback on scan miss */}
                  {onSearchByName ? (
                    <Pressable
                      style={styles.searchByNameBtn}
                      onPress={() => { onSearchByName(lastResult.barcode); onClose(); }}
                      accessibilityLabel="Search by name"
                      testID="scan-search-by-name-btn"
                    >
                      <Text style={styles.searchByNameBtnText}>Search by Name</Text>
                    </Pressable>
                  ) : null}
                  {/* GCP-STG-0531: Retry lookup button */}
                  <Pressable
                    style={styles.continueBtn}
                    onPress={() => processScan(lastResult.barcode)}
                    accessibilityLabel="Retry lookup"
                    testID="scan-retry-btn"
                  >
                    <Text style={styles.continueBtnText}>Retry</Text>
                  </Pressable>
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
                  ? (context === "sell_scan" ? "✓ Added to cart!" : context === "stock_in" ? "✓ Stock recorded!" : context === "counter_purchase_scan" ? "✓ Ready for inward!" : context === "supplier_catalog_procurement_scan" ? (lastResult.isSupplierCatalog ? "✓ Found in supplier catalogue" : "✓ Found in store catalogue") : "✓ Product found")
                  : context === "supplier_catalog_procurement_scan" ? "Product not found in store or supplier catalogue" : "Tap Create to add this product to your store"}
              </Text>
            </View>
          </View>
        ) : null}

        {/* GCP-STG-0532: First-time scan tutorial overlay */}
        {showTutorial ? (
          <View style={styles.tutorialOverlay}>
            <View style={styles.tutorialCard}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#fff", marginBottom: 12 }}>How to Scan</Text>
              <Text style={styles.tutorialStep}>1. Point camera at barcode or use HID scanner</Text>
              <Text style={styles.tutorialStep}>2. Product auto-adds to cart if found</Text>
              <Text style={styles.tutorialStep}>3. If not found, tap "New Product" to add it</Text>
              <Pressable
                style={styles.tutorialDismiss}
                onPress={() => { setShowTutorial(false); useSettingsStore.getState().setHasSeenScanTutorial(true); }}
                testID="tutorial-dismiss-btn"
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>Got it</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function createStyles(colors: ColorPalette, safeTop: number) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: "#0F172A" },
    // GCP-STG-0414: Dynamic paddingTop from safe area insets instead of hardcoded 48
    header: { flexDirection: "row", alignItems: "center", padding: getScreenPadding(), paddingTop: safeTop + 8 },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    // GCP-STG-0509: Torch toggle button — top-right of viewfinder
    torchBtn: { position: "absolute", top: 12, right: 12, zIndex: 10, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 },
    torchText: { color: "#fff", fontSize: 11, fontWeight: "700" },
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
    // GCP-STG-0035: Camera permission prompt
    permissionPrompt: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#111" },
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
    // GCP-STG-0316: Search by Name button on scan miss
    searchByNameBtn: { backgroundColor: colors.primaryLight ?? colors.primary + "18", borderWidth: 1.5, borderColor: colors.primary + "40", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    searchByNameBtnText: { color: colors.primary, fontSize: 13, fontWeight: "700" },
    // GCP-STG-0028: Continue button alongside New Product
    continueBtn: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
    continueBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
    resultAction: { marginTop: 12, backgroundColor: colors.successSoft, borderRadius: 10, padding: 10, alignItems: "center" },
    resultActionText: { color: colors.success, fontSize: 13, fontWeight: "700" },
    // GCP-STG-0532: Tutorial overlay
    tutorialOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", zIndex: 100 } as any,
    tutorialCard: { backgroundColor: "#1E293B", borderRadius: 20, padding: 24, marginHorizontal: 32, alignItems: "center" as const },
    tutorialStep: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "500" as const, marginBottom: 8, textAlign: "left" as const, alignSelf: "flex-start" as const },
    tutorialDismiss: { marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
    // GCP-STG-0530: Low-light warning hint
    lightHint: { color: "#FBBF24", fontSize: 12, fontWeight: "600", marginTop: 8, textAlign: "center" as const },
    // GCP-STG-0525: Running cart total bar
    cartSummary: { backgroundColor: "rgba(37,99,235,0.15)", paddingVertical: 6, paddingHorizontal: getScreenPadding(), alignItems: "center" },
    cartSummaryText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  });
}
