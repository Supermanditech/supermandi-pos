import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding, getChipFontSize } from "../../theme/responsive";
import { showToast } from "../../utils/showToast";
import { getCreditOffers, getCreditApplications, applyForCredit } from "../../services/api/creditApi";
import type { CreditOffersResponse, CreditApplicationsResponse } from "../../services/api/creditApi";
import { isOnline } from "../../services/networkStatus";

// V3-062: Credit & Finance v3 — full UI with offers, loans, apply flow

type Props = { onClose: () => void };

export default function FinanceScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<"offers" | "loans" | "bills">("offers");
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [offersRes, loansRes] = await Promise.allSettled([
          getCreditOffers(),
          getCreditApplications(),
        ]);
        if (offersRes.status === "fulfilled") setOffers(offersRes.value.offers ?? []);
        if (loansRes.status === "fulfilled") setLoans(loansRes.value.applications ?? []);
      } catch {
        // Feature may be disabled
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: "#7C3AED" }]}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Credit & Finance</Text><View style={{ width: 30 }} /></View>
      <View style={styles.tabs}>
        {(["offers", "loans", "bills"] as const).map(t => (
          <Pressable key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t === "offers" ? "Offers" : t === "loans" ? "My Loans" : "Bill Discount"}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />}
        {/* V3-DELETE-086: Real offers from API, no hardcoded cards */}
        {!loading && activeTab === "offers" && (
          offers.length > 0 ? (
            <>
              <View style={styles.scoreCard}><Text style={styles.scoreText}>{offers.length} offer{offers.length !== 1 ? "s" : ""} available</Text></View>
              {offers.map((offer: any, i: number) => (
                <View key={offer.id ?? i} style={styles.offerCard}>
                  <View style={styles.offerTop}>
                    <Text style={styles.provider}>{offer.providerName ?? offer.provider ?? "Provider"}</Text>
                    <View style={styles.bnplBadge}><Text style={styles.bnplText}>{offer.type ?? "Credit"}</Text></View>
                  </View>
                  <Text style={styles.offerAmount}>₹{Math.round((offer.amountMinor ?? offer.maxAmountMinor ?? 0) / 100).toLocaleString("en-IN")}</Text>
                  <Text style={styles.offerDetail}>{offer.description ?? offer.terms ?? ""}</Text>
                  <Pressable style={styles.applyBtn} onPress={async () => {
                    const online = await isOnline();
                    if (!online) { showToast("Apply requires internet connection"); return; }
                    try {
                      await applyForCredit(offer.id ?? offer.providerId, offer.amountMinor ?? offer.maxAmountMinor ?? 0);
                      showToast("Credit application submitted");
                    } catch (err: any) {
                      showToast(err?.message ?? "Application failed");
                    }
                  }}><Text style={styles.applyText}>Apply</Text></Pressable>
                </View>
              ))}
            </>
          ) : (
            <View style={{ padding: 32, alignItems: "center" }}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>💳</Text>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No credit offers</Text>
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4, textAlign: "center" }}>Credit offers will appear here when available for your store</Text>
            </View>
          )
        )}
        {!loading && activeTab === "loans" && (
          loans.length === 0 ? (
            <View style={{ padding: 32, alignItems: "center" }}><Text style={{ fontSize: 36, marginBottom: 8 }}>💳</Text><Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No active loans</Text><Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Apply for credit to see your loans here</Text></View>
          ) : (
            loans.map((loan: any, i: number) => (
              <View key={i} style={styles.offerCard}><Text style={styles.provider}>{loan.providerName ?? "Loan"}</Text><Text style={styles.offerAmount}>₹{Math.round((loan.principalMinor ?? 0) / 100).toLocaleString("en-IN")}</Text><Text style={styles.offerDetail}>Status: {loan.status ?? "active"}</Text></View>
            ))
          )
        )}
        {/* V3-DELETE-087: Bill discounting — real empty state, no placeholder alerts */}
        {!loading && activeTab === "bills" && (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>🧾</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>Bill Discounting</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4, textAlign: "center" }}>Upload supplier invoices to get 90% value upfront.{"\n"}This feature requires document scanner integration.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: getScreenPadding(), paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    tabs: { flexDirection: "row", backgroundColor: colors.surface },
    tab: { flex: 1, padding: 10, alignItems: "center", borderBottomWidth: 3, borderBottomColor: "transparent" },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: getChipFontSize(), fontWeight: "700", color: colors.textTertiary },
    tabTextActive: { color: colors.primary },
    body: { flex: 1, padding: 14, gap: 10 },
    scoreCard: { padding: 12, backgroundColor: colors.primaryLight, borderRadius: 12, borderWidth: 1, borderColor: colors.primary },
    scoreText: { fontSize: 12, color: colors.primary, fontWeight: "700" },
    offerCard: { padding: 18, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    offerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    provider: { fontSize: 10, fontWeight: "800", color: colors.primary, letterSpacing: 0.5 },
    bnplBadge: { backgroundColor: "#F5F3FF", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    bnplText: { fontSize: 10, fontWeight: "700", color: "#7C3AED" }, // GCP-STG-0307: raised from 9
    offerAmount: { fontSize: 24, fontWeight: "900", marginTop: 6, letterSpacing: -0.5 },
    offerDetail: { fontSize: 12, color: colors.textTertiary, lineHeight: 18, marginTop: 4 },
    applyBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" },
    applyText: { color: "#fff", fontSize: 14, fontWeight: "800" },
    detailBtn: { marginTop: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    detailText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  });
}
