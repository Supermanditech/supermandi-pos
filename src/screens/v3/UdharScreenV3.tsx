/**
 * V3-FIX-074: Dedicated Udhar (credit/due) payment screen
 * Prototype: amount due, customer name/phone, existing-customer quick-select, Record Udhar
 */
import React, { useMemo, useState, useCallback, useEffect } from "react";
import { View, Pressable, TextInput, FlatList, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { recordDuePayment } from "../../services/api/posApi";
import { apiClient } from "../../services/api/apiClient";
import { showToast } from "../../utils/showToast";
import { logger } from "../../services/logger";
import { usePaymentFlow, type PaymentMethod } from "./usePaymentFlow";

type Customer = { id: string; name: string; phone?: string };

type UdharScreenV3Props = {
  onBack: () => void;
  onComplete: (method: PaymentMethod, saleId: string, totalMinor: number, itemCount: number, customerPhone?: string) => void;
};

export default function UdharScreenV3({ onBack, onComplete }: UdharScreenV3Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { grandTotal, itemCount, totalDisplay, isBulk, processing, executePayment } = usePaymentFlow();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);

  // V3-FIX-074: Load existing customers for quick-select
  useEffect(() => {
    apiClient.get<any>("/api/v1/pos/customers?limit=10&sort=last_purchase_desc")
      .then((res) => {
        const list = (res?.customers ?? res?.data ?? []) as Customer[];
        setRecentCustomers(list.slice(0, 10));
      })
      .catch(() => {}); // Graceful — empty list on failure
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
    <View style={styles.container}>
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

        {/* V3-FIX-074: Existing customer quick-select */}
        {recentCustomers.length > 0 ? (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>RECENT CUSTOMERS</Text>
            <FlatList
              data={recentCustomers}
              keyExtractor={(c) => c.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  style={[styles.customerChip, customerName === item.name && styles.customerChipActive]}
                  onPress={() => handleSelectCustomer(item)}
                >
                  <Text style={[styles.customerName, customerName === item.name && styles.customerNameActive]}>{item.name}</Text>
                  {item.phone ? <Text style={styles.customerPhone}>{item.phone.slice(-4)}</Text> : null}
                </Pressable>
              )}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
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
    customerChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, marginRight: 8, backgroundColor: colors.surface },
    customerChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    customerName: { fontSize: 13, fontWeight: "700", color: colors.textPrimary },
    customerNameActive: { color: colors.primary },
    customerPhone: { fontSize: 10, color: colors.textTertiary, marginTop: 1 },
    footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
    completeBtn: { backgroundColor: colors.success, paddingVertical: 16, borderRadius: 16, alignItems: "center" },
    completeBtnDisabled: { opacity: 0.6 },
    completeBtnText: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  });
}
