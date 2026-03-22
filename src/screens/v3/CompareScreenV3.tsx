import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, ScrollView, ActivityIndicator, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";
import { getProductSuppliers, type CatalogSupplier } from "../../services/api/catalogApi";
import { getDeviceStoreId } from "../../services/deviceSession";
import { logger } from "../../services/logger";

// STG-562: Supplier price comparison — all suppliers for one product, ranked by price
// Shows: price, MOQ, delivery, BNPL, margin, auto-calculated need based on sales velocity

type SupplierOffer = {
  id: string;
  supplierName: string;
  ptrMinor: number;
  moq: number;
  moqUnit: string;
  deliveryDays: number;
  tradeDiscountPct?: number;
  bnplAvailable?: boolean;
  freeDelivery?: boolean;
  creditDays?: number;
  // V3-FIX-173: Full buyer-card metadata
  scheme?: string;
  deliveryTerms?: string;
  financeEligible?: boolean;
  publishedTermsVersion?: number;
  moqTiers?: any;
  procurementUnit?: string;
  procurementPackQty?: number;
  baseStockUnit?: string;
  isBestPrice?: boolean;
};

type CompareScreenV3Props = {
  visible: boolean;
  productName: string;
  productId?: string; // V3-FIX-173: canonical product ID for supplier lookup
  packSize: string;
  mrpMinor: number;
  currentStock: number;
  sellPriceMinor: number;
  weeklyNeed: number;
  onClose: () => void;
  onOrder: (supplierId: string, qty: number) => void;
};

// V3-014: Demo data removed — offers loaded from real API

