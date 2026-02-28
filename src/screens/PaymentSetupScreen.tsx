/**
 * #329-332: Post-Activation Payment Setup
 *
 * Shown once after POS activation if store has no UPI VPA set.
 * Retailer enters UPI VPA (required) + optional bank account details.
 * Can be skipped once — sets AsyncStorage flag so it won't show again.
 * If skipped, SellScan shows a banner prompting setup.
 */

import React, { useEffect, useMemo, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { updatePaymentSettings } from "../services/api/enrollApi";
import { ApiError } from "../services/api/apiClient";
import { theme, typography, spacing, useThemeColors } from "../theme";

type RootStackParamList = {
  PaymentSetup: undefined;
  SellScan: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "PaymentSetup">;

const PAYMENT_PROMPTED_KEY = "supermandi.payment_setup_prompted";

// Validation patterns (match backend)
const VPA_REGEX = /^[a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,}$/;
const BANK_ACCT_REGEX = /^\d{9,18}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export default function PaymentSetupScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation<Nav>();

  const [upiVpa, setUpiVpa] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // PAYMENT-SETUP-OFFLINE-CHECK-MISSING: track connectivity on mount and via listener
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    NetInfo.fetch().then((state) => setIsOffline(!state.isConnected));
    const unsubscribe = NetInfo.addEventListener((state) => setIsOffline(!state.isConnected));
    return () => unsubscribe();
  }, []);

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    const trimmedVpa = upiVpa.trim().toLowerCase();
    if (!trimmedVpa) {
      errs.upiVpa = "UPI ID is required";
    } else if (!VPA_REGEX.test(trimmedVpa) || trimmedVpa.length < 6 || trimmedVpa.length > 100) {
      errs.upiVpa = "Invalid UPI ID. Expected format: name@bank (e.g., store@ybl)";
    }

    if (bankAccount.trim()) {
      if (!BANK_ACCT_REGEX.test(bankAccount.trim())) {
        errs.bankAccount = "Bank account must be 9-18 digits";
      }
    }

    if (ifsc.trim()) {
      if (!IFSC_REGEX.test(ifsc.trim().toUpperCase())) {
        errs.ifsc = "Invalid IFSC. Expected format: SBIN0001234";
      }
    }

    return errs;
  }

  async function handleSave() {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    // DEPLOY-392: Check network before API call
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert("No Internet", "Please connect to the internet and try again.");
        return;
      }
    } catch {
      // NetInfo failed — proceed anyway
    }

    setSaving(true);

    try {
      await updatePaymentSettings({
        upiVpa: upiVpa.trim().toLowerCase(),
        bankAccountNumber: bankAccount.trim() || undefined,
        bankIfsc: ifsc.trim().toUpperCase() || undefined,
      });

      await AsyncStorage.setItem(PAYMENT_PROMPTED_KEY, "1");
      navigation.replace("SellScan");
    } catch (err) {
      // PAYMENT-SETUP-AUTH-ERROR-HANDLING: detect 401 and guide re-enrollment
      if (err instanceof ApiError && (err.status === 401 || err.message === "device_unauthorized")) {
        Alert.alert("Session Expired", "Your device session has expired. Please re-enroll this device to continue.");
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.message || "Failed to save payment settings"
          : "Network error. Check your connection and try again.";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    await AsyncStorage.setItem(PAYMENT_PROMPTED_KEY, "1");
    navigation.replace("SellScan");
  }

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      padding: spacing.lg,
      justifyContent: "center",
    },
    header: {
      alignItems: "center",
      marginBottom: spacing.xl,
    },
    title: {
      ...typography.h3,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    subtitle: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: "center",
    },
    form: {
      marginBottom: spacing.xl,
    },
    fieldGroup: {
      marginBottom: spacing.md,
    },
    label: {
      ...typography.caption,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    required: {
      color: colors.error,
    },
    input: {
      ...typography.body,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.borderRadius.md,
      padding: spacing.sm,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    inputError: {
      borderColor: colors.error,
    },
    errorText: {
      color: colors.error,
      fontSize: 12,
      marginTop: 4,
    },
    actions: {
      alignItems: "center",
    },
    saveButton: {
      backgroundColor: colors.primary,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.xl,
      borderRadius: theme.borderRadius.md,
      width: "100%",
      alignItems: "center",
      marginBottom: spacing.md,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      ...typography.button,
      color: colors.textInverse,
    },
    skipButton: {
      paddingVertical: spacing.sm,
      marginBottom: spacing.xs,
    },
    skipButtonText: {
      ...typography.body,
      color: colors.textSecondary,
      textDecorationLine: "underline",
    },
    skipHint: {
      color: colors.textTertiary,
      fontSize: 12,
      textAlign: "center",
    },
    offlineBanner: {
      backgroundColor: colors.warning + "20",
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: theme.borderRadius.md,
      padding: spacing.sm,
      marginBottom: spacing.md,
    },
    offlineBannerText: {
      ...typography.caption,
      color: colors.warning,
      textAlign: "center",
      fontWeight: "600",
    },
  }), [colors]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Set Up Payments</Text>
          <Text style={styles.subtitle}>
            Add your UPI ID to accept digital payments from customers
          </Text>
        </View>

        {/* PAYMENT-SETUP-OFFLINE-CHECK-MISSING: offline banner */}
        {isOffline && (
          <View style={styles.offlineBanner} testID="payment-offline-banner">
            <Text style={styles.offlineBannerText}>
              No internet connection. Connect to save payment settings.
            </Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          {/* UPI VPA */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              UPI ID (VPA) <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.upiVpa ? styles.inputError : null]}
              placeholder="yourname@upi"
              placeholderTextColor={colors.textTertiary}
              value={upiVpa}
              onChangeText={(t) => {
                setUpiVpa(t);
                if (errors.upiVpa) setErrors((e) => ({ ...e, upiVpa: "" }));
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!saving}
              testID="payment-upi-input"
              accessibilityLabel="UPI ID"
              accessibilityRole="text"
            />
            {errors.upiVpa ? (
              <Text style={styles.errorText}>{errors.upiVpa}</Text>
            ) : null}
          </View>

          {/* Bank Account */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Bank Account Number (optional)</Text>
            <TextInput
              style={[styles.input, errors.bankAccount ? styles.inputError : null]}
              placeholder="123456789012"
              placeholderTextColor={colors.textTertiary}
              value={bankAccount}
              onChangeText={(t) => {
                setBankAccount(t);
                if (errors.bankAccount) setErrors((e) => ({ ...e, bankAccount: "" }));
              }}
              keyboardType="number-pad"
              editable={!saving}
              testID="payment-bank-input"
              accessibilityLabel="Bank account number"
              accessibilityRole="text"
            />
            {errors.bankAccount ? (
              <Text style={styles.errorText}>{errors.bankAccount}</Text>
            ) : null}
          </View>

          {/* IFSC */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>IFSC Code (optional)</Text>
            <TextInput
              style={[styles.input, errors.ifsc ? styles.inputError : null]}
              placeholder="SBIN0001234"
              placeholderTextColor={colors.textTertiary}
              value={ifsc}
              onChangeText={(t) => {
                setIfsc(t.toUpperCase());
                if (errors.ifsc) setErrors((e) => ({ ...e, ifsc: "" }));
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!saving}
              testID="payment-ifsc-input"
              accessibilityLabel="IFSC code"
              accessibilityRole="text"
            />
            {errors.ifsc ? (
              <Text style={styles.errorText}>{errors.ifsc}</Text>
            ) : null}
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.saveButton, (saving || isOffline) && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving || isOffline}
            testID="payment-save-button"
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>Save & Continue</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={saving}
            testID="payment-skip-button"
          >
            <Text style={styles.skipButtonText}>Skip for Now</Text>
          </Pressable>

          <Text style={styles.skipHint}>
            You can set this up later from Settings
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
