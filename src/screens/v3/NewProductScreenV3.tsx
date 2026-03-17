import React, { useMemo, useState } from "react";
import { View, TextInput, Pressable, ScrollView, StyleSheet, Text, Image } from "react-native";
import Svg, { Rect, Path, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";
import { upsertLocalProduct, setLocalPrice } from "../../services/offline/scan";
import { useCartStore } from "../../stores/cartStore";
import { logger } from "../../services/logger";

// V3-012: New product digitization — wired to upsertLocalProduct + cartStore
// If barcode is in SuperMandi master DB → auto-fill name/brand/MRP, retailer only sets sell price
// If not in master DB → full form with photo
// Reuses existing upsertLocalProduct (connected in production wiring)

type NewProductScreenV3Props = {
  barcode: string;
  onClose: () => void;
  onProductAdded: (barcode: string, name: string) => void;
};

// Simulate master DB lookup (in production: GET /api/v1/catalog/master/:barcode)
function lookupMasterDB(barcode: string): { found: boolean; name?: string; brand?: string; category?: string; packSize?: string; mrpMinor?: number; hsnCode?: string; gstPct?: number } {
  if (barcode.startsWith("890123")) {
    return { found: true, name: "Parle-G Gold Biscuit", brand: "Parle", category: "Biscuits", packSize: "100g", mrpMinor: 1000, hsnCode: "1905", gstPct: 18 };
  }
  return { found: false };
}

export default function NewProductScreenV3({ barcode, onClose, onProductAdded }: NewProductScreenV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const masterResult = useMemo(() => lookupMasterDB(barcode), [barcode]);
  const isAutoFilled = masterResult.found;

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState(masterResult.name ?? "");
  const [brand, setBrand] = useState(masterResult.brand ?? "");
  const [category, setCategory] = useState(masterResult.category ?? "");
  const [packSize, setPackSize] = useState(masterResult.packSize ?? "");
  const [mrp, setMrp] = useState(masterResult.mrpMinor ? String(masterResult.mrpMinor / 100) : "");
  const [sellPrice, setSellPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [openingStock, setOpeningStock] = useState("0");
  const [hsnCode, setHsnCode] = useState(masterResult.hsnCode ?? "");
  const [gstPct, setGstPct] = useState(masterResult.gstPct ? String(masterResult.gstPct) : "18");
  const [unit, setUnit] = useState("pcs");
  const [caseQty, setCaseQty] = useState("24");

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

      // Add to cart
      useCartStore.getState().addItem({
        id: barcode,
        name,
        priceMinor: priceMinor || Math.round(parseFloat(mrp) * 100) || 0,
        barcode,
        currency: "INR",
        metadata: { brand, category, packSize, unit, hsnCode, gstPct: parseInt(gstPct, 10) || 18 },
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

        {/* Photo capture */}
        <Pressable style={[styles.photoBox, photoUri ? { borderColor: colors.primary } : null]}
          accessibilityLabel="Take product photo"
          onPress={() => {
            // V3-060: Photo capture — requires expo-image-picker (not yet installed)
            showToast("Photo capture requires expo-image-picker — install with: npx expo install expo-image-picker");
          }}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: 64, height: 64, borderRadius: 12 }} />
          ) : (
            <>
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.textTertiary} strokeWidth={1.5}>
                <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <Circle cx={12} cy={13} r={4} />
              </Svg>
              <Text style={styles.photoText}>Tap to photograph product</Text>
            </>
          )}
        </Pressable>

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
    header: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    body: { flex: 1, padding: 14 },
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
    footer: { padding: 14, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    submitBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    submitBtnDisabled: { backgroundColor: colors.disabled, opacity: 0.6 },
    submitText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  });
}
