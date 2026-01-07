import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  findNodeHandle,
  View,
} from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";

import PosStatusBar from "../components/PosStatusBar";
import ScanNoticeBanner from "../components/ScanNoticeBanner";
import MenuScreen from "./MenuScreen";
import SellScanScreen from "./SellScanScreen";
import PurchaseScreen from "./PurchaseScreen";
import { cacheDeviceInfo, fetchDeviceInfo, getCachedDeviceInfo } from "../services/deviceInfo";
import { clearDeviceSession, getDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import {
  feedHidKey,
  feedHidText,
  resetHidTracking,
  setHidScanHandler,
  submitHidBuffer,
} from "../services/hidScannerService";
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

const HID_ACTIVE_WINDOW_MS = 60000;
const CAMERA_IDLE_TIMEOUT_MS = 5000;
const CAMERA_SCAN_COOLDOWN_MS = 700;
const POS_DEVICE_HINTS = ["sunmi", "pax", "urovo", "newland", "zebra", "honeywell", "datalogic"];

export default function PosRootLayout() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const hidInputRef = useRef<TextInput>(null);
  const hidActiveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraScanCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [activeTab, setActiveTab] = useState<PosTab>("SELL");
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);

  const [storeActive, setStoreActive] = useState<boolean | null>(null);
  const [deviceActive, setDeviceActive] = useState<boolean | null>(null);
  const [deviceType, setDeviceType] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [deviceStoreId, setDeviceStoreId] = useState<string | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [printerOk, setPrinterOk] = useState<boolean | null>(null);
  const [scannerOk, setScannerOk] = useState<boolean>(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraScanLocked, setCameraScanLocked] = useState(false);
  const [hidInput, setHidInput] = useState("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const scanDisabled = !isFocused || storeActive === false || scannerOpen;
  const statusMode = "SELL";
  const hidConnected = scannerOk;
  const cameraAvailable = cameraPermission?.granted !== false;
  const isDedicatedPosDevice = useMemo(() => {
    if (deviceType) return deviceType === "OEM_HANDHELD";
    if (Platform.OS !== "android") return false;
    const androidMeta = (Constants.platform as any)?.android ?? {};
    const manufacturer = String(androidMeta.manufacturer ?? "").toLowerCase();
    const model = String(androidMeta.model ?? "").toLowerCase();
    const deviceName = String(Constants.deviceName ?? "").toLowerCase();
    const signature = `${manufacturer} ${model} ${deviceName}`;
    return POS_DEVICE_HINTS.some((hint) => signature.includes(hint));
  }, [deviceType]);
  const isMobileDevice = !isDedicatedPosDevice;
  const showCameraTimeoutNote = !isMobileDevice && !hidConnected;

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

    const loadDeviceType = async () => {
      const session = await getDeviceSession();
      if (cancelled) return;
      if (session?.deviceType) {
        setDeviceType(session.deviceType);
      }
    };

    void loadDeviceType();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const ensureHidFocus = useCallback(() => {
    if (!isFocused || scanDisabled || scannerOpen) return;
    const state = (TextInput as any).State;
    if (!state) return;
    if (typeof state.currentlyFocusedInput === "function") {
      const focused = state.currentlyFocusedInput();
      if (focused && focused !== hidInputRef.current) return;
    } else if (typeof state.currentlyFocusedField === "function") {
      const focusedTag = state.currentlyFocusedField();
      const hidTag = hidInputRef.current ? findNodeHandle(hidInputRef.current) : null;
      if (focusedTag && hidTag && focusedTag !== hidTag) return;
    } else {
      return;
    }
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

  useEffect(() => {
    const subscription = Keyboard.addListener("keyboardDidHide", () => {
      ensureHidFocus();
    });

    return () => {
      subscription.remove();
    };
  }, [ensureHidFocus]);

  useEffect(() => {
    return () => {
      if (hidActiveTimeoutRef.current) {
        clearTimeout(hidActiveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (cameraIdleTimerRef.current) {
        clearTimeout(cameraIdleTimerRef.current);
      }
      if (cameraScanCooldownRef.current) {
        clearTimeout(cameraScanCooldownRef.current);
      }
    };
  }, []);

  const clearCameraIdleTimer = useCallback(() => {
    if (cameraIdleTimerRef.current) {
      clearTimeout(cameraIdleTimerRef.current);
      cameraIdleTimerRef.current = null;
    }
  }, []);

  const resetCameraIdleTimer = useCallback(() => {
    if (!scannerOpen) return;
    if (isMobileDevice) return;
    if (hidConnected) return;
    clearCameraIdleTimer();
    cameraIdleTimerRef.current = setTimeout(() => {
      setScannerOpen(false);
    }, CAMERA_IDLE_TIMEOUT_MS);
  }, [clearCameraIdleTimer, hidConnected, isMobileDevice, scannerOpen]);

  useEffect(() => {
    if (!scannerOpen || isMobileDevice || hidConnected) {
      clearCameraIdleTimer();
      return;
    }
    resetCameraIdleTimer();
    return clearCameraIdleTimer;
  }, [clearCameraIdleTimer, hidConnected, isMobileDevice, resetCameraIdleTimer, scannerOpen]);

  useEffect(() => {
    if (!scannerOpen) {
      setCameraScanLocked(false);
      if (cameraScanCooldownRef.current) {
        clearTimeout(cameraScanCooldownRef.current);
        cameraScanCooldownRef.current = null;
      }
    }
  }, [scannerOpen]);

  const markHidActive = useCallback(() => {
    setScannerOk(true);
    if (hidActiveTimeoutRef.current) {
      clearTimeout(hidActiveTimeoutRef.current);
    }
    hidActiveTimeoutRef.current = setTimeout(() => {
      setScannerOk(false);
      hidActiveTimeoutRef.current = null;
    }, HID_ACTIVE_WINDOW_MS);
  }, []);

  useEffect(() => {
    setHidScanHandler((value) => {
      markHidActive();
      setHidInput("");
      void handleGlobalScan(value);
    });
    return () => {
      setHidScanHandler(null);
    };
  }, [markHidActive]);

  useEffect(() => {
    if (!scanDisabled) return;
    resetHidTracking();
    setHidInput("");
  }, [scanDisabled]);

  const handleHidChange = (text: string) => {
    if (scanDisabled) return;
    feedHidText(text);
    setHidInput(text);
  };

  const handleHidSubmit = () => {
    if (scanDisabled) return;
    const scanValue = submitHidBuffer();
    if (scanValue) {
      setHidInput("");
    }
  };

  const handleHidKeyPress = (event: { nativeEvent: { key: string } }) => {
    if (scanDisabled) return;
    const scanValue = feedHidKey(event.nativeEvent.key);
    if (scanValue) {
      setHidInput("");
    }
  };

  const handleOpenCamera = async () => {
    if (!isFocused || scannerOpen) return;
    if (storeActive === false) {
      setScanNotice({ tone: "error", message: POS_MESSAGES.storeInactive });
      return;
    }
    if (isDedicatedPosDevice && hidConnected) {
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
    setCameraScanLocked(false);
    setScannerOpen(true);
  };

  const handleCameraScan = (value: string) => {
    if (!value) return;
    setCameraScanLocked(true);
    resetCameraIdleTimer();
    if (cameraScanCooldownRef.current) {
      clearTimeout(cameraScanCooldownRef.current);
    }
    cameraScanCooldownRef.current = setTimeout(() => {
      setCameraScanLocked(false);
      cameraScanCooldownRef.current = null;
    }, CAMERA_SCAN_COOLDOWN_MS);
    void handleGlobalScan(value);
  };

  useEffect(() => {
    if (scannerOpen && isDedicatedPosDevice && hidConnected) {
      setScannerOpen(false);
    }
  }, [hidConnected, isDedicatedPosDevice, scannerOpen]);

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
        cameraAvailable={cameraAvailable}
      />

      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const isMenu = tab.id === "MENU";
          const isSell = tab.id === "SELL";
          const isPurchase = tab.id === "PURCHASE";
          return (
            <Pressable
              key={tab.id}
              style={({ pressed }) => [
                styles.tabButton,
                isMenu && styles.tabMenu,
                isSell && styles.tabSell,
                isPurchase && styles.tabPurchase,
                active && isMenu && styles.tabMenuActive,
                active && isSell && styles.tabSellActive,
                active && isPurchase && styles.tabPurchaseActive,
                pressed && styles.tabPressed,
              ]}
              onPress={() => setActiveTab(tab.id)}
            >
              {isMenu ? (
                <View style={styles.tabMenuContent}>
                  <MaterialCommunityIcons
                    name="menu"
                    size={16}
                    color={active ? theme.colors.textPrimary : theme.colors.textSecondary}
                  />
                  <Text style={[styles.tabText, styles.tabMenuText, active && styles.tabMenuTextActive]}>
                    {tab.label}
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    styles.tabText,
                    isSell && styles.tabSellText,
                    isPurchase && styles.tabPurchaseText,
                    active && isPurchase && styles.tabPurchaseTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              )}
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
                onBarcodeScanned={cameraScanLocked ? undefined : (event) => handleCameraScan(event.data)}
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
              <View style={styles.cameraHintBlock}>
                <Text style={styles.cameraHint}>Align the barcode/QR inside the frame.</Text>
                {showCameraTimeoutNote ? (
                  <Text style={styles.cameraTimeoutHint}>
                    Auto-closes after 5s of inactivity.
                  </Text>
                ) : null}
              </View>
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
        onBlur={() => {
          setTimeout(() => {
            ensureHidFocus();
          }, 50);
        }}
        blurOnSubmit={false}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        autoFocus
        caretHidden
        contextMenuHidden
        editable={!scanDisabled}
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
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tabButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  tabSell: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  tabSellActive: {
    backgroundColor: theme.colors.primary,
  },
  tabPurchase: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  tabPurchaseActive: {
    borderColor: theme.colors.primaryDark,
    backgroundColor: theme.colors.surfaceAlt,
  },
  tabMenu: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 14,
  },
  tabMenuActive: {
    borderColor: theme.colors.textSecondary,
    backgroundColor: theme.colors.surface,
  },
  tabMenuContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tabPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.textSecondary,
  },
  tabSellText: {
    color: theme.colors.textInverse,
  },
  tabPurchaseText: {
    color: theme.colors.primaryDark,
  },
  tabPurchaseTextActive: {
    color: theme.colors.primaryDark,
  },
  tabMenuText: {
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  tabMenuTextActive: {
    color: theme.colors.textPrimary,
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
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cameraHintBlock: {
    flex: 1,
  },
  cameraHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  cameraTimeoutHint: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.textTertiary,
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
