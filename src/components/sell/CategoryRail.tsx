import React, { useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText, LabelText } from "../ui/AppText";
import { theme } from "../../theme";
import { LinearGradient } from "expo-linear-gradient";

// SD-CATEGORY: Demo store category rail for fast category browsing
// CAT-004: Updated to support API-driven categories

import type { FmcgCategory } from "../../services/api/catalogApi";

// Vibrant gradient color palette for category icons (Indian-inspired)
// Keys can be either the slugified ID (legacy) or labelEn from API
const CATEGORY_COLORS: Record<string, { gradient: [string, string]; icon: string; glow: string }> = {
  // Slugified IDs (legacy/fallback)
  "all":        { gradient: ["#43A047", "#66BB6A"], icon: "#FFFFFF", glow: "#43A047" },
  "atta-dal":   { gradient: ["#EF6C00", "#FF9800"], icon: "#FFFFFF", glow: "#EF6C00" },
  "chawal":     { gradient: ["#F9A825", "#FFCA28"], icon: "#FFFFFF", glow: "#F9A825" },
  "masala":     { gradient: ["#E53935", "#EF5350"], icon: "#FFFFFF", glow: "#E53935" },
  "tel-ghee":   { gradient: ["#FF8F00", "#FFB300"], icon: "#FFFFFF", glow: "#FF8F00" },
  "namkeen":    { gradient: ["#D81B60", "#EC407A"], icon: "#FFFFFF", glow: "#D81B60" },
  "biscuit":    { gradient: ["#6D4C41", "#8D6E63"], icon: "#FFFFFF", glow: "#6D4C41" },
  "chai-coffee":{ gradient: ["#4E342E", "#795548"], icon: "#FFFFFF", glow: "#4E342E" },
  "cold-drink": { gradient: ["#1E88E5", "#42A5F5"], icon: "#FFFFFF", glow: "#1E88E5" },
  "doodh":      { gradient: ["#8E24AA", "#AB47BC"], icon: "#FFFFFF", glow: "#8E24AA" },
  "sabun":      { gradient: ["#00ACC1", "#26C6DA"], icon: "#FFFFFF", glow: "#00ACC1" },
  "safai":      { gradient: ["#3949AB", "#5C6BC0"], icon: "#FFFFFF", glow: "#3949AB" },
  "baby":       { gradient: ["#F06292", "#F48FB1"], icon: "#FFFFFF", glow: "#F06292" },
  "paan":       { gradient: ["#2E7D32", "#4CAF50"], icon: "#FFFFFF", glow: "#2E7D32" },
  "baaki":      { gradient: ["#546E7A", "#78909C"], icon: "#FFFFFF", glow: "#546E7A" },
  // labelEn from API (CAT-004)
  "Sab":        { gradient: ["#43A047", "#66BB6A"], icon: "#FFFFFF", glow: "#43A047" },
  "Atta-Dal":   { gradient: ["#EF6C00", "#FF9800"], icon: "#FFFFFF", glow: "#EF6C00" },
  "Chawal":     { gradient: ["#F9A825", "#FFCA28"], icon: "#FFFFFF", glow: "#F9A825" },
  "Masala":     { gradient: ["#E53935", "#EF5350"], icon: "#FFFFFF", glow: "#E53935" },
  "Tel-Ghee":   { gradient: ["#FF8F00", "#FFB300"], icon: "#FFFFFF", glow: "#FF8F00" },
  "Namkeen":    { gradient: ["#D81B60", "#EC407A"], icon: "#FFFFFF", glow: "#D81B60" },
  "Biscuit":    { gradient: ["#6D4C41", "#8D6E63"], icon: "#FFFFFF", glow: "#6D4C41" },
  "Chai-Coffee":{ gradient: ["#4E342E", "#795548"], icon: "#FFFFFF", glow: "#4E342E" },
  "Cold Drink": { gradient: ["#1E88E5", "#42A5F5"], icon: "#FFFFFF", glow: "#1E88E5" },
  "Doodh":      { gradient: ["#8E24AA", "#AB47BC"], icon: "#FFFFFF", glow: "#8E24AA" },
  "Sabun":      { gradient: ["#00ACC1", "#26C6DA"], icon: "#FFFFFF", glow: "#00ACC1" },
  "Safai":      { gradient: ["#3949AB", "#5C6BC0"], icon: "#FFFFFF", glow: "#3949AB" },
  "Baby":       { gradient: ["#F06292", "#F48FB1"], icon: "#FFFFFF", glow: "#F06292" },
  "Paan-Supari":{ gradient: ["#2E7D32", "#4CAF50"], icon: "#FFFFFF", glow: "#2E7D32" },
  "Baaki":      { gradient: ["#546E7A", "#78909C"], icon: "#FFFFFF", glow: "#546E7A" },
};

