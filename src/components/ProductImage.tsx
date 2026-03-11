// SCALE-E2: Reusable ProductImage component for POS sell and buy tiles
// Handles: remote image loading, load-error fallback, null/undefined fallback
// Used by: SellTile (sell screen), CatalogProductCard (buy screen), and any future tile

import React, { useState } from "react";
import { Image, View, Text, StyleSheet, ImageStyle, ViewStyle } from "react-native";

// =============================================================================
// TYPES
// =============================================================================

export interface ProductImageProps {
  /** Remote GCS URL or null/undefined when product has no image */
  uri: string | null | undefined;
  /** Width and height of the image in dp (default: 40) */
  size?: number;
  /** Border radius in dp (default: 4) */
  borderRadius?: number;
  /** testID for automated tests */
  testID?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * ProductImage — network image with gray placeholder fallback.
 *
 * - Renders a remote image when `uri` is provided and loads successfully.
 * - Falls back to a gray box with 📦 icon when:
 *   - `uri` is null or undefined (no image assigned to product)
 *   - The network image fails to load (onError)
 *
 * The same component is used on both the sell tile (staff view)
 * and the buy/catalog tile, keeping fallback UX consistent.
 */
export const ProductImage: React.FC<ProductImageProps> = ({
  uri,
  size = 40,
  borderRadius = 4,
  testID,
}) => {
  const [loadError, setLoadError] = useState(false);

  const containerStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius,
  };

  const imageStyle: ImageStyle = {
    width: size,
    height: size,
    borderRadius,
  };

  // Show placeholder when: no URI provided, or image failed to load
  if (!uri || loadError) {
    return (
      <View
        style={[styles.placeholder, containerStyle]}
        testID={testID ?? "product-image-placeholder"}
      >
        <Text style={[styles.placeholderIcon, { fontSize: Math.round(size * 0.45) }]}>
          📦
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={imageStyle}
      onError={() => setLoadError(true)}
      resizeMode="cover"
      testID={testID ?? "product-image"}
    />
  );
};

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIcon: {
    // fontSize set inline based on `size` prop
  },
});

export default ProductImage;
