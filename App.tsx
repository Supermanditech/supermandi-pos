import React, { useEffect, useState, useCallback, useRef } from "react";
import { Alert, StatusBar, Platform, View, ActivityIndicator, AppState, AppStateStatus } from "react-native";
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
import SplashScreen from "./src/screens/SplashScreen";
import EnrollDeviceScreen from "./src/screens/EnrollDeviceScreen";
// V3: OTP auth screens
import PhoneScreenV3 from "./src/screens/v3/PhoneScreenV3";
import OTPScreenV3 from "./src/screens/v3/OTPScreenV3";
// #329-332: PaymentSetup shown once after activation if no UPI VPA
import PaymentSetupScreen from "./src/screens/PaymentSetupScreen";
// #329: RegisterStoreScreen removed — registration happens on Retailer Web only
import PosRootLayout from "./src/screens/PosRootLayout";
import PaymentScreen from "./src/screens/PaymentScreen";
import SuccessPrintScreen from "./src/screens/SuccessPrintScreenV2";
import DeviceBlockedScreen from "./src/screens/DeviceBlockedScreen";
// SA-P2-003: Force update screen for minimum app version enforcement
import ForceUpdateScreen from "./src/screens/ForceUpdateScreen";
import SalesHistoryScreen from "./src/screens/SalesHistoryScreen";
import BillDetailScreen from "./src/screens/BillDetailScreen";
import BarcodeSheetScreen from "./src/screens/BarcodeSheetScreen";
// V3.0.9 Screens
import OrderHistoryScreen from "./src/screens/OrderHistoryScreen";
import OrderDetailScreen from "./src/screens/OrderDetailScreen";
import ReorderSettingsScreen from "./src/screens/ReorderSettingsScreen";
import ReorderPoliciesScreen from "./src/screens/ReorderPoliciesScreen";
import GRNScreen from "./src/screens/GRNScreen";
// V3.0.10 Screens
import InwardScreen from "./src/screens/InwardScreen";
import UiShowcaseScreen, { isQaMenuEnabled } from "./src/screens/UiShowcaseScreen";
import { FeatureGate } from "./src/components/FeatureGate";
import PurchaseHistoryScreen from "./src/screens/PurchaseHistoryScreen";
import SalesStatementScreen from "./src/screens/SalesStatementScreen";
import StockStatementScreen from "./src/screens/StockStatementScreen";
// AUD-POS-NAV-002: Wire BuyScreen to navigation
import { BuyScreen } from "./src/screens/BuyScreen";
// SM-020: BNPL Dues Screen
import { BnplDuesScreen } from "./src/screens/BnplDuesScreen";
// T-154: Khata (Credit Book) Screen
import KhataScreen from "./src/screens/KhataScreen";
// T-155: Customer Profiles Screen
import CustomerListScreen from "./src/screens/CustomerListScreen";
// T-191: Daily Closing / Z-Report Screen
import DailyClosingScreen from "./src/screens/DailyClosingScreen";
// T-192: Shift Management Screen
import ShiftScreen from "./src/screens/ShiftScreen";
// T-193: Overdue Dues Screen
import OverdueDuesScreen from "./src/screens/OverdueDuesScreen";
// T-194: Return/Refund Screen
import ReturnScreen from "./src/screens/ReturnScreen";
// T-196: Customer Management Screen
import CustomerManagementScreen from "./src/screens/CustomerManagementScreen";
// T-195: Printer Settings Screen
import PrinterSettingsScreen from "./src/screens/PrinterSettingsScreen";
// T-198: Opening Stock Screen
import OpeningStockScreen from "./src/screens/OpeningStockScreen";
// T-199: Daily Report Screen
import DailyReportScreen from "./src/screens/DailyReportScreen";
// T-294: Chat Screens
import ChatListScreen from "./src/screens/ChatListScreen";
import ChatConversationScreen from "./src/screens/ChatConversationScreen";
// T-303→T-316: AI Insights Screen
import AIInsightsScreen from "./src/screens/AIInsightsScreen";
// T-288: Bulk Purchase Credit Screen
import BulkPurchaseCreditScreen from "./src/screens/BulkPurchaseCreditScreen";
// HELP-001: Help & Support screen
import HelpScreen from "./src/screens/HelpScreen";

