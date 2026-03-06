// SA-P1-001: Staff PIN login screen
import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import NetInfo from "@react-native-community/netinfo";
import { theme, useThemeColors } from "../theme";
import { staffLogin } from "../services/api/staffApi";
import { useStaffSessionStore } from "../stores/staffSessionStore";
import type { StaffRole } from "../stores/staffSessionStore";
import BrandShortmark from "../components/BrandShortmark";

type Props = {
  storeName: string | null;
};

export default function StaffLoginScreen({ storeName }: Props) {
  const colors = useThemeColors();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const pinRef = useRef<TextInput>(null);
  const setSession = useStaffSessionStore((s) => s.setSession);

  // ISSUE-081: Client-side rate limiting
  const [cooldown, setCooldown] = useState(false);
  const failCountRef = useRef(0);

  const handleLogin = useCallback(async () => {
    if (cooldown) return; // ISSUE-081: Throttle rapid submissions
    const trimmedPhone = phone.trim();
    const trimmedPin = pin.trim();

    // LIVE.POS.PHONE_VALIDATION_STRICT_REGEX.001: Strict Indian mobile number validation
    const phone10 = trimmedPhone.replace(/^\+91/, '').replace(/^91/, '');
    if (phone10.length !== 10 || !/^[6-9]\d{9}$/.test(phone10)) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!trimmedPin || !/^\d{4,6}$/.test(trimmedPin)) {
      Alert.alert("Invalid PIN", "PIN must be 4-6 digits.");
      return;
    }

    // ISSUE-080: Check network before API call
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert("No Connection", "Please connect to the internet to log in.");
        return;
      }
    } catch { /* NetInfo failed — proceed */ }

    setLoading(true);
    try {
      // STG-162: Send normalized 10-digit phone (strip +91/91 prefix) since DB stores 10-digit
      const result = await staffLogin({ phone: phone10, pin: trimmedPin });
      failCountRef.current = 0;
      setSession({
        staffId: result.staffId,
        name: result.name,
        role: result.role as StaffRole,
      });
    } catch (err: any) {
      // ISSUE-081: Increase cooldown on repeated failures
      failCountRef.current += 1;
      const cooldownMs = Math.min(failCountRef.current * 3000, 15000);
      setCooldown(true);
      setTimeout(() => setCooldown(false), cooldownMs);

      const code = err?.body?.error?.code || err?.message;
      if (code === "STAFF_INVALID_CREDENTIALS") {
        Alert.alert("Login Failed", "Invalid phone or PIN. Please try again.");
      } else {
        Alert.alert("Login Failed", "Could not log in. Please check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [phone, pin, cooldown, setSession]);

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: theme.spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: theme.spacing.lg,
      alignItems: "center",
    },
    brandLockup: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    brandPillText: {
      backgroundColor: colors.primary,
      color: colors.textInverse,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 4,
      borderRadius: 999,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    iconWrap: {
      marginBottom: theme.spacing.md,
    },
    title: {
      ...theme.typography.h4,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    storeName: {
      ...theme.typography.caption,
      fontWeight: "600",
      color: colors.primary,
      marginBottom: theme.spacing.xs,
    },
    subtitle: {
      ...theme.typography.caption,
      color: colors.textSecondary,
      marginBottom: theme.spacing.lg,
      textAlign: "center",
    },
    inputGroup: {
      width: "100%",
      marginBottom: theme.spacing.md,
    },
    label: {
      ...theme.typography.caption,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    input: {
      width: "100%",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.borderRadius.lg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      ...theme.typography.bodySmall,
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    loginButton: {
      width: "100%",
      backgroundColor: colors.primary,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing.md,
      alignItems: "center",
      justifyContent: "center",
      marginTop: theme.spacing.sm,
      height: 52,
    },
    loginButtonDisabled: {
      opacity: 0.6,
    },
    loginButtonText: {
      ...theme.typography.button,
      color: colors.textInverse,
    },
  }), [colors]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="staff-login-screen"
      accessibilityLabel="Staff login screen"
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.card} testID="staff-login-card">
        <View style={styles.brandLockup}>
          <BrandShortmark
            size={30}
            backgroundColor={colors.primary}
            lineColor={colors.textInverse}
            dotColor={colors.textInverse}
            radius={8}
          />
          <Text style={styles.brandPillText}>SuperMandi</Text>
        </View>
        <View style={styles.iconWrap} accessibilityElementsHidden>
          <MaterialCommunityIcons name="account-lock" size={48} color={colors.primary} />
        </View>

        <Text
          style={styles.title}
          testID="staff-login-title"
          accessibilityRole="header"
        >
          Staff Login
        </Text>
        {storeName && (
          <Text style={styles.storeName} testID="staff-login-store-name">
            {storeName}
          </Text>
        )}
        <Text style={styles.subtitle}>Enter your phone number and PIN to continue</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone Number</Text>
          {/* REQ.AUDIT.W5.POS.STAFF-PHONE-VALIDATION-INTL-FORMAT.001: accept +91 prefix */}
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit phone (or +91...)"
            placeholderTextColor={colors.textTertiary}
            keyboardType="phone-pad"
            maxLength={13}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => pinRef.current?.focus()}
            testID="staff-login-phone-input"
            accessibilityLabel="Phone number"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>PIN</Text>
          <TextInput
            ref={pinRef}
            style={styles.input}
            value={pin}
            onChangeText={setPin}
            placeholder="4-6 digit PIN"
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            testID="staff-login-pin-input"
            accessibilityLabel="PIN"
          />
        </View>

        <Pressable
          style={[styles.loginButton, (loading || cooldown) && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={loading || cooldown}
          testID="staff-login-btn"
          accessibilityLabel={loading ? "Logging in" : cooldown ? "Please wait" : "Login"}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={styles.loginButtonText}>Login</Text>
          )}
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
