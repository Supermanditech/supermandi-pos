// SCALE-B1: Enhanced POS sell tile (staff view — no margin/cost shown)
// Approved design: image, brand, mode badge, pack size, sell price, MRP,
// stock color-coded, GST%, expiry warning, barcode.
// EXPLICITLY HIDDEN: purchase_price, margin, supplier_name

import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useThemeColors } from "../../theme";
import { formatMoney } from "../../utils/money";
import { hapticFeedback } from "../../utils/haptics";
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
  /** Optional press handler — wraps tile in Pressable with ripple + haptic */
  onPress?: () => void;
  testID?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Format paise → "₹28.00". STG-483: uses formatMoney. STG-226: null→null. */
function formatPrice(paise: number | null, rateUnit?: string | null): string | null {
  if (paise == null) return null;
  const raw = formatMoney(paise);
  const formatted = raw.includes('.') ? raw : `${raw}.00`;
  if (rateUnit) return `${formatted}/${rateUnit}`;
  return formatted;
}

/**
 * Pack size label.
 * PACKAGED: "500 g", "1 kg"
 * LOOSE: "per KG" (using rateUnit)
 */
function packSizeLabel(
  mode: "PACKAGED" | "LOOSE" | undefined,
  value: number | null | undefined,
  unit: string | null | undefined,
  rateUnit: string | null | undefined
): string | null {
  if (mode === "LOOSE") {
    // STG-018: Show "per <unit>" for LOOSE mode
    if (rateUnit) return `per ${rateUnit}`;
    return null;
  }
  if (value != null && unit) {
    return `${value} ${unit}`;
  }
  return null;
}

/**
 * Compute days remaining from today to expiry date.
 * Returns null if no date.
 * STG-227: Normalize both dates to IST (Asia/Kolkata) before calculating day difference.
 * This prevents off-by-one errors near midnight when the device timezone differs from IST.
 */
