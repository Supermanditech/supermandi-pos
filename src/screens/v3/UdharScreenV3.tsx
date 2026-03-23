/**
 * V3-FIX-074: Dedicated Udhar (credit/due) payment screen
 * Prototype: amount due, customer name/phone, existing-customer quick-select, Record Udhar
 */
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { View, Pressable, TextInput, FlatList, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { recordDuePayment } from "../../services/api/posApi";
import { apiClient } from "../../services/api/apiClient";
import { showToast } from "../../utils/showToast";
import { logger } from "../../services/logger";
import { usePaymentFlow, type PaymentMethod } from "./usePaymentFlow";

// GCP-STG-0041: Enhanced customer type with due balance for Udhar screen
type Customer = { id: string; name: string; phone?: string; dueBalanceMinor?: number };

type UdharScreenV3Props = {
  onBack: () => void;
  onComplete: (method: PaymentMethod, saleId: string, totalMinor: number, itemCount: number, customerPhone?: string) => void;
};

export default function UdharScreenV3({ onBack, onComplete }: UdharScreenV3Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { grandTotal, itemCount, totalDisplay, isBulk, processing, executePayment } = usePaymentFlow();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);

  // GCP-STG-0041: Load existing customers + due balances for quick-select
  useEffect(() => {
    (async () => {
      try {
        const [custRes, duesRes] = await Promise.all([
          apiClient.get<any>("/api/v1/pos/customers?limit=10&sort=last_purchase_desc").catch(() => null),
          apiClient.get<any>("/api/v1/pos/khata/customers").catch(() => null),
        ]);
        const custList = (custRes?.customers ?? custRes?.data ?? []) as Customer[];
        // Build phone→balance map from khata data
        const balanceMap = new Map<string, number>();
        const khataCustomers = (duesRes?.customers ?? duesRes?.data ?? []) as any[];
        for (const kc of khataCustomers) {
          const phone = kc.phone ?? kc.customer_phone;
          const bal = Number(kc.balanceMinor ?? kc.balance_minor ?? kc.totalDueMinor ?? 0);
          if (phone && bal > 0) balanceMap.set(phone, bal);
        }
        // Merge due balances into customer list
        const merged = custList.slice(0, 10).map((c) => ({
          ...c,
          dueBalanceMinor: c.phone ? (balanceMap.get(c.phone) ?? 0) : 0,
        }));
        setRecentCustomers(merged);
      } catch {
        // Graceful — empty list on failure
      }
    })();
  }, []);

  const handleSelectCustomer = useCallback((c: Customer) => {
    setCustomerName(c.name);
    if (c.phone) setCustomerPhone(c.phone);
  }, []);

  const handleComplete = useCallback(() => {
    if (!customerName.trim()) { showToast("Add customer name for Udhar"); return; }
    // V3-HARDEN-103: Pass customerPhone to onComplete for server-backed WhatsApp
    const phone = customerPhone.trim() || undefined;
    executePayment("DUE", async (saleId) => {
      await recordDuePayment({ saleId, customerName: customerName.trim(), customerPhone: phone });
      logger.debug("V3Udhar", `due_recorded:${saleId},customer:${customerName}`);
    }, (method, saleId, totalMinor, itemCount) => onComplete(method, saleId, totalMinor, itemCount, phone));
  }, [executePayment, onComplete, customerName, customerPhone]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={onBack} accessibilityLabel="Back to payment methods">
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Udhar / Credit</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.totalAmount}>{totalDisplay}</Text>
        <Text style={styles.totalSub}>{itemCount} item{itemCount !== 1 ? "s" : ""}{isBulk ? " · incl. GST" : ""}</Text>

        <Text style={styles.sectionTitle}>Customer Details</Text>
        <TextInput
          style={styles.input}
          placeholder="Customer name"
          placeholderTextColor={colors.textTertiary}
          value={customerName}
          onChangeText={setCustomerName}
        />
        <TextInput
          style={styles.input}
          placeholder="+91 phone number"
          placeholderTextColor={colors.textTertiary}
          keyboardType="phone-pad"
          value={customerPhone}
          onChangeText={setCustomerPhone}
          maxLength={10}
        />

        {/* GCP-STG-0041: Customer cards with avatar, due balance, action buttons */}
        {/* GCP-STG-0431: Hint text when no recent customers */}
        {recentCustomers.length > 0 ? (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>OR SELECT EXISTING</Text>
            <FlatList
              data={recentCustomers}
              keyExtractor={(c) => c.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = customerName === item.name;
                const initial = (item.name || "?").charAt(0).toUpperCase();
                const dueDisplay = item.dueBalanceMinor && item.dueBalanceMinor > 0
                  ? `₹${Math.round(item.dueBalanceMinor / 100).toLocaleString("en-IN")} existing`
                  : null;
                return (
                  <Pressable
                    style={[styles.customerCard, isSelected && styles.customerCardActive]}
                    onPress={() => handleSelectCustomer(item)}
                  >
                    <View style={[styles.avatar, isSelected && styles.avatarActive]}>
                      <Text style={[styles.avatarText, isSelected && styles.avatarTextActive]}>{initial}</Text>
                    </View>
                    <Text style={[styles.customerName, isSelected && styles.customerNameActive]} numberOfLines={1}>{item.name}</Text>
                    {item.phone ? <Text style={styles.customerPhone}>{item.phone.slice(-4)}</Text> : null}
                    {dueDisplay ? <Text style={styles.dueBalance}>{dueDisplay}</Text> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        ) : (
          <Text style={{ fontSize: 13, color: colors.textTertiary, marginTop: 16, textAlign: "center" }}>
            Recent credit customers will appear here
          </Text>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          style={[styles.completeBtn, (!customerName.trim() || processing) && styles.completeBtnDisabled]}
          onPress={handleComplete}
          disabled={!customerName.trim() || processing}
          accessibilityRole="button"
        >
          <Text style={styles.completeBtnText}>{processing ? "Processing..." : `Record Udhar ${totalDisplay}`}</Text>
        </Pressable>
      </View>
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
    body: { flex: 1, padding: 20 },
    totalAmount: { fontSize: 44, fontWeight: "900", color: colors.textPrimary, letterSpacing: -1, marginTop: 8, textAlign: "center" },
    totalSub: { fontSize: 14, color: colors.textTertiary, fontWeight: "500", marginTop: 4, textAlign: "center" },
    sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textTertiary, marginTop: 24, marginBottom: 10 },
    input: { padding: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.border, fontSize: 15, fontWeight: "500", color: colors.textPrimary, backgroundColor: colors.surface, marginBottom: 10 },
    recentSection: { marginTop: 16 },
    recentTitle: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.8, marginBottom: 8 },
    // GCP-STG-0041: Vertical customer cards with avatar
    customerCard: { width: 100, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, marginRight: 10, backgroundColor: colors.surface, alignItems: "center" },
    customerCardActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.backgroundSecondary, alignItems: "center", justifyContent: "center", marginBottom: 6 },
    avatarActive: { backgroundColor: colors.primary },
    avatarText: { fontSize: 18, fontWeight: "800", color: colors.textSecondary },
    avatarTextActive: { color: "#fff" },
    customerName: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, textAlign: "center" },
    customerNameActive: { color: colors.primary },
    customerPhone: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
    dueBalance: { fontSize: 10, fontWeight: "600", color: colors.warning ?? colors.error, marginTop: 3, textAlign: "center" },
    footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
    completeBtn: { backgroundColor: colors.success, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    completeBtnDisabled: { opacity: 0.6 },
    completeBtnText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  });
}
