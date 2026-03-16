import React, { useMemo, useState } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";

// STG-573: Credit & Finance v3 — BNPL, credit line, bill discounting

type Props = { onClose: () => void };

export default function FinanceScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<"offers" | "loans" | "bills">("offers");

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: "#7C3AED" }]}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Credit & Finance</Text><View style={{ width: 30 }} /></View>
      <View style={styles.tabs}>
        {(["offers", "loans", "bills"] as const).map(t => (
          <Pressable key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t === "offers" ? "Offers" : t === "loans" ? "My Loans" : "Bill Discount"}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.scoreCard}><Text style={styles.scoreText}>Credit Score: 720 ✓ Eligible</Text></View>
        <View style={styles.offerCard}><View style={styles.offerTop}><Text style={styles.provider}>SUPERMANDI FINANCE</Text><View style={styles.bnplBadge}><Text style={styles.bnplText}>BNPL</Text></View></View><Text style={styles.offerAmount}>₹50,000</Text><Text style={styles.offerDetail}>Buy Now Pay Later · 0% for 30 days{"\n"}3 EMIs of ₹16,667</Text><Pressable style={styles.applyBtn}><Text style={styles.applyText}>Apply Now</Text></Pressable></View>
        <View style={styles.offerCard}><View style={styles.offerTop}><Text style={styles.provider}>LENDINGKART</Text><View style={[styles.bnplBadge, { backgroundColor: colors.warningSoft }]}><Text style={[styles.bnplText, { color: colors.warning }]}>Credit Line</Text></View></View><Text style={styles.offerAmount}>₹2,00,000</Text><Text style={styles.offerDetail}>Business credit · 1.5%/month{"\n"}Draw as needed</Text><Pressable style={styles.detailBtn}><Text style={styles.detailText}>Details</Text></Pressable></View>
        <View style={styles.offerCard}><View style={styles.offerTop}><Text style={styles.provider}>FINBOX</Text><View style={[styles.bnplBadge, { backgroundColor: colors.successSoft }]}><Text style={[styles.bnplText, { color: colors.success }]}>Bill Discount</Text></View></View><Text style={styles.offerAmount}>Sell Bill Discounting</Text><Text style={styles.offerDetail}>90% of invoice value upfront{"\n"}Funds in 24 hours</Text><Pressable style={styles.detailBtn}><Text style={styles.detailText}>Upload Invoice</Text></Pressable></View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    tabs: { flexDirection: "row", backgroundColor: colors.surface },
    tab: { flex: 1, padding: 10, alignItems: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 12, fontWeight: "700", color: colors.textTertiary },
    tabTextActive: { color: colors.primary },
    body: { flex: 1, padding: 14, gap: 10 },
    scoreCard: { padding: 12, backgroundColor: colors.primaryLight, borderRadius: 12, borderWidth: 1, borderColor: colors.primary },
    scoreText: { fontSize: 12, color: colors.primary, fontWeight: "700" },
    offerCard: { padding: 18, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    offerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    provider: { fontSize: 10, fontWeight: "800", color: colors.primary, letterSpacing: 0.5 },
    bnplBadge: { backgroundColor: "#F5F3FF", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    bnplText: { fontSize: 9, fontWeight: "700", color: "#7C3AED" },
    offerAmount: { fontSize: 24, fontWeight: "900", marginTop: 6, letterSpacing: -0.5 },
    offerDetail: { fontSize: 12, color: colors.textTertiary, lineHeight: 18, marginTop: 4 },
    applyBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" },
    applyText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    detailBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    detailText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  });
}
