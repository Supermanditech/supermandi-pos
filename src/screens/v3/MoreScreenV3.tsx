import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import Svg, { Rect, Circle, Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding, getChipFontSize } from "../../theme/responsive";
import { tabAccents, cardElevation, typeRhythm } from "../../theme/brand";
import { useSettingsStore } from "../../stores/settingsStore";
import { getDailySummary, type DailySummary } from "../../services/api/dailySummaryApi";
import { isOnline } from "../../services/networkStatus";
import { logger } from "../../services/logger";

// V3-023: More screen with real daily summary

type MoreScreenV3Props = { onNavigate: (screen: string) => void };

export default function MoreScreenV3({ onNavigate }: MoreScreenV3Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const storeName = useSettingsStore((s) => s.storeName) ?? "SuperMandi Store";

  // V3-023: Real daily summary
  const [summary, setSummary] = useState<DailySummary | null>(null);
  useEffect(() => {
    isOnline().then((on) => {
      if (!on) return;
      getDailySummary().then(setSummary).catch((e) => logger.debug("MoreV3", `summary_failed:${String(e)}`));
    });
  }, []);

  const MENU_ITEMS = [
    // V3-FIX-081: No hardcoded badge — badge hidden until real overdue count API is available
    { icon: "📒", label: t("more.khata", "Khata (Udhar)"), bg: colors.primaryLight, screen: "khata" },
    { icon: "👥", label: t("more.customers", "Customers"), bg: colors.successSoft, screen: "customers" },
    { icon: "📊", label: t("more.reports", "Reports"), bg: colors.warningSoft, screen: "reports" },
    { icon: "📦", label: t("more.stock", "Stock"), bg: colors.backgroundSecondary, screen: "stock" },
    { icon: "💳", label: t("more.finance", "Credit & Finance"), bg: tabAccents(colors).STORE.heroSoft, screen: "finance" },
    { icon: "🧾", label: t("more.salesHistory", "Sales History"), bg: colors.primaryLight, screen: "sales" },
    { icon: "⚙️", label: t("more.settings", "Settings"), bg: colors.backgroundSecondary, screen: "settings" },
    // V3-DELETE-085: Help removed — no V3 Help screen exists. Will be added when V3-HARDEN-094 is implemented.
  ];

  return (
    <View style={styles.container}>
      {/* Branded header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{(() => { const h = new Date().getHours(); return h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening"; })()} 👋</Text>
          <Text style={styles.storeInfo}>{storeName} · Online</Text>
        </View>
        <Pressable style={styles.settingsBtn} onPress={() => onNavigate("settings")} accessibilityLabel="Settings" testID="more-settings-gear"><Text style={styles.settingsIcon}>⚙️</Text></Pressable>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* Morning brief */}
        {/* V3-FIX-081: Real yesterday data from summary API */}
        <View style={styles.morningCard}>
          <Text style={styles.morningTitle}>📊 Yesterday</Text>
          {summary ? (
            [
              ["Sales", `₹${Math.round((summary as any).yesterdaySales ?? 0).toLocaleString("en-IN")}`],
              ["Bills", `${(summary as any).yesterdayBills ?? 0}`],
              ["Top Item", (summary as any).topItem ?? "—"],
            ].map(([k, v]) => (
              <View key={k} style={styles.morningRow}><Text style={styles.morningKey}>{k}</Text><Text style={styles.morningVal}>{v}</Text></View>
            ))
          ) : (
            <Text style={styles.morningVal}>Loading...</Text>
          )}
        </View>

        {/* Stats cards */}
        <View style={styles.statsRow}>
          <Pressable style={styles.statCard} onPress={() => onNavigate("reports")}><Text style={styles.statLabel}>Today's Sales</Text><Text style={styles.statVal}>₹{summary ? Math.round(summary.totalSales).toLocaleString("en-IN") : "—"}</Text><Text style={styles.statSub}>{summary?.totalBills ?? 0} bills</Text></Pressable>
          <Pressable style={[styles.statCard, { borderColor: colors.error }]} onPress={() => onNavigate("khata")}><Text style={styles.statLabel}>Udhar Pending</Text><Text style={[styles.statVal, { color: colors.error }]}>₹{summary ? Math.round((summary.paymentBreakdown?.credit ?? 0)).toLocaleString("en-IN") : "—"}</Text><Text style={styles.statSub}>due</Text></Pressable>
        </View>

        {/* Finance banner */}
        <Pressable style={styles.financeBanner} onPress={() => onNavigate("finance")}>
          <Text style={styles.financeIcon}>💳</Text>
          <View style={{ flex: 1 }}><Text style={styles.financeTitle}>Credit & Finance</Text><Text style={styles.financeSub}>BNPL · Credit Line · Bill Discounting</Text></View>
          <View style={styles.financeArrow}><Text style={styles.financeArrowText}>View →</Text></View>
        </Pressable>

        {/* Quick access menu */}
        <Text style={styles.sectionTitle}>QUICK ACCESS</Text>
        <View style={styles.menuCard}>
          {MENU_ITEMS.map((item) => (
            <Pressable key={item.label} style={styles.menuItem} onPress={() => onNavigate(item.screen)}>
              <View style={[styles.menuIcon, { backgroundColor: item.bg }]}><Text style={{ fontSize: 18 }}>{item.icon}</Text></View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              {/* V3-FIX-081: Badge hidden until real overdue count API — no (item as any).badge */}
              <Text style={styles.menuArrow}>›</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    // V3-FIX-180: MORE mode identity — muted header with owner/settings feel
    header: { backgroundColor: colors.textPrimary, paddingHorizontal: 18, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    greeting: { color: colors.textInverse, fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
    storeInfo: { color: colors.textInverse, fontSize: 11, fontWeight: "500", marginTop: 2, opacity: 0.7 },
    settingsBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.overlayInverse, alignItems: "center", justifyContent: "center" },
    settingsIcon: { fontSize: 18 },
    body: { flex: 1 },
    morningCard: { margin: getScreenPadding(), padding: 18, borderRadius: 20, backgroundColor: colors.primary, overflow: "hidden" },
    morningTitle: { color: colors.textInverse, fontSize: 15, fontWeight: "700", marginBottom: 8 },
    morningRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    morningKey: { color: colors.textInverse, fontSize: 13, opacity: 0.8 },
    morningVal: { color: colors.textInverse, fontSize: 13, fontWeight: "700" },
    statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: getScreenPadding() },
    statCard: { flex: 1, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, ...cardElevation.subtle },
    statLabel: { ...typeRhythm.sectionTitle, color: colors.textTertiary, textTransform: "uppercase" },
    statVal: { ...typeRhythm.heroStat, fontSize: 22, marginTop: 4 },
    statSub: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
    // V3-FIX-181: Finance banner uses tab accent token instead of hardcoded purple
    financeBanner: { marginHorizontal: getScreenPadding(), marginTop: 10, padding: 14, borderRadius: 16, backgroundColor: tabAccents(colors).STORE.hero, flexDirection: "row", alignItems: "center", gap: 12 },
    financeIcon: { fontSize: 28 },
    financeTitle: { color: colors.textInverse, fontSize: 14, fontWeight: "800" },
    financeSub: { color: colors.textInverse, fontSize: getChipFontSize(), opacity: 0.85 },
    financeArrow: { backgroundColor: colors.overlayInverse, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 },
    financeArrowText: { color: colors.textInverse, fontSize: getChipFontSize(), fontWeight: "700" },
    sectionTitle: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.8, paddingHorizontal: getScreenPadding(), marginTop: 14, marginBottom: 8 },
    menuCard: { marginHorizontal: getScreenPadding(), backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    menuItem: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.backgroundSecondary },
    menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    menuLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
    menuBadge: { backgroundColor: colors.error, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    menuBadgeText: { color: colors.textInverse, fontSize: 9, fontWeight: "800" },
    menuArrow: { fontSize: 14, color: colors.border },
  });
}
