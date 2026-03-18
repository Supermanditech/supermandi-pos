import React from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import Svg, { Rect, Circle } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding, getHeaderSpacing, getNavIconSize } from "../../theme/responsive";
import { useSettingsStore } from "../../stores/settingsStore";
import { isOnline as checkOnline } from "../../services/networkStatus";

// STG-553: Branded header for v3 sell screen — SuperMandi logo + online status + menu

type BrandedHeaderProps = {
  onMenuPress?: () => void;
};

export default function BrandedHeader({ onMenuPress }: BrandedHeaderProps) {
  const colors = useThemeColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const storeName = useSettingsStore((s) => s.storeName) ?? "SuperMandi";
  const [isOnline, setIsOnline] = React.useState(true);
  React.useEffect(() => {
    checkOnline().then(setIsOnline).catch(() => setIsOnline(false));
    const interval = setInterval(() => { checkOnline().then(setIsOnline).catch(() => setIsOnline(false)); }, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {/* SuperMandi shortmark — white on blue */}
        <Svg width={22} height={22} viewBox="0 0 32 32">
          <Rect x={2} y={2} width={28} height={28} rx={8} fill="#FFFFFF" />
          <Rect x={9} y={9} width={14} height={3.2} rx={1.6} fill={colors.primary} />
          <Rect x={9} y={14.4} width={14} height={3.2} rx={1.6} fill={colors.primary} />
          <Rect x={9} y={19.8} width={14} height={3.2} rx={1.6} fill={colors.primary} />
          <Circle cx={16} cy={25.3} r={2.1} fill={colors.primary} />
        </Svg>
        <Text style={styles.brandText}>SuperMandi</Text>
      </View>
      <View style={styles.right}>
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, isOnline ? styles.dotOnline : styles.dotOffline]} />
          <Text style={styles.statusText}>{isOnline ? "Online" : "Offline"}</Text>
        </View>
        {onMenuPress ? (
          <Pressable
            style={styles.menuButton}
            onPress={onMenuPress}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Text style={styles.menuDots}>⋮</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    // V3-HARDEN-111: Responsive header spacing
    container: {
      backgroundColor: colors.primary,
      paddingHorizontal: getScreenPadding(),
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    left: {
      flexDirection: "row",
      alignItems: "center",
      gap: getHeaderSpacing(),
    },
    brandText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: -0.3,
    },
    right: {
      flexDirection: "row",
      alignItems: "center",
      gap: getHeaderSpacing(),
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "rgba(255,255,255,0.15)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    dotOnline: {
      backgroundColor: "#4ADE80",
    },
    dotOffline: {
      backgroundColor: "#F87171",
    },
    statusText: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 10,
      fontWeight: "600",
    },
    // V3-HARDEN-111: Responsive menu button size
    menuButton: {
      backgroundColor: "rgba(255,255,255,0.15)",
      width: getNavIconSize() + 8,
      height: getNavIconSize() + 8,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    menuDots: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
    },
  });
}
