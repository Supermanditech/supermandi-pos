import React, { useEffect, useState, useCallback, useRef } from "react";
import { StatusBar, Platform, View, ActivityIndicator, AppState, AppStateStatus } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";
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
// RO-004: POS store registration screen
import RegisterStoreScreen from "./src/screens/RegisterStoreScreen";
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
import { theme } from "./src/theme";
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
      onOpenScanner={() => {}}
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

import { startScanIntentListener } from "./src/services/scan/scanIntent";
import { useProductsStore } from "./src/stores/productsStore";

const Stack = createNativeStackNavigator();

export default function App() {
  const [appReady, setAppReady] = useState(false);

  const initializeApp = useCallback(async () => {
    try {
      // Load fonts and initialize i18n in parallel
      await Promise.all([
        Font.loadAsync(MaterialCommunityIcons.font),
        initI18n(),
      ]);
      setAppReady(true);
    } catch (error) {
      console.error("Error initializing app:", error);
      // Still allow app to render even if initialization fails
      setAppReady(true);
    }
  }, []);

  useEffect(() => {
    initializeApp();
    startScanIntentListener();
  }, [initializeApp]);

  // CACHE-000: Force refresh truth data (products/stock) when app resumes from background
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        useProductsStore.getState().loadProducts();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, []);

  // Show loading indicator while app is initializing
  if (!appReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <I18nextProvider i18n={i18n}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar
          backgroundColor={theme.colors.background}
          barStyle={Platform.OS === "android" ? "dark-content" : "default"}
        />

        <ErrorBoundary>
        <NavigationContainer>
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
          {/* RO-004: POS store registration */}
          <Stack.Screen name="RegisterStore" component={RegisterStoreScreen} />
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
        </Stack.Navigator>
      </NavigationContainer>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </I18nextProvider>
  );
}
