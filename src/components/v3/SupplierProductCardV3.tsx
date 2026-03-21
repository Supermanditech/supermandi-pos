import React, { useMemo } from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { cardElevation, shell, typeRhythm, chipColors } from "../../theme/brand";

// STG-561: Supplier product card with full wholesale B2B metadata

export interface SupplierProduct {
  id: string;
  supplierId: string;        // authoritative supplier identity for orders
  barcode?: string;           // V3-FIX-157: product barcode for scan matching
  name: string;
  brand: string;
  category: string;
  packSize: string;           // e.g. "100g", "250ml"
  caseSize: number;           // units per case
  unit: string;               // pcs, kg, ltr, btl
  mrpMinor: number;           // MRP in paise
  ptrMinor: number;           // Price to Retailer in paise
  ptsMinor?: number;          // Price to Stockist in paise
  hsnCode: string;
  gstPct: number;             // 5, 12, 18, 28
  moq: number;                // minimum order qty in cases
  supplierName: string;
  deliveryDays: number;
  tradeDiscountPct?: number;
  scheme?: string;            // e.g. "10+1 Free"
  creditDays?: number;        // payment credit period
  currentStock?: number;      // retailer's current stock
  daysOfStock?: number;       // estimated days until stockout
  bnplAvailable?: boolean;    // Buy Now Pay Later eligibility
  // V3-FIX-170: Conversion-aware procurement context
  procurementUnit?: string;
  procurementPackQty?: number;
  baseStockUnit?: string;
  // V3-FIX-173: Full published buyer-card contract
  deliveryTerms?: string;
  financeEligible?: boolean;
  publishedTermsVersion?: number;
  // V3-HARDEN-177: MOQ tier discounts from supplier offer
  moqTiers?: any;
  // V3-FIX-169: Approved sell profile (from store_products, set by publish materialization)
  soldBy?: string;
  rateUnit?: string;
  productMode?: string;
  // GCP-STG-0087: B2B billing model
  billingModel?: string;
}

// V3-FIX-136: Card is browse-only — no inline qty/add controls
// Add-to-purchase-cart happens only inside the detail surface
type SupplierProductCardV3Props = {
  product: SupplierProduct;
  orderQtyCases?: number; // Optional — for display badge only, not inline editing
  onPress: () => void;
};

function getStockUrgency(days?: number): "urgent" | "low" | "ok" | "unknown" {
  if (days == null) return "unknown";
  if (days <= 1) return "urgent";
  if (days <= 3) return "low";
  return "ok";
}

