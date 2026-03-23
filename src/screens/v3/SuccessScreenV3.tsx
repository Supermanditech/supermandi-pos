import React, { useMemo, useState, useEffect } from "react";
import { View, Pressable, StyleSheet, Text, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";

import Confetti from "../../components/v3/Confetti";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { useCartStore } from "../../stores/cartStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { printerService } from "../../services/printerService";
import { showToast } from "../../utils/showToast";
import { voidSale } from "../../services/api/posApi";
import { isOnline } from "../../services/networkStatus";
import { shareBillWhatsApp } from "../../services/billing/billShare";
import { logger } from "../../services/logger";

// STG-557: Success screen v3 — profit display, streak, confetti, WhatsApp bill, new sale
// GCP-STG-0042: In-memory daily sales streak counter
const _streakCache: Record<string, string> = {};

type SuccessScreenV3Props = {
  paymentMethod: "CASH" | "UPI" | "DUE";
  totalMinor: number;
  itemCount: number;
  saleId?: string;
  customerPhone?: string; // V3-HARDEN-103: For server-backed WhatsApp send
  onNewSale: () => void;
};

const METHOD_LABELS: Record<string, string> = { CASH: "Cash · नकद", UPI: "UPI · यूपीआई", DUE: "Udhar · उधार" };

export default function SuccessScreenV3({ paymentMethod, totalMinor, itemCount, saleId, customerPhone, onNewSale }: SuccessScreenV3Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showConfetti, setShowConfetti] = useState(true);

  // V3-FIX-075: Use real sale ID as bill ref, no random streak/profit
  const billRef = saleId ?? `PENDING-${Date.now()}`;
  const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const totalDisplay = `₹${Math.round(totalMinor / 100).toLocaleString("en-IN")}`;

  // GCP-STG-0042: Daily sales streak counter (in-memory per session)
  const [dailyCount, setDailyCount] = useState(0);
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const key = `streak_${today}`;
    const stored = parseInt(_streakCache[key] ?? "0", 10);
    const next = stored + 1;
    _streakCache[key] = String(next);
    setDailyCount(next);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // V3-009: Auto-print receipt if enabled
  const autoPrint = useSettingsStore((s) => s.printerAutoPrint);
  const [printStatus, setPrintStatus] = useState<"pending" | "printing" | "done" | "failed">("pending");
  useEffect(() => {
    if (!autoPrint) { setPrintStatus("done"); return; }
    setPrintStatus("printing");
    const receiptText = `Bill: ${billRef}\n${METHOD_LABELS[paymentMethod]}\n${itemCount} items\nTotal: ${totalDisplay}\n\nThank you!\n— SuperMandi POS`;
    printerService.printReceipt(receiptText)
      .then((ok) => { setPrintStatus(ok ? "done" : "failed"); if (!ok) showToast("Print failed — tap Reprint"); })
      .catch(() => { setPrintStatus("failed"); });
  }, [autoPrint, billRef, paymentMethod, itemCount, totalDisplay]);

  // V3-HARDEN-103: Delegate to shareBillWhatsApp (server-backed + fallback)
  // This ensures SuccessScreen uses the SAME tested code path as billShare.ts
  const handleWhatsAppBill = async (recipientPhone?: string) => {
    try {
      await shareBillWhatsApp({
        saleId: saleId ?? "",
        billRef,
        status: "completed",
        paymentMode: paymentMethod as any,
        currency: "INR",
        createdAt: new Date().toISOString(),
        subtotalMinor: totalMinor,
        discountMinor: 0,
        totalMinor,
        items: [],
      }, recipientPhone);
      if (recipientPhone) showToast("Bill sent via WhatsApp");
    } catch {
      showToast("WhatsApp not available");
    }
  };

  const handleNewSale = () => {
    useCartStore.getState().clearCart(true);
    onNewSale();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Confetti active={showConfetti} />

      <View style={styles.body}>
        {/* Success checkmark */}
        <View style={styles.checkCircle}>
          <Text style={styles.checkIcon}>✓</Text>
        </View>

        <Text style={styles.title}>Payment Received!</Text>
        <Text style={styles.amount}>{totalDisplay}</Text>
        <Text style={styles.subtitle}>{METHOD_LABELS[paymentMethod]} · {itemCount} item{itemCount !== 1 ? "s" : ""}</Text>

        {/* GCP-STG-0042: Daily sales streak motivational text */}
        {dailyCount > 0 && (
          <Text style={styles.streakText}>🔥 {dailyCount} sale{dailyCount !== 1 ? "s" : ""} today — keep going!</Text>
        )}

        {/* V3-FIX-075: Bill ref display */}
        <View style={styles.billRefRow}>
          <Text style={styles.billRefText}>{billRef} · {timeStr}</Text>
        </View>

        {/* Print status */}
        <View style={styles.printStatus}>
          <Text style={styles.printText}>{printStatus === "printing" ? "🖨️ Printing receipt..." : printStatus === "done" ? "🖨️ Receipt printed ✓" : printStatus === "failed" ? "🖨️ Print failed — tap Reprint" : "🖨️ Ready to print"}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.newSaleBtn} onPress={handleNewSale} accessibilityRole="button">
            <Text style={styles.newSaleBtnText}>💰 New Sale</Text>
          </Pressable>

          <View style={styles.secondaryActions}>
            <Pressable style={styles.secondaryBtn} onPress={() => {
              const receiptText = `Bill: ${billRef}\n${METHOD_LABELS[paymentMethod]}\n${itemCount} items\nTotal: ${totalDisplay}\n\nThank you!\n— SuperMandi POS`;
              showToast("Reprinting...");
              printerService.printReceipt(receiptText).then((ok) => { if (!ok) showToast("Print failed"); }).catch(() => showToast("Print failed"));
            }} accessibilityLabel="Reprint receipt">
              <Text style={styles.secondaryBtnText}>🖨️ Reprint</Text>
            </Pressable>

            <Pressable style={styles.waBtn} onPress={() => handleWhatsAppBill(customerPhone)} accessibilityLabel="Send bill on WhatsApp">
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="#fff">
                <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479c0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <Path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.72-1.391A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
              </Svg>
              <Text style={styles.waBtnText}>Send Bill</Text>
            </Pressable>

            <Pressable style={styles.voidBtn} onPress={() => {
              if (!saleId) { showToast("Cannot void — sale ID not available"); return; }
              Alert.alert("Void Sale", `Void sale ${billRef}? This cannot be undone.`, [
                { text: "Cancel", style: "cancel" },
                { text: "Void", style: "destructive", onPress: async () => {
                  const online = await isOnline();
                  if (!online) { showToast("Void requires internet connection"); return; }
                  try {
                    await voidSale({ saleId, reason: "Voided from POS success screen" });
                    showToast("Sale voided successfully");
                    logger.debug("V3Success", `voided:${saleId}`);
                    onNewSale();
                  } catch (err: any) {
                    showToast(err?.message ?? "Failed to void sale");
                  }
                }},
              ]);
            }} accessibilityLabel="Void sale">
              <Text style={styles.voidBtnText}>Void</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.billInfo}>Bill #{billRef} · {timeStr}</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface, position: "relative" },
    body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: getScreenPadding() * 2 },
    checkCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
    checkIcon: { fontSize: 48, color: colors.success },
    title: { fontSize: 24, fontWeight: "900", color: colors.textPrimary, marginTop: 20, letterSpacing: -0.5 },
    amount: { fontSize: 36, fontWeight: "900", color: colors.textPrimary, marginTop: 8, letterSpacing: -1 },
    subtitle: { fontSize: 14, color: colors.textTertiary, fontWeight: "500", marginTop: 4 },
    // GCP-STG-0042: Daily sales streak motivational text
    streakText: { fontSize: 13, color: colors.success, fontWeight: "700", marginTop: 8 },
    billRefRow: { marginTop: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.backgroundSecondary },
    billRefText: { fontSize: 11, fontWeight: "600", color: colors.textTertiary, textAlign: "center" },
    printStatus: { marginTop: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.backgroundSecondary },
    printText: { fontSize: 12, color: colors.textTertiary, fontWeight: "500" },
    actions: { width: "100%", marginTop: 28, gap: 8 },
    newSaleBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    newSaleBtnText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
    secondaryActions: { flexDirection: "row", gap: 8 },
    secondaryBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    secondaryBtnText: { fontSize: 12, fontWeight: "700", color: colors.primary },
    waBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#25D366", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    waBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
    voidBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
    voidBtnText: { fontSize: 12, fontWeight: "600", color: colors.error },
    billInfo: { marginTop: 20, fontSize: 11, color: colors.textTertiary, fontWeight: "500" },
  });
}
