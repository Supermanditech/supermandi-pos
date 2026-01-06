import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";

import PosStatusBar from "../components/PosStatusBar";
import ScanNoticeBanner from "../components/ScanNoticeBanner";
import MenuScreen from "./MenuScreen";
import SellScanScreen from "./SellScanScreen";
import PurchaseScreen from "./PurchaseScreen";
import { cacheDeviceInfo, fetchDeviceInfo, getCachedDeviceInfo } from "../services/deviceInfo";
import { clearDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { notifyHidScan, wasHidScannerActive } from "../services/hidScannerService";
import { handleScan as handleGlobalScan, setScanRuntime, type ScanNotice } from "../services/scan/handleScan";
import { POS_MESSAGES } from "../utils/uiStatus";
import { theme } from "../theme";

type RootStackParamList = {
  SellScan: undefined;
  EnrollDevice: undefined;
  DeviceBlocked: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "SellScan">;

type PosTab = "MENU" | "SELL" | "PURCHASE";

const TABS: Array<{ id: PosTab; label: string }> = [
  { id: "MENU", label: "MENU" },
  { id: "SELL", label: "SELL" },
  { id: "PURCHASE", label: "PURCHASE" },
];

export default function PosRootLayout() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const hidInputRef = useRef<TextInput>(null);
  const hidBufferRef = useRef("");

  const [activeTab, setActiveTab] = useState<PosTab>("SELL");
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);

  const [storeActive, setStoreActive] = useState<boolean | null>(null);
  const [deviceActive, setDeviceActive] = useState<boolean | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [deviceStoreId, setDeviceStoreId] = useState<string | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [printerOk, setPrinterOk] = useState<boolean | null>(null);
  const [scannerOk, setScannerOk] = useState<boolean | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraScanned, setCameraScanned] = useState(false);
  const [hidInput, setHidInput] = useState("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const scanDisabled = !isFocused || storeActive === false || scannerOpen;
  const statusMode = "SELL";

  const handleDeviceAuthError = useCallback(async (error: ApiError): Promise<boolean> => {
    if (error.message === "device_inactive") {
      navigation.reset({ index: 0, routes: [{ name: "DeviceBlocked" }] });
      return true;
    }
    if (error.message === "device_unauthorized") {
      await clearDeviceSession();
      navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
      return true;
    }
    if (error.message === "device_not_enrolled") {
      navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
      return true;
    }
    return false;
  }, [navigation]);

  useEffect(() => {
    const intent = activeTab === "PURCHASE" ? "PURCHASE" : "SELL";
    const runtimeMode = "SELL";
    setScanRuntime({
      intent,
      mode: runtimeMode,
      storeActive,
      onNotice: setScanNotice,
      onDeviceAuthError: handleDeviceAuthError,
      onStoreInactive: () => setStoreActive(false),
    });
  }, [activeTab, handleDeviceAuthError, storeActive]);

  useEffect(() => {
    setScanNotice(null);
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      try {
        const status = await fetchUiStatus();
        if (cancelled) return;
        setStoreActive(status.storeActive ?? null);
        setDeviceActive(status.deviceActive ?? null);
        setDeviceStoreId(status.storeId ?? null);
        setPendingOutboxCount(status.pendingOutboxCount ?? 0);
        setPrinterOk(status.printerOk ?? null);
        setScannerOk(status.scannerOk ?? null);
        if (status.storeName) {
          setStoreName((prev) => status.storeName ?? prev);
        }
        if (status.deviceActive === false) {
          navigation.reset({ index: 0, routes: [{ name: "DeviceBlocked" }] });
          return;
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError) {
          const handled = await handleDeviceAuthError(error);
          if (handled) return;
          if (error.message === "store_inactive") {
            setStoreActive(false);
            return;
          }
          if (error.message === "store not found") {
            setStoreActive(false);
            return;
          }
        }
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [handleDeviceAuthError, navigation]);

  useEffect(() => {
    let cancelled = false;

    const applyInfo = (info: { storeId: string | null; storeName: string | null }) => {
      if (cancelled) return;
      setDeviceStoreId(info.storeId ?? null);
      setStoreName(info.storeName ?? null);
    };

    const loadCached = async () => {
      const cached = await getCachedDeviceInfo();
      if (cached) {
        applyInfo(cached);
      }
    };

    const refresh = async () => {
      try {
        const info = await fetchDeviceInfo();
        applyInfo(info);
        await cacheDeviceInfo(info);
      } catch (error) {
        if (error instanceof ApiError) {
          await handleDeviceAuthError(error);
        }
      }
    };

    loadCached();
    void refresh();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });

    const interval = setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      subscription.remove();
      clearInterval(interval);
    };
  }, [handleDeviceAuthError]);

  useEffect(() => {
    if (!isFocused) return;
    if (scannerOpen) return;
    if (scanDisabled) return;
    requestAnimationFrame(() => {
      hidInputRef.current?.focus();
    });
  }, [isFocused, scanDisabled, scannerOpen]);

  useEffect(() => {
    if (!isFocused) {
      hidInputRef.current?.blur();
      if (scannerOpen) {
        setScannerOpen(false);
      }
    }
  }, [isFocused, scannerOpen]);

  const commitHidScan = (raw: string) => {
    const value = raw.trim();
    hidBufferRef.current = "";
    setHidInput("");
    if (value) {
      notifyHidScan(true);
      void handleGlobalScan(value);
    }
  };

  const handleHidChange = (text: string) => {
    if (scanDisabled) return;
    hidBufferRef.current = text;
    setHidInput(text);
  };

  const handleHidSubmit = () => {
    if (scanDisabled) return;
    commitHidScan(hidBufferRef.current);
  };

  const handleHidKeyPress = (event: { nativeEvent: { key: string } }) => {
    if (scanDisabled) return;
    if (event.nativeEvent.key === "Enter") {
      commitHidScan(hidBufferRef.current);
    }
  };

  const handleOpenCamera = async () => {
    if (!isFocused || scannerOpen) return;
    if (storeActive === false) {
      setScanNotice({ tone: "error", message: POS_MESSAGES.storeInactive });
      return;
    }
    if (wasHidScannerActive()) {
      setScanNotice({ tone: "info", message: "HID scanner detected. Use the scanner to scan." });
      return;
    }
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        setScanNotice({
          tone: "warning",
          message: "Camera permission is required to scan barcodes.",
        });
        return;
      }
    }
    setCameraScanned(false);
    setScannerOpen(true);
  };

  const handleCameraScan = (value: string) => {
    if (!value) return;
    setCameraScanned(true);
    setScannerOpen(false);
    void handleGlobalScan(value);
  };

  return (
    <View style={styles.container}>
      <PosStatusBar
        storeActive={storeActive}
        deviceActive={deviceActive}
        pendingOutboxCount={pendingOutboxCount}
        mode={statusMode}
        storeName={storeName}
        storeId={deviceStoreId}
        printerOk={printerOk}
        scannerOk={scannerOk}
      />

      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[styles.tabButton, active && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {scanNotice ? (
        <View style={styles.noticeWrap}>
          <ScanNoticeBanner notice={scanNotice} />
        </View>
      ) : null}

      <View style={styles.content}>
        {activeTab === "MENU" ? <MenuScreen /> : null}
        {activeTab === "SELL" ? (
          <SellScanScreen
            storeActive={storeActive}
            scanDisabled={scanDisabled}
            onOpenScanner={handleOpenCamera}
          />
        ) : null}
        {activeTab === "PURCHASE" ? (
          <PurchaseScreen
            storeActive={storeActive}
            scanDisabled={scanDisabled}
            onOpenScanner={handleOpenCamera}
          />
        ) : null}
      </View>

      <Modal
        visible={scannerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setScannerOpen(false)}
      >
        <View style={styles.cameraOverlay}>
          <View style={styles.cameraCard}>
            {cameraPermission?.granted ? (
              <CameraView
                style={styles.cameraView}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: [
                    "qr",
                    "ean13",
                    "ean8",
                    "code128",
                    "code39",
                    "code93",
                    "upc_a",
                    "upc_e",
                    "itf14",
                  ],
                }}
                onBarcodeScanned={cameraScanned ? undefined : (event) => handleCameraScan(event.data)}
              />
            ) : (
              <View style={styles.cameraPermission}>
                <Text style={styles.cameraPermissionText}>
                  Camera permission is required to scan barcodes.
                </Text>
                <Pressable style={styles.cameraPermissionButton} onPress={() => requestCameraPermission()}>
                  <Text style={styles.cameraPermissionButtonText}>Allow Camera</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.cameraActions}>
              <Text style={styles.cameraHint}>Align the barcode/QR inside the frame.</Text>
              <Pressable onPress={() => setScannerOpen(false)}>
                <Text style={styles.cameraClose}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <TextInput
        ref={hidInputRef}
        value={hidInput}
        onChangeText={handleHidChange}
        onSubmitEditing={handleHidSubmit}
        onKeyPress={handleHidKeyPress}
        blurOnSubmit={false}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        caretHidden
        contextMenuHidden
        editable={!scanDisabled}
        inputMode="none"
        showSoftInputOnFocus={false}
        style={styles.hidInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: {
    borderBottomColor: theme.colors.primary,
    backgroundColor: theme.colors.surfaceAlt,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.primaryDark,
  },
  noticeWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  content: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlayLight,
    justifyContent: "center",
    padding: 16,
  },
  cameraCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  cameraView: {
    height: 280,
    width: "100%",
  },
  cameraActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cameraHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  cameraClose: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: "700",
  },
  cameraPermission: {
    padding: 16,
    alignItems: "center",
    gap: 12,
  },
  cameraPermissionText: {
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  cameraPermissionButton: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cameraPermissionButtonText: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  hidInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
});
