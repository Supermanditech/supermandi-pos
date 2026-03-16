import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";

import BottomNavV3, { type V3Tab } from "../../components/v3/BottomNavV3";
import ScreenErrorBoundary from "../../components/ui/ScreenErrorBoundary";
import SellScreenV3 from "./SellScreenV3";
import BuyScreenV3 from "./BuyScreenV3";
import StoreHubScreenV3 from "./StoreHubScreenV3";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useCartStore } from "../../stores/cartStore";

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
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<V3Tab>("SELL");

  // Cart badge from existing store
  const cartCount = useCartStore((s) => s.items?.length ?? 0);

  return (
    <View style={styles.container}>
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
            <StoreHubScreenV3 onNavigate={(s) => {/* sub-navigation in future ticket */}} />
          </ScreenErrorBoundary>
        ) : null}
        {activeTab === "MORE" ? (
          <ScreenErrorBoundary screenName="MoreV3">
            <PlaceholderScreen name="MORE" description="Dashboard, khata, credit/finance, reports, customers, sales history, settings. Consolidates 15+ screens." />
          </ScreenErrorBoundary>
        ) : null}
      </View>

      <BottomNavV3
        activeTab={activeTab}
        onTabPress={setActiveTab}
        sellBadge={cartCount > 0 ? cartCount : undefined}
        moreBadge={3}
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
  });
}