export default function SupplierProductCardV3({ product, orderQtyCases, onPress }: SupplierProductCardV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const marginPct = product.mrpMinor > 0 ? Math.round((1 - product.ptrMinor / product.mrpMinor) * 100) : 0;
  const urgency = getStockUrgency(product.daysOfStock);

  return (
    <Pressable style={[styles.card, urgency === "urgent" && styles.cardUrgent]} onPress={onPress} accessibilityRole="button">
      <View style={styles.row}>
        <View style={styles.imgBox}><Text style={styles.emoji}>📦</Text><Text style={styles.brandLabel}>{product.brand}</Text></View>
        <View style={styles.info}>
          {/* Name + PTR */}
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{product.name}</Text>
              <Text style={styles.meta}>HSN {product.hsnCode} · GST {product.gstPct}% · {product.supplierName}</Text>
            </View>
            <View style={styles.priceCol}>
              <Text style={styles.ptr}>₹{(product.ptrMinor / 100).toFixed(2)}</Text>
              <Text style={styles.ptrLabel}>PTR/unit</Text>
            </View>
          </View>

          {/* Tags: MRP, PTS, Case, MOQ, Margin */}
          <View style={styles.tags}>
            <View style={styles.tag}><Text style={styles.tagText}>MRP ₹{(product.mrpMinor / 100).toFixed(0)}</Text></View>
            {product.ptsMinor ? <View style={styles.tag}><Text style={styles.tagText}>PTS ₹{(product.ptsMinor / 100).toFixed(2)}</Text></View> : null}
            <View style={styles.tag}><Text style={styles.tagText}>Case: {product.caseSize} {product.unit}</Text></View>
            <View style={styles.tag}><Text style={styles.tagText}>MOQ: {product.moq} case</Text></View>
            <View style={styles.marginTag}><Text style={styles.marginText}>Margin {marginPct}%</Text></View>
          </View>

          {/* V3-FIX-173: B2B decision metadata — scheme, discount, delivery, finance */}
          {(product.scheme || product.tradeDiscountPct || product.creditDays) ? (
            <View style={styles.terms}>
              {product.scheme ? <View style={styles.schemeBadge}><Text style={styles.schemeText}>{product.scheme}</Text></View> : null}
              {product.tradeDiscountPct ? <View style={styles.discBadge}><Text style={styles.discText}>-{product.tradeDiscountPct}%</Text></View> : null}
              {product.creditDays ? <View style={styles.creditBadge}><Text style={styles.creditText}>{product.creditDays}d credit</Text></View> : null}
            </View>
          ) : null}

          {/* V3-FIX-173+181: Delivery + finance row — canonical chip tokens */}
          <View style={styles.terms}>
            {product.deliveryDays != null ? (
              <View style={styles.infoBadge}><Text style={styles.infoBadgeText}>Delivery: {product.deliveryDays}d</Text></View>
            ) : null}
            {product.bnplAvailable ? (
              <View style={styles.successBadge}><Text style={styles.successBadgeText}>BNPL</Text></View>
            ) : null}
            {product.financeEligible && !product.bnplAvailable ? (
              <View style={styles.successBadge}><Text style={styles.successBadgeText}>Credit</Text></View>
            ) : null}
            {product.deliveryTerms ? (
              <View style={styles.infoBadge}><Text style={[styles.infoBadgeText, { fontSize: 9 }]}>{product.deliveryTerms}</Text></View>
            ) : null}
            {product.procurementUnit && product.procurementUnit !== product.unit ? (
              <View style={styles.accentBadge}><Text style={styles.accentBadgeText}>{product.procurementUnit}{product.procurementPackQty && product.procurementPackQty > 1 ? ` ×${product.procurementPackQty}` : ''}</Text></View>
            ) : null}
            {product.publishedTermsVersion ? (
              <View style={styles.neutralBadge}><Text style={[styles.neutralBadgeText, { fontSize: 8 }]}>v{product.publishedTermsVersion}</Text></View>
            ) : null}
          </View>

          {/* V3-FIX-136: Browse-only — no inline qty/add. Tap card for details. */}
          <View style={styles.bottomRow}>
            <Text style={[
              styles.stockLabel,
              urgency === "urgent" && styles.stockUrgent,
              urgency === "low" && styles.stockLow,
              urgency === "ok" && styles.stockOk,
            ]}>
              {product.currentStock != null
                ? `Stock: ${product.currentStock}${product.daysOfStock != null ? ` (${urgency === "urgent" ? "runs out today!" : urgency === "low" ? `${product.daysOfStock}d left` : `${product.daysOfStock}d`})` : ""}`
                : "Stock: —"}
            </Text>
            {(orderQtyCases ?? 0) > 0 ? (
              <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{orderQtyCases} in cart</Text></View>
            ) : (
              <Text style={styles.tapHint}>Tap for details →</Text>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    // V3-FIX-181: Premium card with subtle elevation
    card: { backgroundColor: colors.surface, borderRadius: shell.cardRadius, padding: getScreenPadding(), borderWidth: 1, borderColor: colors.border, marginBottom: 8, ...cardElevation.subtle },
    cardUrgent: { borderLeftWidth: 3, borderLeftColor: colors.error },
    row: { flexDirection: "row", gap: 12 },
    imgBox: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center" },
    emoji: { fontSize: 26 },
    brandLabel: { fontSize: 7, fontWeight: "700", color: colors.textTertiary, marginTop: 1 },
    info: { flex: 1 },
    topRow: { flexDirection: "row", justifyContent: "space-between" },
    name: { ...typeRhythm.cardTitle, color: colors.textPrimary },
    meta: { ...typeRhythm.cardMeta, color: colors.textTertiary, marginTop: 1 },
    priceCol: { alignItems: "flex-end" },
    ptr: { fontSize: 16, fontWeight: "900", color: colors.success },
    ptrLabel: { fontSize: 9, color: colors.textTertiary },
    tags: { flexDirection: "row", gap: 4, marginTop: 6, flexWrap: "wrap" },
    tag: { backgroundColor: colors.backgroundSecondary, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    tagText: { fontSize: 9, fontWeight: "600", color: colors.textSecondary },
    marginTag: { backgroundColor: colors.successSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    marginText: { fontSize: 9, fontWeight: "800", color: colors.success },
    terms: { flexDirection: "row", gap: 4, marginTop: 4 },
    schemeBadge: { backgroundColor: colors.warningSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    schemeText: { fontSize: 9, fontWeight: "700", color: colors.warningDark },
    discBadge: { backgroundColor: colors.accentLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    discText: { fontSize: 9, fontWeight: "700", color: colors.accentDark },
    creditBadge: { backgroundColor: colors.primaryLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    creditText: { fontSize: 9, fontWeight: "700", color: colors.primary },
    bottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
    stockLabel: { fontSize: 10, fontWeight: "700" },
    stockUrgent: { color: colors.error },
    stockLow: { color: colors.warning },
    stockOk: { color: colors.success },
    qtyRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    qtyBox: { flexDirection: "row", alignItems: "center", backgroundColor: colors.backgroundSecondary, borderRadius: 6, transform: [{ scale: 0.85 }] },
    qtyBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
    qtyBtnText: { fontSize: 14, fontWeight: "700", color: colors.primary },
    qtyVal: { fontSize: 13, fontWeight: "800", minWidth: 20, textAlign: "center" },
    casesLabel: { fontSize: 9, color: colors.textTertiary },
    addBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
    addBtnText: { color: colors.textInverse, fontSize: 11, fontWeight: "700" },
    calcLine: { fontSize: 9, color: colors.textTertiary, marginTop: 4 },
    // V3-FIX-136: Browse-only card styles
    cartBadge: { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    cartBadgeText: { color: colors.textInverse, fontSize: 10, fontWeight: "700" },
    tapHint: { fontSize: 11, color: colors.textTertiary, fontWeight: "500" },
    // V3-FIX-181: Semantic badge styles from chipColors tokens
    infoBadge: { backgroundColor: chipColors(colors).info.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    infoBadgeText: { fontSize: 9, fontWeight: "700", color: chipColors(colors).info.text },
    successBadge: { backgroundColor: chipColors(colors).status.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    successBadgeText: { fontSize: 9, fontWeight: "700", color: chipColors(colors).status.text },
    accentBadge: { backgroundColor: chipColors(colors).accent.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    accentBadgeText: { fontSize: 9, fontWeight: "700", color: chipColors(colors).accent.text },
    neutralBadge: { backgroundColor: chipColors(colors).neutral.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    neutralBadgeText: { fontSize: 9, fontWeight: "700", color: chipColors(colors).neutral.text },
  });
}
