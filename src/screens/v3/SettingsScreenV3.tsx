import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text, Alert, TextInput, Modal } from "react-native";
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

  // Cross-platform modal state (replaces Alert.prompt for Android compatibility)
  type ModalMode = "add-staff" | "owner-pin" | null;
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalStep, setModalStep] = useState(0); // 0=name, 1=pin for add-staff; 0=pin, 1=confirm for owner-pin
  const [modalName, setModalName] = useState("");
  const [modalPin, setModalPin] = useState("");
  const [modalConfirmPin, setModalConfirmPin] = useState("");
  const [modalError, setModalError] = useState("");

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
                  setModalMode("add-staff"); setModalStep(0); setModalName(""); setModalPin(""); setModalError("");
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
                  setModalMode("owner-pin"); setModalStep(0); setModalPin(""); setModalConfirmPin(""); setModalError("");
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

      {/* Cross-platform modal for Add Staff + Owner PIN (works on Android) */}
      <Modal visible={modalMode !== null} transparent animationType="slide" onRequestClose={() => setModalMode(null)} testID="settings-modal">
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            {modalMode === "add-staff" && (
              <>
                <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 4 }}>
                  {modalStep === 0 ? "Add Staff — Name" : "Add Staff — PIN"}
                </Text>
                {modalStep === 0 ? (
                  <>
                    <Text style={{ fontSize: 13, color: colors.textTertiary, marginBottom: 12 }}>Enter the staff member's name</Text>
                    <TextInput
                      style={{ padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, fontSize: 16, fontWeight: "600" }}
                      value={modalName} onChangeText={setModalName} placeholder="Staff name" autoFocus testID="modal-staff-name"
                    />
                    {modalError ? <Text style={{ color: colors.error, fontSize: 12, marginTop: 6 }}>{modalError}</Text> : null}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                      <Pressable onPress={() => setModalMode(null)} style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: "center" }}>
                        <Text style={{ fontWeight: "700", color: colors.textSecondary }}>Cancel</Text>
                      </Pressable>
                      <Pressable onPress={() => {
                        if (!modalName.trim() || modalName.trim().length < 2) { setModalError("Name must be at least 2 characters"); return; }
                        setModalStep(1); setModalError("");
                      }} style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" }}>
                        <Text style={{ fontWeight: "800", color: "#fff" }}>Next →</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 13, color: colors.textTertiary, marginBottom: 12 }}>Set 4-6 digit PIN for {modalName.trim()}</Text>
                    <TextInput
                      style={{ padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, fontSize: 20, fontWeight: "700", textAlign: "center", letterSpacing: 8 }}
                      value={modalPin} onChangeText={v => setModalPin(v.replace(/\D/g, "").slice(0, 6))}
                      keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus testID="modal-staff-pin"
                    />
                    {modalError ? <Text style={{ color: colors.error, fontSize: 12, marginTop: 6 }}>{modalError}</Text> : null}
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                      <Pressable onPress={() => { setModalStep(0); setModalPin(""); setModalError(""); }} style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: "center" }}>
                        <Text style={{ fontWeight: "700", color: colors.textSecondary }}>Back</Text>
                      </Pressable>
                      <Pressable onPress={async () => {
                        if (!/^\d{4,6}$/.test(modalPin)) { setModalError("PIN must be 4-6 digits"); return; }
                        try {
                          await createStaff({ name: modalName.trim(), pin: modalPin, role: "CASHIER" });
                          showToast(`Staff "${modalName.trim()}" created`);
                          setModalMode(null);
                        } catch (err: any) {
                          setModalError(err?.response?.data?.error?.message ?? "Failed to create staff");
                        }
                      }} style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" }}>
                        <Text style={{ fontWeight: "800", color: "#fff" }}>Create Staff</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            )}

            {modalMode === "owner-pin" && (
              <>
                <Text style={{ fontSize: 18, fontWeight: "800", marginBottom: 4 }}>
                  {modalStep === 0 ? "Set Owner PIN" : "Confirm PIN"}
                </Text>
                <Text style={{ fontSize: 13, color: colors.textTertiary, marginBottom: 12 }}>
                  {modalStep === 0 ? "Enter 4-6 digit PIN for quick POS re-entry" : "Re-enter the PIN to confirm"}
                </Text>
                <TextInput
                  style={{ padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, fontSize: 20, fontWeight: "700", textAlign: "center", letterSpacing: 8 }}
                  value={modalStep === 0 ? modalPin : modalConfirmPin}
                  onChangeText={v => { const clean = v.replace(/\D/g, "").slice(0, 6); modalStep === 0 ? setModalPin(clean) : setModalConfirmPin(clean); }}
                  keyboardType="number-pad" secureTextEntry maxLength={6} autoFocus
                  testID={modalStep === 0 ? "modal-owner-pin" : "modal-owner-pin-confirm"}
                />
                {modalError ? <Text style={{ color: colors.error, fontSize: 12, marginTop: 6 }}>{modalError}</Text> : null}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                  <Pressable onPress={() => { if (modalStep === 0) setModalMode(null); else { setModalStep(0); setModalConfirmPin(""); setModalError(""); } }} style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: "center" }}>
                    <Text style={{ fontWeight: "700", color: colors.textSecondary }}>{modalStep === 0 ? "Cancel" : "Back"}</Text>
                  </Pressable>
                  <Pressable onPress={async () => {
                    if (modalStep === 0) {
                      if (!/^\d{4,6}$/.test(modalPin)) { setModalError("PIN must be 4-6 digits"); return; }
                      setModalStep(1); setModalError("");
                    } else {
                      if (modalPin !== modalConfirmPin) { setModalError("PINs do not match"); return; }
                      const online = await isOnline();
                      if (!online) { setModalError("Setting PIN requires internet"); return; }
                      try {
                        const { apiClient } = require("../../services/api/apiClient");
                        await apiClient.post("/api/v1/retailer-admin/staff/owner-pin", { pin: modalPin });
                        showToast("Owner PIN set — use it for quick re-entry after idle lock");
                        setModalMode(null);
                      } catch (err: any) {
                        setModalError(err?.response?.data?.error?.message ?? "Failed to set PIN");
                      }
                    }
                  }} style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center" }}>
                    <Text style={{ fontWeight: "800", color: "#fff" }}>{modalStep === 0 ? "Next →" : "Set PIN"}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
