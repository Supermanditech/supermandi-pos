import React from "react";
import { StatusBar, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import SplashScreen from "./src/screens/SplashScreen";
import EnrollDeviceScreen from "./src/screens/EnrollDeviceScreen";
import PosRootLayout from "./src/screens/PosRootLayout";
import PaymentScreen from "./src/screens/PaymentScreen";
import SuccessPrintScreen from "./src/screens/SuccessPrintScreenV2";
import DeviceBlockedScreen from "./src/screens/DeviceBlockedScreen";
import SalesHistoryScreen from "./src/screens/SalesHistoryScreen";
import BillDetailScreen from "./src/screens/BillDetailScreen";
import BarcodeSheetScreen from "./src/screens/BarcodeSheetScreen";
import { theme } from "./src/theme";

const Stack = createNativeStackNavigator();

export default function App() {
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
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
