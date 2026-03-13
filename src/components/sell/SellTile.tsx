// SCALE-B1: Enhanced POS sell tile (staff view — no margin/cost shown)
// Approved design: image, brand, mode badge, pack size, sell price, MRP,
// stock color-coded, GST%, expiry warning, barcode.
// EXPLICITLY HIDDEN: purchase_price, margin, supplier_name

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../../theme";
import { formatMoney } from "../../utils/money";
import { ProductImage } from "../ProductImage";

// =============================================================================
// TYPES
// =============================================================================

export interface SellTileProduct {
  barcode: string;
  name: string;
  /** Sell price in paise (integer) */
  sellPriceMinor: number | null;
  /** MRP in paise (integer); shown only if > 0 */
  mrp?: number | null;
  /** GST rate percentage, e.g. 18 */
  gst_rate?: number | null;
  /** Net content numeric value, e.g. 500 */
  net_content_value?: number | null;
  /** Net content unit string, e.g. "g", "ml", "kg" */
  net_content_unit?: string | null;
  /** Product image URL */
  image_url?: string | null;
  /** Expiry date ISO string */
  expiry_date?: string | null;
  /** Brand name */
  brand?: string | null;
  /** PACKAGED = pre-weighed; LOOSE = sold by weight */
  mode?: "PACKAGED" | "LOOSE";
  /** Rate unit for LOOSE mode (e.g. "KG") */
  rate_unit?: string | null;
  /** Current stock count */
  currentStock?: number | null;
}

