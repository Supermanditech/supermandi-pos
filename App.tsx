import React, { useEffect, useState, useCallback, useRef } from "react";
import { StatusBar, Platform, View, ActivityIndicator, AppState, AppStateStatus } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Font from "expo-font";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { I18nextProvider } from "react-i18next";

// GO-LIVE-010: Logger and crash handling
import { installGlobalErrorHandler, logAppStartup } from "./src/services/logger";
installGlobalErrorHandler();
logAppStartup();

// I18N: Internationalization
import i18n, { initI18n } from "./src/i18n";

// AUDIT-POS-049: Error Boundary to catch render crashes
import ErrorBoundary from "./src/components/ErrorBoundary";

// V3-BOOT-001: Unified v3 splash replaces legacy SplashScreen
import SplashScreenV3 from "./src/screens/v3/SplashScreenV3";
// Legacy splash kept for reference but no longer mounted
// import SplashScreen from "./src/screens/SplashScreen";
import DeviceBlockedScreen from "./src/screens/DeviceBlockedScreen";
import ForceUpdateScreen from "./src/screens/ForceUpdateScreen";
import PaymentSetupScreen from "./src/screens/PaymentSetupScreen";
import EnrollDeviceScreen from "./src/screens/EnrollDeviceScreen";

// V3 auth screens
import PhoneScreenV3 from "./src/screens/v3/PhoneScreenV3";
import OTPScreenV3 from "./src/screens/v3/OTPScreenV3";

// V3 POS root (replaces old PosRootLayout)
import PosRootLayoutV3 from "./src/screens/v3/PosRootLayoutV3";
// V3-063: Multi-store selector
import StoreSelectScreenV3 from "./src/screens/v3/StoreSelectScreenV3";
// V3-OWNER-023: Staff/owner PIN login
import StaffLoginScreenV3 from "./src/screens/v3/StaffLoginScreenV3";

// V3-001: V3 sub-screen wrappers for React Navigation stack
import {
  V3PaymentWrapper, V3CashWrapper, V3UpiWrapper, V3UdharWrapper,
  V3SuccessWrapper, V3ScanWrapper, V3NewProductWrapper,
  V3CompareWrapper, V3CounterPurchaseWrapper, V3GRNWrapper, V3ReorderWrapper,
  V3StockWrapper, V3BarcodeSheetWrapper, V3KhataWrapper, V3FinanceWrapper, V3ReportsWrapper,
  V3CustomersWrapper, V3SalesHistoryWrapper, V3SettingsWrapper,
} from "./src/screens/v3/V3ScreenWrappers";

import { useThemeColors } from "./src/theme";
import { useSettingsStore, useSettingsHydrated } from "./src/stores/settingsStore";
import { startScanIntentListener } from "./src/services/scan/scanIntent";
import { useProductsStore } from "./src/stores/productsStore";
import { isCacheLoaded, getCachedSession } from "./src/services/deviceSession";
import { registerForPushNotifications, setupNotificationListeners } from "./src/services/pushNotifications";

const Stack = createNativeStackNavigator();

// Deep link config for enrollment QR codes (supermandi://enroll?code=X)
const linking = {
  prefixes: ["supermandi://"],
  config: {
    screens: {
      EnrollDevice: "enroll",
    },
  },
};

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const settingsHydrated = useSettingsHydrated();
  const themeColors = useThemeColors();
  const isDark = useSettingsStore((s) => s.themeMode === 'dark');

  const initializeApp = useCallback(async () => {
    try {
      const initPromise = Promise.all([
        Font.loadAsync(MaterialCommunityIcons.font),
        initI18n(),
      ]);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("App init timed out after 10s")), 10_000)
      );
      await Promise.race([initPromise, timeoutPromise]);
      setAppReady(true);
    } catch (error) {
      console.error("Error initializing app:", error);
      setAppReady(true);
    }
  }, []);

  useEffect(() => {
    initializeApp();
    startScanIntentListener();
  }, [initializeApp]);

  // Push notifications
  useEffect(() => {
    if (!appReady) return;
    registerForPushNotifications().catch((err) =>
      console.warn("[Push] Registration failed:", err)
    );
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, [appReady]);

  // Refresh products when app resumes from background
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        if (isCacheLoaded() && getCachedSession()) {
          useProductsStore.getState().loadProducts();
        }
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  if (!appReady || !settingsHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: themeColors.background }}>
        <ActivityIndicator size="large" color={themeColors.primary} />
      </View>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar
          backgroundColor={themeColors.background}
          barStyle={isDark ? "light-content" : (Platform.OS === "android" ? "dark-content" : "default")}
        />
        <ErrorBoundary>
        <NavigationContainer linking={linking}>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerShown: false,
            headerBackVisible: false,
            headerShadowVisible: false,
          }}
        >
          {/* System screens */}
          <Stack.Screen name="Splash" component={SplashScreenV3} />
          <Stack.Screen name="DeviceBlocked" component={DeviceBlockedScreen} />
          <Stack.Screen name="ForceUpdate" component={ForceUpdateScreen} />
          <Stack.Screen name="EnrollDevice" component={EnrollDeviceScreen} />
          <Stack.Screen name="PaymentSetup" component={PaymentSetupScreen} />

          {/* V3 auth flow */}
          <Stack.Screen name="V3Phone" component={PhoneScreenV3} />
          <Stack.Screen name="V3OTP" component={OTPScreenV3} />
          <Stack.Screen name="V3StoreSelect" component={StoreSelectScreenV3} />
          <Stack.Screen name="V3StaffLogin" component={StaffLoginScreenV3} />

          {/* V3 POS root (4-tab layout: SELL / BUY / STORE / MORE) */}
          <Stack.Screen name="SellScan" component={PosRootLayoutV3} />

          {/* V3 sub-screens */}
          <Stack.Screen name="V3Payment" component={V3PaymentWrapper} />
          <Stack.Screen name="V3Cash" component={V3CashWrapper} />
          <Stack.Screen name="V3Upi" component={V3UpiWrapper} />
          <Stack.Screen name="V3Udhar" component={V3UdharWrapper} />
          <Stack.Screen name="V3Success" component={V3SuccessWrapper} />
          <Stack.Screen name="V3Scan" component={V3ScanWrapper} />
          <Stack.Screen name="V3NewProduct" component={V3NewProductWrapper} />
          <Stack.Screen name="V3Compare" component={V3CompareWrapper} />
          <Stack.Screen name="V3CounterPurchase" component={V3CounterPurchaseWrapper} />
          <Stack.Screen name="V3GRN" component={V3GRNWrapper} />
          <Stack.Screen name="V3Reorder" component={V3ReorderWrapper} />
          <Stack.Screen name="V3Stock" component={V3StockWrapper} />
          <Stack.Screen name="BarcodeSheet" component={V3BarcodeSheetWrapper} />
          <Stack.Screen name="V3Khata" component={V3KhataWrapper} />
          <Stack.Screen name="V3Finance" component={V3FinanceWrapper} />
          <Stack.Screen name="V3Reports" component={V3ReportsWrapper} />
          <Stack.Screen name="V3Customers" component={V3CustomersWrapper} />
          <Stack.Screen name="V3SalesHistory" component={V3SalesHistoryWrapper} />
          <Stack.Screen name="V3Settings" component={V3SettingsWrapper} />
        </Stack.Navigator>
      </NavigationContainer>
        </ErrorBoundary>
      </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nextProvider>
  );
}
