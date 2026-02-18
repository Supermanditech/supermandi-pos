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
import { CameraView, useCameraPermissions } from "expo-camera";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
// expo-updates disabled for development - channel info not needed
const Updates = { channel: null as string | null };

import NetInfo from "@react-native-community/netinfo";

import { enrollDevice, checkDuplicateLabel, CheckDuplicateLabelResponse } from "../services/api/enrollApi";
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

/**
 * POS-ENROLL-401-FIX: Integration Smoke Test Checklist
 *
 * Before Go-Live, verify these scenarios manually:
 *
 * 1. FRESH INSTALL / CLEARED STORAGE:
 *    - Clear app data (Settings > Apps > SuperMandi POS > Clear Data)
 *    - Open app → should show EnrollDeviceScreen
 *    - Enter valid enrollment code (e.g., SM-DEMO01)
 *    - Enter device label (e.g., Counter-1)
 *    - Tap "Enroll Device"
 *    - EXPECTED: Enrollment succeeds, navigates to SellScan
 *    - VERIFY LOGS:
 *      [api_debug] POST /api/v1/pos/enroll (no BLOCKED message)
 *      [Enroll] Success: token saved (len=...)
 *      [api_debug] X-Device-Token: <first 8 chars>...
 *
 * 2. PROTECTED ENDPOINT AFTER ENROLL:
 *    - After successful enrollment, app should call ui-status
 *    - VERIFY LOGS:
 *      [api_debug] GET /api/v1/pos/ui-status
 *      [api_debug] X-Device-Token: <first 8 chars>...(len=...)
 *      [api_debug] status: 200
 *
 * 3. WRONG/EXPIRED ENROLLMENT CODE:
 *    - Clear app data
 *    - Enter invalid code (e.g., "WRONG-CODE")
 *    - EXPECTED: Alert shows "Enrollment code is invalid"
 *    - App stays on EnrollDeviceScreen (no navigation)
 *    - No token stored (verify with subsequent attempt)
 *
 * 4. REINSTALL / TOKEN CLEARED:
 *    - Uninstall and reinstall app
 *    - Should show EnrollDeviceScreen (no crash)
 *    - Should be able to enroll again
 *
 * See: apiClient.ts for PUBLIC_ENDPOINT_PATTERNS and guard assertions
 */

