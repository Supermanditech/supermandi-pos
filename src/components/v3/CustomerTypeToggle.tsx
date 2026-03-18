import React, { useMemo } from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding, getChipPadding, getChipFontSize } from "../../theme/responsive";
import type { SellMode } from "../../stores/cartStore";

// STG-553: Retail / Bulk trade toggle for sell screen
// Re-export SellMode for backwards compatibility
export type { SellMode };

type CustomerTypeToggleProps = {
  mode: SellMode;
  onModeChange: (mode: SellMode) => void;
};

export default function CustomerTypeToggle({ mode, onModeChange }: CustomerTypeToggleProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>CUSTOMER</Text>
      <View style={styles.toggle}>
        <Pressable
          style={[styles.option, mode === "retail" && styles.optionActive]}
          onPress={() => onModeChange("retail")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "retail" }}
        >
          <Text style={[styles.optionText, mode === "retail" && styles.optionTextActive]}>Retail</Text>
        </Pressable>
        <Pressable
          style={[styles.option, mode === "bulk" && styles.optionActiveBulk]}
          onPress={() => onModeChange("bulk")}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === "bulk" }}
        >
          <Text style={[styles.optionText, mode === "bulk" && styles.optionTextActive]}>Bulk / Trade</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    // V3-HARDEN-111: Responsive toggle sizing
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: getScreenPadding(),
      paddingVertical: 6,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    label: {
      fontSize: getChipFontSize(),
      fontWeight: "700",
      color: colors.textTertiary,
      letterSpacing: 0.3,
    },
    toggle: {
      flexDirection: "row",
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 10,
      overflow: "hidden",
    },
    option: {
      paddingHorizontal: getChipPadding(),
      paddingVertical: 6,
      borderRadius: 10,
    },
    optionActive: {
      backgroundColor: colors.primary,
    },
    optionActiveBulk: {
      backgroundColor: colors.accent,
    },
    optionText: {
      fontSize: getChipFontSize(),
      fontWeight: "700",
      color: colors.textTertiary,
    },
    optionTextActive: {
      color: "#FFFFFF",
    },
  });
}