export default function CompareScreenV3({ visible, productName, productId, packSize, mrpMinor, currentStock, sellPriceMinor, weeklyNeed, onClose, onOrder }: CompareScreenV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [loading, setLoading] = useState(true);

  // V3-014: Fetch real supplier offers
  useEffect(() => {
    if (!visible) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const online = await isOnline();
        if (!online) { showToast("Offline — comparison unavailable"); setLoading(false); return; }
        const storeId = await getDeviceStoreId();
        if (!storeId) return;
        // V3-FIX-173: Use canonical productId for supplier-offer identity lookup
        if (!productId) {
          showToast("Product identity missing — cannot compare suppliers");
          setLoading(false);
          return;
        }
        const suppliers = await getProductSuppliers(storeId, productId);
        // Sort by price ascending — lowest price is best
        const sorted = [...suppliers].sort((a, b) => a.purchasePrice - b.purchasePrice);
        const bestPrice = sorted.length > 0 ? sorted[0].purchasePrice : 0;
        const mapped: SupplierOffer[] = sorted.map((s) => ({
          id: s.supplierId,
          supplierName: s.supplierName,
          ptrMinor: s.purchasePrice,
          moq: s.moq,
          moqUnit: s.moqUnit ?? "units",
          deliveryDays: s.deliveryDays ?? 0,
          bnplAvailable: s.bnplEligible,
          tradeDiscountPct: s.tradeDiscountPct,
          creditDays: s.creditDays,
          freeDelivery: s.freeDelivery,
          scheme: s.scheme,
          deliveryTerms: s.deliveryTerms,
          financeEligible: s.financeEligible,
          publishedTermsVersion: s.publishedTermsVersion,
          moqTiers: s.moqTiers,
          procurementUnit: s.procurementUnit,
          procurementPackQty: s.procurementPackQty,
          baseStockUnit: s.baseStockUnit,
          isBestPrice: s.purchasePrice === bestPrice,
        }));
        setOffers(mapped);
      } catch (err) {
        logger.debug("CompareV3", `fetch_failed:${String(err)}`);
        // V3-FIX-077: No demo fallback — show real error state
        showToast("Could not load supplier offers");
      }
      setLoading(false);
    };
    void fetch();
  }, [visible, productName]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onClose} accessibilityLabel="Back">
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{productName}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Product info card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLine}>Your sell price: <Text style={styles.infoBold}>₹{(sellPriceMinor / 100).toFixed(0)}</Text> · Stock: <Text style={styles.infoBold}>{currentStock} units</Text></Text>
          <Text style={styles.needLine}>Need ~{weeklyNeed} units (1 week supply)</Text>
        </View>

        {/* Section title */}
        <Text style={styles.sectionTitle}>COMPARE SUPPLIERS</Text>

        {/* Supplier offer cards */}
        {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} /> : null}
        {!loading && offers.length === 0 ? (
          <View style={{ padding: 24, alignItems: "center" }}>
            <Text style={{ fontSize: 28, marginBottom: 8 }}>📭</Text>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.textSecondary }}>No suppliers found</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4, textAlign: "center" }}>No supplier offers available for this product</Text>
          </View>
        ) : null}
        {offers.map((offer) => {
          const marginPct = Math.round((1 - offer.ptrMinor / (mrpMinor / 100)) * 100);
          const totalForNeed = weeklyNeed * offer.ptrMinor;

          return (
            <View key={offer.id} style={[styles.offerCard, offer.isBestPrice && styles.offerCardBest]}>
              <View style={styles.offerTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerName}>{offer.isBestPrice ? "⭐ " : ""}{offer.supplierName}</Text>
                  <Text style={styles.offerMeta}>
                    MOQ: {offer.moq} {offer.moqUnit} · {offer.deliveryDays === 0 ? "Same day" : `${offer.deliveryDays} day${offer.deliveryDays > 1 ? "s" : ""}`} delivery
                    {offer.freeDelivery ? " · Free delivery" : ""}
                  </Text>
                </View>
                <View style={styles.offerPriceCol}>
                  <Text style={[styles.offerPrice, offer.isBestPrice && styles.offerPriceBest]}>₹{(offer.ptrMinor / 100).toFixed(2)}/u</Text>
                  {offer.isBestPrice ? <View style={styles.bestBadge}><Text style={styles.bestText}>Best Price</Text></View> : null}
                </View>
              </View>

              {/* Terms badges */}
              <View style={styles.termRow}>
                {offer.tradeDiscountPct ? <View style={styles.termBadge}><Text style={styles.termText}>Disc {offer.tradeDiscountPct}%</Text></View> : null}
                {offer.creditDays ? <View style={styles.termBadge}><Text style={styles.termText}>Credit {offer.creditDays}d</Text></View> : null}
                {offer.bnplAvailable ? <View style={styles.bnplBadge}><Text style={styles.bnplText}>BNPL</Text></View> : null}
                {offer.financeEligible && !offer.bnplAvailable ? <View style={styles.termBadge}><Text style={styles.termText}>Credit</Text></View> : null}
                {offer.scheme ? <View style={styles.termBadge}><Text style={styles.termText}>{offer.scheme}</Text></View> : null}
                {offer.deliveryTerms ? <View style={styles.termBadge}><Text style={[styles.termText, { fontSize: 10 }]}>{offer.deliveryTerms}</Text></View> : null}
                {offer.procurementUnit ? <View style={styles.termBadge}><Text style={styles.termText}>{offer.procurementUnit}{offer.procurementPackQty && offer.procurementPackQty > 1 ? ` ×${offer.procurementPackQty}` : ''}{offer.baseStockUnit && offer.baseStockUnit !== offer.procurementUnit ? ` → ${offer.baseStockUnit}` : ''}</Text></View> : null}
                {offer.publishedTermsVersion ? <View style={styles.termBadge}><Text style={[styles.termText, { fontSize: 10 }]}>v{offer.publishedTermsVersion}</Text></View> : null}
              </View>

              <Text style={styles.calcLine}>
                Total for {weeklyNeed}: ₹{Math.round(totalForNeed / 100).toLocaleString("en-IN")} · Margin: {marginPct}%
              </Text>

              <Pressable
                style={[styles.orderBtn, offer.isBestPrice && styles.orderBtnBest]}
                onPress={() => { onOrder(offer.id, weeklyNeed); showToast(`Order placed with ${offer.supplierName}`); }}
                accessibilityRole="button"
              >
                <Text style={[styles.orderBtnText, offer.isBestPrice && styles.orderBtnTextBest]}>Order from {offer.supplierName}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
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
    infoCard: { backgroundColor: colors.primaryLight, borderRadius: 14, padding: getScreenPadding(), marginBottom: 12, alignItems: "center" },
    infoLine: { fontSize: 12, color: colors.textTertiary },
    infoBold: { fontWeight: "800", color: colors.textPrimary },
    needLine: { fontSize: 12, color: colors.primary, fontWeight: "700", marginTop: 2 },
    sectionTitle: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.8, marginBottom: 8 },
    // Offer cards
    offerCard: { backgroundColor: colors.surface, borderRadius: 16, padding: getScreenPadding(), borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
    offerCardBest: { borderWidth: 2, borderColor: colors.success },
    offerTop: { flexDirection: "row", justifyContent: "space-between" },
    offerName: { fontSize: 14, fontWeight: "800", color: colors.textPrimary },
    offerMeta: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
    offerPriceCol: { alignItems: "flex-end" },
    offerPrice: { fontSize: 18, fontWeight: "900", color: colors.textPrimary },
    offerPriceBest: { color: colors.success },
    bestBadge: { backgroundColor: colors.successSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
    bestText: { fontSize: 10, fontWeight: "800", color: colors.success }, // GCP-STG-0307: raised from 9
    termRow: { flexDirection: "row", gap: 4, marginTop: 6 },
    termBadge: { backgroundColor: colors.backgroundSecondary, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    termText: { fontSize: 10, fontWeight: "700", color: colors.textSecondary }, // GCP-STG-0307: raised from 9
    bnplBadge: { backgroundColor: "#F5F3FF", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
    bnplText: { fontSize: 10, fontWeight: "700", color: "#7C3AED" }, // GCP-STG-0307: raised from 9
    calcLine: { fontSize: 12, color: colors.textTertiary, marginTop: 6 },
    orderBtn: { marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    orderBtnBest: { backgroundColor: colors.success, borderColor: colors.success },
    orderBtnText: { fontSize: 14, fontWeight: "800", color: colors.primary },
    orderBtnTextBest: { color: "#fff" },
  });
}
