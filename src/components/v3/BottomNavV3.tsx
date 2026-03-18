import React from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import Svg, { Path, Circle, Line } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getNavIconSize } from "../../theme/responsive";

// STG-552: POS v3 4-tab bottom navigation — SELL / BUY / STORE / MORE
export type V3Tab = "SELL" | "BUY" | "STORE" | "MORE";

type BottomNavV3Props = {
  activeTab: V3Tab;
  onTabPress: (tab: V3Tab) => void;
  sellBadge?: number;
  buyBadge?: number;
  moreBadge?: number;
};

// SVG icon components for each tab
function SellIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <Path d="M3 6h18" />
      <Path d="M16 10a4 4 0 01-8 0" />
    </Svg>
  );
}

function BuyIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
    </Svg>
  );
}

function StoreIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <Path d="M3.27 6.96L12 12.01l8.73-5.05" />
      <Path d="M12 22.08V12" />
    </Svg>
  );
}

function MoreIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Line x1={4} y1={6} x2={20} y2={6} />
      <Line x1={4} y1={12} x2={20} y2={12} />
      <Line x1={4} y1={18} x2={20} y2={18} />
    </Svg>
  );
}

const ICON_MAP: Record<V3Tab, React.FC<{ color: string; size: number }>> = {
  SELL: SellIcon,
  BUY: BuyIcon,
  STORE: StoreIcon,
  MORE: MoreIcon,
};

const TAB_LABELS: Record<V3Tab, string> = {
  SELL: "SELL",
  BUY: "BUY",
  STORE: "STORE",
  MORE: "MORE",
};

export default function BottomNavV3({ activeTab, onTabPress, sellBadge, buyBadge, moreBadge }: BottomNavV3Props) {
  const colors = useThemeColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const badges: Partial<Record<V3Tab, number | undefined>> = { SELL: sellBadge, BUY: buyBadge, MORE: moreBadge };

  return (
    <View style={styles.container}>
      {(["SELL", "BUY", "STORE", "MORE"] as V3Tab[]).map((tab) => {
        const isActive = activeTab === tab;
        const IconComponent = ICON_MAP[tab];
        const badge = badges[tab];
        const iconColor = isActive ? "#FFFFFF" : colors.textTertiary;

        return (
          <Pressable
            key={tab}
            style={styles.tab}
            onPress={() => onTabPress(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={TAB_LABELS[tab]}
          >
            <View style={[styles.iconPill, isActive && styles.iconPillActive]}>
              <IconComponent color={iconColor} size={22} />
              {badge != null && badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge > 99 ? "99+" : String(badge)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>{TAB_LABELS[tab]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      paddingBottom: 8,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.06,
      shadowRadius: 16,
      elevation: 8,
    },
    tab: {
      flex: 1,
      alignItems: "center",
      paddingTop: 8,
      paddingBottom: 4,
      gap: 3,
    },
    // V3-HARDEN-111: Responsive icon pill sizing
    iconPill: {
      width: getNavIconSize() * 2.3,
      height: getNavIconSize() + 8,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    iconPillActive: {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    label: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.textTertiary,
      letterSpacing: 0.2,
    },
    labelActive: {
      color: colors.primary,
      fontWeight: "800",
    },
    // V3-DELETE-113: Responsive badge sizing
    badge: {
      position: "absolute",
      top: -2,
      right: 2,
      backgroundColor: colors.error,
      borderRadius: getNavIconSize() / 3,
      minWidth: getNavIconSize() * 0.67,
      height: getNavIconSize() * 0.67,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    badgeText: {
      fontSize: 8,
      fontWeight: "800",
      color: "#FFFFFF",
    },
  });
}