type RootStackParamList = {
  EnrollDevice: { enrollmentCode?: string } | undefined;  // DRX-003: Optional pre-fill from registration
  SellScan: undefined;
  ForceUpdate: { currentVersion?: string; requiredVersion?: string };
  DeviceBlocked: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "EnrollDevice">;
type EnrollRoute = RouteProp<RootStackParamList, "EnrollDevice">;

type DeviceType = "OEM_HANDHELD" | "SUPMANDI_PHONE" | "RETAILER_PHONE";
type PrintingMode = "DIRECT_ESC_POS" | "SHARE_TO_PRINTER_APP" | "NONE";

const DEVICE_TYPES: Array<{ value: DeviceType; label: string }> = [
  { value: "OEM_HANDHELD", label: "OEM Handheld" },
  { value: "SUPMANDI_PHONE", label: "SuperMandi Phone" },
  { value: "RETAILER_PHONE", label: "Retailer Phone" }
];

const PRINTING_MODES: Array<{ value: PrintingMode; label: string }> = [
  { value: "DIRECT_ESC_POS", label: "Direct ESC/POS" },
  { value: "SHARE_TO_PRINTER_APP", label: "Share to Printer App" },
  { value: "NONE", label: "None" }
];

// DEV-071: Error codes from backend (uppercase with underscores)
const ENROLL_ERROR_MESSAGES: Record<string, { message: string; hint?: string }> = {
  // 400 Bad Request errors
  CODE_REQUIRED: { message: "Enter or scan an enrollment code." },
  LABEL_REQUIRED: { message: "Enter a device label (e.g., Counter-1)." },
  DEVICE_TYPE_REQUIRED: { message: "Select a valid device type." },
  DEVICE_TYPE_INVALID: { message: "Select a valid device type." },
  PRINTING_MODE_INVALID: { message: "Select a valid printing mode." },
  ENROLLMENT_CODE_INVALID: {
    message: "Enrollment code is invalid.",
    hint: "Check the code and try again, or ask your SuperAdmin for a new code."
  },

  // 409 Conflict errors (code state issues)
  ENROLLMENT_CODE_EXPIRED: {
    message: "This enrollment code has expired.",
    hint: "Ask your SuperAdmin to generate a new enrollment code."
  },
  ENROLLMENT_CODE_USED: {
    message: "This enrollment code has already been used.",
    hint: "Ask your SuperAdmin to generate a new enrollment code."
  },
  ENROLLMENT_CODE_REVOKED: {
    message: "This enrollment code has been revoked.",
    hint: "Ask your SuperAdmin to generate a new enrollment code."
  },

  // 404 Not Found errors
  STORE_NOT_FOUND: {
    message: "Store not found for this enrollment code.",
    hint: "Verify the code with your SuperAdmin."
  },

  // 503 Service Unavailable
  DATABASE_UNAVAILABLE: {
    message: "Server database unavailable.",
    hint: "Wait a minute and try again."
  },

  // 500 Internal Server Error
  ENROLLMENT_FAILED: {
    message: "Server could not enroll the device.",
    hint: "Try again. If the problem persists, contact support."
  },

  // Rate limiting (429)
  ENROLLMENT_RATE_LIMITED: {
    message: "Too many enrollment attempts.",
    hint: "Please wait 15 minutes before trying again."
  },

  // Legacy error codes (for backwards compatibility)
  enrollment_invalid: {
    message: "Enrollment code is invalid or expired.",
    hint: "Contact your SuperAdmin for a new enrollment code."
  },
  enrollment_expired: {
    message: "This enrollment code has expired.",
    hint: "Contact your SuperAdmin for a new enrollment code."
  },
  enrollment_used: {
    message: "This enrollment code has already been used.",
    hint: "Contact your SuperAdmin for a new enrollment code."
  },
  enrollment_revoked: {
    message: "This enrollment code has been revoked.",
    hint: "Contact your SuperAdmin for a new enrollment code."
  },
  device_already_enrolled: {
    message: "This label is already active.",
    hint: "Ask your SuperAdmin to reset the device token or use a different label."
  },

  // Network errors
  network_error: {
    message: "Could not connect to the server.",
    hint: "Check your internet connection and try again."
  },
  timeout: {
    message: "Request timed out.",
    hint: "Check your connection and try again."
  }
};

function parseEnrollmentCode(raw: string): string | null {
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

function formatUnknownError(value: unknown): string {
  if (value instanceof Error) {
    return value.message || value.name || "unknown error";
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "unknown error";
  }
}

export default function EnrollDeviceScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<EnrollRoute>();  // DRX-003
  const [permission, requestPermission] = useCameraPermissions();
  const [codeInput, setCodeInput] = useState(route.params?.enrollmentCode || "");
  const [labelInput, setLabelInput] = useState("");
  const [deviceType, setDeviceType] = useState<DeviceType>("RETAILER_PHONE");
  const [printingMode, setPrintingMode] = useState<PrintingMode>("NONE");
  const [scanned, setScanned] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // GL-RJ-006: Duplicate label detection state
  const [labelCheckResult, setLabelCheckResult] = useState<CheckDuplicateLabelResponse | null>(null);
  const [checkingLabel, setCheckingLabel] = useState(false);
  const labelCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P3-001: Use expo-device for reliable device metadata capture
  const deviceMeta = useMemo(() => {
    return {
      manufacturer: Device.manufacturer ?? null,
      model: Device.modelName ?? Device.deviceName ?? Constants.deviceName ?? null,
      androidVersion: Platform.OS === "android" ? String(Platform.Version) : Device.osVersion ?? null,
      appVersion: getAppVersion(),
      label: labelInput.trim() || null,
      deviceType,
      printingMode
    };
  }, [labelInput, deviceType, printingMode]);

  // GL-RJ-006: Debounced duplicate label check
  const doLabelCheck = useCallback(async (label: string, code: string) => {
    if (!label.trim() || !code.trim()) {
      setLabelCheckResult(null);
      return;
    }

    setCheckingLabel(true);
    try {
      const result = await checkDuplicateLabel({
        enrollmentCode: code,
        label: label.trim(),
      });
      setLabelCheckResult(result);
    } catch (error) {
      console.warn("[EnrollDeviceScreen] Label check failed:", error);
      setLabelCheckResult(null);
    } finally {
      setCheckingLabel(false);
    }
  }, []);

  // GL-RJ-006: Trigger label check when label or code changes
  useEffect(() => {
    if (labelCheckTimerRef.current) {
      clearTimeout(labelCheckTimerRef.current);
    }

    const enrollmentCode = parseEnrollmentCode(codeInput);
    if (!labelInput.trim() || !enrollmentCode) {
      setLabelCheckResult(null);
      return;
    }

    // Debounce by 500ms
    labelCheckTimerRef.current = setTimeout(() => {
      void doLabelCheck(labelInput, enrollmentCode);
    }, 500);

    return () => {
      if (labelCheckTimerRef.current) {
        clearTimeout(labelCheckTimerRef.current);
      }
    };
  }, [labelInput, codeInput, doLabelCheck]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await getDeviceSession();
      if (cancelled || !session) return;
      navigation.replace("SellScan");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      const code = parseEnrollmentCode(url);
      if (!code) return;
      setCodeInput(code);
      setScannerOpen(false);
      setScanned(true);
    };

    Linking.getInitialURL().then(handleUrl).catch(() => undefined);
    const subscription = Linking.addEventListener("url", (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);

  const handleEnroll = async () => {
    const enrollmentCode = parseEnrollmentCode(codeInput);
    if (!enrollmentCode) {
      Alert.alert("Missing Code", "Enter or scan an enrollment code.");
      return;
    }
    if (!labelInput.trim()) {
      Alert.alert("Missing Label", "Enter a device label (e.g., Counter-1).");
      return;
    }

    // SCR-AUDIT-312: Block enrollment while label check is in-flight to prevent race condition
    if (checkingLabel) {
      Alert.alert("Please Wait", "Label availability check is in progress. Please wait a moment.");
      return;
    }

    // S3-1: Offline detection before enrollment attempt
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert(
          "No Internet",
          "Enrollment requires a network connection. Please connect to the internet and try again."
        );
        return;
      }
    } catch {
      // NetInfo failed — proceed anyway (best effort)
    }

    // GL-RJ-006: Block enrollment if duplicate label detected
    if (labelCheckResult?.isDuplicate) {
      const suggestions = labelCheckResult.suggestions?.slice(0, 3).join(", ");
      Alert.alert(
        "Duplicate Label",
        `A device with label "${labelInput.trim()}" already exists for this store.\n\n` +
        (suggestions ? `Suggestions: ${suggestions}\n\n` : "") +
        "Please use a unique label.",
        [{ text: "OK" }]
      );
      return;
    }

    setLoading(true);
    try {
      // DEV-071: Debug logging for enrollment payload
      if (__DEV__) {
        console.log("[Enroll] Payload:", { enrollmentCode, deviceMeta });
      }

      const previousSession = await getDeviceSession();
      const previousStoreId = previousSession?.storeId ?? null;
      const res = await enrollDevice({ enrollmentCode, deviceMeta });
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
        deviceType
      });
      console.log(`[Enroll] Success: token saved (len=${res.deviceToken?.length ?? 0})`);

      // GO-LIVE INVARIANT CHECK: Immediately verify token works after enrollment
      // This prevents silent failures where token is saved but doesn't actually work
      try {
        console.log("[Enroll] Running Go-Live invariant check: calling ui-status...");
        const uiStatus = await fetchUiStatus();
        // If we get here, token worked. Check for inactive store
        if (uiStatus.storeActive === false) {
          console.log("[Enroll] Invariant check passed but store is inactive");
          // Will show inactive alert below
        } else {
          console.log("[Enroll] Invariant check PASSED: ui-status returned successfully");
        }
      } catch (invariantError) {
        // Token didn't work! This is the critical bug we're trying to prevent
        console.error("[Enroll] INVARIANT CHECK FAILED:", invariantError);

        // Check if it's a 401 (token invalid) or DEVICE_SESSION_MISSING
        const is401 = invariantError instanceof ApiError &&
          (invariantError.status === 401 || invariantError.message === "DEVICE_SESSION_MISSING" || invariantError.message === "device_unauthorized");

        if (is401) {
          // Critical: Token was saved but doesn't work! Clear it and block enrollment
          await clearDeviceSession();
          Alert.alert(
            "Enrollment Failed",
            "Token was saved but is not valid. This is a critical error.\n\nPlease try enrolling again. If this persists, contact support.",
            [{ text: "OK" }]
          );
          return; // Block navigation to SellScan
        }
        // Other errors (network, etc.) - log but don't block
        console.warn("[Enroll] Non-critical invariant check error:", invariantError);
      }

      // GO-LIVE: Persist store name for offline display (SuperAdmin source of truth)
      const { setStoreName, setStoreCode } = useSettingsStore.getState();
      if (res.storeName) {
        setStoreName(res.storeName);
      }
      if (res.storeCode) {
        setStoreCode(res.storeCode);
      }

      if (storeChanged) {
        void logPosEvent("STORE_SWITCH", {
          previousStoreId,
          nextStoreId: res.storeId,
          reason: "enroll"
        });
      }
      // ISSUE-MICRO-030: Warn operator if multiple POS devices are active for this store
      if (typeof res.activeDeviceCount === "number" && res.activeDeviceCount > 1) {
        Alert.alert(
          "Multiple Devices",
          `This store has ${res.activeDeviceCount} active POS devices. Multiple devices on the same store may cause duplicate sales. Contact your SuperAdmin if this is unexpected.`
        );
      }
      if (!res.storeActive) {
        Alert.alert("Store Inactive", POS_MESSAGES.storeInactive);
      }
      navigation.replace("SellScan");
    } catch (error) {
      // POS-ENROLL-401-FIX Acceptance #3: Wrong enrollment code
      // On error, we reach this catch block BEFORE saveDeviceSession is called,
      // so no token is stored. User stays on EnrollDeviceScreen.
      let errorKey = "enrollment_failed";
      let rawMessage = "";

      // Detect network errors
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
        rawMessage = formatUnknownError(error);
      }

      const errorInfo = ENROLL_ERROR_MESSAGES[errorKey];
      const message = errorInfo?.message ?? "Unable to enroll device.";
      const hint = errorInfo?.hint ?? "Try again or contact your SuperAdmin.";

      // Build debug info for dev troubleshooting
      const debugParts: string[] = [];
      if (error instanceof ApiError && error.status) {
        debugParts.push(`status: ${error.status}`);
      }
      debugParts.push(`code: ${rawMessage || errorKey}`);
      debugParts.push(`api: ${API_BASE_URL}`);
      if (Updates.channel) debugParts.push(`channel: ${Updates.channel}`);

      Alert.alert(
        "Enrollment Failed",
        `${message}\n\n${hint}\n\n(${debugParts.join(", ")})`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleScanValue = (value: string) => {
    const code = parseEnrollmentCode(value);
    if (!code) return;
    setCodeInput(code);
    setScanned(true);
    setScannerOpen(false);
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      testID="enroll-device-screen"
      accessibilityLabel="Enroll POS device screen"
    >
      <Text style={styles.title} testID="enroll-title" accessibilityRole="header">Enroll POS Device</Text>
      <Text style={styles.subtitle} testID="enroll-subtitle">Scan the QR code or enter the enrollment code.</Text>

      {scannerOpen && (
        <View style={styles.cameraWrap}>
          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={scanned ? undefined : (event) => handleScanValue(event.data)}
            />
          ) : (
            <View style={styles.permissionBox}>
              <Text
                style={styles.permissionText}
                testID="enroll-camera-permission-text"
                accessibilityLabel="Camera permission is required to scan QR codes"
              >
                {permission?.canAskAgain === false
                  ? "Camera permission was denied. Please enable it in Settings."
                  : "Camera permission is required to scan QR codes."}
              </Text>
              {/* S3-4: Recovery path for denied camera permission */}
              {permission?.canAskAgain === false ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => Linking.openSettings()}
                  testID="enroll-open-settings-button"
                  accessibilityLabel="Open device settings to enable camera"
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryButtonText}>Open Settings</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => requestPermission()}
                  testID="enroll-allow-camera-button"
                  accessibilityLabel="Allow camera access"
                  accessibilityRole="button"
                >
                  <Text style={styles.secondaryButtonText}>Allow Camera</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.controls}>
        <Text style={styles.label}>Enrollment Code</Text>
        <TextInput
          style={styles.input}
          placeholder="SM-XXXXXX"
          autoCapitalize="characters"
          value={codeInput}
          onChangeText={setCodeInput}
          testID="enroll-code-input"
          accessibilityLabel="Enrollment code"
        />

        <Text style={styles.label}>Device Label (required)</Text>
        <TextInput
          style={[
            styles.input,
            labelCheckResult?.isDuplicate && styles.inputError
          ]}
          placeholder="Counter-1"
          value={labelInput}
          onChangeText={setLabelInput}
          testID="enroll-label-input"
          accessibilityLabel="Device label"
        />
        {/* GL-RJ-006: Duplicate label warning */}
        {checkingLabel && (
          <Text style={styles.labelHint}>Checking label availability...</Text>
        )}
        {labelCheckResult?.isDuplicate && (
          <View style={styles.duplicateWarning}>
            <Text style={styles.duplicateWarningText}>
              This label is already in use. Please choose a different label.
            </Text>
            {labelCheckResult.suggestions && labelCheckResult.suggestions.length > 0 && (
              <View style={styles.suggestions}>
                <Text style={styles.suggestionsLabel}>Suggestions:</Text>
                <View style={styles.suggestionPills}>
                  {labelCheckResult.suggestions.slice(0, 3).map((suggestion) => (
                    <Pressable
                      key={suggestion}
                      style={styles.suggestionPill}
                      onPress={() => setLabelInput(suggestion)}
                    >
                      <Text style={styles.suggestionPillText}>{suggestion}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
        {!checkingLabel && !labelCheckResult?.isDuplicate && labelInput.trim() && parseEnrollmentCode(codeInput) && (
          <Text style={styles.labelAvailable}>Label available</Text>
        )}

        <Text style={styles.label}>Device Type</Text>
        <View style={styles.pillRow}>
          {DEVICE_TYPES.map((item) => (
            <Pressable
              key={item.value}
              style={[
                styles.pill,
                deviceType === item.value && styles.pillActive
              ]}
              onPress={() => setDeviceType(item.value)}
            >
              <Text
                style={[
                  styles.pillText,
                  deviceType === item.value && styles.pillTextActive
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Printing Mode (optional)</Text>
        <View style={styles.pillRow}>
          {PRINTING_MODES.map((item) => (
            <Pressable
              key={item.value}
              style={[
                styles.pill,
                printingMode === item.value && styles.pillActive
              ]}
              onPress={() => setPrintingMode(item.value)}
            >
              <Text
                style={[
                  styles.pillText,
                  printingMode === item.value && styles.pillTextActive
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => {
            setScannerOpen((prev) => !prev);
            setScanned(false);
          }}
          testID="enroll-scan-button"
          accessibilityLabel={scannerOpen ? "Hide QR scanner" : "Open QR scanner"}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>
            {scannerOpen ? "Hide Scanner" : "Scan QR"}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
          onPress={handleEnroll}
          disabled={loading}
          testID="enroll-submit-button"
          accessibilityLabel={loading ? "Enrolling device" : "Enroll device"}
          accessibilityRole="button"
          accessibilityState={{ disabled: loading }}
        >
          {loading ? (
            <View style={styles.enrollingRow}>
              <ActivityIndicator size="small" color={colors.textInverse} style={{ marginRight: spacing.xs }} />
              <Text style={styles.primaryButtonText}>Enrolling...</Text>
            </View>
          ) : (
            <Text style={styles.primaryButtonText}>Enroll Device</Text>
          )}
        </Pressable>

        {/* DEV-only Test Store Shortcuts */}
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
                  // For enrollment, we can't auto-fill phone/PIN since enrollment uses code
                  // Just show info that test credentials are loaded
                  Alert.alert(
                    "Test Store Ready",
                    `Phone: ${TEST_STORE_CONFIG?.phone}\nPIN: ${TEST_STORE_CONFIG?.pin}\n\nUse these credentials after enrollment for quick login.`
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
  title: {
    ...typography.h4,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  cameraWrap: {
    marginTop: spacing.md,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  camera: {
    height: 220,
    width: "100%"
  },
  permissionBox: {
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  permissionText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  controls: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  input: {
    ...typography.bodySmall,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
  },
  // GL-RJ-006: Duplicate label detection styles
  inputError: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft
  },
  labelHint: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  duplicateWarning: {
    backgroundColor: colors.errorSoft,
    padding: spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error,
  },
  duplicateWarningText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.error,
    fontWeight: "500",
  },
  suggestions: {
    marginTop: spacing.sm,
  },
  suggestionsLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  suggestionPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  suggestionPill: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary
  },
  suggestionPillText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  labelAvailable: {
    fontSize: 11,
    color: colors.success,
    fontWeight: "500",
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  pillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentSoft
  },
  pillText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: colors.primaryDark
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  primaryButtonTextDisabled: {
    color: colors.textSecondary
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  secondaryButtonText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: "600",
  },
  devSection: {
    marginTop: spacing.lg,
    padding: spacing.sm,
    backgroundColor: colors.warning + "15",
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.warning,
    borderStyle: "dashed"
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
    width: 45
  },
  devInfoValue: {
    flex: 1,
    fontSize: 11,
    fontFamily: "monospace",
    color: colors.textPrimary
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
  enrollingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  devWarning: {
    marginTop: spacing.sm,
    fontSize: 10,
    color: colors.textSecondary,
    fontStyle: "italic",
    lineHeight: 14,
  },
});
