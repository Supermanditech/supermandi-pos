// CategoryFilter - V3.0.9 compliant
// Horizontal scrolling category filter chips for BUY screen

import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";

// =============================================================================
// TYPES
// =============================================================================

export interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string | null;
  onSelectCategory: (category: string | null) => void;
  loading?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CategoryFilter({
  categories,
  selectedCategory,
  onSelectCategory,
  loading = false,
}: CategoryFilterProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingChip}>
          <Text style={styles.loadingText}>Loading categories...</Text>
        </View>
      </View>
    );
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Pressable
          style={[
            styles.chip,
            selectedCategory === null && styles.chipSelected,
          ]}
          onPress={() => onSelectCategory(null)}
        >
          <MaterialCommunityIcons
            name="view-grid"
            size={14}
            color={
              selectedCategory === null
                ? theme.colors.textInverse
                : theme.colors.textSecondary
            }
          />
          <Text
            style={[
              styles.chipText,
              selectedCategory === null && styles.chipTextSelected,
            ]}
          >
            All
          </Text>
        </Pressable>

        {categories.map((category) => {
          const isSelected = selectedCategory === category;
          return (
            <Pressable
              key={category}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelectCategory(category)}
            >
              <Text
                style={[
                  styles.chipText,
                  isSelected && styles.chipTextSelected,
                ]}
                numberOfLines={1}
              >
                {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.full,
    gap: 6,
  },
  chipSelected: {
    backgroundColor: theme.colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  chipTextSelected: {
    color: theme.colors.textInverse,
  },
  loadingChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
});

export default CategoryFilter;
