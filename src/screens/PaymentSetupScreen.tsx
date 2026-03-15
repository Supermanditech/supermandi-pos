/**
 * #329-332: Post-Activation Payment Setup
 *
 * Shown once after POS activation if store has no UPI ID set.
 * Retailer enters UPI ID (required) + optional bank account details.
 * Can be skipped once — sets AsyncStorage flag so it won't show again.
 * If skipped, SellScan shows a banner prompting setup.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";

import { updatePaymentSettings } from "../services/api/enrollApi";
import { ApiError } from "../services/api/apiClient";
import { theme, typography, spacing, useThemeColors } from "../theme";
// STG-437: Store-scoped payment prompt key
import { getDeviceStoreId } from "../services/deviceSession";

type RootStackParamList = {
  PaymentSetup: undefined;
  SellScan: undefined;
  EnrollDevice: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "PaymentSetup">;

// STG-437: Store-scoped key to prevent cross-store persistence
const getPaymentPromptedKey = (storeId: string) => `supermandi.payment_setup_prompted.${storeId}`;

// Validation patterns (match backend)
const VPA_REGEX = /^[a-zA-Z0-9._-]{3,}@[a-zA-Z0-9]{2,}$/;
const BANK_ACCT_REGEX = /^\d{9,18}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export default function PaymentSetupScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();

  const [upiVpa, setUpiVpa] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // PAYMENT-SETUP-OFFLINE-CHECK-MISSING: track connectivity on mount and via listener
  const [isOffline, setIsOffline] = useState(false);

  // STG-529: useCallback so BackHandler useEffect gets stable reference
  const handleSkip = useCallback(async () => {
    try {
      const storeId = await getDeviceStoreId();
      if (storeId) await AsyncStorage.setItem(getPaymentPromptedKey(storeId), "1");
    } catch {
      // Best-effort — skip flag not critical, continue to SellScan
    }
    navigation.replace("SellScan");
  }, [navigation]);

  useEffect(() => {
    NetInfo.fetch().then((state) => setIsOffline(!state.isConnected));
    const unsubscribe = NetInfo.addEventListener((state) => setIsOffline(!state.isConnected));
    return () => unsubscribe();
  }, []);

  // Trap Android back button — skip setup rather than going to a dead-end
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleSkip();
      return true;
    });
    return () => sub.remove();
  }, [handleSkip]); // STG-529: include handleSkip to avoid stale closure

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};

    const trimmedVpa = upiVpa.trim().toLowerCase();
    if (!trimmedVpa) {
      errs.upiVpa = t("paymentSetup.validationUpiRequired");
    } else if (!VPA_REGEX.test(trimmedVpa) || trimmedVpa.length < 6 || trimmedVpa.length > 100) {
      errs.upiVpa = t("paymentSetup.validationUpiInvalid");
    }

    if (bankAccount.trim()) {
      if (!BANK_ACCT_REGEX.test(bankAccount.trim())) {
        errs.bankAccount = t("paymentSetup.validationBankAccount");
      }
    }

    if (ifsc.trim()) {
      if (!IFSC_REGEX.test(ifsc.trim().toUpperCase())) {
        errs.ifsc = t("paymentSetup.validationIfsc");
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
        Alert.alert(t("paymentSetup.noInternetTitle"), t("paymentSetup.noInternetMessage"));
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

      // STG-314: Show success toast after saving payment settings
      Alert.alert(t("paymentSetup.saveSuccess"));

      const storeId = await getDeviceStoreId();
      if (storeId) await AsyncStorage.setItem(getPaymentPromptedKey(storeId), "1");
      navigation.replace("SellScan");
    } catch (err) {
      // PAYMENT-SETUP-AUTH-ERROR-HANDLING: detect 401 and guide re-enrollment
      // STG-438: Navigate to EnrollDevice on dismiss so user isn't trapped
      if (err instanceof ApiError && (err.status === 401 || err.message === "device_unauthorized")) {
        Alert.alert(t("paymentSetup.sessionExpiredTitle"), t("paymentSetup.sessionExpiredMessage"), [
          { text: t("common.ok"), onPress: () => navigation.replace("EnrollDevice") },
        ]);
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.message || t("paymentSetup.saveFailed")
          : t("paymentSetup.networkError");
      Alert.alert(t("paymentSetup.errorTitle"), msg);
    } finally {
      setSaving(false);
    }
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
    // STG-280: Hint text for plain-language guidance
    hintText: {
      color: colors.textTertiary,
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
          <Text style={styles.title}>{t("paymentSetup.title")}</Text>
          <Text style={styles.subtitle}>
            {t("paymentSetup.subtitle")}
          </Text>
        </View>

        {/* PAYMENT-SETUP-OFFLINE-CHECK-MISSING: offline banner */}
        {isOffline && (
          <View style={styles.offlineBanner} testID="payment-offline-banner">
            <Text style={styles.offlineBannerText}>
              {t("paymentSetup.offlineBanner")}
            </Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          {/* STG-280: UPI ID — plain language, no VPA jargon */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {t("paymentSetup.upiLabel")} <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.upiVpa ? styles.inputError : null]}
              placeholder={t("paymentSetup.upiPlaceholder")}
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
              accessibilityLabel={t("paymentSetup.upiAccessibility")}
              accessibilityRole="text"
            />
            {/* STG-280: Helpful hint for non-technical store owners */}
            {!errors.upiVpa && (
              <Text style={styles.hintText}>{t("paymentSetup.upiHint")}</Text>
            )}
            {errors.upiVpa ? (
              <Text style={styles.errorText}>{errors.upiVpa}</Text>
            ) : null}
          </View>

          {/* Bank Account */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("paymentSetup.bankAccountLabel")}</Text>
            <TextInput
              style={[styles.input, errors.bankAccount ? styles.inputError : null]}
              placeholder={t("paymentSetup.bankAccountPlaceholder")}
              placeholderTextColor={colors.textTertiary}
              value={bankAccount}
              onChangeText={(t) => {
                setBankAccount(t);
                if (errors.bankAccount) setErrors((e) => ({ ...e, bankAccount: "" }));
              }}
              keyboardType="number-pad"
              editable={!saving}
              testID="payment-bank-input"
              accessibilityLabel={t("paymentSetup.bankAccountAccessibility")}
              accessibilityRole="text"
            />
            {errors.bankAccount ? (
              <Text style={styles.errorText}>{errors.bankAccount}</Text>
            ) : null}
          </View>

          {/* IFSC */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t("paymentSetup.ifscLabel")}</Text>
            <TextInput
              style={[styles.input, errors.ifsc ? styles.inputError : null]}
              placeholder={t("paymentSetup.ifscPlaceholder")}
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
              accessibilityLabel={t("paymentSetup.ifscAccessibility")}
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
            accessibilityLabel={saving ? t("paymentSetup.savingAccessibility") : t("paymentSetup.saveAccessibility")}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || isOffline }}
          >
            {saving ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <Text style={styles.saveButtonText}>{t("paymentSetup.saveButton")}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={saving}
            testID="payment-skip-button"
            accessibilityLabel={t("paymentSetup.skipAccessibility")}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
          >
            <Text style={styles.skipButtonText}>{t("paymentSetup.skipButton")}</Text>
          </Pressable>

          <Text style={styles.skipHint}>
            {t("paymentSetup.skipHint")}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
