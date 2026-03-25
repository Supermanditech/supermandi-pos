import React from "react";
import { View, Pressable, StyleSheet, Text, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context"; // GCP-STG-0302
import Svg, { Rect, Circle } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding, getHeaderSpacing, getNavIconSize } from "../../theme/responsive";
import { shell } from "../../theme/brand";
import { useSettingsStore } from "../../stores/settingsStore";
import { isOnline as checkOnline } from "../../services/networkStatus";
import { apiClient } from "../../services/api/apiClient"; // GCP-STG-0737

// STG-553: Branded header for v3 sell screen — SuperMandi logo + online status + menu

type BrandedHeaderProps = {
  onMenuPress?: () => void;
};

export default function BrandedHeader({ onMenuPress }: BrandedHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets(); // GCP-STG-0302
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const storeName = useSettingsStore((s) => s.storeName) ?? "SuperMandi";
  const [isOnline, setIsOnline] = React.useState(true);
  // GCP-STG-0737: Unread alert count badge
  const [alertCount, setAlertCount] = React.useState(0);
  React.useEffect(() => {
    checkOnline().then(setIsOnline).catch(() => setIsOnline(false));
    const interval = setInterval(() => { checkOnline().then(setIsOnline).catch(() => setIsOnline(false)); }, 15000);
    return () => clearInterval(interval);
  }, []);
  React.useEffect(() => {
    const fetchAlerts = () => {
      apiClient.get<{ count: number }>("/api/v1/pos/alerts/unread")
        .then((data) => setAlertCount(data?.count ?? 0))
        .catch(() => setAlertCount(0));
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
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
        {/* GCP-STG-0737: Alert badge */}
        {alertCount > 0 ? (
          <View style={styles.alertBadge} testID="alert-badge">
            <Text style={styles.alertBadgeText}>{alertCount > 99 ? "99+" : String(alertCount)}</Text>
          </View>
        ) : null}
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
      color: colors.textInverse,
      fontSize: 16,
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
      backgroundColor: colors.overlayInverse,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    // V3-DELETE-113: Responsive status dot
    statusDot: {
      width: getHeaderSpacing() - 2,
      height: getHeaderSpacing() - 2,
      borderRadius: (getHeaderSpacing() - 2) / 2,
    },
    dotOnline: {
      backgroundColor: colors.success,
    },
    dotOffline: {
      backgroundColor: colors.error,
    },
    statusText: {
      color: colors.textInverse,
      fontSize: 10,
      fontWeight: "600",
      opacity: 0.9,
    },
    // V3-HARDEN-111: Responsive menu button size
    menuButton: {
      backgroundColor: colors.overlayInverse,
      width: getNavIconSize() + 8,
      height: getNavIconSize() + 8,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    menuDots: {
      color: colors.textInverse,
      fontSize: 18,
      fontWeight: "700",
    },
    // GCP-STG-0737: Alert badge styles
    alertBadge: {
      backgroundColor: colors.error,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: 4,
    },
    alertBadgeText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "800" as const,
    },
  });
}