export interface SellTileProps {
  product: SellTileProduct;
  testID?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Format paise → "₹28.00"
 * For LOOSE mode: "₹28.00/KG"
 * STG-483: Delegates to formatMoney() — single source of truth for currency formatting
 */
function formatPrice(paise: number | null, rateUnit?: string | null): string {
  if (paise === null || paise === undefined) return "—";
  const formatted = formatMoney(paise);
  if (rateUnit) return `${formatted}/${rateUnit}`;
  return formatted;
}

/**
 * Pack size label.
 * PACKAGED: "500 g", "1 kg"
 * LOOSE: "per KG"
 */
function packSizeLabel(
  mode: "PACKAGED" | "LOOSE" | undefined,
  value: number | null | undefined,
  unit: string | null | undefined,
  rateUnit: string | null | undefined
): string | null {
  if (mode === "LOOSE") {
    return rateUnit ? `per ${rateUnit}` : null;
  }
  if (value != null && unit) {
    return `${value} ${unit}`;
  }
  return null;
}

/**
 * Compute days remaining from today to expiry date.
 * Returns null if no date.
 */
function daysUntilExpiry(expiryIso: string | null | undefined): number | null {
  if (!expiryIso) return null;
  const expiry = new Date(expiryIso);
  if (isNaN(expiry.getTime())) return null;
  const now = new Date();
  // Zero-out time component for day-level calculation
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const expDay = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  return Math.round((expDay - nowDay) / (1000 * 60 * 60 * 24));
}

/**
 * Format expiry date as "15-Aug-26"
 */
function formatExpiryDate(expiryIso: string): string {
  const d = new Date(expiryIso);
  if (isNaN(d.getTime())) return expiryIso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" });
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SellTile({ product, testID }: SellTileProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const {
    barcode,
    name,
    sellPriceMinor,
    mrp,
    gst_rate,
    net_content_value,
    net_content_unit,
    image_url,
    expiry_date,
    brand,
    mode,
    rate_unit,
    currentStock,
  } = product;

  // --- Price labels ---
  const sellPriceLabel = formatPrice(
    sellPriceMinor,
    mode === "LOOSE" ? (rate_unit ?? undefined) : undefined
  );
  const mrpLabel =
    mrp && mrp > 0 ? `MRP ${formatPrice(mrp)}` : null;

  // --- Pack size ---
  const packSize = packSizeLabel(mode, net_content_value, net_content_unit, rate_unit);

  // --- Stock color ---
  const stockCount =
    currentStock !== null && currentStock !== undefined && !isNaN(Number(currentStock))
      ? Number(currentStock)
      : null;
  const stockColor =
    stockCount === null
      ? colors.textTertiary
      : stockCount === 0
        ? colors.error
        : stockCount <= 10
          ? colors.warning
          : colors.success;
  const stockLabel =
    stockCount === null ? "Stock: —" : `Stock: ${stockCount} pcs`;

  // --- Expiry warning ---
  const daysLeft = daysUntilExpiry(expiry_date);
  let expiryText: string | null = null;
  let expiryColor: string | null = null;
  if (daysLeft !== null) {
    if (daysLeft < 0) {
      expiryText = "⚠ EXPIRED";
      expiryColor = colors.error;
    } else if (daysLeft <= 30) {
      expiryText = `⚠ Exp: ${formatExpiryDate(expiry_date!)} (${daysLeft}d)`;
      expiryColor = colors.error;
    } else if (daysLeft <= 90) {
      expiryText = `⚠ Exp: ${formatExpiryDate(expiry_date!)} (${daysLeft}d)`;
      expiryColor = colors.warning;
    }
    // >90d: no badge (expiryText stays null)
  }

  // --- Mode badge label ---
  const modeBadge = mode ?? null;

  return (
    <View style={styles.tile} testID={testID ?? "sell-tile"}>
      {/* Row 1: Image + name/brand/badge/pack-size */}
      <View style={styles.topRow}>
        {/* SCALE-E2: ProductImage handles remote load, null, and error fallback */}
        <ProductImage
          uri={image_url}
          size={40}
          borderRadius={4}
          testID={image_url ? "sell-tile-image" : "sell-tile-image-fallback"}
        />

        {/* Name + meta */}
        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={2} testID="sell-tile-name">
            {name}
          </Text>
          <View style={styles.metaRow}>
            {brand ? (
              <Text style={styles.brand} numberOfLines={1} testID="sell-tile-brand">
                {brand}
              </Text>
            ) : null}
            {modeBadge ? (
              <View
                style={[
                  styles.modeBadge,
                  modeBadge === "PACKAGED" ? styles.modeBadgePackaged : styles.modeBadgeLoose,
                ]}
                testID="sell-tile-mode-badge"
              >
                <Text
                  style={[
                    styles.modeBadgeText,
                    modeBadge === "PACKAGED"
                      ? styles.modeBadgeTextPackaged
                      : styles.modeBadgeTextLoose,
                  ]}
                >
                  {modeBadge}
                </Text>
              </View>
            ) : null}
            {packSize ? (
              <Text style={styles.packSize} testID="sell-tile-pack-size">
                {packSize}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Row 2: Sell price + MRP */}
      <View style={styles.priceRow}>
        <Text style={styles.sellPrice} testID="sell-tile-sell-price">
          {sellPriceLabel}
        </Text>
        {mrpLabel ? (
          <Text style={styles.mrp} testID="sell-tile-mrp">
            {mrpLabel}
          </Text>
        ) : null}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Row 3: Stock + GST | Expiry + Barcode */}
      <View style={styles.bottomRow}>
        <View style={styles.bottomLeft}>
          <Text
            style={[styles.stock, { color: stockColor }]}
            testID="sell-tile-stock"
          >
            {stockLabel}
          </Text>
          {expiryText ? (
            <Text
              style={[styles.expiry, { color: expiryColor! }]}
              testID="sell-tile-expiry"
            >
              {expiryText}
            </Text>
          ) : null}
        </View>
        <View style={styles.bottomRight}>
          {gst_rate != null ? (
            <Text style={styles.gst} testID="sell-tile-gst">
              GST {gst_rate}%
            </Text>
          ) : null}
          {barcode ? (
            <Text style={styles.barcode} numberOfLines={1} testID="sell-tile-barcode">
              {barcode}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

function createStyles(colors: ReturnType<typeof useThemeColors>) {
  return StyleSheet.create({
    tile: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 10,
      marginBottom: 8,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8,
    },
    nameBlock: {
      flex: 1,
    },
    name: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 4,
    },
    brand: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    modeBadge: {
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    modeBadgePackaged: {
      backgroundColor: colors.primarySoft,
    },
    modeBadgeLoose: {
      backgroundColor: colors.accentLight,
    },
    modeBadgeText: {
      fontSize: 10,
      fontWeight: "700",
    },
    modeBadgeTextPackaged: {
      color: colors.primary,
    },
    modeBadgeTextLoose: {
      color: colors.accent,
    },
    packSize: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 6,
    },
    priceRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
    },
    sellPrice: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    mrp: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    bottomRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    bottomLeft: {
      flex: 1,
      gap: 2,
    },
    bottomRight: {
      alignItems: "flex-end",
      gap: 2,
    },
    stock: {
      fontSize: 11,
      fontWeight: "600",
    },
    expiry: {
      fontSize: 11,
      fontWeight: "600",
    },
    gst: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    barcode: {
      fontSize: 10,
      color: colors.textTertiary,
      maxWidth: 120,
    },
  });
}