// V3-001: V3 sub-screen wrappers for React Navigation stack
import {
  V3PaymentWrapper, V3SuccessWrapper, V3ScanWrapper, V3NewProductWrapper,
  V3CompareWrapper, V3CounterPurchaseWrapper, V3GRNWrapper, V3ReorderWrapper,
  V3StockWrapper, V3KhataWrapper, V3FinanceWrapper, V3ReportsWrapper,
  V3CustomersWrapper, V3SettingsWrapper,
} from "./src/screens/v3/V3ScreenWrappers";
import { theme, useThemeColors } from "./src/theme";
import { useSettingsStore, useSettingsHydrated } from "./src/stores/settingsStore";
import { useRoute, useNavigation } from "@react-navigation/native";

// Wrapper components for screens that need route params
// UI-AUDIT-003: All feature-gated screens wrapped with FeatureGate for direct access protection
function OrderHistoryWrapper() {
  const navigation = useNavigation<any>();
  return (
    <FeatureGate feature="buy" onBack={() => navigation.goBack()}>
      <OrderHistoryScreen
        onSelectOrder={(order) => navigation.navigate("OrderDetail", { orderId: order.id })}
        onBack={() => navigation.goBack()}
        onNavigateToBuy={() => navigation.navigate("SellScan", { initialTab: "BUY" })}
      />
    </FeatureGate>
  );
}

function OrderDetailWrapper() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  return (
    <FeatureGate feature="buy" onBack={() => navigation.goBack()}>
      <OrderDetailScreen
        orderId={route.params?.orderId}
        onBack={() => navigation.goBack()}
        onNavigateToGRN={(orderId) => navigation.navigate("GRN", { orderId })}
      />
    </FeatureGate>
  );
}

function ReorderSettingsWrapper() {
  const navigation = useNavigation<any>();
  return (
    <FeatureGate feature="reorder" onBack={() => navigation.goBack()}>
      <ReorderSettingsScreen
        onNavigateToPolicies={() => navigation.navigate("ReorderPolicies")}
        onBack={() => navigation.goBack()}
      />
    </FeatureGate>
  );
}

function ReorderPoliciesWrapper() {
  const navigation = useNavigation<any>();
  return (
    <FeatureGate feature="reorder" onBack={() => navigation.goBack()}>
      <ReorderPoliciesScreen
        onBack={() => navigation.goBack()}
      />
    </FeatureGate>
  );
}

function GRNWrapper() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  return (
    <FeatureGate feature="buy" onBack={() => navigation.goBack()}>
      <GRNScreen
        orderId={route.params?.orderId}
        onBack={() => navigation.goBack()}
        onSuccess={() => navigation.goBack()}
        onNavigateToBarcodeSheet={(grnItems) =>
          navigation.replace("BarcodeSheet", { grnItems })
        }
      />
    </FeatureGate>
  );
}

// V3.0.10 Wrapper components
function InwardWrapper() {
  const navigation = useNavigation<any>();
  return (
    <InwardScreen
      storeActive={true}
      scanDisabled={false}
      onOpenScanner={() => Alert.alert("Scanner", "Use the BUY tab scanner for barcode scanning.")}
      onBack={() => navigation.goBack()}
    />
  );
}

function UiShowcaseWrapper() {
  const navigation = useNavigation<any>();
  return (
    <UiShowcaseScreen
      onNavigateTo={(screen, params) => navigation.navigate(screen, params)}
      onBack={() => navigation.goBack()}
    />
  );
}

function PurchaseHistoryWrapper() {
  const navigation = useNavigation<any>();
  return (
    <PurchaseHistoryScreen
      onBack={() => navigation.goBack()}
      onNavigateToInward={() => navigation.navigate("Inward")}
    />
  );
}

function SalesStatementWrapper() {
  const navigation = useNavigation<any>();
  return (
    <SalesStatementScreen
      onBack={() => navigation.goBack()}
      onNavigateToSell={() => navigation.navigate("SellScan")}
    />
  );
}

function StockStatementWrapper() {
  const navigation = useNavigation<any>();
  return <StockStatementScreen onBack={() => navigation.goBack()} />;
}

