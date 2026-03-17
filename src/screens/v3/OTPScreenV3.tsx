import React, { useMemo, useState, useCallback, useRef } from "react";
import { View, TextInput, Pressable, StyleSheet, Text, ActivityIndicator } from "react-native";
import Svg, { Rect, Circle } from "react-native-svg";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { showToast } from "../../utils/showToast";
import { apiClient } from "../../services/api/apiClient";
import { saveDeviceSession } from "../../services/deviceSession";
import { useSettingsStore } from "../../stores/settingsStore";
import { logger } from "../../services/logger";

// V3 Auth Step 2: OTP verification
// User enters 6-digit OTP → backend verifies → returns device token + store info

export default function OTPScreenV3() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<any>();
  const phone = route.params?.phone ?? "";
  React.useEffect(() => { if (!phone) { showToast("Phone number missing"); navigation.goBack(); } }, [phone, navigation]);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const submittingRef = useRef(false);

  // Auto-advance OTP inputs
  const handleOtpChange = useCallback((index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    // Auto-submit when all 6 digits entered
    if (index === 5 && value) {
      const fullOtp = newOtp.join("");
      if (fullOtp.length === 6) handleVerify(fullOtp);
    }
  }, [otp]);

  const handleVerify = useCallback(async (otpCode?: string) => {
    const code = otpCode ?? otp.join("");
    if (code.length !== 6) { showToast("Enter 6-digit OTP"); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);
    try {
      // V3-063: Verify OTP — may return multi-store list or single session
      // DA-035: 15s timeout to prevent stuck loading state
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Verification timed out — check your connection")), 15000));
      const result = await Promise.race([
        apiClient.post<any>("/api/v1/pos/auth/verify-otp", { phone, otp: code }),
        timeoutPromise,
      ]);

      if (result.multiStore && result.stores?.length > 1) {
        // Multi-store: navigate to store selector
        navigation.navigate("V3StoreSelect" as any, { phone, otp: code, stores: result.stores });
        return;
      }

      // Single store — save session directly
      await saveDeviceSession({
        deviceId: `pos-${phone}`,
        storeId: result.storeId,
        deviceToken: result.token,
      });

      // V3-CLIENT-003: Hydrate store metadata immediately after login
      if (result.storeName) useSettingsStore.getState().setStoreName(result.storeName);
      if (result.storeCode) useSettingsStore.getState().setStoreCode(result.storeCode);

      logger.debug("OTPV3", `verified:${phone},store:${result.storeCode}`);
      showToast(`Welcome to ${result.storeName}!`);

      navigation.reset({ index: 0, routes: [{ name: "V3StaffLogin" }] });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "OTP verification failed";
      showToast(msg);
      logger.debug("OTPV3", `verify_failed:${phone}:${String(err)}`);
    }
    setLoading(false);
    submittingRef.current = false;
  }, [otp, phone, navigation]);

  const handleResend = useCallback(async () => {
    if (resendTimer > 0) return;
    try {
      await apiClient.post("/api/v1/pos/auth/send-otp", { phone });
      showToast("OTP resent");
      setResendTimer(30);
    } catch { showToast("Failed to resend"); }
  }, [phone, resendTimer]);

  // Countdown timer
  React.useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <Text style={styles.icon}>🔐</Text>
        <Text style={styles.title}>Verify OTP</Text>
        <Text style={styles.subtitle}>Enter the 6-digit code sent to{"\n"}<Text style={styles.phoneBold}>+91 {phone}</Text></Text>

        {/* OTP boxes */}
        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={(ref) => { inputRefs.current[i] = ref; }}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
              value={digit}
              onChangeText={(v) => handleOtpChange(i, v)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        <Pressable
          style={[styles.verifyBtn, loading && styles.btnDisabled]}
          onPress={() => handleVerify()}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.verifyText}>Verify →</Text>}
        </Pressable>

        <Pressable onPress={handleResend} disabled={resendTimer > 0}>
          <Text style={styles.resendText}>
            {resendTimer > 0 ? `Didn't receive? Resend in ${resendTimer}s` : "Didn't receive? Resend OTP"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    body: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
    icon: { fontSize: 48, marginBottom: 16 },
    title: { fontSize: 26, fontWeight: "900", color: colors.textPrimary, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: colors.textTertiary, marginTop: 8, textAlign: "center", lineHeight: 20 },
    phoneBold: { fontWeight: "800", color: colors.textPrimary },
    otpRow: { flexDirection: "row", gap: 10, marginTop: 24 },
    otpBox: { width: 48, height: 56, borderRadius: 14, borderWidth: 2, borderColor: colors.border, textAlign: "center", fontSize: 24, fontWeight: "700", color: colors.textPrimary },
    otpBoxFilled: { borderColor: colors.primary },
    verifyBtn: { width: "100%", backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 16, alignItems: "center", marginTop: 24 },
    btnDisabled: { opacity: 0.6 },
    verifyText: { fontSize: 17, fontWeight: "800", color: "#fff" },
    resendText: { fontSize: 13, color: colors.textTertiary, marginTop: 16 },
  });
}
