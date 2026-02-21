// SA-P1-001: Staff PIN login screen
import React, { useState, useRef } from "react";
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

import { theme } from "../theme";
import { staffLogin } from "../services/api/staffApi";
import { useStaffSessionStore } from "../stores/staffSessionStore";
import type { StaffRole } from "../stores/staffSessionStore";
import BrandShortmark from "../components/BrandShortmark";

type Props = {
  storeName: string | null;
};

export default function StaffLoginScreen({ storeName }: Props) {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const pinRef = useRef<TextInput>(null);
  const setSession = useStaffSessionStore((s) => s.setSession);

  const handleLogin = async () => {
    const trimmedPhone = phone.trim();
    const trimmedPin = pin.trim();

    if (!trimmedPhone || trimmedPhone.length < 10) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit phone number.");
      return;
    }
    if (!trimmedPin || !/^\d{4,6}$/.test(trimmedPin)) {
      Alert.alert("Invalid PIN", "PIN must be 4-6 digits.");
      return;
    }

    setLoading(true);
    try {
      const result = await staffLogin({ phone: trimmedPhone, pin: trimmedPin });
      setSession({
        staffId: result.staffId,
        name: result.name,
        role: result.role as StaffRole,
      });
    } catch (err: any) {
      const code = err?.body?.error?.code || err?.message;
      if (code === "STAFF_INVALID_CREDENTIALS") {
        Alert.alert("Login Failed", "Invalid phone or PIN. Please try again.");
      } else {
        Alert.alert("Login Failed", "Could not log in. Please check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

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
            backgroundColor={theme.colors.primary}
            lineColor={theme.colors.textInverse}
            dotColor={theme.colors.textInverse}
            radius={8}
          />
          <Text style={styles.brandPillText}>SuperMandi</Text>
        </View>
        <View style={styles.iconWrap} accessibilityElementsHidden>
          <MaterialCommunityIcons name="account-lock" size={48} color={theme.colors.primary} />
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
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit phone number"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="phone-pad"
            maxLength={10}
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
            placeholderTextColor={theme.colors.textTertiary}
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
          style={[styles.loginButton, loading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          testID="staff-login-btn"
          accessibilityLabel={loading ? "Logging in" : "Login"}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.textInverse} size="small" />
          ) : (
            <Text style={styles.loginButtonText}>Login</Text>
          )}
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    backgroundColor: theme.colors.primary,
    color: theme.colors.textInverse,
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
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  storeName: {
    ...theme.typography.caption,
    fontWeight: "600",
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
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
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.typography.bodySmall,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
  },
  loginButton: {
    width: "100%",
    backgroundColor: theme.colors.primary,
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
    color: theme.colors.textInverse,
  },
});
