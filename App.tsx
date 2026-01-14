import React, { useEffect, useState, useCallback } from "react";
import { StatusBar, Platform, View, ActivityIndicator } from "react-native";
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

import SplashScreen from "./src/screens/SplashScreen";
import EnrollDeviceScreen from "./src/screens/EnrollDeviceScreen";
import PosRootLayout from "./src/screens/PosRootLayout";
import PaymentScreen from "./src/screens/PaymentScreen";
import SuccessPrintScreen from "./src/screens/SuccessPrintScreenV2";
import DeviceBlockedScreen from "./src/screens/DeviceBlockedScreen";
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
import PurchaseHistoryScreen from "./src/screens/PurchaseHistoryScreen";
import SalesStatementScreen from "./src/screens/SalesStatementScreen";
import StockStatementScreen from "./src/screens/StockStatementScreen";
import { theme } from "./src/theme";
import { useRoute, useNavigation } from "@react-navigation/native";

// Wrapper components for screens that need route params
function OrderHistoryWrapper() {
  const navigation = useNavigation<any>();
  return (
    <OrderHistoryScreen
      onSelectOrder={(order) => navigation.navigate("OrderDetail", { orderId: order.id })}
      onBack={() => navigation.goBack()}
    />
  );
}

function OrderDetailWrapper() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  return (
    <OrderDetailScreen
      orderId={route.params?.orderId}
      onBack={() => navigation.goBack()}
      onNavigateToGRN={(orderId) => navigation.navigate("GRN", { orderId })}
    />
  );
}

function ReorderSettingsWrapper() {
  const navigation = useNavigation<any>();
  return (
    <ReorderSettingsScreen
      onNavigateToPolicies={() => navigation.navigate("ReorderPolicies")}
      onBack={() => navigation.goBack()}
    />
  );
}

function ReorderPoliciesWrapper() {
  const navigation = useNavigation<any>();
  return (
    <ReorderPoliciesScreen
      onBack={() => navigation.goBack()}
    />
  );
}

function GRNWrapper() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  return (
    <GRNScreen
      orderId={route.params?.orderId}
      onBack={() => navigation.goBack()}
      onSuccess={() => navigation.goBack()}
    />
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
  return <PurchaseHistoryScreen onBack={() => navigation.goBack()} />;
}

function SalesStatementWrapper() {
  const navigation = useNavigation<any>();
  return <SalesStatementScreen onBack={() => navigation.goBack()} />;
}

function StockStatementWrapper() {
  const navigation = useNavigation<any>();
  return <StockStatementScreen onBack={() => navigation.goBack()} />;
}

import { startScanIntentListener } from "./src/services/scan/scanIntent";

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
          <Stack.Screen name="DeviceBlocked" component={DeviceBlockedScreen} />
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
        </Stack.Navigator>
      </NavigationContainer>
      </GestureHandlerRootView>
    </I18nextProvider>
  );
}