export type CategoryItem = {
  id: string;
  label: string;
  labelHi?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  /** Product count from API (CAT-004) */
  productCount?: number;
};

// Indian FMCG industry-standard categories for kirana stores (15 broad categories)
export const DEMO_CATEGORIES: CategoryItem[] = [
  { id: "all", label: "Sab", labelHi: "सभी", icon: "view-grid" },
  { id: "atta-dal", label: "Atta-Dal", labelHi: "आटा-दाल", icon: "barley" },
  { id: "chawal", label: "Chawal", labelHi: "चावल", icon: "rice" },
  { id: "masala", label: "Masala", labelHi: "मसाला", icon: "shaker-outline" },
  { id: "tel-ghee", label: "Tel-Ghee", labelHi: "तेल-घी", icon: "bottle-wine-outline" },
  { id: "namkeen", label: "Namkeen", labelHi: "नमकीन", icon: "food-croissant" },
  { id: "biscuit", label: "Biscuit", labelHi: "बिस्कुट", icon: "cookie-outline" },
  { id: "chai-coffee", label: "Chai-Coffee", labelHi: "चाय-कॉफी", icon: "coffee" },
  { id: "cold-drink", label: "Cold Drink", labelHi: "कोल्ड ड्रिंक", icon: "bottle-soda-classic" },
  { id: "doodh", label: "Doodh", labelHi: "दूध-पनीर", icon: "cow" },
  { id: "sabun", label: "Sabun", labelHi: "साबुन", icon: "hand-wash-outline" },
  { id: "safai", label: "Safai", labelHi: "सफाई", icon: "spray-bottle" },
  { id: "baby", label: "Baby", labelHi: "बेबी", icon: "baby-face-outline" },
  { id: "paan", label: "Paan-Supari", labelHi: "पान-सुपारी", icon: "leaf" },
  { id: "baaki", label: "Baaki", labelHi: "बाकी", icon: "dots-horizontal" },
];

const COLLAPSED_WIDTH = 80;
const EXPANDED_WIDTH = 220;
const ANIMATION_DURATION = 250;

/**
 * Convert FmcgCategory from API to CategoryItem for display.
 * Falls back to DEMO_CATEGORIES for icon if iconKey not valid.
 */
export function fmcgCategoryToItem(cat: FmcgCategory): CategoryItem {
  return {
    id: cat.id,
    label: cat.labelEn,
    labelHi: cat.labelHi ?? undefined,
    icon: cat.iconKey as keyof typeof MaterialCommunityIcons.glyphMap,
    productCount: cat.productCount,
  };
}

