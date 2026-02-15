// T-163: Placeholder image component for products without photos
// Provides a consistent fallback visual when a product has no image.
// Uses MaterialCommunityIcons package-variant icon centered in a rounded container.

import React from "react";
import { View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";

interface ProductImagePlaceholderProps {
  /** Size of the placeholder container in pixels (default: 48) */
  size?: number;
}

export default function ProductImagePlaceholder({
  size = 48,
}: ProductImagePlaceholderProps) {
  const iconSize = Math.round(size * 0.5);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: 6,
        },
      ]}
    >
      <MaterialCommunityIcons
        name="package-variant"
        size={iconSize}
        color={theme.colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
});
