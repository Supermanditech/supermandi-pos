import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text, ActivityIndicator } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";
import { getDailySummary } from "../../services/api/dailySummaryApi";
import type { DailySummary } from "../../services/api/dailySummaryApi";

// V3-045: Reports v3 — wire real getDailySummary API

type Props = { onClose: () => void };

export default function ReportsScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<"today" | "week" | "month">("today");
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await getDailySummary();
        setSummary(data);
      } catch (err) {
        showToast("Could not load report");
      } finally {
        setLoading(false);
      }
    })();
  }, [activeTab]);

  const salesTotal = summary?.totalSales ?? 0;
  const billCount = summary?.totalBills ?? 0;
  const cashAmount = summary?.paymentBreakdown?.cash ?? 0;
  const upiAmount = summary?.paymentBreakdown?.upi ?? 0;
  const dueAmount = summary?.paymentBreakdown?.credit ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Reports</Text><View style={{ width: 30 }} /></View>
      <View style={styles.tabs}>
        {(["today", "week", "month"] as const).map(t => (
          <Pressable key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />}
        {!loading && !summary && (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📊</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No sales data</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Complete your first sale to see reports</Text>
          </View>
        )}
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statLabel}>Sales</Text><Text style={styles.statVal}>₹{Math.round(salesTotal).toLocaleString("en-IN")}</Text><Text style={styles.statSub}>{billCount} bills</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>Profit</Text><Text style={[styles.statVal, { color: colors.success }]}>—</Text><Text style={styles.statSub}>—</Text></View>
        </View>
        <Text style={styles.section}>PAYMENT SPLIT</Text>
        <View style={styles.splitCard}>
          {[["Cash", 3200, 66, colors.success], ["UPI", 1200, 25, colors.primary], ["Udhar", 450, 9, colors.warning]].map(([label, amt, pct, color]) => (
            <View key={String(label)}>
              <View style={styles.splitRow}><Text style={styles.splitLabel}>{label as string}</Text><Text style={styles.splitVal}>₹{(amt as number).toLocaleString("en-IN")} ({pct}%)</Text></View>
              <View style={[styles.bar, { width: `${pct as number}%`, backgroundColor: color as string }]} />
            </View>
          ))}
        </View>
        <View style={styles.actionRow}>
          <Pressable style={styles.actionBtn} onPress={() => showToast("Printing...")}><Text style={styles.actionText}>🖨️ Print</Text></Pressable>
          <Pressable style={styles.waBtn} onPress={() => showToast("Report shared")}><Svg width={12} height={12} viewBox="0 0 24 24" fill="#fff"><Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /></Svg><Text style={styles.waText}>Share</Text></Pressable>
          <Pressable style={styles.actionBtn}><Text style={styles.actionText}>📄 PDF</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    tabs: { flexDirection: "row", backgroundColor: colors.surface },
    tab: { flex: 1, padding: 10, alignItems: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 12, fontWeight: "700", color: colors.textTertiary },
    tabTextActive: { color: colors.primary },
    body: { flex: 1, padding: 14 },
    statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    stat: { flex: 1, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
    statLabel: { fontSize: 10, fontWeight: "700", color: colors.textTertiary },
    statVal: { fontSize: 22, fontWeight: "900", marginTop: 4 },
    statSub: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
    section: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.8, marginBottom: 8 },
    splitCard: { padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
    splitRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    splitLabel: { fontSize: 13, fontWeight: "500" },
    splitVal: { fontSize: 13, fontWeight: "800" },
    bar: { height: 14, borderRadius: 7, marginBottom: 8 },
    actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
    actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    actionText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    waBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: "#25D366" },
    waText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  });
}
