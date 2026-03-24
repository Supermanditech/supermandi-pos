/**
 * V3-LOGIN-010 + V3-OWNER-023: Staff/Owner PIN login screen
 * Store-bound device → PIN entry → POS
 * Matches prototype: SuperMandi POS, store code/name, PIN input, Login CTA, Switch Store
 */

import React, { useMemo, useState, useCallback } from "react";
import { View, TextInput, Pressable, StyleSheet, Text, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Circle } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { showToast } from "../../utils/showToast";
import { staffLogin } from "../../services/api/staffApi";
import { useStaffSessionStore } from "../../stores/staffSessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { clearDeviceSession } from "../../services/deviceSession";
import { isOnline } from "../../services/networkStatus";
import { logger } from "../../services/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SK_PIN_CACHE } from "../../constants/storageKeys";

type Nav = NativeStackNavigationProp<any>;

export default function StaffLoginScreenV3() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeName = useSettingsStore((s) => s.storeName) ?? "SuperMandi Store";
  const storeCode = useSettingsStore((s) => s.storeCode) ?? "";

  const handleLogin = useCallback(async () => {
    if (!pin || pin.length < 4) {
      setError("Enter your 4-6 digit PIN");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const online = await isOnline();

      if (online) {
        // Online: verify with backend
        const result = await staffLogin({ pin });
        const session = {
          staffId: result.staffId,
          name: result.name,
          role: result.role,
          maxDiscountPct: result.maxDiscountPct ?? (result.role === "MANAGER" ? 100 : 10),
        };
        useStaffSessionStore.getState().setSession(session);
        // V3-SESSION-025: Cache PIN+session for offline re-entry
        await AsyncStorage.setItem(SK_PIN_CACHE, JSON.stringify({ pin, ...session, cachedAt: Date.now() }));
        logger.debug("StaffLoginV3", `login:${result.staffId},role:${result.role},owner:${result.isOwner}`);
      } else {
        // Offline: check cached PIN
        const cached = await AsyncStorage.getItem(SK_PIN_CACHE);
        if (!cached) { setError("Offline — no cached login available"); setPin(""); setLoading(false); return; }
        const parsed = JSON.parse(cached);
        if (parsed.pin !== pin) { setError("Invalid PIN (offline)"); setPin(""); setLoading(false); return; }
        // Cache valid — restore session
        useStaffSessionStore.getState().setSession({
          staffId: parsed.staffId,
          name: parsed.name,
          role: parsed.role,
          maxDiscountPct: parsed.maxDiscountPct,
        });
        logger.debug("StaffLoginV3", `offline_login:${parsed.staffId}`);
      }

      navigation.reset({ index: 0, routes: [{ name: "SellScan" }] });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "Login failed";
      const code = err?.response?.data?.error?.code ?? "";
      if (code === "STAFF_LOCKED") {
        setError(msg);
      } else if (code === "STAFF_INVALID_CREDENTIALS") {
        setError("Invalid PIN. Try again.");
      } else {
        setError(msg);
      }
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [pin, navigation]);

  const handleSwitchStore = useCallback(async () => {
    // Clear device-store session, go back to phone/OTP flow
    useStaffSessionStore.getState().clearSession();
    await clearDeviceSession();
    navigation.reset({ index: 0, routes: [{ name: "V3Phone" }] });
  }, [navigation]);

  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* SuperMandi mark */}
      <Svg width={48} height={48} viewBox="0 0 32 32">
        <Rect x={2} y={2} width={28} height={28} rx={8} fill="#2563EB" />
        <Rect x={9} y={9} width={14} height={3.2} rx={1.6} fill="#fff" />
        <Rect x={9} y={14.4} width={14} height={3.2} rx={1.6} fill="#fff" />
        <Rect x={9} y={19.8} width={14} height={3.2} rx={1.6} fill="#fff" />
        <Circle cx={16} cy={25.3} r={2.1} fill="#fff" />
      </Svg>

      <Text style={styles.title}>SuperMandi POS</Text>
      <Text style={styles.subtitle} testID="staff-login-store-header">
        {storeCode ? `${storeCode} · ` : ""}{storeName}
      </Text>

      {/* PIN input */}
      <View style={styles.form}>
        <Text style={styles.label}>PIN</Text>
        <TextInput
          style={styles.pinInput}
          value={pin}
          onChangeText={(v) => { setPin(v.replace(/\D/g, "").slice(0, 6)); setError(null); }}
          placeholder="Enter PIN"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          autoFocus
          onSubmitEditing={handleLogin}
          testID="staff-login-pin-input"
          accessibilityLabel="Staff PIN"
        />
        {error ? <Text style={styles.errorText} testID="staff-login-error">{error}</Text> : null}
      </View>

      {/* Login CTA */}
      <Pressable
        style={[styles.loginBtn, loading && { opacity: 0.6 }]}
        onPress={handleLogin}
        disabled={loading}
        testID="staff-login-cta"
        accessibilityRole="button"
        accessibilityLabel="Login"
      >
        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.loginBtnText}>Login →</Text>}
      </Pressable>

      {/* Switch Store */}
      <Pressable
        style={styles.switchBtn}
        onPress={handleSwitchStore}
        testID="staff-login-switch-store"
        accessibilityRole="button"
        accessibilityLabel="Switch Store"
      >
        <Text style={styles.switchBtnText}>Switch Store ↗</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", padding: getScreenPadding() * 2 },
    title: { fontSize: 22, fontWeight: "900", color: colors.textPrimary, marginTop: 16, letterSpacing: -0.5 },
    subtitle: { fontSize: 13, color: colors.textTertiary, marginTop: 4, fontWeight: "500" },
    form: { width: "100%", marginTop: 32 },
    label: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 6 },
    pinInput: { padding: 16, borderRadius: 14, borderWidth: 2, borderColor: colors.border, fontSize: 24, fontWeight: "700", color: colors.textPrimary, textAlign: "center", letterSpacing: 8 },
    errorText: { color: colors.error, fontSize: 12, fontWeight: "600", marginTop: 8, textAlign: "center" },
    loginBtn: { width: "100%", backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 16, alignItems: "center", marginTop: 24 },
    loginBtnText: { fontSize: 17, fontWeight: "800", color: "#fff" },
    switchBtn: { marginTop: 24 },
    switchBtnText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  });
}
