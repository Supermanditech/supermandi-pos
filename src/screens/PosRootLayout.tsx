import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  AccessibilityInfo,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  findNodeHandle,
  useWindowDimensions,
  View,
} from "react-native";
import type { AppStateStatus, LayoutChangeEvent } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { logger } from "../services/logger";

import StaffLoginScreen from "./StaffLoginScreen";
import { useStaffSessionStore } from "../stores/staffSessionStore";
import PosStatusBar from "../components/PosStatusBar";
import ScanNoticeBanner from "../components/ScanNoticeBanner";
import { TabBadge } from "../components/TabBadge";
// REG-AUTH-401: LIMITED MODE banner for non-ACTIVE stores
import LimitedModeBanner from "../components/LimitedModeBanner";
import MenuScreen from "./MenuScreen";
import SellScanScreen from "./SellScanScreen";
import PurchaseScreen from "./PurchaseScreen";
import ReorderScreen from "./ReorderScreen";
import CreditScreen from "./CreditScreen";
// T-117: Per-screen error boundaries for POS tabs
import ScreenErrorBoundary from "../components/ui/ScreenErrorBoundary";
import { usePurchaseCartStore } from "../stores/purchaseCartStore";
import * as reorderApi from "../services/api/reorderApi";
import { cacheDeviceInfo, fetchDeviceInfo, getCachedDeviceInfo, getDeviceMeta, updateDeviceMetadata } from "../services/deviceInfo";
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
// ISSUE-MICRO-087: Import local outbox count for accurate pending display
import { pendingOutboxCount as getLocalOutboxCount } from "../services/offline/outbox";
import {
  addStoreProductToCart,
  onBarcodeScanned,
  setScanRuntime,
  type AddStoreProductRequest,
  type ScanNotice,
  type SellFirstOnboardingRequest,
  type VariantPickerRequest,
} from "../services/scan/handleScan";
import { AddStoreProductModal } from "../components/sell/AddStoreProductModal";
// T-059: Variant picker for LOOSE_BULK products
import { VariantPickerModal } from "../components/sell/VariantPickerModal";
import type { RetailVariant, StoreLookupProduct } from "../services/api/productsApi";
import { useCartStore } from "../stores/cartStore";
import { getLastPosMode, setLastPosMode } from "../services/posMode";
import { POS_MESSAGES } from "../utils/uiStatus";
import { hydrateStockCacheForStore, setStockCacheStoreId } from "../services/stockCache";
import { refreshStockSnapshot } from "../services/stockService";
import { useSettingsStore } from "../stores/settingsStore";
import { theme, useThemeColors } from "../theme";
import { showToast } from "../utils/showToast";
// GATE-000: Import probeReadiness for startup endpoint check
import { probeReadiness } from "../services/api/readinessGate";
// T-123: Session timeout hook
import { useSessionTimeout } from "../hooks/useSessionTimeout";
// T-126: Offline indicator banner
import { OfflineBanner } from "../components/ui/OfflineBanner";
// T-174: Real-time settings sync (SSE/polling)
import { startSSEClient, stopSSEClient } from "../services/sseClient";
// T-175: Sync status widget
import { SyncStatusWidget } from "../components/ui/SyncStatusWidget";
// T-178: Periodic stock reconciliation
import { startStockReconciliation, stopStockReconciliation } from "../services/stockReconciliation";
// T-179: Background auto-sync
import { startAutoSync, stopAutoSync } from "../services/autoSync";

