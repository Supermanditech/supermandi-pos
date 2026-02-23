/**
 * #329-332: POS Activation Screen with Phone Lookup
 *
 * After registration on Retailer Web + SuperAdmin approval:
 * 1. Primary: Enter phone number → auto-fetch activation code → activate
 * 2. Fallback: Manual code entry (for deep links, admin-shared codes)
 *
 * Post-activation: Routes to PaymentSetup if no UPI VPA set, else SellScan.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Linking,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { enrollDevice, lookupActivation } from "../services/api/enrollApi";
import { getDeviceSession, saveDeviceSession, clearDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { POS_MESSAGES } from "../utils/uiStatus";
import { theme, colors, typography, spacing, useThemeColors } from "../theme";
import { API_BASE_URL, BUILD_INFO, TEST_STORE_CONFIG } from "../config/api";
import { logPosEvent } from "../services/cloudEventLogger";
import { useCartStore } from "../stores/cartStore";
import { usePurchaseDraftStore } from "../stores/purchaseDraftStore";
import { useProductsStore } from "../stores/productsStore";
import { useSettingsStore } from "../stores/settingsStore";
import BrandShortmark from "../components/BrandShortmark";

type RootStackParamList = {
  EnrollDevice: { enrollmentCode?: string; code?: string } | undefined;
  SellScan: undefined;
  PaymentSetup: undefined;
  ForceUpdate: { currentVersion?: string; requiredVersion?: string };
  DeviceBlocked: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "EnrollDevice">;
type EnrollRoute = RouteProp<RootStackParamList, "EnrollDevice">;

// Error codes from backend
const ENROLL_ERROR_MESSAGES: Record<string, { message: string; hint?: string }> = {
  CODE_REQUIRED: { message: "Enter your activation code." },
  ENROLLMENT_CODE_INVALID: {
    message: "Activation code is invalid.",
    hint: "Check the code and try again, or contact support for a new code."
  },
  ENROLLMENT_CODE_EXPIRED: {
    message: "This activation code has expired.",
    hint: "Contact support to get a new activation code."
  },
  ENROLLMENT_CODE_USED: {
    message: "This activation code has already been used.",
    hint: "Contact support to get a new activation code."
  },
  ENROLLMENT_CODE_REVOKED: {
    message: "This activation code has been revoked.",
    hint: "Contact support to get a new activation code."
  },
  STORE_NOT_FOUND: {
    message: "Store not found for this code.",
    hint: "Verify the code with support."
  },
  STORE_INACTIVE: {
    message: "This store is not active yet.",
    hint: "Your registration may still be pending approval. Contact hello@supermandi.tech for help."
  },
  DATABASE_UNAVAILABLE: {
    message: "Server temporarily unavailable.",
    hint: "Wait a minute and try again."
  },
  ENROLLMENT_FAILED: {
    message: "Could not activate the device.",
    hint: "Try again. If the problem persists, contact support."
  },
  ENROLLMENT_RATE_LIMITED: {
    message: "Too many attempts.",
    hint: "Please wait 15 minutes before trying again."
  },
  LABEL_REQUIRED: {
    message: "Device name is required.",
    hint: "Enter a name for this POS device (e.g., Counter-1)."
  },
  LABEL_DUPLICATE: {
    message: "A device with this name already exists in your store.",
    hint: "Choose a different name (e.g., Counter-2, Billing-2)."
  },
  DEVICE_LIMIT_EXCEEDED: {
    message: "Maximum devices reached for this store.",
    hint: "Contact support to increase your device limit."
  },
  DEVICE_FINGERPRINT_INVALID: {
    message: "Device fingerprint is invalid.",
    hint: "Reinstall the app and try again."
  },
  DEVICE_TYPE_REQUIRED: {
    message: "Device type could not be detected.",
    hint: "Reinstall the app and try again."
  },
  DEVICE_TYPE_INVALID: {
    message: "Device type is not supported.",
    hint: "Contact support for assistance."
  },
  PRINTING_MODE_INVALID: {
    message: "Printing mode is not supported.",
    hint: "Contact support for assistance."
  },
  DAILY_ENROLLMENT_LIMIT: {
    message: "Daily activation limit reached for this store.",
    hint: "Please try again tomorrow or contact support."
  },
  // Phone lookup error codes (from /pos/phone-lookup endpoint)
  PHONE_REQUIRED: { message: "Phone number is required.", hint: "Enter your 10-digit mobile number." },
  PHONE_INVALID: { message: "Enter a valid 10-digit Indian mobile number.", hint: "Phone number must start with 6-9." },
  LOOKUP_FAILED: { message: "Could not look up your phone number.", hint: "Try again. If the problem persists, contact support." },
  // Legacy error codes
  enrollment_invalid: { message: "Activation code is invalid or expired.", hint: "Contact support for a new code." },
  enrollment_expired: { message: "This activation code has expired.", hint: "Contact support for a new code." },
  enrollment_used: { message: "This activation code has already been used.", hint: "Contact support for a new code." },
  enrollment_revoked: { message: "This activation code has been revoked.", hint: "Contact support for a new code." },
  network_error: { message: "Could not connect to the server.", hint: "Check your internet connection and try again." },
  timeout: { message: "Request timed out.", hint: "Check your connection and try again." },
};

function parseActivationCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    if (code) return code.trim().toUpperCase();
  } catch {
    // fall through to raw code
  }
  return trimmed.toUpperCase();
}

function getAppVersion(): string {
  const v = (Constants.expoConfig as any)?.version ?? (Constants.manifest as any)?.version;
  return typeof v === "string" && v.trim() ? v.trim() : "unknown";
}

// expo-updates disabled for development
const Updates = { channel: null as string | null };

const PAYMENT_PROMPTED_KEY = "supermandi.payment_setup_prompted";

export default function EnrollDeviceScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<EnrollRoute>();
  // LIVE.POS.BUILDSTAMP.RUNTIME_GCP_PARITY.001: Theme-aware build stamp
  const tc = useThemeColors();
  const buildShaLabel = String((BUILD_INFO as any).gitSha || (BUILD_INFO as any).version || "unknown");
  const buildTimeLabel = String((BUILD_INFO as any).buildTime || (BUILD_INFO as any).buildDate || "unknown");
  // #342: Accept both ?enrollmentCode=X and ?code=X from deep links
  const [codeInput, setCodeInput] = useState(route.params?.enrollmentCode || route.params?.code || "");
  const [loading, setLoading] = useState(false);

  // Phone lookup state
  const [phoneInput, setPhoneInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStoreName, setLookupStoreName] = useState("");
  const [lookupError, setLookupError] = useState("");

  // #404: Device label (required by backend for device identification)
  // Default to device model name for convenience
  const defaultLabel = Device.modelName || Device.deviceName || "";
  const [labelInput, setLabelInput] = useState(defaultLabel);

  const deviceMeta = useMemo(() => ({
    manufacturer: Device.manufacturer ?? null,
    model: Device.modelName ?? Device.deviceName ?? Constants.deviceName ?? null,
    androidVersion: Platform.OS === "android" ? String(Platform.Version) : Device.osVersion ?? null,
    appVersion: getAppVersion(),
    // #404: label is set dynamically, not memoized — added at call site
  }), []);

  // Check existing session on mount — skip to SellScan if already enrolled
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await getDeviceSession();
      if (cancelled || !session) return;
      navigation.replace("SellScan");
    })();
    return () => { cancelled = true; };
  }, [navigation]);

  // Deep link support
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const code = parseActivationCode(url);
      if (code) setCodeInput(code);
    };

    Linking.getInitialURL().then(handleUrl).catch(() => undefined);
    const subscription = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  const handleLookup = useCallback(async () => {
    // Strip non-digit chars and validate
    const digits = phoneInput.replace(/\D/g, "");
    let phone10 = digits;
    if (digits.length === 12 && digits.startsWith("91")) {
      phone10 = digits.slice(2);
    } else if (digits.length === 13 && digits.startsWith("+91")) {
      phone10 = digits.slice(3);
    }
    if (phone10.length !== 10 || !/^[6-9]/.test(phone10)) {
      setLookupError("Enter a valid 10-digit mobile number");
      return;
    }

    // Offline check
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        setLookupError("No internet connection. Connect and try again.");
        return;
      }
    } catch {
      // proceed
    }

    setLookupLoading(true);
    setLookupError("");
    setLookupStoreName("");

    try {
      const result = await lookupActivation(phone10);
      setCodeInput(result.code);
      setLookupStoreName(result.storeName);
      // POS-1: Show code + store name, let user confirm before activating
      // (removed auto-activate — user must press "Activate" button)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message === "STORE_NOT_FOUND") {
          setLookupError("No store found for this phone number. Your registration may be pending approval, or register at supermandi.tech/retailer/register.");
        } else if (err.message === "NO_ACTIVE_CODE") {
          setLookupError("Your store is pending approval. Contact SuperMandi support.");
        } else if (err.status === 429) {
          setLookupError("Too many attempts. Please wait a few minutes.");
        } else {
          setLookupError(err.message || "Lookup failed. Try entering the code manually.");
        }
      } else {
        setLookupError("Network error. Check your connection and try again.");
      }
    } finally {
      setLookupLoading(false);
    }
  }, [phoneInput]);

  // Ref for auto-activate callback (avoids stale closure in timer)
  const handleActivateRef = useRef<(() => void) | null>(null);

  const handleActivate = useCallback(async () => {
    const activationCode = parseActivationCode(codeInput);
    if (!activationCode) {
      Alert.alert("Missing Code", "Enter your phone number above to look up the code, or enter it manually.");
      return;
    }

    // #404: Validate label (required by backend)
    const trimmedLabel = labelInput.trim();
    if (!trimmedLabel) {
      Alert.alert("Device Name Required", "Enter a name for this POS device (e.g., Counter-1, Billing-Main).");
      return;
    }

    // Offline detection
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert(
          "No Internet",
          "Activation requires a network connection. Please connect to the internet and try again."
        );
        return;
      }
    } catch {
      // NetInfo failed — proceed anyway
    }

    setLoading(true);
    try {
      if (__DEV__) {
        console.log("[Activate] Payload:", { activationCode, deviceMeta });
      }

      const previousSession = await getDeviceSession();
      const previousStoreId = previousSession?.storeId ?? null;
      const res = await enrollDevice({ enrollmentCode: activationCode, deviceMeta: { ...deviceMeta, label: trimmedLabel } });
      const storeChanged = previousStoreId !== res.storeId;

      if (storeChanged) {
        useCartStore.getState().resetForStore();
        usePurchaseDraftStore.getState().resetForStore();
        useProductsStore.getState().resetForStore();
      }

      await saveDeviceSession({
        deviceId: res.deviceId,
        storeId: res.storeId,
        deviceToken: res.deviceToken,
        deviceType: "RETAILER_PHONE",
      });
      console.log(`[Activate] Success: token saved (len=${res.deviceToken?.length ?? 0})`);

      // Go-Live invariant check
      try {
        console.log("[Activate] Running invariant check: calling ui-status...");
        const uiStatus = await fetchUiStatus();
        if (uiStatus.storeActive === false) {
          console.log("[Activate] Store is inactive");
        } else {
          console.log("[Activate] Invariant check PASSED");
        }
      } catch (invariantError) {
        console.error("[Activate] INVARIANT CHECK FAILED:", invariantError);
        const is401 = invariantError instanceof ApiError &&
          (invariantError.status === 401 || invariantError.message === "DEVICE_SESSION_MISSING" || invariantError.message === "device_unauthorized");
        if (is401) {
          await clearDeviceSession();
          Alert.alert(
            "Activation Failed",
            "Token was saved but is not valid. Please try again. If this persists, contact support.",
            [{ text: "OK" }]
          );
          return;
        }
        console.warn("[Activate] Non-critical invariant check error:", invariantError);
      }

      // Persist store info
      const { setStoreName, setStoreCode } = useSettingsStore.getState();
      if (res.storeName) setStoreName(res.storeName);
      if (res.storeCode) setStoreCode(res.storeCode);

      if (storeChanged) {
        void logPosEvent("STORE_SWITCH", {
          previousStoreId,
          nextStoreId: res.storeId,
          reason: "activation",
        });
      }

      if (typeof res.activeDeviceCount === "number" && res.activeDeviceCount > 1) {
        Alert.alert(
          "Multiple Devices",
          `This store has ${res.activeDeviceCount} active POS devices. Contact support if this is unexpected.`
        );
      }
      if (!res.storeActive) {
        Alert.alert("Store Inactive", POS_MESSAGES.storeInactive);
      }

      // #329-332: Route to PaymentSetup if no UPI VPA set (prompted once)
      const needsPaymentSetup = !res.upiVpa;
      const alreadyPrompted = await AsyncStorage.getItem(PAYMENT_PROMPTED_KEY);
      if (needsPaymentSetup && !alreadyPrompted) {
        navigation.replace("PaymentSetup");
      } else {
        navigation.replace("SellScan");
      }
    } catch (error) {
      let errorKey = "ENROLLMENT_FAILED";
      let rawMessage = "";

      if (error instanceof TypeError && error.message?.includes("Network")) {
        errorKey = "network_error";
        rawMessage = error.message;
      } else if (error instanceof Error && error.message?.toLowerCase().includes("timeout")) {
        errorKey = "timeout";
        rawMessage = error.message;
      } else if (error instanceof ApiError) {
        rawMessage = error.message || "unknown_error";
        errorKey = rawMessage;
      } else {
        rawMessage = error instanceof Error ? error.message : "unknown error";
      }

      const errorInfo = ENROLL_ERROR_MESSAGES[errorKey];
      const message = errorInfo?.message ?? "Unable to activate device.";
      const hint = errorInfo?.hint ?? "Try again or contact support.";

      const debugParts: string[] = [];
      if (error instanceof ApiError && error.status) debugParts.push(`status: ${error.status}`);
      debugParts.push(`code: ${rawMessage || errorKey}`);
      debugParts.push(`api: ${API_BASE_URL}`);
      if (Updates.channel) debugParts.push(`channel: ${Updates.channel}`);

      Alert.alert("Activation Failed", `${message}\n\n${hint}\n\n(${debugParts.join(", ")})`);
    } finally {
      setLoading(false);
    }
  }, [codeInput, labelInput, deviceMeta, navigation]);

  // Keep ref current for auto-activate timer
  handleActivateRef.current = handleActivate;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      testID="enroll-device-screen"
      accessibilityLabel="Activate POS device screen"
    >
      {/* Header */}
      <View style={styles.headerSection}>
        <View style={styles.brandLockup}>
          <BrandShortmark
            size={36}
            backgroundColor={colors.primary}
            lineColor={colors.textInverse}
            dotColor={colors.textInverse}
            radius={9}
          />
          <Text style={styles.brandPillText}>SuperMandi</Text>
        </View>
        <Text style={styles.title} testID="enroll-title" accessibilityRole="header">
          Activate Your POS
        </Text>
        <Text style={styles.subtitle} testID="enroll-subtitle">
          Enter your registered phone number to activate, or enter the code manually.
        </Text>
      </View>

      {/* Phone Lookup Section */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>Registered Phone Number</Text>
        <TextInput
          style={styles.phoneInput}
          placeholder="+91 98765 43210"
          keyboardType="phone-pad"
          value={phoneInput}
          onChangeText={(t) => {
            setPhoneInput(t);
            if (lookupError) setLookupError("");
            // POS-4: Only clear code if phone actually changed (not on focus)
            if (lookupStoreName && t !== phoneInput) {
              setLookupStoreName("");
              setCodeInput("");
            }
          }}
          testID="enroll-phone-input"
          accessibilityLabel="Registered phone number"
          autoFocus={!codeInput}
          editable={!lookupLoading && !loading}
        />

        {lookupStoreName ? (
          <View style={styles.lookupSuccess}>
            <Text style={styles.lookupSuccessText}>
              Store found: {lookupStoreName} ✓
            </Text>
          </View>
        ) : null}

        {lookupError ? (
          <Text style={styles.lookupErrorText}>{lookupError}</Text>
        ) : null}

        <Pressable
          style={[styles.lookupButton, (lookupLoading || loading) && styles.buttonDisabled]}
          onPress={handleLookup}
          disabled={lookupLoading || loading}
          testID="enroll-lookup-button"
          accessibilityLabel={lookupLoading ? "Looking up code" : "Look up my code"}
          accessibilityRole="button"
        >
          {lookupLoading ? (
            <View style={styles.activatingRow}>
              <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: spacing.xs }} />
              <Text style={styles.lookupButtonText}>Looking up...</Text>
            </View>
          ) : (
            <Text style={styles.lookupButtonText}>Look Up My Code</Text>
          )}
        </Pressable>
      </View>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or enter code manually</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Manual Code Input */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>Activation Code</Text>
        <TextInput
          style={styles.codeInput}
          placeholder="SM-XXXXXX"
          autoCapitalize="characters"
          value={codeInput}
          onChangeText={setCodeInput}
          testID="enroll-code-input"
          accessibilityLabel="Activation code"
          returnKeyType="next"
          editable={!loading}
        />
      </View>

      {/* #404: Device Label (required) */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>
          Device Name <Text style={styles.requiredMark}>*</Text>
        </Text>
        <TextInput
          style={styles.labelInput}
          placeholder="e.g., Counter-1, Billing-Main"
          placeholderTextColor={colors.textTertiary}
          value={labelInput}
          onChangeText={setLabelInput}
          testID="enroll-label-input"
          accessibilityLabel="Device name for this POS"
          returnKeyType="done"
          onSubmitEditing={handleActivate}
          editable={!loading}
          maxLength={50}
        />
        <Text style={styles.labelHint}>
          A name to identify this device in your store dashboard
        </Text>

        <Pressable
          style={[styles.activateButton, loading && styles.activateButtonDisabled]}
          onPress={handleActivate}
          disabled={loading}
          testID="enroll-submit-button"
          accessibilityLabel={loading ? "Activating device" : "Activate device"}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <View style={styles.activatingRow}>
              <ActivityIndicator size="small" color={colors.textInverse} style={{ marginRight: spacing.xs }} />
              <Text style={styles.activateButtonText}>Activating...</Text>
            </View>
          ) : (
            <Text style={styles.activateButtonText}>Activate POS</Text>
          )}
        </Pressable>
      </View>

      {/* Help Text */}
      <View style={styles.helpSection}>
        <Text style={styles.helpText}>
          Don't have a store yet? Register at{" "}
          <Text style={styles.helpLink} onPress={() => Linking.openURL("https://supermandi.tech/retailer/register")}>
            supermandi.tech/retailer/register
          </Text>
        </Text>
        <Text style={styles.helpTextSmall}>
          After registration, SuperMandi will review your application. Once approved, enter your phone number above to activate.
        </Text>
        <Text style={styles.helpTextSmall}>
          Need help?{" "}
          <Text style={styles.helpLink} onPress={() => Linking.openURL("mailto:hello@supermandi.tech")}>
            hello@supermandi.tech
          </Text>
        </Text>
      </View>

      {/* LIVE.POS.BUILDSTAMP.RUNTIME_GCP_PARITY.001: DEV-only section, theme-aware */}
      {__DEV__ && (
        <View style={[styles.devSection, { backgroundColor: tc.warning + "15" }]}>
          <Text style={[styles.devSectionLabel, { color: tc.warning }]}>DEV MODE</Text>
          <View style={styles.devInfoRow}>
            <Text style={[styles.devInfoLabel, { color: tc.textSecondary }]}>API:</Text>
            <Text style={[styles.devInfoValue, { color: tc.textPrimary }]} numberOfLines={1}>{API_BASE_URL}</Text>
          </View>
          <View style={styles.devInfoRow}>
            <Text style={[styles.devInfoLabel, { color: tc.textSecondary }]}>Build:</Text>
            <Text style={[styles.devInfoValue, { color: tc.textPrimary }]}>{BUILD_INFO.gitSha} @ {BUILD_INFO.buildTime}</Text>
          </View>
          {TEST_STORE_CONFIG?.phone && TEST_STORE_CONFIG?.pin ? (
            <Pressable
              style={styles.devButton}
              onPress={() => {
                Alert.alert(
                  "Test Store Ready",
                  `Phone: ${TEST_STORE_CONFIG?.phone}\nPIN: ${TEST_STORE_CONFIG?.pin}\n\nUse these credentials after activation for quick login.`
                );
              }}
            >
              <Text style={styles.devButtonText}>View Test Credentials</Text>
            </Pressable>
          ) : (
            <Text style={styles.devWarning}>
              Test credentials not set.{"\n"}
              Set EXPO_PUBLIC_TEST_PHONE and EXPO_PUBLIC_TEST_PIN in .env.local
            </Text>
          )}
        </View>
      )}

      {/* LIVE.POS.BUILDSTAMP.RUNTIME_GCP_PARITY.001: Theme-aware release stamp */}
      <View style={styles.releaseBuildInfo}>
        <Text style={[styles.releaseBuildInfoText, { color: tc.textTertiary }]}>
          Build: {buildShaLabel} · Deployed: {buildTimeLabel}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  headerSection: {
    marginBottom: spacing.xl,
  },
  brandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  brandPillText: {
    backgroundColor: colors.primary,
    color: colors.textInverse,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  title: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    marginTop: spacing.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  inputSection: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  phoneInput: {
    ...typography.body,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
    fontSize: 18,
  },
  lookupSuccess: {
    backgroundColor: colors.success + "15",
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  lookupSuccessText: {
    color: colors.success,
    fontWeight: "600",
    fontSize: 13,
  },
  lookupErrorText: {
    color: colors.error,
    fontSize: 12,
    lineHeight: 16,
  },
  lookupButton: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: "transparent",
    paddingVertical: spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
  },
  lookupButtonText: {
    ...typography.button,
    color: colors.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.caption,
    color: colors.textTertiary,
    marginHorizontal: spacing.sm,
    fontSize: 12,
  },
  codeInput: {
    ...typography.h4,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
    textAlign: "center",
    letterSpacing: 3,
  },
  labelInput: {
    ...typography.body,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
  },
  labelHint: {
    fontSize: 11,
    color: colors.textTertiary,
    lineHeight: 14,
  },
  requiredMark: {
    color: colors.error,
  },
  activateButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  activateButtonDisabled: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  activateButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  activatingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  helpSection: {
    backgroundColor: colors.surfaceAlt,
    padding: spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  helpText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  helpLink: {
    color: colors.primary,
    fontWeight: "600",
  },
  helpTextSmall: {
    fontSize: 11,
    color: colors.textTertiary,
    lineHeight: 16,
  },
  devSection: {
    marginTop: spacing.lg,
    padding: spacing.sm,
    backgroundColor: colors.warning + "15",
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    borderStyle: "dashed",
  },
  devSectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.warning,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  devInfoRow: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
  devInfoLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
    width: 45,
  },
  devInfoValue: {
    flex: 1,
    fontSize: 11,
    fontFamily: "monospace",
    color: colors.textPrimary,
  },
  devButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
  },
  devButtonText: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 12,
  },
  devWarning: {
    marginTop: spacing.sm,
    fontSize: 10,
    color: colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 14,
  },
  releaseBuildInfo: {
    marginTop: spacing.lg,
    alignItems: "center",
  },
  releaseBuildInfoText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: colors.textTertiary,
  },
});
