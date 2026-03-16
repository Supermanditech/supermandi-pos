import React, { useMemo } from "react";
import { View, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";

// STG-557: Profit/margin badge shown on success screen after each sale

type ProfitBadgeProps = {
  profitMinor: number;    // profit in paise
  marginPct: number;      // margin percentage
};

export default function ProfitBadge({ profitMinor, marginPct }: ProfitBadgeProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const profitDisplay = `₹${Math.round(profitMinor / 100).toLocaleString("en-IN")}`;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Margin: {profitDisplay} ({marginPct}%)</Text>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      backgroundColor: colors.successSoft,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 12,
      alignSelf: "center",
    },
    text: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.success,
      letterSpacing: -0.2,
    },
  });
}