// AUD-POS-NAV-002: BuyScreen wrapper with feature gate
function BuyScreenWrapper() {
  const navigation = useNavigation<any>();
  return (
    <FeatureGate feature="buy" onBack={() => navigation.goBack()}>
      <BuyScreen />
    </FeatureGate>
  );
}

// SM-020: BnplDuesScreen wrapper
function BnplDuesWrapper() {
  const navigation = useNavigation<any>();
  return (
    <BnplDuesScreen onBack={() => navigation.goBack()} />
  );
}

// T-154: Khata (Credit Book) wrapper
function KhataWrapper() {
  const navigation = useNavigation<any>();
  return (
    <KhataScreen onBack={() => navigation.goBack()} />
  );
}

// T-155: Customer Profiles wrapper
function CustomerListWrapper() {
  const navigation = useNavigation<any>();
  return (
    <CustomerListScreen onBack={() => navigation.goBack()} />
  );
}

// T-191: Daily Closing / Z-Report wrapper
function DailyClosingWrapper() {
  const navigation = useNavigation<any>();
  return (
    <DailyClosingScreen onBack={() => navigation.goBack()} />
  );
}

// T-192: Shift Management wrapper
function ShiftWrapper() {
  const navigation = useNavigation<any>();
  return (
    <ShiftScreen onBack={() => navigation.goBack()} />
  );
}

// T-193: Overdue Dues wrapper
function OverdueDuesWrapper() {
  const navigation = useNavigation<any>();
  return (
    <OverdueDuesScreen onBack={() => navigation.goBack()} />
  );
}

// T-194: Return/Refund wrapper
function ReturnWrapper() {
  const navigation = useNavigation<any>();
  return (
    <ReturnScreen onBack={() => navigation.goBack()} />
  );
}

// T-196: Customer Management wrapper
function CustomerManagementWrapper() {
  const navigation = useNavigation<any>();
  return (
    <CustomerManagementScreen onBack={() => navigation.goBack()} />
  );
}

// T-195: Printer Settings wrapper
function PrinterSettingsWrapper() {
  const navigation = useNavigation<any>();
  return (
    <PrinterSettingsScreen onBack={() => navigation.goBack()} />
  );
}

// T-198: Opening Stock wrapper
function OpeningStockWrapper() {
  const navigation = useNavigation<any>();
  return (
    <OpeningStockScreen onBack={() => navigation.goBack()} />
  );
}

// T-199: Daily Report wrapper
function DailyReportWrapper() {
  const navigation = useNavigation<any>();
  return (
    <DailyReportScreen onBack={() => navigation.goBack()} />
  );
}

// T-294: Chat List wrapper
function ChatListWrapper() {
  const navigation = useNavigation<any>();
  return (
    <ChatListScreen
      onSelectConversation={(conv) => navigation.navigate("ChatConversation", {
        conversationId: conv.id,
        conversationTitle: conv.title || conv.otherParticipantName || 'Chat',
        conversationType: conv.type,
      })}
      onContactSupport={() => navigation.navigate("ChatConversation", {
        conversationId: '__new_support__',
        conversationTitle: 'SuperMandi Support',
        conversationType: 'support',
      })}
      onBack={() => navigation.goBack()}
    />
  );
}

// T-294: Chat Conversation wrapper
function ChatConversationWrapper() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  return (
    <ChatConversationScreen
      conversationId={route.params?.conversationId || ''}
      conversationTitle={route.params?.conversationTitle || 'Chat'}
      conversationType={route.params?.conversationType || 'direct'}
      currentUserId={route.params?.currentUserId || ''}
      currentUserName={route.params?.currentUserName || 'Me'}
      onBack={() => navigation.goBack()}
    />
  );
}

// T-303→T-316: AI Insights wrapper
function AIInsightsWrapper() {
  const navigation = useNavigation<any>();
  return <AIInsightsScreen onBack={() => navigation.goBack()} />;
}

// T-288: Bulk Purchase Credit wrapper
function BulkPurchaseCreditWrapper() {
  const navigation = useNavigation<any>();
  return <BulkPurchaseCreditScreen onBack={() => navigation.goBack()} />;
}

// HELP-001: Help & Support screen wrapper
function HelpScreenWrapper() {
  const navigation = useNavigation<any>();
  return <HelpScreen onBack={() => navigation.goBack()} />;
}

