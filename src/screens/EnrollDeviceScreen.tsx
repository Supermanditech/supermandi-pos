import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  Linking,
  Platform
} from "react-native";
import Constants from "expo-constants";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Updates from "expo-updates";

import { enrollDevice } from "../services/api/enrollApi";
import { getDeviceSession, saveDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { POS_MESSAGES } from "../utils/uiStatus";
import { theme } from "../theme";
import { API_BASE_URL } from "../config/api";

type RootStackParamList = {
  EnrollDevice: undefined;
  SellScan: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "EnrollDevice">;

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

const ENROLL_ERROR_MESSAGES: Record<string, string> = {
  enrollment_invalid: "Enrollment code is invalid or expired.",
  device_already_enrolled: "This label is already active. Ask Superadmin to reset the token.",
  "label is required": "Enter a device label (e.g., Counter-1).",
  "deviceType is required": "Select a valid device type.",
  "deviceType invalid": "Select a valid device type.",
  "printingMode invalid": "Select a valid printing mode.",
  "code is required": "Enter or scan an enrollment code.",
  "store not found": "Store not found for this enrollment code.",
  "database unavailable": "Server database unavailable. Try again in a minute.",
  enrollment_failed: "Server could not enroll the device. Try again."
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
  const [permission, requestPermission] = useCameraPermissions();
  const [codeInput, setCodeInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [deviceType, setDeviceType] = useState<DeviceType>("RETAILER_PHONE");
  const [printingMode, setPrintingMode] = useState<PrintingMode>("NONE");
  const [scanned, setScanned] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const deviceMeta = useMemo(() => {
    const androidMeta = (Constants.platform as any)?.android ?? {};
    return {
      manufacturer: androidMeta.manufacturer ?? null,
      model: androidMeta.model ?? Constants.deviceName ?? null,
      androidVersion: Platform.OS === "android" ? String(Platform.Version) : null,
      appVersion: getAppVersion(),
      label: labelInput.trim() || null,
      deviceType,
      printingMode
    };
  }, [labelInput, deviceType, printingMode]);

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
    const code = parseEnrollmentCode(codeInput);
    if (!code) {
      Alert.alert("Missing Code", "Enter or scan an enrollment code.");
      return;
    }
    if (!labelInput.trim()) {
      Alert.alert("Missing Label", "Enter a device label (e.g., Counter-1).");
      return;
    }

    setLoading(true);
    try {
      const res = await enrollDevice({ code, deviceMeta });
      await saveDeviceSession({
        deviceId: res.deviceId,
        storeId: res.storeId,
        deviceToken: res.deviceToken
      });
      if (!res.storeActive) {
        Alert.alert("Store Inactive", POS_MESSAGES.storeInactive);
      }
      navigation.replace("SellScan");
    } catch (error) {
      if (error instanceof ApiError) {
        const raw = error.message || "unknown_error";
        const friendly = ENROLL_ERROR_MESSAGES[raw];
        const extra: string[] = [];
        if (error.status) extra.push(`status: ${error.status}`);
        extra.push(`code: ${raw}`);
        extra.push(`api: ${API_BASE_URL}`);
        if (Updates.channel) extra.push(`channel: ${Updates.channel}`);
        Alert.alert(
          "Enrollment Failed",
          `${friendly ?? "Unable to enroll device. Try again."} (${extra.join(", ")})`
        );
        return;
      }
      const fallback = formatUnknownError(error) || "Unable to enroll device. Try again.";
      const details: string[] = [`api: ${API_BASE_URL}`];
      if (Updates.channel) details.push(`channel: ${Updates.channel}`);
      Alert.alert(
        "Enrollment Failed",
        `${fallback}${details.length ? ` (${details.join(", ")})` : ""}`
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
    <View style={styles.container}>
      <Text style={styles.title}>Enroll POS Device</Text>
      <Text style={styles.subtitle}>Scan the QR code or enter the enrollment code.</Text>

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
              <Text style={styles.permissionText}>Camera permission is required to scan QR codes.</Text>
              <Pressable style={styles.secondaryButton} onPress={() => requestPermission()}>
                <Text style={styles.secondaryButtonText}>Allow Camera</Text>
              </Pressable>
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
        />

        <Text style={styles.label}>Device Label (required)</Text>
        <TextInput
          style={styles.input}
          placeholder="Counter-1"
          value={labelInput}
          onChangeText={setLabelInput}
        />

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
        >
          <Text style={styles.secondaryButtonText}>
            {scannerOpen ? "Hide Scanner" : "Scan QR"}
          </Text>
        </Pressable>

        <Pressable style={styles.primaryButton} onPress={handleEnroll} disabled={loading}>
          <Text style={styles.primaryButtonText}>
            {loading ? "Enrolling..." : "Enroll Device"}
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
    padding: 20
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.textPrimary
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: theme.colors.textSecondary
  },
  cameraWrap: {
    marginTop: 16,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  camera: {
    height: 220,
    width: "100%"
  },
  permissionBox: {
    padding: 16,
    alignItems: "center",
    gap: 12
  },
  permissionText: {
    color: theme.colors.textSecondary,
    textAlign: "center"
  },
  controls: {
    marginTop: 18,
    gap: 12
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.textPrimary
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface
  },
  pillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.accentSoft
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textSecondary
  },
  pillTextActive: {
    color: theme.colors.primaryDark
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  primaryButtonText: {
    color: theme.colors.textInverse,
    fontWeight: "700"
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  secondaryButtonText: {
    color: theme.colors.primary,
    fontWeight: "600"
  }
});
