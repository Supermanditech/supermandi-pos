// SA-P1-001: Staff PIN login screen
// BLK-POS-UX1: Added back/switch-store button
// BLK-POS-UX2: Added pull-to-refresh
import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import NetInfo from "@react-native-community/netinfo";
import { theme, useThemeColors } from "../theme";
import { staffLogin, staffMe } from "../services/api/staffApi";
import { useStaffSessionStore } from "../stores/staffSessionStore";
import type { StaffRole } from "../stores/staffSessionStore";
import { clearDeviceSession } from "../services/deviceSession";
import BrandShortmark from "../components/BrandShortmark";

type Props = {
  storeName: string | null;
  onSwitchStore?: () => void;
};

export default function StaffLoginScreen({ storeName, onSwitchStore }: Props) {
  const colors = useThemeColors();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pinRef = useRef<TextInput>(null);
  const setSession = useStaffSessionStore((s) => s.setSession);

  // ISSUE-081: Client-side rate limiting
  const [cooldown, setCooldown] = useState(false);
  // STG-327: Countdown seconds for button text
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const failCountRef = useRef(0);
  // ISSUE-127: Ref-based guard to prevent double submission via keyboard onSubmitEditing
  const loginInFlightRef = useRef(false);

  // BLK-POS-UX2: Pull-to-refresh — resets error state and cooldown
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    failCountRef.current = 0;
    setCooldown(false);
    // Brief visual feedback
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // BLK-POS-UX1: Switch store / re-enroll
  const handleSwitchStore = useCallback(() => {
    Alert.alert(
      "Switch Store?",
      "This will sign you out and clear device enrollment. You'll need a new enrollment code.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch Store",
          style: "destructive",
          onPress: async () => {
            try {
              await clearDeviceSession();
              onSwitchStore?.();
            } catch {
              Alert.alert("Error", "Failed to clear session. Please restart the app.");
            }
          },
        },
      ]
    );
  }, [onSwitchStore]);

  const handleLogin = useCallback(async () => {
    if (loginInFlightRef.current) return; // ISSUE-127: Block re-entry during active login
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

    loginInFlightRef.current = true; // ISSUE-127
    setLoading(true);
    try {
      // STG-162: Send normalized 10-digit phone (strip +91/91 prefix) since DB stores 10-digit
      const result = await staffLogin({ phone: phone10, pin: trimmedPin });
      failCountRef.current = 0;
      // STG-102: Fetch max discount limit from /staff/me after login
      let maxDiscountPct = 100; // Default: no limit
      try {
        const meResult = await staffMe();
        maxDiscountPct = meResult.maxDiscountPct;
      } catch {
        // Non-blocking: if /me fails, default to 100% (no limit)
      }
      setSession({
        staffId: result.staffId,
        name: result.name,
        role: result.role as StaffRole,
        maxDiscountPct,
      });
    } catch (err: any) {
      // ISSUE-081: Increase cooldown on repeated failures
      // STG-327: Show countdown seconds on button
      failCountRef.current += 1;
      const cooldownMs = Math.min(failCountRef.current * 3000, 15000);
      const totalSeconds = Math.ceil(cooldownMs / 1000);
      setCooldown(true);
      setCooldownSeconds(totalSeconds);
      let remaining = totalSeconds;
      const interval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(interval);
          setCooldown(false);
          setCooldownSeconds(0);
        } else {
          setCooldownSeconds(remaining);
        }
      }, 1000);

      const code = err?.body?.error?.code || err?.message;
      if (code === "STAFF_INVALID_CREDENTIALS") {
        Alert.alert("Login Failed", "Invalid phone or PIN. Please try again.");
      } else {
        Alert.alert("Login Failed", "Could not log in. Please check your connection and try again.");
      }
    } finally {
      loginInFlightRef.current = false; // ISSUE-127
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
    switchStoreButton: {
      marginTop: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      alignItems: "center" as const,
    },
    switchStoreText: {
      ...theme.typography.caption,
      color: colors.textSecondary,
      textDecorationLine: "underline" as const,
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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
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
          ) : cooldown ? (
            <Text style={styles.loginButtonText}>Wait {cooldownSeconds}s</Text>
          ) : (
            <Text style={styles.loginButtonText}>Login</Text>
          )}
        </Pressable>

        {/* BLK-POS-UX1: Switch store / back navigation */}
        <Pressable
          style={styles.switchStoreButton}
          onPress={handleSwitchStore}
          testID="staff-login-switch-store"
          accessibilityLabel="Switch store or re-enroll"
          accessibilityRole="button"
        >
          <Text style={styles.switchStoreText}>Switch Store / Re-enroll</Text>
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
