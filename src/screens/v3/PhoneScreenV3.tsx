import React, { useMemo, useState, useCallback } from "react";
import { View, TextInput, Pressable, StyleSheet, Text, ActivityIndicator, Linking, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Circle } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";
import { getScreenPadding } from "../../theme/responsive";
import { showToast } from "../../utils/showToast";
import { apiClient } from "../../services/api/apiClient";
import { logger } from "../../services/logger";

// V3 Auth Step 1: Phone number entry
// Retailer enters registered phone → backend sends OTP

export default function PhoneScreenV3() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  // GCP-STG-0479: Track if user tried entering more than 10 digits
  const [showPhoneHint, setShowPhoneHint] = useState(false);

  const handleContinue = useCallback(async () => {
    const clean = phone.replace(/\D/g, "").slice(-10);
    if (clean.length !== 10) { showToast("Enter valid 10-digit phone number"); return; }

    setLoading(true);
    try {
      // Call backend to send OTP
      await apiClient.post("/api/v1/auth/pos/auth/send-otp", { phone: clean });
      logger.debug("PhoneV3", `otp_sent:${clean}`);
      navigation.navigate("V3OTP", { phone: clean });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? "Failed to send OTP";
      showToast(msg);
      logger.debug("PhoneV3", `send_otp_failed:${clean}:${String(err)}`);
    }
    setLoading(false);
  }, [phone, navigation]);

  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.body}>
        {/* Logo */}
        <Svg width={64} height={64} viewBox="0 0 32 32">
          <Rect x={2} y={2} width={28} height={28} rx={8} fill="#2563EB" />
          <Rect x={9} y={9} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={14.4} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={19.8} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Circle cx={16} cy={25.3} r={2.1} fill="#fff" />
        </Svg>

        <Text style={styles.title}>Welcome!</Text>
        <Text style={styles.subtitle}>Enter your registered phone number to get started</Text>

        <View style={styles.form}>
          <Text style={styles.label}>PHONE NUMBER</Text>
          <View style={styles.phoneRow}>
            <View style={styles.prefix}><Text style={styles.prefixText}>+91</Text></View>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={(text) => {
                // GCP-STG-0479: Show hint when user types more than 10 digits
                const digits = text.replace(/\D/g, "");
                if (digits.length > 10) {
                  setShowPhoneHint(true);
                  setPhone(digits.slice(0, 10));
                } else {
                  setPhone(text);
                  if (digits.length <= 10) setShowPhoneHint(false);
                }
              }}
              placeholder="98765 43210"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              maxLength={12}
              autoFocus
              onSubmitEditing={handleContinue}
            />
          </View>
          {/* GCP-STG-0479: Hint for excess digits */}
          {showPhoneHint && (
            <Text style={styles.phoneHint}>Enter 10-digit number without country code</Text>
          )}
        </View>

        <Pressable
          style={[styles.continueBtn, loading && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.continueText}>Continue →</Text>}
        </Pressable>

        <Pressable style={styles.registerLink} onPress={() => Linking.openURL("https://supermandi.tech/retailer/register")}>
          <Text style={styles.registerText}>New store? <Text style={styles.registerBold}>Register here</Text></Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    body: { flex: 1, alignItems: "center", justifyContent: "center", padding: getScreenPadding() * 2 },
    title: { fontSize: 26, fontWeight: "900", color: colors.textPrimary, marginTop: 24, letterSpacing: -0.5 },
    subtitle: { fontSize: 14, color: colors.textTertiary, marginTop: 8, textAlign: "center", lineHeight: 20 },
    form: { width: "100%", marginTop: 32 },
    label: { fontSize: 10, fontWeight: "800", color: colors.textTertiary, letterSpacing: 0.5, marginBottom: 6 },
    phoneRow: { flexDirection: "row", gap: 8 },
    prefix: { paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.background, justifyContent: "center" },
    prefixText: { fontSize: 16, fontWeight: "600", color: colors.textTertiary },
    phoneInput: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: colors.border, fontSize: 18, fontWeight: "600", color: colors.textPrimary, backgroundColor: colors.background },
    continueBtn: { width: "100%", backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 16, alignItems: "center", marginTop: 24 },
    btnDisabled: { opacity: 0.6 },
    continueText: { fontSize: 17, fontWeight: "800", color: "#fff" },
    phoneHint: { fontSize: 12, color: "#E53E3E", marginTop: 4 },
    registerLink: { marginTop: 24 },
    registerText: { fontSize: 13, color: colors.textTertiary },
    registerBold: { color: colors.primary, fontWeight: "600" },
  });
}
