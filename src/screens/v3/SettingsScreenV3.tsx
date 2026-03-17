import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text, Alert, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useSettingsStore } from "../../stores/settingsStore";
import { useStaffSessionStore } from "../../stores/staffSessionStore";
import { clearDeviceSession } from "../../services/deviceSession";
import { showToast } from "../../utils/showToast";
import { listStaff, createStaff, toggleStaffActive, type StaffMember } from "../../services/api/staffApi";
import { isOnline } from "../../services/networkStatus";
import i18n from "../../i18n";

// STG-576: Settings v3 — unified with language toggle, printer, HID, express checkout

type Props = { onClose: () => void; onSwitchStaff?: () => void; onLogout?: () => void };

export default function SettingsScreenV3({ onClose, onSwitchStaff, onLogout }: Props) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const storeName = useSettingsStore((s) => s.storeName) ?? "SuperMandi Store";
  const autoPrint = useSettingsStore((s) => s.printerAutoPrint);
  const setAutoPrint = useSettingsStore((s) => s.setPrinterAutoPrint);
  const [expressCheckout, setExpressCheckout] = React.useState(true);
  const [soundEnabled, setSoundEnabled] = React.useState(true);

  type SettingsItem = { icon: string; label: string; value?: string; valueColor?: string; toggle?: boolean; on?: boolean; onToggle?: () => void; langToggle?: boolean };
  type SettingsSection = { title: string; items: SettingsItem[] };
  const SECTIONS: SettingsSection[] = [
    { title: "STORE", items: [
      { icon: "🏪", label: "Store Name", value: storeName },
      { icon: "👤", label: "Staff", value: (() => { const s = useStaffSessionStore.getState().session; return s ? `${s.name} (${s.role})` : "Not logged in"; })() },
    ]},
    { title: "HARDWARE", items: [
      { icon: "🖨️", label: "Printer", value: "Connected ✓", valueColor: colors.success },
      { icon: "📟", label: "HID Scanner", value: "Active ✓", valueColor: colors.success },
      { icon: "🔄", label: "Auto-Print", toggle: true, on: autoPrint, onToggle: () => setAutoPrint(!autoPrint) },
    ]},
    { title: "PAYMENTS", items: [
      { icon: "📱", label: "UPI ID", value: "store@upi" },
      { icon: "⚡", label: "Express Checkout", toggle: true, on: expressCheckout, onToggle: () => setExpressCheckout(!expressCheckout) },
    ]},
    { title: "PREFERENCES", items: [
      { icon: "🌐", label: "Language", langToggle: true },
      { icon: "🌙", label: "Dark Mode", toggle: true, on: themeMode === "dark", onToggle: toggleTheme },
      { icon: "🔊", label: "Sounds", toggle: true, on: soundEnabled, onToggle: () => setSoundEnabled(!soundEnabled) },
    ]},
    { title: "DATA", items: [
      { icon: "☁️", label: "Last Sync", value: "2 min ago ✓", valueColor: colors.success },
      { icon: "📤", label: "Pending", value: "0 items" },
    ]},
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}><Pressable style={styles.backBtn} onPress={onClose}><Text style={styles.backText}>←</Text></Pressable><Text style={styles.headerTitle}>Settings</Text><View style={{ width: 30 }} /></View>
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {SECTIONS.map((sec) => (
          <View key={sec.title}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            <View style={styles.sectionCard}>
              {sec.items.map((item) => (
                <View key={item.label} style={styles.row}>
                  <Text style={styles.rowIcon}>{item.icon}</Text>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  {item.value ? <Text style={[styles.rowValue, item.valueColor ? { color: item.valueColor, fontWeight: "600" } : {}]}>{item.value}</Text> : null}
                  {item.toggle ? (
                    <Pressable style={[styles.toggle, item.on && styles.toggleOn]} onPress={item.onToggle}>
                      <View style={[styles.toggleThumb, item.on && styles.toggleThumbOn]} />
                    </Pressable>
                  ) : null}
                  {item.langToggle ? (
                    <View style={styles.langToggle}>
                      <Pressable style={[styles.langBtn, language === "en" && styles.langBtnActive]} onPress={() => { setLanguage("en"); i18n.changeLanguage("en"); showToast("English"); }}>
                        <Text style={[styles.langText, language === "en" && styles.langTextActive]}>English</Text>
                      </Pressable>
                      <Pressable style={[styles.langBtn, language === "hi" && styles.langBtnActive]} onPress={() => { setLanguage("hi"); i18n.changeLanguage("hi"); showToast("हिंदी"); }}>
                        <Text style={[styles.langText, language === "hi" && styles.langTextActive]}>हिंदी</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}
        {/* V3-POS-024: Staff Management (owner/manager only) */}
        {(() => {
          const session = useStaffSessionStore.getState().session;
          if (session?.role !== "MANAGER") return null;
          return (
            <View>
              <Text style={styles.sectionTitle}>STAFF MANAGEMENT</Text>
              <View style={styles.sectionCard}>
                <Pressable style={styles.row} onPress={async () => {
                  const online = await isOnline();
                  if (!online) { showToast("Staff management requires internet"); return; }
                  try {
                    const result = await listStaff();
                    const staffList = result.staff.map((s: StaffMember) => `${s.name} (${s.role})${s.is_owner ? " — Owner" : ""}${!s.is_active ? " [inactive]" : ""}`).join("\n");
                    Alert.alert("Store Staff", staffList || "No staff configured.\n\nCreate staff to enable PIN login.", [{ text: "OK" }]);
                  } catch { showToast("Could not load staff list"); }
                }}>
                  <Text style={styles.rowIcon}>👥</Text>
                  <Text style={styles.rowLabel}>View Staff</Text>
                  <Text style={styles.rowValue}>→</Text>
                </Pressable>
                <Pressable style={styles.row} onPress={() => {
                  Alert.prompt ? Alert.prompt("Add Staff", "Enter staff name:", async (staffName) => {
                    if (!staffName?.trim()) return;
                    Alert.prompt("Set PIN", "Enter 4-6 digit PIN for " + staffName, async (staffPin) => {
                      if (!staffPin || !/^\d{4,6}$/.test(staffPin)) { showToast("PIN must be 4-6 digits"); return; }
                      try {
                        await createStaff({ name: staffName.trim(), pin: staffPin, role: "CASHIER" });
                        showToast(`Staff "${staffName.trim()}" created`);
                      } catch (err: any) {
                        showToast(err?.response?.data?.error?.message ?? "Failed to create staff");
                      }
                    });
                  }) : showToast("Use retailer web to manage staff on this device");
                }}>
                  <Text style={styles.rowIcon}>➕</Text>
                  <Text style={styles.rowLabel}>Add Staff</Text>
                  <Text style={styles.rowValue}>→</Text>
                </Pressable>
              </View>
              {/* V3-POS-024: Owner Quick PIN */}
              <Text style={[styles.sectionTitle, { marginTop: 14 }]}>OWNER QUICK PIN</Text>
              <View style={styles.sectionCard}>
                <Pressable style={styles.row} onPress={() => {
                  Alert.prompt ? Alert.prompt("Set Owner PIN", "Enter 4-6 digit PIN for quick POS re-entry:", async (ownerPin) => {
                    if (!ownerPin || !/^\d{4,6}$/.test(ownerPin)) { showToast("PIN must be 4-6 digits"); return; }
                    Alert.prompt("Confirm PIN", "Re-enter the PIN:", async (confirmPin) => {
                      if (ownerPin !== confirmPin) { showToast("PINs do not match"); return; }
                      const online = await isOnline();
                      if (!online) { showToast("Setting PIN requires internet"); return; }
                      try {
                        const { apiClient } = require("../../services/api/apiClient");
                        await apiClient.post("/api/v1/retailer-admin/staff/owner-pin", { pin: ownerPin });
                        showToast("Owner PIN set — use it for quick re-entry after idle lock");
                      } catch (err: any) {
                        showToast(err?.response?.data?.error?.message ?? "Failed to set PIN");
                      }
                    });
                  }) : showToast("Use retailer web to set your owner PIN");
                }}>
                  <Text style={styles.rowIcon}>🔐</Text>
                  <Text style={styles.rowLabel}>Set/Reset Owner PIN</Text>
                  <Text style={styles.rowValue}>→</Text>
                </Pressable>
              </View>
            </View>
          );
        })()}

        <View style={styles.footerActions}>
          <Pressable style={styles.switchBtn} onPress={() => {
            useStaffSessionStore.getState().clearSession();
            showToast("Staff session cleared");
            onSwitchStaff?.();
          }}><Text style={styles.switchText}>Switch Staff</Text></Pressable>
          <Pressable style={styles.logoutBtn} onPress={async () => {
            useStaffSessionStore.getState().clearSession();
            await clearDeviceSession();
            showToast("Logged out");
            onLogout?.();
          }}><Text style={styles.logoutText}>Logout</Text></Pressable>
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
    body: { flex: 1 },
    sectionTitle: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.8, paddingHorizontal: 14, marginTop: 14, marginBottom: 6 },
    sectionCard: { backgroundColor: colors.surface, marginHorizontal: 0 },
    row: { flexDirection: "row", alignItems: "center", padding: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.backgroundSecondary, gap: 14 },
    rowIcon: { fontSize: 18, width: 20, textAlign: "center" },
    rowLabel: { flex: 1, fontSize: 14, fontWeight: "600" },
    rowValue: { fontSize: 12, color: colors.textTertiary, fontWeight: "500" },
    toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.border, justifyContent: "center", paddingHorizontal: 2 },
    toggleOn: { backgroundColor: colors.primary },
    toggleThumb: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff" },
    toggleThumbOn: { alignSelf: "flex-end" },
    langToggle: { flexDirection: "row", backgroundColor: colors.backgroundSecondary, borderRadius: 10, overflow: "hidden" },
    langBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
    langBtnActive: { backgroundColor: colors.primary },
    langText: { fontSize: 11, fontWeight: "700", color: colors.textTertiary },
    langTextActive: { color: "#fff" },
    footerActions: { padding: 16, gap: 8 },
    switchBtn: { paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: "center" },
    switchText: { fontSize: 14, fontWeight: "700", color: colors.primary },
    logoutBtn: { paddingVertical: 12, borderRadius: 12, backgroundColor: colors.error, alignItems: "center" },
    logoutText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  });
}