type RootStackParamList = {
  SellScan: undefined;
  EnrollDevice: undefined;
  DeviceBlocked: undefined;
  ForceUpdate: { currentVersion?: string; requiredVersion?: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList, "SellScan">;

type PosTab = "MENU" | "SELL" | "PURCHASE" | "REORDER" | "CREDIT";
type TabLayout = { x: number; y: number; width: number; height: number };

const TABS: Array<{ id: PosTab; label: string }> = [
  { id: "MENU", label: "MENU" },
  { id: "SELL", label: "SELL" },
  { id: "PURCHASE", label: "PURCHASE" },
  { id: "REORDER", label: "REORDER" },
  { id: "CREDIT", label: "CREDIT" },
];

// GL-CRIT-0091: Reduced HID scanner timeout from 60s to 15s for faster camera fallback
const HID_ACTIVE_WINDOW_MS = 15000;
// GL-CRIT-0092: Increased camera idle timeout from 5s to 45s for better usability
const CAMERA_IDLE_TIMEOUT_MS = 45000;
const CAMERA_SCAN_COOLDOWN_MS = 700;
const POS_DEVICE_HINTS = ["sunmi", "pax", "urovo", "newland", "zebra", "honeywell", "datalogic"];
const TAB_PILL_ANIMATION_MS = 200;

export default function PosRootLayout() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const hidInputRef = useRef<TextInput>(null);
  // LIVE.POS.THEME.TOKENS_BRAND_PARITY.001: Dynamic theme colors
  const tc = useThemeColors();
  // STG-286: Dynamic styles for dark mode support
  const styles = useMemo(() => createStyles(tc), [tc]);
  const hidFocusRequestRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hidActiveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraScanCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedMode, setSelectedModeInternal] = useState<PosTab>("SELL");
  const [lastModeLoaded, setLastModeLoaded] = useState(false);
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);
  const [tabLayouts, setTabLayouts] = useState<Partial<Record<PosTab, TabLayout>>>({});
  const tabIndicatorX = useRef(new Animated.Value(0)).current;
  const tabIndicatorWidth = useRef(new Animated.Value(0)).current;
  const tabIndicatorReadyRef = useRef(false);
  const buyEnabled = useSettingsStore((state) => state.buyEnabled);
  const reorderEnabled = useSettingsStore((state) => state.reorderEnabled);
  const creditEnabled = useSettingsStore((state) => state.creditEnabled);
  const cartItemCount = usePurchaseCartStore((state) => state.items.length);
  const [pendingReorderCount, setPendingReorderCount] = useState(0);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const reorderPulse = useRef(new Animated.Value(0)).current;
  const reorderPulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const uiStatusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uiStatusInFlightRef = useRef(false);
  const uiStatusAppStateRef = useRef(AppState.currentState);
  const reorderIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reorderInFlightRef = useRef(false);
  const reorderAppStateRef = useRef(AppState.currentState);

  const [storeActive, setStoreActive] = useState<boolean | null>(null);
  // UI-REVEAL: Track API connection errors to show banner instead of hiding UI
  const [apiConnectionError, setApiConnectionError] = useState<string | null>(null);

  // DEV-055: Restrict to MENU when store is inactive
  const effectiveMode = storeActive === false ? "MENU" : selectedMode;
  const setSelectedMode = useCallback((mode: PosTab) => {
    // Block navigation to other tabs if store is inactive
    if (storeActive === false && mode !== "MENU") {
      return; // Silently block - the UI will show disabled state
    }

    // T-124: Confirm tab switch when sell cart has items
    const currentTab = selectedMode;
    if (mode !== currentTab && currentTab === "SELL") {
      const sellCartItems = useCartStore.getState().items;
      if (sellCartItems.length > 0) {
        Alert.alert(
          "Cart Not Empty",
          `You have ${sellCartItems.length} item${sellCartItems.length > 1 ? "s" : ""} in your cart. Switching tabs will keep your cart. Continue?`,
          [
            { text: "Stay", style: "cancel" },
            { text: "Switch", onPress: () => setSelectedModeInternal(mode) },
          ]
        );
        return;
      }
    }

    // T-124: Confirm tab switch when purchase cart has items
    if (mode !== currentTab && currentTab === "PURCHASE") {
      const purchaseCartItems = usePurchaseCartStore.getState().items;
      if (purchaseCartItems.length > 0) {
        Alert.alert(
          "Purchase Cart Not Empty",
          `You have ${purchaseCartItems.length} item${purchaseCartItems.length > 1 ? "s" : ""} in your purchase cart. Continue?`,
          [
            { text: "Stay", style: "cancel" },
            { text: "Switch", onPress: () => setSelectedModeInternal(mode) },
          ]
        );
        return;
      }
    }

    setSelectedModeInternal(mode);
  }, [storeActive, selectedMode]);

  // LIVE.NAV.POS.PURCHASE_CART_GUARD.001: Prevent leaving SellScan when purchase cart has items
  useEffect(() => {
    if (cartItemCount === 0) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (e.data.action.type === 'RESET') return;
      e.preventDefault();
      Alert.alert(
        t('purchase_cart_not_empty', 'Purchase Cart Not Empty'),
        t('purchase_cart_leave_warning', 'Your purchase cart will be saved. Do you want to leave?'),
        [
          { text: t('stay', 'Stay'), style: 'cancel' },
          { text: t('leave', 'Leave'), style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, cartItemCount, t]);

  const [deviceActive, setDeviceActive] = useState<boolean | null>(null);
  const [deviceType, setDeviceType] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeCode, setStoreCode] = useState<string | null>(null); // GO-LIVE: Human-readable store code
  // REG-AUTH-401: Store status for LIMITED MODE display
  const [storeStatus, setStoreStatus] = useState<string | null>(null);
  const [deviceStoreId, setDeviceStoreId] = useState<string | null>(null);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);
  const [printerOk, setPrinterOk] = useState<boolean | null>(null);
  const [scannerOk, setScannerOk] = useState<boolean>(false);
  const [scanLookupV2Enabled, setScanLookupV2Enabled] = useState(false);
  const [sellOnboardingRequest, setSellOnboardingRequest] =
    useState<SellFirstOnboardingRequest | null>(null);
  // SD-ONBOARD-001B: Add store product modal state for digitisation flow
  const [addStoreProductRequest, setAddStoreProductRequest] =
    useState<AddStoreProductRequest | null>(null);
  // T-059: Variant picker modal state
  const [variantPickerRequest, setVariantPickerRequest] =
    useState<VariantPickerRequest | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraScanLocked, setCameraScanLocked] = useState(false);
  const [hidInput, setHidInput] = useState("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const { width: screenWidth } = useWindowDimensions();

  const sellOnboardingActive = sellOnboardingRequest !== null && effectiveMode === "SELL";
  // SD-ONBOARD-001B: Block scans while add store product modal is open
  const addStoreProductActive = addStoreProductRequest !== null && effectiveMode === "SELL";
  // T-059: Block scans while variant picker is open
  const variantPickerActive = variantPickerRequest !== null && effectiveMode === "SELL";
  const scanDisabled = !isFocused || storeActive === false || scannerOpen || sellOnboardingActive || addStoreProductActive || variantPickerActive;
  const cartMode = effectiveMode === "PURCHASE" ? "PURCHASE" : "SELL";
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
  // Lowered threshold from 360 to 280 so Menu text shows on handheld POS devices
  const compactTabs = screenWidth <= 280;
  const reorderLabel = reorderEnabled ? t('tabs.reorderOn') : t('tabs.reorderOff');
  const reorderStatusLabel = reorderEnabled ? "ON" : "OFF";
  const tabLabels: Record<PosTab, string> = {
    MENU: t('tabs.menu'),
    SELL: t('tabs.sell'),
    PURCHASE: t('tabs.purchase', { defaultValue: 'PURCHASE' }),
    REORDER: reorderLabel,
    CREDIT: t('tabs.credit', { defaultValue: 'CREDIT' }),
  };
  // Always show Menu text on handheld POS devices for better usability
  const showMenuText = true;
  const reorderTabColor = reorderEnabled ? tc.success : tc.error;
  const reorderTextColor = tc.textInverse;
  const showReorderPulse = reorderEnabled && !reduceMotionEnabled;
  const reorderPulseScale = reorderPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });
  const reorderPulseOpacity = reorderPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  const handleTabLayout = useCallback(
    (tabId: PosTab) => (event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      setTabLayouts((prev) => {
        const existing = prev[tabId];
        if (
          existing &&
          existing.x === x &&
          existing.y === y &&
          existing.width === width &&
          existing.height === height
        ) {
          return prev;
        }
        return { ...prev, [tabId]: { x, y, width, height } };
      });
    },
    []
  );

  useEffect(() => {
    const layout = tabLayouts[effectiveMode];
    if (!layout) return;
    if (!tabIndicatorReadyRef.current) {
      tabIndicatorX.setValue(layout.x);
      tabIndicatorWidth.setValue(layout.width);
      tabIndicatorReadyRef.current = true;
      return;
    }
    Animated.parallel([
      Animated.timing(tabIndicatorX, {
        toValue: layout.x,
        duration: TAB_PILL_ANIMATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(tabIndicatorWidth, {
        toValue: layout.width,
        duration: TAB_PILL_ANIMATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start();
  }, [effectiveMode, tabIndicatorWidth, tabIndicatorX, tabLayouts]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotionEnabled(Boolean(enabled));
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (enabled) => {
        setReduceMotionEnabled(Boolean(enabled));
      }
    );
    return () => {
      mounted = false;
      if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, []);

  // GO-LIVE FIX: Check session validity on mount - redirect to EnrollDevice if no token
  useEffect(() => {
    let cancelled = false;
    const checkSession = async () => {
      const session = await getDeviceSession();
      if (cancelled) return;
      if (!session || !session.deviceToken) {
        logger.debug("PosRootLayout", "No valid session, redirecting to EnrollDevice");
        navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
      }
    };
    void checkSession();
    return () => { cancelled = true; };
  }, [navigation]);

  useEffect(() => {
    if (reorderPulseAnimationRef.current) {
      reorderPulseAnimationRef.current.stop();
      reorderPulseAnimationRef.current = null;
    }

    if (!showReorderPulse) {
      reorderPulse.setValue(0);
      return;
    }

    reorderPulseAnimationRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(reorderPulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(reorderPulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    reorderPulseAnimationRef.current.start();
    return () => {
      if (reorderPulseAnimationRef.current) {
        reorderPulseAnimationRef.current.stop();
        reorderPulseAnimationRef.current = null;
      }
    };
  }, [reorderPulse, showReorderPulse]);

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
    const intent = effectiveMode === "PURCHASE" ? "PURCHASE" : "SELL";
    const runtimeMode = "SELL";
    setScanRuntime({
      intent,
      mode: runtimeMode,
      storeActive,
      scanLookupV2Enabled,
      onNotice: setScanNotice,
      onSellFirstOnboarding: (request) => {
        if (effectiveMode !== "SELL") return;
        setSellOnboardingRequest((current) => current ?? request);
      },
      sellFirstOnboardingActive: sellOnboardingActive,
      onDeviceAuthError: handleDeviceAuthError,
      onStoreInactive: () => setStoreActive(false),
      // SD-ONBOARD-001B: Digitisation flow callbacks
      digitisationFlowEnabled: true,
      onAddStoreProduct: (request) => {
        if (effectiveMode !== "SELL") return;
        setAddStoreProductRequest((current) => current ?? request);
      },
      addStoreProductActive,
      // T-059: Variant picker for LOOSE_BULK products
      onVariantPicker: (request) => {
        if (effectiveMode !== "SELL") return;
        setVariantPickerRequest((current) => current ?? request);
      },
      variantPickerActive,
    });
  }, [addStoreProductActive, effectiveMode, handleDeviceAuthError, scanLookupV2Enabled, sellOnboardingActive, storeActive, variantPickerActive]);

  useEffect(() => {
    let cancelled = false;
    const loadLastMode = async () => {
      const lastMode = await getLastPosMode();
      if (cancelled) return;
      setSelectedMode(lastMode === "PURCHASE" ? "PURCHASE" : "SELL");
      setLastModeLoaded(true);
    };
    // REQ.AUDIT.W5.POS.ASYNCSTORAGE-ERROR-UNHANDLED.001: handle getLastPosMode errors gracefully
    loadLastMode().catch(() => {
      if (!cancelled) {
        setSelectedMode("SELL");
        setLastModeLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lastModeLoaded) return;
    if (selectedMode === "SELL" || selectedMode === "PURCHASE") {
      void setLastPosMode(selectedMode);
    }
  }, [lastModeLoaded, selectedMode]);

  useEffect(() => {
    setScanNotice(null);
  }, [effectiveMode]);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      if (cancelled) return;
      if (uiStatusInFlightRef.current) return;
      if (uiStatusAppStateRef.current !== "active") return;
      uiStatusInFlightRef.current = true;
      try {
        // GO-LIVE FIX: Check session before making API calls - redirect if cleared
        const session = await getDeviceSession();
        if (!session || !session.deviceToken) {
          logger.debug("PosRootLayout", "No valid session, redirecting to EnrollDevice (loadStatus)");
          navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
          return;
        }
        const status = await fetchUiStatus();
        if (cancelled) return;
        // UI-REVEAL: Clear connection error on successful API call
        setApiConnectionError(null);
        setStoreActive(status.storeActive ?? null);
        setDeviceActive(status.deviceActive ?? null);
        setDeviceStoreId(status.storeId ?? null);
        // ISSUE-MICRO-087: Use local SQLite outbox count (server always returns 0)
        const localOutbox = await getLocalOutboxCount();
        setPendingOutboxCount(localOutbox);
        setPrinterOk(status.printerOk ?? null);
        setScanLookupV2Enabled(Boolean(status.features?.scan_lookup_v2));
        // GO-LIVE: Update local storeName/storeCode state and persist to settingsStore
        if (status.storeName) {
          setStoreName((prev) => status.storeName ?? prev);
        }
        if (status.storeCode) {
          setStoreCode((prev) => status.storeCode ?? prev);
        }
        // REG-AUTH-401: Update storeStatus for LIMITED MODE display
        if (status.storeStatus !== undefined) {
          setStoreStatus(status.storeStatus);
        }
        // Persist to settingsStore for offline display
        if (status.storeName || status.storeCode) {
          const { setStoreName: persistStoreName, setStoreCode: persistStoreCode } = useSettingsStore.getState();
          if (status.storeName) persistStoreName(status.storeName);
          if (status.storeCode) persistStoreCode(status.storeCode);
        }
        // GO-LIVE-002: Sync feature flags to settingsStore
        // CA-1.4-006: Unified settings propagation from backend
        if (status.features) {
          const { setBuyEnabled, setReorderEnabled, setCreditEnabled, setBnplEnabled } = useSettingsStore.getState();
          // buyEnabled defaults to ordersEnabled if not explicitly set
          const buyFlag = status.features.buyEnabled ?? status.features.ordersEnabled ?? true;
          const reorderFlag = status.features.reorderEnabled ?? false;
          const creditFlag = status.features.creditEnabled ?? false; // SM-022
          const bnplFlag = status.features.bnplEnabled ?? false; // GL-AUD-007
          setBuyEnabled(buyFlag);
          setReorderEnabled(reorderFlag);
          setCreditEnabled(creditFlag); // SM-022
          setBnplEnabled(bnplFlag); // GL-AUD-007
        }
        // GATE-000: Probe Phase-1 endpoints on startup (after ui-status succeeds)
        // This runs asynchronously and caches results for 5 minutes
        void probeReadiness();

        if (status.deviceActive === false) {
          navigation.reset({ index: 0, routes: [{ name: "DeviceBlocked" }] });
          return;
        }
        // SA-P2-003: Force update screen when app version is below minimum
        if (status.forceUpdate) {
          const meta = getDeviceMeta();
          navigation.reset({
            index: 0,
            routes: [{
              name: "ForceUpdate",
              params: {
                currentVersion: meta.appVersion ?? "unknown",
                requiredVersion: status.minAppVersion ?? "unknown",
              },
            }],
          });
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
          // UI-REVEAL: Set connection error for other API failures
          setApiConnectionError(error.message || "Server connection failed");
        } else {
          // UI-REVEAL: Network or unknown error
          setApiConnectionError("Could not connect to server");
        }
      } finally {
        uiStatusInFlightRef.current = false;
      }
    };

    // POS-HEALTH-002: De-amplify uiStatus polling (was 15s, now 60s)
    const startPolling = () => {
      if (uiStatusIntervalRef.current) return;
      void loadStatus();
      uiStatusIntervalRef.current = setInterval(() => {
        void loadStatus();
      }, 60000); // 60s instead of 15s for 10k scale
    };

    const stopPolling = () => {
      if (!uiStatusIntervalRef.current) return;
      clearInterval(uiStatusIntervalRef.current);
      uiStatusIntervalRef.current = null;
    };

    const handleAppStateChange = (state: AppStateStatus) => {
      uiStatusAppStateRef.current = state;
      if (state === "active") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    handleAppStateChange(AppState.currentState);
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      cancelled = true;
      stopPolling();
      subscription.remove();
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

    const applyInfo = (info: { storeId: string | null; storeName: string | null; storeCode?: string | null }) => {
      if (cancelled) return;
      setDeviceStoreId(info.storeId ?? null);
      setStoreName(info.storeName ?? null);
      if (info.storeCode) setStoreCode(info.storeCode);
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
        // P3-001: Update device metadata on backend (captures info for pre-existing devices)
        void updateDeviceMetadata();
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
    setStockCacheStoreId(deviceStoreId);
    void hydrateStockCacheForStore(deviceStoreId);
  }, [deviceStoreId]);

  useEffect(() => {
    if (effectiveMode !== "SELL") return;
    void refreshStockSnapshot();
  }, [deviceStoreId, effectiveMode]);

  // T-174/T-178/T-179: Start data sync services on mount
  useEffect(() => {
    // T-174: Start SSE client for real-time settings sync from web
    startSSEClient();
    // T-178: Start periodic stock reconciliation (every 15 min)
    startStockReconciliation();
    // T-179: Start background auto-sync (default 60s interval)
    void startAutoSync();

    return () => {
      stopSSEClient();
      stopStockReconciliation();
      stopAutoSync();
    };
  }, []);

  // Fetch pending reorder count for badge
  useEffect(() => {
    if (!deviceStoreId || !reorderEnabled) {
      setPendingReorderCount(0);
      return;
    }

    let cancelled = false;

    const fetchCount = async () => {
      if (cancelled) return;
      if (reorderInFlightRef.current) return;
      if (reorderAppStateRef.current !== "active") return;
      reorderInFlightRef.current = true;
      try {
        const response = await reorderApi.listPendingReorders(deviceStoreId, {
          status: "pending",
          limit: 1,
        });
        if (!cancelled) {
          setPendingReorderCount(response.pagination.total);
        }
      } catch (error) {
        // LIVE.POS.SESSION_LOGGING_DEV_GUARD.001: Only log in development
        if (__DEV__) console.error("[PosRootLayout] Failed to fetch pending reorder count:", error);
      } finally {
        reorderInFlightRef.current = false;
      }
    };

    const startPolling = () => {
      if (reorderIntervalRef.current) return;
      void fetchCount();
      reorderIntervalRef.current = setInterval(() => {
        void fetchCount();
      }, 60000);
    };

    const stopPolling = () => {
      if (!reorderIntervalRef.current) return;
      clearInterval(reorderIntervalRef.current);
      reorderIntervalRef.current = null;
    };

    const handleAppStateChange = (state: AppStateStatus) => {
      reorderAppStateRef.current = state;
      if (state === "active") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    handleAppStateChange(AppState.currentState);
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      cancelled = true;
      stopPolling();
      subscription.remove();
    };
  }, [deviceStoreId, reorderEnabled]);

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

  const scheduleHidFocus = useCallback(() => {
    if (!isFocused || scanDisabled || scannerOpen) return;
    if (hidFocusRequestRef.current) {
      clearTimeout(hidFocusRequestRef.current);
    }
    hidFocusRequestRef.current = setTimeout(() => {
      hidFocusRequestRef.current = null;
      ensureHidFocus();
    }, 50);
  }, [ensureHidFocus, isFocused, scanDisabled, scannerOpen]);



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
      if (hidFocusRequestRef.current) {
        clearTimeout(hidFocusRequestRef.current);
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
      // REQ.AUDIT.W5.POS.HID-SCANNER-TIMEOUT-NO-NOTIFICATION.001
      showToast("Scanner disconnected — tap camera icon to scan");
    }, HID_ACTIVE_WINDOW_MS);
  }, []);

  useEffect(() => {
    setHidScanHandler((value) => {
      logger.debug("HidScan", `received:${value}`);
      markHidActive();
      setHidInput("");

      // Check if we should block the scan and show feedback
      if (sellOnboardingActive) {
        logger.debug("HidScan", "blocked:onboarding_active");
        showToast("Complete price setup first");
        return;
      }
      // SD-ONBOARD-001B: Block scans when add store product modal is open
      if (addStoreProductActive) {
        logger.debug("HidScan", "blocked:add_store_product_active");
        showToast("Complete adding product first");
        return;
      }
      if (scannerOpen) {
        logger.debug("HidScan", "blocked:camera_open");
        showToast("Close camera to use scanner");
        return;
      }
      if (storeActive === false) {
        logger.debug("HidScan", "blocked:store_inactive");
        showToast("Store is inactive");
        return;
      }
      if (!isFocused) {
        logger.debug("HidScan", "blocked:not_focused");
        return;
      }

      // Process the scan
      (async () => {
        try {
          await onBarcodeScanned(value);
        } catch (err) {
          // LIVE.POS.SESSION_LOGGING_DEV_GUARD.001: Only log in development
          if (__DEV__) console.error("hid_scan_error:", err);
        }
      })();
    });
    return () => {
      setHidScanHandler(null);
    };
  }, [addStoreProductActive, isFocused, markHidActive, scannerOpen, sellOnboardingActive, storeActive]);

  useEffect(() => {
    if (!scanDisabled) return;
    resetHidTracking();
    setHidInput("");
  }, [scanDisabled]);

  const handleHidChange = (text: string) => {
    // Mark HID as active whenever we receive any input (shows scanner is connected)
    if (text && text.length > 0) {
      markHidActive();
    }

    // Always process HID input to the buffer (so we capture the full barcode)
    feedHidText(text);
    setHidInput(text);

    // If scanning is disabled, show feedback on why (only once per blocked scan)
    if (scanDisabled && text.length >= 4) {
      if (sellOnboardingActive) {
        showToast("Complete price setup first");
      } else if (addStoreProductActive) {
        showToast("Complete adding product first");
      } else if (scannerOpen) {
        showToast("Close camera to use scanner");
      } else if (storeActive === false) {
        showToast("Store is inactive");
      }
    }
  };

  const handleHidSubmit = () => {
    // Always submit the buffer - let the handler decide what to do
    submitHidBuffer();
  };

  const handleHidKeyPress = (event: { nativeEvent: { key: string } }) => {
    // Always process key presses - let the handler decide what to do with the scan
    feedHidKey(event.nativeEvent.key);
  };

  const closeSellOnboarding = useCallback(() => {
    setSellOnboardingRequest(null);
  }, []);

  // SD-ONBOARD-001B: Close handler for add store product modal
  const closeAddStoreProduct = useCallback(() => {
    setAddStoreProductRequest(null);
  }, []);

  // T-059: Close handler for variant picker modal
  const closeVariantPicker = useCallback(() => {
    setVariantPickerRequest(null);
  }, []);

  // T-059: Handle variant selection — add variant to cart with variant-specific price
  const handleVariantSelect = useCallback((variant: RetailVariant, parentProduct: StoreLookupProduct) => {
    const cartState = useCartStore.getState();
    cartState.addItem({
      id: parentProduct.global_product_id,
      name: `${parentProduct.store_display_name || parentProduct.global_name} — ${variant.variantLabel}`,
      priceMinor: variant.sellPriceMinor,
      currency: "INR",
      barcode: variant.barcode,
      metadata: {
        variantId: variant.id,
        variantLabel: variant.variantLabel,
        variantQty: variant.variantQty,
        baseUnit: variant.baseUnit,
        parentProductId: parentProduct.global_product_id,
        storeProductId: parentProduct.store_product_id,
      },
    });
    showToast(`${variant.variantLabel} added`);
  }, []);

  // T-059: Fallback — add parent product directly to cart (no variant selected)
  const handleVariantFallback = useCallback((parentProduct: StoreLookupProduct, barcode: string) => {
    const cartState = useCartStore.getState();
    cartState.addItem({
      id: parentProduct.global_product_id,
      name: parentProduct.store_display_name || parentProduct.global_name || barcode,
      priceMinor: parentProduct.sell_price ?? 0,
      currency: "INR",
      barcode,
      metadata: {
        globalProductId: parentProduct.global_product_id,
        storeProductId: parentProduct.store_product_id,
      },
    });
  }, []);

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

  const handleCameraScan = (value: string, format?: string) => {
    if (!value) return;
    setCameraScanLocked(true);
    resetCameraIdleTimer();
    if (cameraScanCooldownRef.current) {
      clearTimeout(cameraScanCooldownRef.current);
    }
    // Auto-close camera after single scan
    setScannerOpen(false);
    clearCameraIdleTimer();
    // Wrap in try-catch to prevent app crash on scan errors
    (async () => {
      try {
        await onBarcodeScanned(value, format);
      } catch (err) {
        // LIVE.POS.SESSION_LOGGING_DEV_GUARD.001: Only log in development
        if (__DEV__) console.error("camera_scan_error:", err);
      }
    })();
  };

  useEffect(() => {
    if (scannerOpen && isDedicatedPosDevice && hidConnected) {
      setScannerOpen(false);
    }
  }, [hidConnected, isDedicatedPosDevice, scannerOpen]);

  // SA-P1-001: Staff session gate — require staff login before POS operations
  const staffSession = useStaffSessionStore((s) => s.session);
  const clearStaffSession = useStaffSessionStore((s) => s.clearSession);
  const isCashier = staffSession?.role === "CASHIER";

  // T-123: Session timeout — auto-logout staff after 35 min idle
  const { resetTimer: resetSessionTimer } = useSessionTimeout(clearStaffSession);

  if (!staffSession) {
    return <StaffLoginScreen storeName={storeName} />;
  }

  const indicatorLayout = tabLayouts[effectiveMode];
  const indicatorColor =
    effectiveMode === "REORDER" ? reorderTabColor : tc.primary;

  return (
    <View
      style={[styles.container, { backgroundColor: tc.background }]}
      onStartShouldSetResponderCapture={() => {
        scheduleHidFocus();
        // T-123: Reset session timeout on any touch interaction
        resetSessionTimer();
        return false;
      }}
    >
      <PosStatusBar
        storeActive={storeActive}
        deviceActive={deviceActive}
        pendingOutboxCount={pendingOutboxCount}
        mode={statusMode}
        storeName={storeName}
        storeId={deviceStoreId}
        storeCode={storeCode}
        printerOk={printerOk}
        scannerOk={scannerOk}
        cameraAvailable={cameraAvailable}
      />

      {/* T-175: Sync status widget — shows sync progress, queue depth, and drift info */}
      <SyncStatusWidget />

      {/* REG-AUTH-401: LIMITED MODE banner - shows when store status is not ACTIVE */}
      {/* Replaces DEV-055 store inactive banner with status-aware messaging */}
      <LimitedModeBanner status={storeStatus} storeName={storeName} />

      {/* UI-REVEAL: API connection error banner - show warning but keep UI functional */}
      {apiConnectionError && storeActive !== false && (
        <View style={[styles.apiConnectionBanner, { backgroundColor: tc.warningSoft, borderBottomColor: tc.warning }]}>
          <MaterialCommunityIcons name="cloud-off-outline" size={16} color={tc.warning} />
          <Text style={[styles.apiConnectionBannerText, { color: tc.warning }]}>
            Offline mode: {apiConnectionError}
          </Text>
        </View>
      )}

      <View style={[styles.tabs, { backgroundColor: tc.surface, borderBottomColor: tc.border }]}>
        {indicatorLayout ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.tabIndicator,
              {
                top: indicatorLayout.y,
                height: indicatorLayout.height,
                width: tabIndicatorWidth,
                backgroundColor: indicatorColor,
                transform: [{ translateX: tabIndicatorX }],
              },
            ]}
          />
        ) : null}
        {TABS.map((tab) => {
          const active = effectiveMode === tab.id;
          const isReorder = tab.id === "REORDER";
          const isPurchase = tab.id === "PURCHASE";
          const isCredit = tab.id === "CREDIT";
          // UI-REVEAL: Feature-disabled tabs are shown but disabled (not hidden)
          const isFeatureDisabled = (isPurchase && !buyEnabled) || (isReorder && !reorderEnabled) || (isCredit && !creditEnabled);
          // SA-P1-001: CASHIER cannot access PURCHASE (stock-in) tab
          const isRoleRestricted = isPurchase && isCashier;
          // DEV-055: Disable non-MENU tabs when store is inactive
          const isStoreDisabled = storeActive === false && tab.id !== "MENU";
          const isDisabled = isStoreDisabled || isFeatureDisabled || isRoleRestricted;
          const iconColor = isDisabled
            ? tc.textTertiary
            : active
              ? tc.textInverse
              : tc.textPrimary;
          const tabTextColor = isDisabled
            ? tc.textTertiary
            : isReorder
              ? reorderTextColor
              : active
                ? tc.textInverse
                : tc.textPrimary;
          // Badge counts
          const badgeCount = isPurchase ? cartItemCount : isReorder && reorderEnabled ? pendingReorderCount : 0;
          return (
            <Pressable
              key={tab.id}
              onLayout={handleTabLayout(tab.id)}
              style={({ pressed }) => [
                styles.tabButton,
                { borderColor: tc.primary },
                isReorder && styles.reorderTab,
                isReorder && (reorderEnabled ? styles.reorderTabOn : styles.reorderTabOff),
                active && styles.tabButtonActive,
                pressed && !isDisabled && styles.tabPressed,
                isDisabled && [styles.tabButtonDisabled, { borderColor: tc.border }],
              ]}
              onPress={() => {
                // SA-P1-001: Show toast for role-restricted tabs
                if (isRoleRestricted) {
                  showToast("Stock-in is restricted to Stock Manager and Manager roles");
                  return;
                }
                // UI-REVEAL: Show toast for feature-disabled tabs instead of hiding them
                if (isFeatureDisabled) {
                  const featureName = isPurchase ? "Purchase Orders" : isReorder ? "Reorder" : "Credit";
                  showToast(`${featureName} is not enabled for this store`);
                  return;
                }
                setSelectedMode(tab.id);
              }}
              disabled={isStoreDisabled}
              testID={`tab-${tab.id.toLowerCase()}`}
              accessibilityLabel={
                isReorder ? `Reorder ${reorderStatusLabel}`
                  : tab.id === "MENU" ? "Menu"
                  : `${tabLabels[tab.id]} tab${active ? ", selected" : ""}`
              }
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: isDisabled || isStoreDisabled }}
            >
              {tab.id === "MENU" ? (
                <View style={styles.tabMenuContent}>
                  <MaterialCommunityIcons name="menu" size={16} color={iconColor} />
                  {showMenuText ? (
                    <Text
                      style={[styles.tabText, { color: tc.textPrimary }, compactTabs && styles.tabTextCompact, active && { color: tc.textInverse }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {tabLabels[tab.id]}
                    </Text>
                  ) : null}
                </View>
              ) : isReorder ? (
                <View style={styles.tabLabelRow}>
                  <Text
                    style={[
                      styles.tabText,
                      compactTabs && styles.tabTextCompact,
                      { color: tabTextColor }
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    testID={reorderEnabled ? "tab-reorder-status-on" : "tab-reorder-status-off"}
                  >
                    {reorderLabel}
                  </Text>
                  {reorderEnabled && pendingReorderCount > 0 ? (
                    <TabBadge count={pendingReorderCount} color={tc.warning} />
                  ) : reorderEnabled ? (
                    <Animated.View
                      style={[
                        styles.reorderPulseDot,
                        {
                          opacity: showReorderPulse ? reorderPulseOpacity : 1,
                          transform: [{ scale: showReorderPulse ? reorderPulseScale : 1 }],
                        },
                      ]}
                    />
                  ) : null}
                </View>
              ) : (
                <View style={styles.tabLabelRow}>
                  <Text
                    style={[
                      styles.tabText,
                      compactTabs && styles.tabTextCompact,
                      active && styles.tabTextActive,
                      !active && { color: tabTextColor },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {tabLabels[tab.id]}
                  </Text>
                  {badgeCount > 0 ? (
                    <TabBadge
                      count={badgeCount}
                      color={active ? tc.textInverse : tc.primary}
                      textColor={active ? tc.primary : tc.textInverse}
                    />
                  ) : null}
                </View>
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

      {/* T-117: Each tab wrapped with ScreenErrorBoundary for isolated crash recovery */}
      <View style={styles.content}>
        {effectiveMode === "MENU" ? (
          <ScreenErrorBoundary screenName="Menu">
            <MenuScreen />
          </ScreenErrorBoundary>
        ) : null}
        {effectiveMode === "SELL" ? (
          <ScreenErrorBoundary screenName="Sell">
            <SellScanScreen
              storeActive={storeActive}
              scanDisabled={scanDisabled}
              onOpenScanner={handleOpenCamera}
              cartMode={cartMode}
              sellOnboardingRequest={sellOnboardingRequest}
              onSellOnboardingClose={closeSellOnboarding}
              isScanningActive={scannerOpen || hidConnected}
            />
          </ScreenErrorBoundary>
        ) : null}
        {effectiveMode === "PURCHASE" ? (
          <ScreenErrorBoundary screenName="Purchase">
            <PurchaseScreen
              onOpenScanner={handleOpenCamera}
            />
          </ScreenErrorBoundary>
        ) : null}
        {effectiveMode === "REORDER" ? (
          <ScreenErrorBoundary screenName="Reorder">
            <ReorderScreen onNavigateToBuy={() => setSelectedModeInternal("PURCHASE")} />
          </ScreenErrorBoundary>
        ) : null}
        {effectiveMode === "CREDIT" ? (
          <ScreenErrorBoundary screenName="Credit">
            <CreditScreen onBack={() => setSelectedModeInternal("MENU")} />
          </ScreenErrorBoundary>
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
                onBarcodeScanned={
                  cameraScanLocked ? undefined : (event) => handleCameraScan(event.data, event.type)
                }
              />
            ) : (
              <View style={styles.cameraPermission}>
                <Text style={styles.cameraPermissionText}>
                  Camera permission is required to scan barcodes.
                </Text>
                <Pressable
                  style={styles.cameraPermissionButton}
                  onPress={() => requestCameraPermission()}
                  testID="camera-allow-btn"
                  accessibilityLabel="Allow camera access"
                  accessibilityRole="button"
                >
                  <Text style={styles.cameraPermissionButtonText}>Allow Camera</Text>
                </Pressable>
              </View>
            )}
            <View style={styles.cameraActions}>
              <View style={styles.cameraHintBlock}>
                <Text style={styles.cameraHint}>Align the barcode/QR inside the frame.</Text>
                {showCameraTimeoutNote ? (
                  <Text style={styles.cameraTimeoutHint}>
                    Auto-closes after 45s of inactivity.
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => setScannerOpen(false)}
                testID="camera-close-btn"
                accessibilityLabel="Close camera"
                accessibilityRole="button"
              >
                <Text style={styles.cameraClose}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* SD-ONBOARD-001B: Add Store Product Modal */}
      <AddStoreProductModal
        visible={addStoreProductActive}
        request={addStoreProductRequest}
        onClose={closeAddStoreProduct}
        onSuccess={(storeProduct, shouldAddToCart) => {
          closeAddStoreProduct();
          if (shouldAddToCart) {
            addStoreProductToCart(storeProduct);
          }
        }}
      />

      {/* T-059: Variant Picker Modal for LOOSE_BULK products */}
      <VariantPickerModal
        visible={variantPickerActive}
        request={variantPickerRequest}
        onClose={closeVariantPicker}
        onSelect={handleVariantSelect}
        onFallback={handleVariantFallback}
      />

      <TextInput
        ref={hidInputRef}
        value={hidInput}
        onChangeText={handleHidChange}
        onSubmitEditing={handleHidSubmit}
        onKeyPress={handleHidKeyPress}
        onBlur={scheduleHidFocus}
        blurOnSubmit={false}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        autoFocus
        caretHidden
        contextMenuHidden
        editable
        showSoftInputOnFocus={false}
        style={styles.hidInput}
      />

      {/* T-126: Offline indicator banner — overlays on top when offline */}
      <OfflineBanner />
    </View>
  );
}

// STG-286: Dynamic styles for dark mode support
function createStyles(colors: ReturnType<typeof useThemeColors>) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // REG-AUTH-401: storeInactiveBanner styles removed - replaced by LimitedModeBanner component
  // UI-REVEAL: API connection error banner styles
  apiConnectionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.warning,
  },
  apiConnectionBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: colors.warning,
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    position: "relative",
  },
  tabIndicator: {
    position: "absolute",
    left: 0,
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  tabButton: {
    flex: 1,
    minHeight: 44,
    minWidth: 48,
    paddingHorizontal: 4,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "transparent",
    zIndex: 1,
  },
  tabButtonActive: {
    borderColor: "transparent",
  },
  tabButtonDisabled: {
    opacity: 0.5,
    borderColor: colors.border,
  },
  tabMenuContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "visible",
  },
  tabPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  tabText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
  },
  tabTextCompact: {
    fontSize: 11,
  },
  tabTextActive: {
    color: colors.textInverse,
  },
  reorderTab: {
    backgroundColor: colors.surface,
  },
  reorderTabOn: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  reorderTabOff: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  reorderPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textInverse,
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
    backgroundColor: colors.overlayLight,
    justifyContent: "center",
    padding: theme.spacing.md,
  },
  cameraCard: {
    backgroundColor: colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.textSecondary,
    fontWeight: "600",
  },
  cameraTimeoutHint: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textTertiary,
    fontWeight: "600",
  },
  cameraClose: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "700",
  },
  cameraPermission: {
    padding: theme.spacing.md,
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  cameraPermissionText: {
    color: colors.textSecondary,
    textAlign: "center",
  },
  cameraPermissionButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  cameraPermissionButtonText: {
    color: colors.primary,
    fontWeight: "700",
  },
  hidInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
}); }
