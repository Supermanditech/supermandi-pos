import React, { useState, useMemo, useCallback, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import BottomNavV3, { type V3Tab } from "../../components/v3/BottomNavV3";
import ScreenErrorBoundary from "../../components/ui/ScreenErrorBoundary";
import SellScreenV3 from "./SellScreenV3";
import BuyScreenV3 from "./BuyScreenV3";
import StoreHubScreenV3 from "./StoreHubScreenV3";
import MoreScreenV3 from "./MoreScreenV3";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useCartStore } from "../../stores/cartStore";
import { isOnline } from "../../services/networkStatus";
import { startSSEClient, stopSSEClient } from "../../services/sseClient";

type Nav = NativeStackNavigationProp<any>;

// V3-DELETE-085 / V3-HARDEN-090: Exported for testability — maps MORE menu keys to registered route names
// V3-FIX-093: Sales History now has its own route instead of aliasing to Reports
export const MORE_ROUTE_MAP: Record<string, string> = {
  khata: "V3Khata", customers: "V3Customers", reports: "V3Reports",
  stock: "V3Stock", finance: "V3Finance", sales: "V3SalesHistory",
  settings: "V3Settings",
};

// STG-552: POS v3 root layout — 4-tab navigation (SELL / BUY / STORE / MORE)
// Placeholder screens will be replaced by actual v3 screens in subsequent tickets.

function PlaceholderScreen({ name, description }: { name: string; description: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 32 }}>
      <Text style={{ fontSize: 24, fontWeight: "800", color: colors.primary, letterSpacing: -0.5 }}>{name}</Text>
      <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: "center", lineHeight: 20 }}>{description}</Text>
      <View style={{ marginTop: 24, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primaryLight, borderRadius: 12 }}>
        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>v3 Screen — Coming Soon</Text>
      </View>
    </View>
  );
}

export default function PosRootLayoutV3() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<V3Tab>("SELL");

  // Cart badge from existing store
  const cartCount = useCartStore((s) => s.items?.length ?? 0);

  // V3-050: Offline detection — show banner when no network
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const check = () => isOnline().then((on) => setOffline(!on)).catch(() => setOffline(true));
    check();
    const interval = setInterval(check, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, []);

  // V3-CLIENT-003: Start SSE client for real-time store/settings updates
  useEffect(() => {
    startSSEClient();
    return () => stopSSEClient();
  }, []);

  // V3-001: Navigation helper for sub-screens
  const navigateTo = useCallback((screen: string, params?: any) => {
    navigation.navigate(screen, params);
  }, [navigation]);

  return (
    <View style={styles.container}>
      {offline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>⚡ Offline — data may not be current</Text>
        </View>
      )}
      <View style={styles.content}>
        {activeTab === "SELL" ? (
          <ScreenErrorBoundary screenName="SellV3">
            <SellScreenV3 />
          </ScreenErrorBoundary>
        ) : null}
        {activeTab === "BUY" ? (
          <ScreenErrorBoundary screenName="BuyV3">
            <BuyScreenV3 />
          </ScreenErrorBoundary>
        ) : null}
        {activeTab === "STORE" ? (
          <ScreenErrorBoundary screenName="StoreV3">
            <StoreHubScreenV3 onNavigate={(s) => {
              const map: Record<string, string> = { grn: "V3GRN", reorder: "V3Reorder", stock: "V3Stock", barcode: "BarcodeSheet" };
              if (map[s]) navigateTo(map[s]);
            }} />
          </ScreenErrorBoundary>
        ) : null}
        {activeTab === "MORE" ? (
          <ScreenErrorBoundary screenName="MoreV3">
            <MoreScreenV3 onNavigate={(s) => {
              const map = MORE_ROUTE_MAP;
              if (map[s]) navigateTo(map[s]);
            }} />
          </ScreenErrorBoundary>
        ) : null}
      </View>

      <BottomNavV3
        activeTab={activeTab}
        onTabPress={setActiveTab}
        sellBadge={cartCount > 0 ? cartCount : undefined}
        moreBadge={undefined}
      />
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
    },
    // V3-FIX-179: Branded offline banner
    offlineBanner: {
      backgroundColor: colors.warningSoft,
      paddingVertical: 6,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      borderBottomWidth: 1,
      borderBottomColor: colors.warningBorder,
    },
    offlineText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.warningDark,
    },
  });
}