import { startScanIntentListener } from "./src/services/scan/scanIntent";
import { useProductsStore } from "./src/stores/productsStore";
import { isCacheLoaded, getCachedSession } from "./src/services/deviceSession";
// Phase 8: Push notification setup
import { registerForPushNotifications, setupNotificationListeners } from "./src/services/pushNotifications";

const Stack = createNativeStackNavigator();

// SCR-AUDIT-311: Deep link config for enrollment QR codes (supermandi://enroll?code=X)
// Path-only matching: React Navigation routes to EnrollDevice screen.
// Param extraction (code=X → codeInput) is handled by EnrollDeviceScreen's own
// Linking.getInitialURL() + addEventListener handler, which correctly parses ?code=X.
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
  // LIVE.POS.THEME.PERSISTENCE_AND_BOOTSTRAP.001: Wait for AsyncStorage hydration
  // before first render so theme colors are correct from the first visible frame.
  const settingsHydrated = useSettingsHydrated();
  // LIVE.POS.THEME: Dynamic colors based on persisted theme preference
  const themeColors = useThemeColors();
  const isDark = useSettingsStore((s) => s.themeMode === 'dark');

  const initializeApp = useCallback(async () => {
    try {
      // Load fonts and initialize i18n in parallel, with 10s timeout failsafe
      // to prevent infinite spinner on devices where Font.loadAsync hangs
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
      // Still allow app to render even if initialization fails or times out
      setAppReady(true);
    }
  }, []);

  useEffect(() => {
    initializeApp();
    startScanIntentListener();
  }, [initializeApp]);

  // Phase 8: Initialize push notifications after app is ready
  useEffect(() => {
    if (!appReady) return;
    // Register for push notifications (requests permission + gets token)
    registerForPushNotifications().catch((err) =>
      console.warn("[Push] Registration failed:", err)
    );
    // Set up notification listeners (foreground display + tap handling)
    const cleanup = setupNotificationListeners();
    return cleanup;
  }, [appReady]);

  // CACHE-000: Force refresh truth data (products/stock) when app resumes from background
  // Guard: only refresh if device session exists (prevents DEVICE_SESSION_MISSING on unenrolled devices)
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

  // LIVE.POS.THEME.PERSISTENCE_AND_BOOTSTRAP.001: Gate on both app init AND settings
  // hydration to ensure persisted theme is applied before first visible frame.
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
        {/* LIVE.POS.THEME: Dynamic StatusBar based on theme preference */}
        <StatusBar
          backgroundColor={themeColors.background}
          barStyle={isDark ? "light-content" : (Platform.OS === "android" ? "dark-content" : "default")}
        />

        <ErrorBoundary>
        <NavigationContainer linking={linking}>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerShown: false,          // 🔒 disables header
            headerBackVisible: false,    // 🔒 disables back icon
            headerShadowVisible: false, // 🔒 disables header assets
          }}
        >
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="EnrollDevice" component={EnrollDeviceScreen} />
          {/* V3: OTP auth flow */}
          <Stack.Screen name="V3Phone" component={PhoneScreenV3} />
          <Stack.Screen name="V3OTP" component={OTPScreenV3} />
          <Stack.Screen name="PaymentSetup" component={PaymentSetupScreen} />
          {/* #329: RegisterStore removed — registration on Retailer Web only */}
          <Stack.Screen name="DeviceBlocked" component={DeviceBlockedScreen} />
          {/* SA-P2-003: Force update screen for minimum app version enforcement */}
          <Stack.Screen name="ForceUpdate" component={ForceUpdateScreen} />
          <Stack.Screen name="SellScan" component={PosRootLayout} />
          <Stack.Screen name="Payment" component={PaymentScreen} />
          <Stack.Screen name="SuccessPrint" component={SuccessPrintScreen} />
          <Stack.Screen name="SalesHistory" component={SalesHistoryScreen} />
          <Stack.Screen name="BillDetail" component={BillDetailScreen} />
          <Stack.Screen name="BarcodeSheet" component={BarcodeSheetScreen} />
          {/* V3.0.9 Screens */}
          <Stack.Screen name="OrderHistory" component={OrderHistoryWrapper} />
          <Stack.Screen name="OrderDetail" component={OrderDetailWrapper} />
          <Stack.Screen name="ReorderSettings" component={ReorderSettingsWrapper} />
          <Stack.Screen name="ReorderPolicies" component={ReorderPoliciesWrapper} />
          <Stack.Screen name="GRN" component={GRNWrapper} />
          {/* V3.0.10 Screens */}
          <Stack.Screen name="Inward" component={InwardWrapper} />
          {isQaMenuEnabled() && (
            <Stack.Screen name="UiShowcase" component={UiShowcaseWrapper} />
          )}
          <Stack.Screen name="PurchaseHistory" component={PurchaseHistoryWrapper} />
          <Stack.Screen name="SalesStatement" component={SalesStatementWrapper} />
          <Stack.Screen name="StockStatement" component={StockStatementWrapper} />
          {/* AUD-POS-NAV-002: BuyScreen now wired to navigation */}
          <Stack.Screen name="Buy" component={BuyScreenWrapper} />
          {/* SM-020: BNPL Dues Screen */}
          <Stack.Screen name="BnplDues" component={BnplDuesWrapper} />
          {/* T-154: Khata (Credit Book) Screen */}
          <Stack.Screen name="Khata" component={KhataWrapper} />
          {/* T-155: Customer Profiles Screen */}
          <Stack.Screen name="CustomerList" component={CustomerListWrapper} />
          {/* T-191: Daily Closing / Z-Report Screen */}
          <Stack.Screen name="DailyClosing" component={DailyClosingWrapper} />
          {/* T-192: Shift Management Screen */}
          <Stack.Screen name="Shift" component={ShiftWrapper} />
          {/* T-193: Overdue Dues Screen */}
          <Stack.Screen name="OverdueDues" component={OverdueDuesWrapper} />
          {/* T-194: Return/Refund Screen */}
          <Stack.Screen name="Return" component={ReturnWrapper} />
          {/* T-196: Customer Management Screen */}
          <Stack.Screen name="CustomerManagement" component={CustomerManagementWrapper} />
          {/* T-195: Printer Settings Screen */}
          <Stack.Screen name="PrinterSettings" component={PrinterSettingsWrapper} />
          {/* T-198: Opening Stock Screen */}
          <Stack.Screen name="OpeningStock" component={OpeningStockWrapper} />
          {/* T-199: Daily Report Screen */}
          <Stack.Screen name="DailyReport" component={DailyReportWrapper} />
          {/* T-294: Chat Screens */}
          <Stack.Screen name="ChatList" component={ChatListWrapper} />
          <Stack.Screen name="ChatConversation" component={ChatConversationWrapper} />
          {/* T-303→T-316: AI Insights */}
          <Stack.Screen name="AIInsights" component={AIInsightsWrapper} />
          {/* T-288: Bulk Purchase Credit */}
          <Stack.Screen name="BulkPurchaseCredit" component={BulkPurchaseCreditWrapper} />
          {/* HELP-001: Help & Support */}
          <Stack.Screen name="Help" component={HelpScreenWrapper} options={{ headerShown: false }} />

          {/* V3-001: V3 sub-screens with navigation wrappers */}
          <Stack.Screen name="V3Payment" component={V3PaymentWrapper} />
          <Stack.Screen name="V3Success" component={V3SuccessWrapper} />
          <Stack.Screen name="V3Scan" component={V3ScanWrapper} />
          <Stack.Screen name="V3NewProduct" component={V3NewProductWrapper} />
          <Stack.Screen name="V3Compare" component={V3CompareWrapper} />
          <Stack.Screen name="V3CounterPurchase" component={V3CounterPurchaseWrapper} />
          <Stack.Screen name="V3GRN" component={V3GRNWrapper} />
          <Stack.Screen name="V3Reorder" component={V3ReorderWrapper} />
          <Stack.Screen name="V3Stock" component={V3StockWrapper} />
          <Stack.Screen name="V3Khata" component={V3KhataWrapper} />
          <Stack.Screen name="V3Finance" component={V3FinanceWrapper} />
          <Stack.Screen name="V3Reports" component={V3ReportsWrapper} />
          <Stack.Screen name="V3Customers" component={V3CustomersWrapper} />
          <Stack.Screen name="V3Settings" component={V3SettingsWrapper} />
        </Stack.Navigator>
      </NavigationContainer>
        </ErrorBoundary>
      </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nextProvider>
  );
}
