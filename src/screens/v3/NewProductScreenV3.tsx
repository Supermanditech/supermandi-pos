import React, { useMemo, useState, useEffect } from "react";
import { View, TextInput, Pressable, ScrollView, StyleSheet, Text, Image } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { showToast } from "../../utils/showToast";
import { upsertLocalProduct, setLocalPrice } from "../../services/offline/scan";
import { useCartStore } from "../../stores/cartStore";
import { apiClient } from "../../services/api/apiClient";
import { isOnline } from "../../services/networkStatus";
import { logger } from "../../services/logger";

// V3-FIX-070: New product digitization — real master DB lookup via API
// GET /api/v1/pos/catalog/master/:barcode → auto-fill if found
// If not in master DB → full form with photo

type NewProductScreenV3Props = {
  barcode: string;
  onClose: () => void;
  onProductAdded: (barcode: string, name: string) => void;
};

type MasterResult = { found: boolean; name?: string; brand?: string; category?: string; packSize?: string; mrpMinor?: number; hsnCode?: string; gstPct?: number };

export default function NewProductScreenV3({ barcode, onClose, onProductAdded }: NewProductScreenV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // V3-FIX-070: Real master DB lookup via API
  const [masterResult, setMasterResult] = useState<MasterResult>({ found: false });
  const [masterLoading, setMasterLoading] = useState(true);
  const isAutoFilled = masterResult.found;

  useEffect(() => {
    let cancelled = false;
    setMasterLoading(true);
    apiClient.get<any>(`/api/v1/pos/catalog/master/${encodeURIComponent(barcode)}`)
      .then((res) => {
        if (cancelled) return;
        if (res?.found && res.product) {
          // GCP-STG-0191: Unwrap res.product + handle snake_case from backend
          const p = res.product;
          const m: MasterResult = { found: true, name: p.name, brand: p.brand, category: p.category, packSize: p.pack_size ?? p.packSize, mrpMinor: p.mrp_minor ?? p.mrpMinor, hsnCode: p.hsn_code ?? p.hsnCode, gstPct: p.gst_pct ?? p.gstPct };
          setMasterResult(m);
          // Auto-fill form fields from master
          if (m.name) setName(m.name);
          if (m.brand) setBrand(m.brand);
          if (m.category) setCategory(m.category);
          if (m.packSize) setPackSize(m.packSize);
          if (m.mrpMinor) setMrp(String(m.mrpMinor / 100));
          if (m.hsnCode) setHsnCode(m.hsnCode);
          if (m.gstPct != null) setGstPct(String(m.gstPct));
        }
      })
      .catch((err) => {
        if (!cancelled) logger.debug("NewProductV3", `master_lookup_failed:${barcode}:${String(err)}`);
      })
      .finally(() => { if (!cancelled) setMasterLoading(false); });
    return () => { cancelled = true; };
  }, [barcode]);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [packSize, setPackSize] = useState("");
  const [mrp, setMrp] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [openingStock, setOpeningStock] = useState("0");
  const [hsnCode, setHsnCode] = useState("");
  const [gstPct, setGstPct] = useState("18");
  const [unit, setUnit] = useState("pcs");
  const [caseQty, setCaseQty] = useState("24");
  // V3-FIX-168: Product mode + conversion setup
  const [productMode, setProductMode] = useState<"PACKAGED" | "LOOSE_BULK">("PACKAGED");
  const [procurementUnit, setProcurementUnit] = useState("");
  const [procurementPackQty, setProcurementPackQty] = useState("1");
  const [baseStockUnit, setBaseStockUnit] = useState("");
  const [setupMode, setSetupMode] = useState<"suggest" | "edit" | "accepted">("suggest");

  const canSubmit = name.trim().length > 0 && (sellPrice.trim().length > 0 || mrp.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) { showToast("Enter product name and price"); return; }
    const priceVal = parseFloat(sellPrice || mrp);
    if (!priceVal || priceVal <= 0) { showToast("Price must be greater than ₹0"); return; }
    try {
      // V3-012: Save product to offline DB
      const stockQty = parseInt(openingStock, 10) || 0;
      await upsertLocalProduct(barcode, name, "INR", category || null, null, stockQty);

      // Set sell price
      const priceMinor = Math.round(parseFloat(sellPrice || mrp) * 100);
      if (priceMinor > 0) {
        await setLocalPrice(barcode, priceMinor);
      }

      // V3-FIX-168: Persist conversion profile via store-products API
      // For LOOSE_BULK products, authoritative persistence MUST succeed before cart entry
      const conversionConfirmed = productMode === "LOOSE_BULK" ? setupMode === "accepted" : true;
      let persistSucceeded = false;

      if (await isOnline()) {
        try {
          await apiClient.post("/api/v1/pos/store-products", {
            barcode, name, sellPrice: priceMinor, mrp: mrp ? Math.round(parseFloat(mrp) * 100) : undefined,
            initialStockQty: parseInt(openingStock, 10) || 0, unit,
            brand, description: category,
            mode: productMode,
            procurementUnit: productMode === "LOOSE_BULK" ? procurementUnit || undefined : undefined,
            procurementPackQty: productMode === "LOOSE_BULK" ? parseFloat(procurementPackQty) || 1 : undefined,
            baseStockUnit: productMode === "LOOSE_BULK" ? baseStockUnit || undefined : undefined,
            conversionConfirmed,
          });
          persistSucceeded = true;
        } catch (apiErr) {
          logger.debug("NewProductV3", `api_persist_failed:${String(apiErr)}`);
          // PACKAGED products: non-blocking (local product still usable)
          // LOOSE_BULK products: blocking (must not enter cart without authoritative row)
          if (productMode !== "LOOSE_BULK") {
            persistSucceeded = true; // PACKAGED can proceed with local-only
          }
        }
      } else {
        // Offline: PACKAGED products can use local-only, LOOSE_BULK cannot
        if (productMode !== "LOOSE_BULK") {
          persistSucceeded = true;
        }
      }

      // V3-FIX-168: Gate cart entry on persist success + setup confirmation
      // LOOSE_BULK: must have successful API persist AND accepted setup
      // PACKAGED: can enter cart even offline (no conversion ambiguity)
      if (productMode === "LOOSE_BULK" && (!persistSucceeded || setupMode !== "accepted")) {
        const reason = !persistSucceeded
          ? "saved locally — sync required before selling (check connection)"
          : "saved — complete retail setup before selling";
        showToast(`${name} ${reason}`);
        onProductAdded(barcode, name);
        onClose();
        return;
      }
      if (!persistSucceeded && productMode === "PACKAGED") {
        // PACKAGED offline: still add to cart (no conversion risk)
      }

      // Add to cart (only for PACKAGED or confirmed LOOSE_BULK)
      useCartStore.getState().addItem({
        id: barcode,
        name,
        priceMinor: priceMinor || Math.round(parseFloat(mrp) * 100) || 0,
        barcode,
        currency: "INR",
        metadata: { brand, category, packSize, unit, hsnCode, gstPct: parseInt(gstPct, 10) || 18 },
        productMode,
        soldBy: productMode === "LOOSE_BULK" ? "WEIGHT" : undefined,
        rateUnit: productMode === "LOOSE_BULK" ? (baseStockUnit || "KG") : undefined,
        baseStockUnit: baseStockUnit || undefined,
      });

      logger.debug("NewProductV3", `created:${barcode},name:${name},price:${priceMinor}`);
      onProductAdded(barcode, name);
      showToast(`${name} added to store & cart`);
      onClose();
    } catch (err) {
      showToast("Failed to save product");
      logger.debug("NewProductV3", `failed:${String(err)}`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose} accessibilityLabel="Back">
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Add New Product</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Status banner */}
        {isAutoFilled ? (
          <View style={styles.autoFillBanner}>
            <Text style={styles.autoFillIcon}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.autoFillTitle}>Product found in SuperMandi database</Text>
              <Text style={styles.autoFillSub}>Details auto-filled — just set your selling price</Text>
            </View>
          </View>
        ) : (
          <View style={styles.notFoundBanner}>
            <Text style={styles.notFoundText}>Barcode <Text style={{ fontWeight: "800" }}>{barcode}</Text> not in database. Fill details below.</Text>
          </View>
        )}

        {/* V3-DELETE-086: Photo capture — only shown when image available (no placeholder) */}
        {photoUri ? (
          <View style={[styles.photoBox, { borderColor: colors.primary }]}>
            <Image source={{ uri: photoUri }} style={{ width: 64, height: 64, borderRadius: 12 }} />
          </View>
        ) : null}

        {/* Barcode (read-only) */}
        <View style={styles.readonlyRow}>
          <Text style={styles.readonlyLabel}>BARCODE</Text>
          <Text style={styles.readonlyValue}>{barcode}</Text>
        </View>

        {/* Product name */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>PRODUCT NAME *</Text>
          <TextInput style={[styles.fieldInput, isAutoFilled && styles.autoFilledInput]} value={name} onChangeText={setName} placeholder="e.g., Britannia Good Day 200g" placeholderTextColor={colors.textTertiary} />
        </View>

        {/* Sell price + Cost price (MOST IMPORTANT — highlighted) */}
        <View style={styles.priceRow}>
          <View style={styles.priceField}>
            <Text style={styles.priceLabelMain}>SELLING PRICE ₹ *</Text>
            <TextInput style={styles.priceInput} value={sellPrice} onChangeText={setSellPrice} placeholder="₹" placeholderTextColor={colors.textTertiary} keyboardType="numeric" autoFocus={isAutoFilled} />
          </View>
          <View style={styles.priceField}>
            <Text style={styles.fieldLabel}>COST PRICE ₹</Text>
            <TextInput style={styles.fieldInput} value={costPrice} onChangeText={setCostPrice} placeholder="₹" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
          </View>
        </View>

        {/* Brand + Category */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>{isAutoFilled ? "BRAND" : "BRAND *"}</Text>
            <TextInput style={[styles.fieldInput, isAutoFilled && styles.autoFilledInput]} value={brand} onChangeText={setBrand} placeholder="Parle" placeholderTextColor={colors.textTertiary} />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>CATEGORY</Text>
            <TextInput style={[styles.fieldInput, isAutoFilled && styles.autoFilledInput]} value={category} onChangeText={setCategory} placeholder="Biscuits" placeholderTextColor={colors.textTertiary} />
          </View>
        </View>

        {/* Pack size + Unit + Case qty */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>PACK SIZE</Text>
            <TextInput style={[styles.fieldInput, isAutoFilled && styles.autoFilledInput]} value={packSize} onChangeText={setPackSize} placeholder="200g" placeholderTextColor={colors.textTertiary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>UNIT</Text>
            <TextInput style={styles.fieldInput} value={unit} onChangeText={setUnit} placeholder="pcs" placeholderTextColor={colors.textTertiary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>CASE QTY</Text>
            <TextInput style={styles.fieldInput} value={caseQty} onChangeText={setCaseQty} placeholder="24" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
          </View>
        </View>

        {/* V3-FIX-168: Product mode toggle + conversion setup */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>PRODUCT TYPE</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.halfField, { backgroundColor: productMode === "PACKAGED" ? colors.primary + "20" : colors.background, borderRadius: 8, padding: 10, alignItems: "center", borderWidth: 1, borderColor: productMode === "PACKAGED" ? colors.primary : colors.border }]}
              onPress={() => { setProductMode("PACKAGED"); setUnit("pcs"); setBaseStockUnit("PCS"); }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: productMode === "PACKAGED" ? colors.primary : colors.textSecondary }}>PACKAGED</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary }}>Fixed pack</Text>
            </Pressable>
            <Pressable
              style={[styles.halfField, { backgroundColor: productMode === "LOOSE_BULK" ? colors.primary + "20" : colors.background, borderRadius: 8, padding: 10, alignItems: "center", borderWidth: 1, borderColor: productMode === "LOOSE_BULK" ? colors.primary : colors.border }]}
              onPress={() => { setProductMode("LOOSE_BULK"); setUnit("kg"); setBaseStockUnit("KG"); }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: productMode === "LOOSE_BULK" ? colors.primary : colors.textSecondary }}>LOOSE / BULK</Text>
              <Text style={{ fontSize: 10, color: colors.textTertiary }}>Weight / volume</Text>
            </Pressable>
          </View>
        </View>

        {productMode === "LOOSE_BULK" ? (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>BOUGHT AS</Text>
                <TextInput style={styles.fieldInput} value={procurementUnit} onChangeText={setProcurementUnit} placeholder="BAG/CARTON" placeholderTextColor={colors.textTertiary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>PER PACK</Text>
                <TextInput style={styles.fieldInput} value={procurementPackQty} onChangeText={setProcurementPackQty} placeholder="50" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>STOCK UNIT</Text>
                <TextInput style={styles.fieldInput} value={baseStockUnit} onChangeText={setBaseStockUnit} placeholder="KG" placeholderTextColor={colors.textTertiary} />
              </View>
            </View>
            {/* V3-FIX-168: Guided onboarding with distinct operator actions */}
            {setupMode === "accepted" ? (
              <View style={{ backgroundColor: '#ecfdf5', borderRadius: 8, padding: 10, marginTop: 4, borderWidth: 1, borderColor: '#86efac' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>Retail Setup Confirmed</Text>
                <Text style={{ fontSize: 11, color: '#15803d' }}>
                  {baseStockUnit === 'KG' ? 'Sell per KG · Variants: 250g, 500g, 1kg, 5kg' :
                   baseStockUnit === 'LTR' ? 'Sell per LTR · Variants: 250ml, 500ml, 1L' :
                   baseStockUnit === 'PCS' ? 'Sell per PCS · Variants: 1pc, 6pcs, 12pcs' : 'Custom setup'}
                </Text>
                <Pressable onPress={() => setSetupMode("edit")} style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>Edit Setup</Text>
                </Pressable>
              </View>
            ) : setupMode === "edit" ? (
              <View style={{ backgroundColor: '#fef3c7', borderRadius: 8, padding: 10, marginTop: 4, borderWidth: 1, borderColor: '#fbbf24' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e', marginBottom: 4 }}>Edit Retail Setup</Text>
                <Text style={{ fontSize: 10, color: '#78716c' }}>Adjust procurement and stock settings above, then confirm.</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <Pressable
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 6, padding: 8, alignItems: 'center' }}
                    onPress={() => setSetupMode("accepted")}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Confirm Setup</Text>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1, backgroundColor: colors.border, borderRadius: 6, padding: 8, alignItems: 'center' }}
                    onPress={() => setSetupMode("suggest")}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={{ backgroundColor: colors.primaryLight || '#eff6ff', borderRadius: 8, padding: 10, marginTop: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4 }}>
                  Suggested Retail Setup
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  {baseStockUnit === 'KG' ? 'Sell per KG · Variants: 250g, 500g, 1kg, 5kg' :
                   baseStockUnit === 'LTR' ? 'Sell per LTR · Variants: 250ml, 500ml, 1L' :
                   baseStockUnit === 'PCS' ? 'Sell per PCS · Variants: 1pc, 6pcs, 12pcs' :
                   'Set stock unit above to see suggestions'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <Pressable
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 6, padding: 8, alignItems: 'center' }}
                    onPress={() => setSetupMode("accepted")}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Use Suggested</Text>
                  </Pressable>
                  <Pressable
                    style={{ flex: 1, backgroundColor: colors.background, borderRadius: 6, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
                    onPress={() => setSetupMode("edit")}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Edit Setup</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        ) : null}

        {/* MRP + Opening stock */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>MRP ₹</Text>
            <TextInput style={[styles.fieldInput, isAutoFilled && styles.autoFilledInput]} value={mrp} onChangeText={setMrp} placeholder="₹" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>OPENING STOCK</Text>
            <TextInput style={styles.fieldInput} value={openingStock} onChangeText={setOpeningStock} placeholder="0" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
          </View>
        </View>

        {/* HSN + GST */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>HSN CODE</Text>
            <TextInput style={[styles.fieldInput, isAutoFilled && styles.autoFilledInput]} value={hsnCode} onChangeText={setHsnCode} placeholder="e.g., 1905" placeholderTextColor={colors.textTertiary} />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>GST %</Text>
            <TextInput style={styles.fieldInput} value={gstPct} onChangeText={setGstPct} placeholder="18" placeholderTextColor={colors.textTertiary} keyboardType="numeric" />
          </View>
        </View>

        {/* Margin preview */}
        {sellPrice && costPrice ? (
          <View style={styles.marginPreview}>
            <Text style={styles.marginText}>
              Margin: ₹{(parseFloat(sellPrice) - parseFloat(costPrice)).toFixed(2)} ({Math.round(((parseFloat(sellPrice) - parseFloat(costPrice)) / parseFloat(sellPrice)) * 100)}%)
            </Text>
          </View>
        ) : null}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Submit button */}
      <View style={styles.footer}>
        <Pressable style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]} onPress={handleSubmit} disabled={!canSubmit} accessibilityRole="button">
          <Text style={styles.submitText}>Add to Store & Cart</Text>
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
    body: { flex: 1, padding: getScreenPadding() },
    // Banners
    autoFillBanner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: colors.successSoft, borderRadius: 12, borderWidth: 1, borderColor: colors.success, marginBottom: 12 },
    autoFillIcon: { fontSize: 20, color: colors.success },
    autoFillTitle: { fontSize: 13, fontWeight: "700", color: colors.success },
    autoFillSub: { fontSize: 11, color: colors.textTertiary },
    notFoundBanner: { padding: 12, backgroundColor: colors.warningSoft, borderRadius: 12, borderWidth: 1, borderColor: colors.warning, marginBottom: 12 },
    notFoundText: { fontSize: 12, color: "#92400E" },
    // Photo
    photoBox: { alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: colors.backgroundSecondary, borderRadius: 14, marginBottom: 14, gap: 6 },
    photoText: { fontSize: 11, color: colors.textTertiary, fontWeight: "500" },
    // Readonly
    readonlyRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 4, marginBottom: 8 },
    readonlyLabel: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.5 },
    readonlyValue: { fontSize: 12, fontWeight: "700", color: colors.textSecondary },
    // Fields
    field: { marginBottom: 10 },
    fieldLabel: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 4 },
    fieldInput: { padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, fontSize: 14, fontWeight: "500", color: colors.textPrimary, backgroundColor: colors.surface },
    autoFilledInput: { backgroundColor: colors.successSoft, borderColor: colors.success },
    // Price row (highlighted)
    priceRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    priceField: { flex: 1 },
    priceLabelMain: { fontSize: 10, fontWeight: "800", color: colors.primary, letterSpacing: 0.5, marginBottom: 4 },
    priceInput: { padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, fontSize: 18, fontWeight: "800", color: colors.textPrimary, backgroundColor: colors.surface, textAlign: "center" },
    // Row
    row: { flexDirection: "row", gap: 10, marginBottom: 10 },
    halfField: { flex: 1 },
    // Margin
    marginPreview: { padding: 10, backgroundColor: colors.successSoft, borderRadius: 10, alignItems: "center" },
    marginText: { fontSize: 13, fontWeight: "800", color: colors.success },
    // Footer
    footer: { padding: getScreenPadding(), backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    submitBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    submitBtnDisabled: { backgroundColor: colors.disabled, opacity: 0.6 },
    submitText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  });
}
