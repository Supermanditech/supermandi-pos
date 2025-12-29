import React from "react";
import { StatusBar, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import SplashScreen from "./src/screens/SplashScreen";
import SellScanScreen from "./src/screens/SellScanScreen";
import PaymentScreen from "./src/screens/PaymentScreen";
import SuccessPrintScreen from "./src/screens/SuccessPrintScreenV2";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar
        backgroundColor="#f6f7f4"
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
          <Stack.Screen name="SellScan" component={SellScanScreen} />
          <Stack.Screen name="Payment" component={PaymentScreen} />
          <Stack.Screen name="SuccessPrint" component={SuccessPrintScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
