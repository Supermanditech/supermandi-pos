import React from "react";
import { View, Pressable, StyleSheet, Text, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context"; // GCP-STG-0302
import Svg, { Path, Circle, Line } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getNavIconSize } from "../../theme/responsive";
import { shell, typeRhythm, iconRhythm } from "../../theme/brand";

// STG-552 + V3-FIX-179: POS v3 4-tab bottom navigation — SuperMandi branded
export type V3Tab = "SELL" | "BUY" | "STORE" | "MORE";

type BottomNavV3Props = {
  activeTab: V3Tab;
  onTabPress: (tab: V3Tab) => void;
  sellBadge?: number;
  buyBadge?: number;
  moreBadge?: number;
};

// SVG icon components — stroke-based, consistent rhythm
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
  const insets = useSafeAreaInsets(); // GCP-STG-0302
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const badges: Partial<Record<V3Tab, number | undefined>> = { SELL: sellBadge, BUY: buyBadge, MORE: moreBadge };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* V3-FIX-179: Subtle top accent line for brand presence */}
      <View style={styles.topAccent} />
      <View style={styles.tabRow}>
        {(["SELL", "BUY", "STORE", "MORE"] as V3Tab[]).map((tab) => {
          const isActive = activeTab === tab;
          const IconComponent = ICON_MAP[tab];
          const badge = badges[tab];
          const iconColor = isActive ? colors.textInverse : colors.textTertiary;

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
                <IconComponent color={iconColor} size={iconRhythm.nav} />
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
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  const iconSize = getNavIconSize();
  return StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      shadowColor: colors.shadow,
      ...shell.navElevation,
    },
    // V3-FIX-179: Thin branded accent line at top of nav bar
    topAccent: {
      height: 2,
      backgroundColor: colors.primary,
      opacity: 0.12,
    },
    tabRow: {
      flexDirection: "row",
      paddingBottom: 8,
    },
    tab: {
      flex: 1,
      alignItems: "center",
      paddingTop: 10,
      paddingBottom: 4,
      gap: 4,
    },
    // V3-FIX-179: Wider, more prominent active pill
    iconPill: {
      width: iconSize * 2.6,
      height: iconSize + 12,
      borderRadius: shell.activePillRadius,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    iconPillActive: {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 6,
    },
    label: {
      ...typeRhythm.navLabel,
      color: colors.textTertiary,
    },
    labelActive: {
      ...typeRhythm.navLabelActive,
      color: colors.primary,
    },
    // V3-FIX-179: More polished badge
    badge: {
      position: "absolute",
      top: -4,
      right: 0,
      backgroundColor: colors.error,
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 5,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    badgeText: {
      fontSize: 11, // GCP-STG-0307: raised from 9 for readability on small screens
      fontWeight: "800",
      color: colors.textInverse,
    },
  });
}
