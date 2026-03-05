/**
 * POS Activation Screen (Code-only enrollment)
 *
 * Flow:
 * 1. Retailer registers on retailer web
 * 2. SuperAdmin activates the retailer account
 * 3. POS enters activation code and enrolls device
 *
 * Post-activation: routes to PaymentSetup if no UPI VPA set, else SellScan.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Keyboard,
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

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { enrollDevice } from "../services/api/enrollApi";
import { getDeviceSession, saveDeviceSession, clearDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { POS_MESSAGES } from "../utils/uiStatus";
import { theme, typography, spacing, useThemeColors } from "../theme";
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
    message: "This activation code has already been used on another device.",
    hint: "If you are replacing a lost or broken device, contact support for a device replacement code."
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

// STG-437: Store-scoped key to prevent cross-store persistence
const getPaymentPromptedKey = (storeId: string) => `supermandi.payment_setup_prompted.${storeId}`;

export default function EnrollDeviceScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<EnrollRoute>();
  // LIVE.POS.BUILDSTAMP.RUNTIME_GCP_PARITY.001: Theme-aware build stamp
  const tc = useThemeColors();
  // STG-284: Dynamic styles for dark mode support
  const styles = useMemo(() => createStyles(tc), [tc]);
  const buildShaLabel = String((BUILD_INFO as any).gitSha || (BUILD_INFO as any).version || "unknown");
  const buildTimeLabel = String((BUILD_INFO as any).buildTime || (BUILD_INFO as any).buildDate || "unknown");
  // #342: Accept both ?enrollmentCode=X and ?code=X from deep links
  const [codeInput, setCodeInput] = useState(route.params?.enrollmentCode || route.params?.code || "");
  const [loading, setLoading] = useState(false);
  // ISSUE-013: Track retry attempt for progress feedback
  const [retryAttempt, setRetryAttempt] = useState(0);
  // ISSUE-012: AbortController ref for cancel support
  const abortRef = React.useRef<AbortController | null>(null);
  // ENROLL-MISSING-ERROR-STATE-UI: persistent inline error shown after API failure
  const [enrollError, setEnrollError] = useState<string | null>(null);
  // ENROLL-SESSION-CHECK-RACE-CONDITION: hide form until session check completes
  const [checkingSession, setCheckingSession] = useState(true);

  // #404: Device label (required by backend for device identification)
  // Default to device model name for convenience
  const defaultLabel = Device.modelName || Device.deviceName || "";
  const [labelInput, setLabelInput] = useState(defaultLabel);

  const deviceMeta = useMemo(() => ({
    manufacturer: Device.manufacturer ?? null,
    model: Device.modelName ?? Device.deviceName ?? Constants.deviceName ?? null,
    androidVersion: Platform.OS === "android" ? String(Platform.Version) : Device.osVersion ?? null,
    appVersion: getAppVersion(),
    // STG-092: deviceType required by backend enroll.ts validation
    deviceType: "RETAILER_PHONE" as const,
    // #404: label is set dynamically, not memoized — added at call site
  }), []);

  // Check existing session on mount — skip to SellScan if already enrolled
  // ENROLL-SESSION-CHECK-RACE-CONDITION: wait for check before showing form to avoid flash
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await getDeviceSession();
        if (cancelled) return;
        if (session) {
          navigation.replace("SellScan");
        } else {
          setCheckingSession(false);
        }
      } catch {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => { cancelled = true; };
  }, [navigation]);

  // Deep link support
  // DEEP-LINK-RE-ENROLLMENT-NO-CONFIRM: check if already enrolled before pre-filling code
  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const code = parseActivationCode(url);
      if (!code) return;
      const session = await getDeviceSession();
      if (session) {
        Alert.alert(
          "Replace Existing Enrollment?",
          "This device is already enrolled to a store. Activating a new code will replace the current enrollment.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Replace", style: "destructive", onPress: () => setCodeInput(code) },
          ]
        );
      } else {
        setCodeInput(code);
      }
    };

    Linking.getInitialURL().then(handleUrl).catch(() => undefined);
    const subscription = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  const handleActivate = useCallback(async () => {
    // REQ.AUDIT.W5.POS.KEYBOARD-NOT-DISMISSED-ON-ERROR.001: dismiss keyboard before showing alerts
    const activationCode = parseActivationCode(codeInput);
    if (!activationCode) {
      Keyboard.dismiss();
      Alert.alert(
        "Missing Code",
        "Enter the activation code shared after retailer registration and superadmin account activation."
      );
      return;
    }

    // #404: Validate label (required by backend)
    const trimmedLabel = labelInput.trim();
    if (!trimmedLabel) {
      Keyboard.dismiss();
      Alert.alert("Device Name Required", "Enter a name for this POS device (e.g., Counter-1, Billing-Main).");
      return;
    }

    // Offline detection
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Keyboard.dismiss();
        Alert.alert(
          "No Internet",
          "Activation requires a network connection. Please connect to the internet and try again."
        );
        return;
      }
    } catch {
      // NetInfo failed — proceed anyway
    }

    // ISSUE-012: Create abort controller for cancel support
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setRetryAttempt(0);
    try {
      if (__DEV__) {
        console.log("[Activate] Payload:", { activationCode, deviceMeta });
      }

      const previousSession = await getDeviceSession();
      const previousStoreId = previousSession?.storeId ?? null;

      // ISSUE-012+013: Reduced retries (2 max) with shorter backoff and progress feedback
      const MAX_ENROLL_RETRIES = 2;
      const ENROLL_BASE_DELAY_MS = 2000;
      let res: Awaited<ReturnType<typeof enrollDevice>> | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= MAX_ENROLL_RETRIES; attempt++) {
        if (controller.signal.aborted) throw new Error("Cancelled by user");
        setRetryAttempt(attempt);
        try {
          res = await enrollDevice({ enrollmentCode: activationCode, deviceMeta: { ...deviceMeta, label: trimmedLabel } });
          break;
        } catch (err) {
          lastError = err;
          if (controller.signal.aborted) throw new Error("Cancelled by user");
          const isTransient =
            (err instanceof TypeError && err.message?.includes("Network")) ||
            (err instanceof Error && err.message?.toLowerCase().includes("timeout")) ||
            (err instanceof ApiError && err.status != null && err.status >= 500);
          if (!isTransient || attempt === MAX_ENROLL_RETRIES) throw err;
          const delayMs = ENROLL_BASE_DELAY_MS * Math.pow(2, attempt);
          if (__DEV__) console.log(`[Activate] Transient error — retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_ENROLL_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      if (!res) throw lastError;
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
      // SCREENS-CONSOLE-LOG-IN-PROD: guard diagnostic logs from release builds
      if (__DEV__) console.log(`[Activate] Success: token saved (len=${res.deviceToken?.length ?? 0})`);

      // STG-436: Post-enrollment invariant check (fetchUiStatus is non-strict, never throws)
      if (__DEV__) console.log("[Activate] Running invariant check: calling ui-status...");
      const uiStatus = await fetchUiStatus();
      if (uiStatus.storeActive === false) {
        if (__DEV__) console.log("[Activate] Store is inactive");
      } else {
        if (__DEV__) console.log("[Activate] Invariant check PASSED");
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
      const alreadyPrompted = await AsyncStorage.getItem(getPaymentPromptedKey(res.storeId));
      if (needsPaymentSetup && !alreadyPrompted) {
        navigation.replace("PaymentSetup");
      } else {
        navigation.replace("SellScan");
      }
    } catch (error) {
      let errorKey = "ENROLLMENT_FAILED";
      let rawMessage = "";

      if (error instanceof Error && error.message === "Cancelled by user") {
        // ISSUE-012: User tapped cancel — no error to show
        return;
      } else if (error instanceof TypeError && error.message?.includes("Network")) {
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
      // STG-393: Guard API_BASE_URL from production error alerts
      if (__DEV__) {
        debugParts.push(`api: ${API_BASE_URL}`);
        if (Updates.channel) debugParts.push(`channel: ${Updates.channel}`);
      }

        Alert.alert("Activation Failed", `${message}\n\n${hint}\n\n(${debugParts.join(", ")})`);
      setEnrollError(`${message} ${hint}`);
    } finally {
      setLoading(false);
      setRetryAttempt(0);
      abortRef.current = null;
    }
  }, [codeInput, labelInput, deviceMeta, navigation]);

  // ISSUE-012: Cancel activation handler
  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setLoading(false);
    setRetryAttempt(0);
  }, []);

  // ENROLL-SESSION-CHECK-RACE-CONDITION: show spinner until session check completes
  if (checkingSession) {
    return (
      <View style={styles.sessionCheckContainer} testID="enroll-session-checking">
        <ActivityIndicator size="large" color={tc.primary} />
      </View>
    );
  }

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
            backgroundColor={tc.primary}
            lineColor={tc.textInverse}
            dotColor={tc.textInverse}
            radius={9}
          />
          <Text style={styles.brandPillText}>SuperMandi</Text>
        </View>
        <Text style={styles.title} testID="enroll-title" accessibilityRole="header">
          Activate Your POS
        </Text>
        <Text style={styles.subtitle} testID="enroll-subtitle">
          Use your activation code after retailer registration on web and superadmin account activation.
        </Text>
      </View>

      {/* Manual Code Input */}
      <View style={styles.inputSection}>
        <Text style={styles.label}>Activation Code</Text>
        <TextInput
          style={styles.codeInput}
          placeholder="SM-XXXXXX"
          autoCapitalize="characters"
          value={codeInput}
          onChangeText={(v) => { setCodeInput(v); setEnrollError(null); }}
          testID="enroll-code-input"
          accessibilityLabel="Activation code"
          accessibilityRole="text"
          returnKeyType="next"
          autoFocus
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
          placeholderTextColor={tc.textTertiary}
          value={labelInput}
          onChangeText={setLabelInput}
          testID="enroll-label-input"
          accessibilityLabel="Device name for this POS"
          accessibilityRole="text"
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
              <ActivityIndicator size="small" color={tc.textInverse} style={{ marginRight: spacing.xs }} />
              <Text style={styles.activateButtonText}>
                {retryAttempt === 0 ? "Connecting..." : `Retrying (${retryAttempt + 1}/3)...`}
              </Text>
            </View>
          ) : (
            <Text style={styles.activateButtonText}>Activate POS</Text>
          )}
        </Pressable>

        {/* ISSUE-012: Cancel button during activation */}
        {loading && (
          <Pressable
            style={styles.cancelButton}
            onPress={handleCancel}
            testID="enroll-cancel-button"
            accessibilityLabel="Cancel activation"
            accessibilityRole="button"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        )}
      </View>

      {/* ENROLL-MISSING-ERROR-STATE-UI: Persistent inline error banner after API failure */}
      {enrollError ? (
        <View style={styles.enrollErrorBanner} testID="enroll-error-banner" accessibilityRole="alert">
          <MaterialCommunityIcons name="alert-circle" size={16} color={tc.error} />
          <Text style={styles.enrollErrorText}>{enrollError}</Text>
        </View>
      ) : null}

      {/* Help Text */}
      <View style={styles.helpSection}>
        <Text style={styles.helpText}>
          Register your retailer account at{" "}
          <Text style={styles.helpLink} onPress={() => Linking.openURL("https://supermandi.tech/retailer/register")}>
            supermandi.tech/retailer/register
          </Text>
        </Text>
        <Text style={styles.helpTextSmall}>
          After registration, wait for superadmin account activation. Then enter your activation code here.
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

// STG-284: Dynamic styles for dark mode support
function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
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
  cancelButton: {
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  cancelButtonText: {
    ...typography.body,
    color: colors.textSecondary,
    textDecorationLine: "underline" as const,
  },
  activatingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sessionCheckContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  enrollErrorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.error + '20',
    padding: spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  enrollErrorText: {
    ...typography.caption,
    color: colors.error,
    flex: 1,
    lineHeight: 18,
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
}); }
