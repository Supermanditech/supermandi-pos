import React, { useMemo, useEffect, useState } from "react";
import { View, Pressable, TextInput, ScrollView, ActivityIndicator, StyleSheet, Text, Alert, Modal, Linking } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { isOnline } from "../../services/networkStatus";
import { showToast } from "../../utils/showToast";
import { recordCollectionCash } from "../../services/api/posApi";
import { useKhataStore } from "../../stores/khataStore";

// V3-024: Khata with real khataStore

// V3-FIX-082: No hardcoded fallback customers — real data or empty state only
type Customer = { name: string; initial: string; days: number; amount: number; overdue: boolean };

const WA_SVG = `M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z`;

type Props = { onClose: () => void };

export default function KhataScreenV3({ onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // GCP-STG-0063: Manual credit record modal state
  const [recordVisible, setRecordVisible] = useState(false);
  const [recordName, setRecordName] = useState("");
  const [recordAmount, setRecordAmount] = useState("");
  const [recordDesc, setRecordDesc] = useState("");
  const storeName = "SuperMandi";

  // V3-024: Real khata data from store
  const khataCustomers = useKhataStore((s) => s.customers);
  const khataLoading = useKhataStore((s) => s.loading);
  const fetchKhataCustomers = useKhataStore((s) => s.fetchCustomers);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const online = await isOnline();
      if (!mounted) return;
      if (!online) { showToast("Offline — showing cached khata"); return; }
      void fetchKhataCustomers();
    })();
    return () => { mounted = false; };
  }, [fetchKhataCustomers]);

  // Map khata customers to display format (merge with demo fallback)
  const realOverdue: Customer[] = khataCustomers
    .filter((c) => c.balanceMinor > 0 && c.lastEntryAt && (Date.now() - new Date(c.lastEntryAt).getTime()) > 30 * 86400000)
    .map((c) => ({ name: c.name, initial: c.name[0] ?? "?", days: Math.round((Date.now() - new Date(c.lastEntryAt ?? Date.now()).getTime()) / 86400000), amount: Math.round(c.balanceMinor / 100), overdue: true }));
  const realPending: Customer[] = khataCustomers
    .filter((c) => c.balanceMinor > 0 && (!c.lastEntryAt || (Date.now() - new Date(c.lastEntryAt).getTime()) <= 30 * 86400000))
    .map((c) => ({ name: c.name, initial: c.name[0] ?? "?", days: Math.max(1, Math.round((Date.now() - new Date(c.lastEntryAt ?? Date.now()).getTime()) / 86400000)), amount: Math.round(c.balanceMinor / 100), overdue: false }));

  // V3-FIX-082: Use only real data — no demo fallback. Search filters both lists.
  const [searchQuery, setSearchQuery] = useState("");
  const filterBySearch = (list: Customer[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.trim().toLowerCase();
    return list.filter((c) => c.name.toLowerCase().includes(q));
  };
  const displayOverdue = filterBySearch(realOverdue);
  const displayPending = filterBySearch(realPending);
  const totalOutstanding = khataCustomers.reduce((s, c) => s + Math.max(0, c.balanceMinor), 0);
  const totalOverdue = realOverdue.reduce((s, c) => s + c.amount * 100, 0);

  const renderCustomer = (c: Customer) => (
    <View key={c.name} style={[styles.kCard, c.overdue && styles.kCardOverdue]}>
      <View style={styles.kAvatar}><Text style={styles.kInitial}>{c.initial}</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.kName}>{c.name}</Text><Text style={styles.kDays}>{c.days} days{c.overdue ? " overdue" : ""}</Text></View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.kAmount, c.overdue && styles.kAmountOverdue]}>₹{c.amount.toLocaleString("en-IN")}</Text>
        <View style={styles.kActions}>
          <Pressable style={styles.waSmBtn} onPress={() => {
            const msg = encodeURIComponent(`Hi ${c.name}, you have ₹${c.amount.toLocaleString("en-IN")} pending from ${storeName}. Please settle at your convenience. — ${storeName}`);
            Linking.openURL(`whatsapp://send?text=${msg}`).catch(() => showToast("WhatsApp not installed"));
          }}><Svg width={10} height={10} viewBox="0 0 24 24" fill="#fff"><Path d={WA_SVG} /></Svg></Pressable>
          <Pressable style={styles.collectBtn} onPress={() => {
            Alert.alert("Collect Payment", `Record ₹${c.amount} collection from ${c.name}?`, [
              { text: "Cancel", style: "cancel" },
              { text: "Cash", onPress: async () => {
                const online = await isOnline();
                if (!online) { showToast("Collection requires connection"); return; }
                try {
                  await recordCollectionCash({ amountMinor: c.amount * 100, reference: c.name });
                  showToast(`₹${c.amount} collected from ${c.name}`);
                  void fetchKhataCustomers();
                } catch { showToast("Collection failed"); }
              }},
            ]);
          }}><Text style={styles.collectText}>Collect</Text></Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Khata</Text><Pressable style={styles.addBtn} onPress={() => setRecordVisible(true)}><Text style={styles.addBtnText}>+ Record</Text></Pressable></View>
      <View style={styles.summaryBar}><View><Text style={styles.sumLabel}>OUTSTANDING</Text><Text style={styles.sumVal}>₹{Math.round(totalOutstanding / 100).toLocaleString("en-IN")}</Text></View><View style={{ alignItems: "flex-end" }}><Text style={styles.sumLabel}>OVERDUE</Text><Text style={styles.sumVal}>₹{Math.round(totalOverdue / 100).toLocaleString("en-IN")}</Text></View></View>
      {khataLoading ? <ActivityIndicator size="small" color={colors.primary} style={{ padding: 10 }} /> : null}
      {/* V3-FIX-082: Wired search filter */}
      <View style={styles.searchBar}><TextInput style={styles.searchInput} placeholder="Search customer..." placeholderTextColor={colors.textTertiary} value={searchQuery} onChangeText={setSearchQuery} /></View>
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {!khataLoading && displayOverdue.length === 0 && displayPending.length === 0 ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>📒</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textSecondary }}>No credit entries</Text>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>Credit entries appear when you sell on due or add manual credit</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.section, { color: colors.error }]}>⚠ OVERDUE</Text>
            {displayOverdue.map(renderCustomer)}
            <Text style={styles.section}>PENDING</Text>
            {displayPending.map(renderCustomer)}
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {/* V3-FIX-082: Real bulk WhatsApp reminder with customer list */}
        <Pressable style={styles.bulkWaBtn} onPress={() => {
          if (realOverdue.length === 0) { showToast("No overdue customers to remind"); return; }
          const lines = realOverdue.map((c) => `• ${c.name}: ₹${c.amount} (${c.days} days)`).join("\n");
          const msg = encodeURIComponent(`*Payment Reminder*\n${lines}\n\nPlease clear your pending dues. Thank you!\n— SuperMandi`);
          const { Linking } = require("react-native");
          Linking.openURL(`whatsapp://send?text=${msg}`).catch(() => showToast("WhatsApp not installed"));
        }}><Svg width={14} height={14} viewBox="0 0 24 24" fill="#fff"><Path d={WA_SVG} /><Path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.72-1.391A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" /></Svg><Text style={styles.bulkWaText}>Remind All Overdue</Text></Pressable>
      </View>

      {/* GCP-STG-0063: Manual credit record modal */}
      <Modal visible={recordVisible} transparent animationType="slide" onRequestClose={() => setRecordVisible(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 }}>Record Credit Entry</Text>
            <TextInput style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 10, color: colors.textPrimary }} placeholder="Customer name" placeholderTextColor={colors.textTertiary} value={recordName} onChangeText={setRecordName} />
            <TextInput style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 10, color: colors.textPrimary }} placeholder="Amount (₹)" placeholderTextColor={colors.textTertiary} value={recordAmount} onChangeText={setRecordAmount} keyboardType="numeric" />
            <TextInput style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 16, color: colors.textPrimary }} placeholder="Description (optional)" placeholderTextColor={colors.textTertiary} value={recordDesc} onChangeText={setRecordDesc} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.backgroundSecondary, alignItems: "center" }} onPress={() => setRecordVisible(false)}><Text style={{ fontWeight: "600", color: colors.textSecondary }}>Cancel</Text></Pressable>
              <Pressable style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" }} onPress={async () => {
                const amt = parseInt(recordAmount, 10);
                if (!recordName.trim() || !amt || amt <= 0) { showToast("Name and valid amount required"); return; }
                const online = await isOnline();
                if (!online) { showToast("Requires connection"); return; }
                try {
                  await recordCollectionCash({ amountMinor: -amt * 100, reference: `${recordName.trim()}: ${recordDesc || "Manual credit"}` });
                  showToast(`₹${amt} credit recorded for ${recordName.trim()}`);
                  setRecordVisible(false); setRecordName(""); setRecordAmount(""); setRecordDesc("");
                  void fetchKhataCustomers();
                } catch { showToast("Failed to record credit"); }
              }}><Text style={{ fontWeight: "700", color: "#fff" }}>Save</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.primary, paddingHorizontal: getScreenPadding(), paddingVertical: 14, flexDirection: "row", alignItems: "center" },
    backBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    backText: { color: "#fff", fontSize: 16 },
    headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 16, fontWeight: "700" },
    addBtn: { backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10 },
    addBtnText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
    summaryBar: { flexDirection: "row", justifyContent: "space-between", padding: 10, paddingHorizontal: getScreenPadding(), backgroundColor: colors.errorSoft },
    sumLabel: { fontSize: 10, fontWeight: "700", color: "#991B1B" },
    sumVal: { fontSize: 18, fontWeight: "900", color: colors.error },
    searchBar: { padding: 10, paddingHorizontal: getScreenPadding(), backgroundColor: colors.surface },
    searchInput: { padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, fontSize: 13, fontWeight: "500", color: colors.textPrimary },
    body: { flex: 1, padding: 14 },
    section: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
    kCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
    kCardOverdue: { borderLeftWidth: 4, borderLeftColor: colors.error },
    kAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
    kInitial: { fontSize: 18, fontWeight: "800", color: colors.primary },
    kName: { fontSize: 14, fontWeight: "700" },
    kDays: { fontSize: 11, color: colors.textTertiary },
    kAmount: { fontSize: 17, fontWeight: "900", color: colors.warning },
    kAmountOverdue: { color: colors.error },
    kActions: { flexDirection: "row", gap: 4, marginTop: 4 },
    waSmBtn: { backgroundColor: "#25D366", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    collectBtn: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    collectText: { color: "#fff", fontSize: 10, fontWeight: "700" }, // GCP-STG-0307: raised from 9
    footer: { padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
    bulkWaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: "#25D366" },
    bulkWaText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  });
}