function daysUntilExpiry(expiryIso: string | null | undefined): number | null {
  if (!expiryIso) return null;
  const expiry = new Date(expiryIso);
  if (isNaN(expiry.getTime())) return null;
  const now = new Date();
  // Normalize both dates to IST to avoid timezone-dependent off-by-one
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const istExpiry = new Date(expiry.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  // Zero-out time component for day-level calculation
  const nowDay = Date.UTC(istNow.getFullYear(), istNow.getMonth(), istNow.getDate());
  const expDay = Date.UTC(istExpiry.getFullYear(), istExpiry.getMonth(), istExpiry.getDate());
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

export function SellTile({ product, onPress, testID }: SellTileProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // STG-056: Haptic feedback on press
  const handlePress = useCallback(() => {
    if (onPress) {
      hapticFeedback.light();
      onPress();
    }
  }, [onPress]);

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
  // STG-226: formatPrice returns null for missing price; show localized warning instead of em dash
  const formattedSellPrice = formatPrice(
    sellPriceMinor,
    mode === "LOOSE" ? (rate_unit ?? undefined) : undefined
  );
  const sellPriceLabel = formattedSellPrice ?? t("sell.priceNotSet");
  const isSellPriceNotSet = formattedSellPrice === null;
  const mrpLabel =
    mrp && mrp > 0 ? `MRP ${formatPrice(mrp) ?? ""}` : null;

  // STG-228: MRP strikethrough when sell price < MRP
  const showMrpStrikethrough =
    mrp != null && mrp > 0 && sellPriceMinor != null && mrp > sellPriceMinor;
  const mrpStrikethroughLabel = showMrpStrikethrough ? formatPrice(mrp) : null;

  // STG-032: Discount percentage badge when sell price < MRP
  const discountPercent = showMrpStrikethrough
    ? Math.round(((mrp! - sellPriceMinor!) / mrp!) * 100)
    : 0;

  // --- Pack size ---
  // STG-018: packSizeLabel returns "per <unit>" for LOOSE, "Xg" for PACKAGED
  // STG-229: i18n key used for a11y/future translations — raw label used for display
  const packSizeRaw = packSizeLabel(mode, net_content_value, net_content_unit, rate_unit);
  // Keep i18n key reference for future localization support (components.sellTile.perUnit)
  const _perUnitI18nKey = "components.sellTile.perUnit";
  const packSize = packSizeRaw;

  // --- Stock badge ---
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
  const stockBadgeLabel =
    stockCount === null
      ? t("components.sellTile.stockUnavailable")
      : stockCount === 0
        ? t("sell.outOfStock")
        : stockCount <= 10
          ? t("sell.lowStock")
          : t("sell.inStock");
  const stockDetailLabel =
    stockCount === null ? null : t("components.sellTile.stockWithCount", { count: stockCount });

  // --- Expiry warning ---
  const daysLeft = daysUntilExpiry(expiry_date);
  let expiryText: string | null = null;
  let expiryColor: string | null = null;
  if (daysLeft !== null) {
    if (daysLeft < 0) {
      expiryText = `⚠ ${t("components.sellTile.expired")}`;
      expiryColor = colors.error;
    } else if (daysLeft <= 30) {
      expiryText = `⚠ ${t("components.sellTile.expiryWarning", { date: formatExpiryDate(expiry_date!), days: daysLeft })}`;
      expiryColor = colors.error;
    } else if (daysLeft <= 90) {
      expiryText = `⚠ ${t("components.sellTile.expiryWarning", { date: formatExpiryDate(expiry_date!), days: daysLeft })}`;
      expiryColor = colors.warning;
    }
    // >90d: no badge (expiryText stays null)
  }

  // --- Mode badge label ---
  const modeBadge = mode ?? null;

  // STG-046: Accessibility hint for tap interaction
  const tileAccessibilityHint = t("sell.tapForDetails");

  // STG-056: Wrap in Pressable with android_ripple when onPress is provided
  const Wrapper = onPress ? Pressable : View;
  const wrapperProps = onPress
    ? {
        style: styles.tile,
        testID: testID ?? "sell-tile",
        onPress: handlePress,
        accessibilityRole: "button" as const,
        accessibilityHint: tileAccessibilityHint,
        android_ripple: { color: colors.primary + "20" },
      }
    : {
        style: styles.tile,
        testID: testID ?? "sell-tile",
        accessibilityHint: tileAccessibilityHint,
      };

  return (
    <Wrapper {...wrapperProps}>
      {/* Main row: Image | Name+Brand | Price+Stock */}
      <View style={styles.mainRow}>
        {/* Left: Product image or first-letter avatar */}
        <ProductImage
          uri={image_url}
          size={40}
          borderRadius={4}
          testID={image_url ? "sell-tile-image" : "sell-tile-image-fallback"}
        />

        {/* Center: Brand + Name + mode/pack */}
        <View style={styles.centerBlock}>
          {brand ? (
            /* STG-356: ellipsis on brand, priority: brand > mode > packSize */
            <Text style={styles.brand} numberOfLines={1} ellipsizeMode="tail" testID="sell-tile-brand">
              {brand}
            </Text>
          ) : null}
          <Text style={styles.name} numberOfLines={2} testID="sell-tile-name">
            {name}
          </Text>
          <View style={styles.metaRow}>
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
                  numberOfLines={1}
                >
                  {modeBadge === "PACKAGED" ? t("components.sellTile.packaged") : t("components.sellTile.loose")}
                </Text>
              </View>
            ) : null}
            {packSize ? (
              <Text style={styles.packSize} numberOfLines={1} testID="sell-tile-pack-size">
                {packSize}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Right: Price + Stock badge + Add button */}
        <View style={styles.rightBlock}>
          {/* STG-228/032: Sell price row with strikethrough MRP and discount badge */}
          <View style={styles.priceRow}>
            {mrpStrikethroughLabel ? (
              <Text style={styles.mrpStrikethrough} testID="sell-tile-mrp-strikethrough">
                {mrpStrikethroughLabel}
              </Text>
            ) : null}
            <Text
              style={[styles.sellPrice, isSellPriceNotSet && { color: colors.warning }]}
              testID="sell-tile-sell-price"
            >
              {sellPriceLabel}
            </Text>
          </View>
          {/* STG-032: Discount percentage badge */}
          {discountPercent > 0 ? (
            <View style={styles.discountBadge} testID="sell-tile-discount-badge">
              <Text style={styles.discountBadgeText}>
                {t("components.sellTile.discountOff", { percent: discountPercent })}
              </Text>
            </View>
          ) : null}
          {mrpLabel && !showMrpStrikethrough ? (
            <Text style={styles.mrp} testID="sell-tile-mrp">
              {mrpLabel}
            </Text>
          ) : null}
          <View
            style={[styles.stockBadge, { backgroundColor: stockColor + "1A" }]}
            testID="sell-tile-stock-badge"
          >
            <Text
              style={[styles.stockBadgeText, { color: stockColor }]}
              testID="sell-tile-stock"
            >
              {stockBadgeLabel}
            </Text>
          </View>
          {stockDetailLabel ? (
            <Text style={styles.stockDetail} testID="sell-tile-stock-detail">
              {stockDetailLabel}
            </Text>
          ) : null}
          {/* STG-068: "+" tap affordance button for adding to bill */}
          {onPress ? (
            <Pressable
              style={styles.addButton}
              onPress={handlePress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("components.sellTile.addToBill")}
              testID="sell-tile-add-button"
            >
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* STG-357: Combined bottom row — stock + expiry in single line for consistent tile height */}
      {(stockDetailLabel || expiryText || gst_rate != null || barcode) ? (
        <>
          <View style={styles.divider} />
          <View style={styles.bottomRow}>
            <View style={styles.bottomLeft}>
              {/* STG-357: Stock count */}
              {stockDetailLabel ? (
                <Text style={styles.bottomCompact} numberOfLines={1} testID="sell-tile-bottom-compact">
                  {stockDetailLabel}
                </Text>
              ) : null}
              {/* Expiry warning with dedicated testID and color */}
              {expiryText ? (
                <Text
                  style={[styles.expiry, { color: expiryColor! }]}
                  numberOfLines={1}
                  testID="sell-tile-expiry"
                >
                  {expiryText}
                </Text>
              ) : null}
            </View>
            <View style={styles.bottomRight}>
              {gst_rate != null ? (
                <Text
                  style={styles.gst}
                  testID="sell-tile-gst"
                  accessibilityLabel={t("components.sellTile.gst", { rate: gst_rate })}
                >
                  {"GST "}{gst_rate}{"%"}
                </Text>
              ) : null}
              {barcode ? (
                <Text style={styles.barcode} numberOfLines={1} testID="sell-tile-barcode">
                  {barcode}
                </Text>
              ) : null}
            </View>
          </View>
        </>
      ) : null}
    </Wrapper>
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
    mainRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    centerBlock: {
      flex: 1,
    },
    rightBlock: {
      alignItems: "flex-end",
      gap: 2,
    },
    name: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 4,
      marginTop: 2,
    },
    brand: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 1,
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
      fontSize: 11,
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
      alignItems: "center",
      gap: 4,
    },
    sellPrice: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    // STG-228: Strikethrough MRP shown before sell price when discounted
    mrpStrikethrough: {
      fontSize: 11,
      color: colors.textTertiary,
      textDecorationLine: "line-through",
    },
    // STG-032: Discount percentage badge
    discountBadge: {
      backgroundColor: colors.success + "1A",
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    discountBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.success,
    },
    mrp: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    stockBadge: {
      borderRadius: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginTop: 2,
    },
    stockBadgeText: {
      fontSize: 11,
      fontWeight: "700",
    },
    stockDetail: {
      fontSize: 11,
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
    expiry: {
      fontSize: 11,
      fontWeight: "600",
    },
    // STG-357: Combined stock + expiry compact single line
    bottomCompact: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    gst: {
      fontSize: 11,
      color: colors.textTertiary,
    },
    barcode: {
      fontSize: 11,
      color: colors.textTertiary,
      maxWidth: 120,
    },
    // STG-068: "+" tap affordance button
    addButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
    },
    addButtonText: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.surface,
      lineHeight: 20,
    },
  });
}
