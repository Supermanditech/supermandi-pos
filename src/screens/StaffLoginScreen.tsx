// SA-P1-001: Staff PIN login screen
import React, { useState, useRef } from "react";
import {
  Alert,
  Pressable,
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
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="account-lock" size={48} color={theme.colors.primary} />
        </View>

        <Text style={styles.title}>Staff Login</Text>
        {storeName && <Text style={styles.storeName}>{storeName}</Text>}
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
          />
        </View>

        <Pressable
          style={[styles.loginButton, loading && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.loginButtonText}>
            {loading ? "Logging in..." : "Login"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  storeName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 24,
    textAlign: "center",
  },
  inputGroup: {
    width: "100%",
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
  },
  loginButton: {
    width: "100%",
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textInverse,
  },
});
