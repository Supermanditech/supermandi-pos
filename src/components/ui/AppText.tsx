/**
 * AppText - GO-LIVE-TR-002
 *
 * Safe Text component with built-in handling for long Hindi strings.
 * Provides consistent truncation, font scaling, and layout behavior.
 *
 * Usage:
 *   <AppText>Regular text</AppText>
 *   <AppText variant="label" maxLines={1}>Tab label</AppText>
 *   <AppText variant="button">Button text</AppText>
 *   <AppText variant="heading">Page title</AppText>
 */

import React from "react";
import { Text, TextProps, StyleSheet, Platform, StyleProp, TextStyle } from "react-native";
import { theme } from "../../theme";
import { getChipFontSize } from "../../theme/responsive";

export type AppTextVariant =
  | "body"      // Default body text
  | "label"     // Tab labels, chips, tags
  | "button"    // Button text
  | "heading"   // Section headings
  | "title"     // Screen titles
  | "caption"   // Small helper text
  | "price"     // Price display
  | "mono";     // Monospace (barcodes, SKUs)

interface AppTextProps extends TextProps {
  /** Text style variant */
  variant?: AppTextVariant;
  /** Maximum number of lines (enables truncation) */
  maxLines?: number;
  /** Allow font size to shrink to fit content */
  allowFontScaling?: boolean;
  /** Minimum font size when scaling (Android only) */
  minFontSize?: number;
  /** Text color override */
  color?: string;
  /** Bold text */
  bold?: boolean;
  /** Center text */
  center?: boolean;
}

/**
 * Safe text component with consistent behavior for multilingual text
 */
export function AppText({
  variant = "body",
  maxLines,
  allowFontScaling = true,
  minFontSize = 10,
  color,
  bold,
  center,
  style,
  children,
  ...props
}: AppTextProps) {
  const variantStyle = styles[variant] || styles.body;

  // Combine styles - filter out falsy values for proper typing
  const combinedStyle: StyleProp<TextStyle> = [
    styles.base,
    variantStyle,
    color ? { color } : undefined,
    bold ? styles.bold : undefined,
    center ? styles.center : undefined,
    // Ensure text can shrink to prevent overflow
    maxLines ? styles.truncatable : undefined,
    style,
  ].filter(Boolean) as StyleProp<TextStyle>;

  // Props for text handling
  const textProps: TextProps = {
    ...props,
    style: combinedStyle,
    allowFontScaling,
  };

  // Enable truncation if maxLines specified
  if (maxLines) {
    textProps.numberOfLines = maxLines;
    textProps.ellipsizeMode = props.ellipsizeMode || "tail";
  }

  // Enable font scaling on Android
  if (Platform.OS === "android" && minFontSize && maxLines) {
    textProps.minimumFontScale = minFontSize / 16; // Relative to base font
    textProps.adjustsFontSizeToFit = true;
  }

  return <Text {...textProps}>{children}</Text>;
}

/**
 * Button text with safe truncation
 */
export function ButtonText({
  children,
  ...props
}: Omit<AppTextProps, "variant">) {
  return (
    <AppText variant="button" maxLines={1} {...props}>
      {children}
    </AppText>
  );
}

/**
 * Tab/chip label with strict size constraints
 */
export function LabelText({
  children,
  ...props
}: Omit<AppTextProps, "variant">) {
  return (
    <AppText variant="label" maxLines={1} minFontSize={8} {...props}>
      {children}
    </AppText>
  );
}

/**
 * Price display (always fits)
 */
export function PriceText({
  children,
  ...props
}: Omit<AppTextProps, "variant">) {
  return (
    <AppText variant="price" maxLines={1} {...props}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  base: {
    color: theme.colors.textPrimary,
    // Ensure text can shrink when needed
    flexShrink: 1,
  },
  truncatable: {
    flexShrink: 1,
  },
  bold: {
    fontWeight: "700",
  },
  center: {
    textAlign: "center",
  },
  // Variants
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  // V3-HARDEN-111: Label variant uses responsive chip font size
  label: {
    fontSize: getChipFontSize(),
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  button: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  caption: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  price: {
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  mono: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});

export default AppText;
