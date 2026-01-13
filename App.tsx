import React, { useEffect, useState, useCallback } from "react";
import { StatusBar, Platform, View, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Font from "expo-font";
import { MaterialCommunityIcons } from "@expo/vector-icons";

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
import { startScanIntentListener } from "./src/services/scan/scanIntent";

const Stack = createNativeStackNavigator();

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  const loadFonts = useCallback(async () => {
    try {
      // Load MaterialCommunityIcons font for APK builds
      await Font.loadAsync(MaterialCommunityIcons.font);
      setFontsLoaded(true);
    } catch (error) {
      console.error("Error loading fonts:", error);
      // Still allow app to render even if fonts fail
      setFontsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadFonts();
    startScanIntentListener();
  }, [loadFonts]);

  // Show loading indicator while fonts are loading
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
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
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
