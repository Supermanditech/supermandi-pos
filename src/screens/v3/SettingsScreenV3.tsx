import React, { useMemo } from "react";
import { View, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { useSettingsStore } from "../../stores/settingsStore";
import { useStaffSessionStore } from "../../stores/staffSessionStore";
import { clearDeviceSession } from "../../services/deviceSession";
import { showToast } from "../../utils/showToast";
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
      { icon: "👤", label: "Staff", value: "Raju (Manager)" },
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