export interface CategoryRailProps {
  selectedCategory: string;
  onSelectCategory: (categoryId: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onCollapse: () => void;
  compact?: boolean;
  /** Optional API-driven categories. If provided, uses these instead of DEMO_CATEGORIES */
  categories?: CategoryItem[];
  /** Loading state for API categories */
  loading?: boolean;
}

// Animated category item component for interactive feedback
function CategoryItemButton({
  category,
  isSelected,
  expanded,
  compact,
  onPress,
}: {
  category: CategoryItem;
  isSelected: boolean;
  expanded: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(isSelected ? 1 : 0)).current;
  // CAT-004: Try id first (legacy slugs), then label (API labelEn), then fallback
  const colorScheme = CATEGORY_COLORS[category.id] || CATEGORY_COLORS[category.label] || CATEGORY_COLORS["baaki"];

  useEffect(() => {
    Animated.timing(glowAnim, {
      toValue: isSelected ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isSelected, glowAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.3],
  });
  const iconSize = expanded ? 22 : compact ? 24 : 26;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={[
          styles.categoryItem,
          expanded ? styles.categoryItemExpanded : styles.categoryItemCollapsed,
          compact && styles.categoryItemCompact,
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityLabel={`Category: ${category.label}`}
        accessibilityState={{ selected: isSelected }}
      >
        {/* Glow effect behind icon when selected */}
        {isSelected && (
          <Animated.View
            style={[
              styles.glowEffect,
              {
                backgroundColor: colorScheme.glow,
                opacity: glowOpacity,
              },
            ]}
          />
        )}

        {/* Icon container with gradient */}
        <View style={[styles.iconWrapper, isSelected && styles.iconWrapperSelected]}>
          <LinearGradient
            colors={colorScheme.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.iconContainer,
              compact && styles.iconContainerCompact,
              isSelected && styles.iconContainerSelected,
            ]}
          >
            <MaterialCommunityIcons
              name={category.icon}
              size={iconSize}
              color={colorScheme.icon}
            />
          </LinearGradient>

          {/* Selection ring */}
          {isSelected && <View style={[styles.selectionRing, { borderColor: colorScheme.glow }]} />}
        </View>

        {/* Label */}
        <AppText
          style={[
            expanded ? styles.categoryLabel : styles.categoryLabelCollapsed,
            compact && !expanded && styles.categoryLabelCollapsedCompact,
            isSelected && [styles.categoryLabelSelected, { color: colorScheme.glow }],
          ]}
          numberOfLines={1}
        >
          {category.label}
        </AppText>

        {/* Selected indicator dot for expanded view */}
        {expanded && isSelected && (
          <View style={[styles.selectedDot, { backgroundColor: colorScheme.glow }]} />
        )}
      </Pressable>
    </Animated.View>
  );
}

export function CategoryRail({
  selectedCategory,
  onSelectCategory,
  expanded,
  onToggleExpanded,
  onCollapse,
  compact,
  categories,
  loading,
}: CategoryRailProps) {
  const widthAnim = useRef(new Animated.Value(COLLAPSED_WIDTH)).current;
  const headerRotateAnim = useRef(new Animated.Value(0)).current;
  const isCompact = compact === true;
  const showExpandedLayout = expanded && !isCompact;
  const isOpen = expanded;

  // STG-224: In production, show empty when API has no categories (no demo data).
  // DEMO_CATEGORIES only used as dev fallback for testing without API.
  const displayCategories = categories && categories.length > 0
    ? categories
    : __DEV__ ? DEMO_CATEGORIES : [];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(widthAnim, {
        toValue: showExpandedLayout ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
        duration: ANIMATION_DURATION,
        useNativeDriver: false,
      }),
      Animated.timing(headerRotateAnim, {
        toValue: showExpandedLayout ? 1 : 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start();
  }, [showExpandedLayout, widthAnim, headerRotateAnim]);

  const handleCategoryPress = useCallback(
    (categoryId: string) => {
      onSelectCategory(categoryId);
      if (showExpandedLayout) {
        onCollapse();
      }
    },
    [onSelectCategory, showExpandedLayout, onCollapse]
  );

  const headerRotate = headerRotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <Animated.View style={[styles.container, { width: widthAnim }]}>
      {/* Header with animated toggle */}
      <Pressable
        style={[styles.header, isCompact && styles.headerCompact]}
        onPress={onToggleExpanded}
        accessibilityLabel={isOpen ? "Collapse categories" : "Expand categories"}
      >
        <Animated.View
          style={[
            styles.headerIconWrap,
            isCompact && styles.headerIconWrapCompact,
            { transform: [{ rotate: headerRotate }] },
          ]}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={isCompact ? 20 : 22}
            color={theme.colors.primary}
          />
        </Animated.View>
        {showExpandedLayout && (
          <LabelText style={styles.headerLabel}>Categories</LabelText>
        )}
      </Pressable>

      {/* Category list */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isCompact && styles.scrollContentCompact,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : (
          displayCategories.map((category) => (
            <CategoryItemButton
              key={category.id}
              category={category}
              isSelected={selectedCategory === category.id}
              expanded={showExpandedLayout}
              compact={isCompact}
              onPress={() => handleCategoryPress(category.id)}
            />
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    height: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    minHeight: 52,
  },
  headerCompact: {
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 10,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
  },
  headerIconWrapCompact: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  headerLabel: {
    marginLeft: 12,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  scrollContentCompact: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  categoryItem: {
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginVertical: 3,
    borderRadius: 14,
    position: "relative",
    overflow: "visible",
  },
  categoryItemCollapsed: {
    flexDirection: "column",
    justifyContent: "center",
  },
  categoryItemCompact: {
    paddingVertical: 6,
    marginVertical: 2,
  },
  categoryItemExpanded: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  glowEffect: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 18,
  },
  iconWrapper: {
    position: "relative",
  },
  iconWrapperSelected: {
    // Extra styling for selected state
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    // Shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  iconContainerCompact: {
    width: 44,
    height: 44,
    borderRadius: 13,
  },
  iconContainerSelected: {
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  selectionRing: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 17,
    borderWidth: 2.5,
    opacity: 0.6,
  },
  categoryLabel: {
    marginLeft: 14,
    fontSize: 15,
    color: theme.colors.textPrimary,
    flex: 1,
    fontWeight: "600",
  },
  categoryLabelCollapsed: {
    fontSize: 10,
    textAlign: "center",
    marginTop: 6,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  categoryLabelCollapsedCompact: {
    marginTop: 4,
    fontSize: 9,
  },
  categoryLabelSelected: {
    fontWeight: "800",
  },
  selectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
  },
});

export default CategoryRail;
