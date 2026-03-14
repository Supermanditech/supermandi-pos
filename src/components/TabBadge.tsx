// TabBadge - V3.0.9 compliant
// Badge component for tab navigation

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { theme } from "../theme";

// =============================================================================
// TYPES
// =============================================================================

export interface TabBadgeProps {
  count: number;
  color?: string;
  textColor?: string;
  maxCount?: number;
  size?: "sm" | "md";
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TabBadge({
  count,
  color = theme.colors.error,
  textColor = theme.colors.textInverse,
  maxCount = 99,
  size = "sm",
}: TabBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const displayCount = count > maxCount ? `${maxCount}+` : String(count);
  const isSmall = size === "sm";

  return (
    <View
      style={[
        styles.badge,
        isSmall ? styles.badgeSmall : styles.badgeMedium,
        { backgroundColor: color },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          isSmall ? styles.badgeTextSmall : styles.badgeTextMedium,
          { color: textColor },
        ]}
        numberOfLines={1}
      >
        {displayCount}
      </Text>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 16,
  },
  badgeSmall: {
    minWidth: 14,
    height: 14,
    paddingHorizontal: 3,
  },
  badgeMedium: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
  },
  badgeText: {
    fontWeight: "700",
    textAlign: "center",
  },
  badgeTextSmall: {
    fontSize: 11,
  },
  badgeTextMedium: {
    fontSize: 12,
  },
});

export default TabBadge;
