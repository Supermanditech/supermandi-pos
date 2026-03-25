import React, { useState, useMemo, useCallback, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, useIsFocused } from "@react-navigation/native";
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
import { useStaffSessionStore } from "../../stores/staffSessionStore";
import { useSessionTimeout } from "../../hooks/useSessionTimeout";
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

export default function PosRootLayoutV3() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<V3Tab>("SELL");
  // GCP-STG-0132: Brief branded loading overlay during tab transitions
  const [transitioning, setTransitioning] = useState(false);
  const handleTabChange = useCallback((tab: V3Tab) => {
    if (tab === activeTab) return;
    setTransitioning(true);
    setActiveTab(tab);
    setTimeout(() => setTransitioning(false), 100);
  }, [activeTab]);

  // Cart badge from existing store
  const cartCount = useCartStore((s) => s.items?.length ?? 0);

  // GCP-STG-0005: Wire idle timeout — 30min idle → soft-lock to PIN re-entry
  // Clears staff session (Layer 2) only. Device session (Layer 1) stays intact.
  // isFocused=false when PaymentScreen/CheckoutScreen is pushed on top — prevents
  // timeout from firing mid-payment (ISSUE-128 protection via useIsFocused).
  const isFocused = useIsFocused();
  const handleIdleLock = useCallback(() => {
    useStaffSessionStore.getState().clearSession();
    navigation.reset({ index: 0, routes: [{ name: "V3StaffLogin" }] });
  }, [navigation]);
  useSessionTimeout(handleIdleLock, isFocused);

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
        {/* GCP-STG-0132: Branded transition overlay */}
        {transitioning && (
          <View style={styles.transitionOverlay}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: colors.primary }}>SuperMandi</Text>
          </View>
        )}
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
            }} onOrderPress={(orderId) => navigateTo("V3OrderTracking", { orderId })} />
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
        onTabPress={handleTabChange}
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
    // GCP-STG-0132: Branded transition overlay
    transitionOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", zIndex: 50 },
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
