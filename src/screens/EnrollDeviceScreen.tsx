/**
 * #329: Simplified POS Activation Screen
 *
 * After registration on Retailer Web + SuperAdmin approval, retailer receives
 * an activation code via WhatsApp/Email. This screen is the ONLY entry point
 * for POS devices — enter code → device activated → navigate to SellScan.
 *
 * Removed: QR scanner, camera, device type/label/printing selectors, registration link.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
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

import { enrollDevice } from "../services/api/enrollApi";
import { getDeviceSession, saveDeviceSession, clearDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { POS_MESSAGES } from "../utils/uiStatus";
import { theme, colors, typography, spacing } from "../theme";
import { API_BASE_URL, BUILD_INFO, TEST_STORE_CONFIG } from "../config/api";
import { logPosEvent } from "../services/cloudEventLogger";
import { useCartStore } from "../stores/cartStore";
import { usePurchaseDraftStore } from "../stores/purchaseDraftStore";
import { useProductsStore } from "../stores/productsStore";
import { useSettingsStore } from "../stores/settingsStore";

type RootStackParamList = {
  EnrollDevice: { enrollmentCode?: string } | undefined;
  SellScan: undefined;
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

export default function EnrollDeviceScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<EnrollRoute>();
  const [codeInput, setCodeInput] = useState(route.params?.enrollmentCode || "");
  const [loading, setLoading] = useState(false);

  const deviceMeta = useMemo(() => ({
    manufacturer: Device.manufacturer ?? null,
    model: Device.modelName ?? Device.deviceName ?? Constants.deviceName ?? null,
    androidVersion: Platform.OS === "android" ? String(Platform.Version) : Device.osVersion ?? null,
    appVersion: getAppVersion(),
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

  const handleActivate = useCallback(async () => {
    const activationCode = parseActivationCode(codeInput);
    if (!activationCode) {
      Alert.alert("Missing Code", "Enter the activation code sent to you by SuperMandi.");
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
      const res = await enrollDevice({ enrollmentCode: activationCode, deviceMeta });
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
      navigation.replace("SellScan");
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
  }, [codeInput, deviceMeta, navigation]);

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
        <Text style={styles.title} testID="enroll-title" accessibilityRole="header">
          Activate Your POS
        </Text>
        <Text style={styles.subtitle} testID="enroll-subtitle">
          Enter the activation code sent to you via WhatsApp or Email after your store was approved.
        </Text>
      </View>

      {/* Code Input */}
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
          autoFocus={!codeInput}
          returnKeyType="done"
          onSubmitEditing={handleActivate}
        />

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
          Don't have an activation code? Register your store at{" "}
          <Text style={styles.helpLink} onPress={() => Linking.openURL("https://portal.supermandi.tech")}>
            portal.supermandi.tech
          </Text>
        </Text>
        <Text style={styles.helpTextSmall}>
          After registration, SuperMandi will review your application and send the activation code via WhatsApp.
        </Text>
      </View>

      {/* DEV-only section */}
      {__DEV__ && (
        <View style={styles.devSection}>
          <Text style={styles.devSectionLabel}>DEV MODE</Text>
          <View style={styles.devInfoRow}>
            <Text style={styles.devInfoLabel}>API:</Text>
            <Text style={styles.devInfoValue} numberOfLines={1}>{API_BASE_URL}</Text>
          </View>
          <View style={styles.devInfoRow}>
            <Text style={styles.devInfoLabel}>Build:</Text>
            <Text style={styles.devInfoValue}>{BUILD_INFO.gitSha} @ {BUILD_INFO.buildTime}</Text>
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
});
