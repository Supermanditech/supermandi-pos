import React from "react";
import { StatusBar, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import SellScanScreen from "./src/screens/SellScanScreen";
import PaymentScreen from "./src/screens/PaymentScreen";
import SuccessPrintScreen from "./src/screens/SuccessPrintScreen";

const Stack = createStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar
        backgroundColor="#f6f7f4"
        barStyle={Platform.OS === "android" ? "dark-content" : "default"}
      />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="SellScan" component={SellScanScreen} />
          <Stack.Screen name="Payment" component={PaymentScreen} />
          <Stack.Screen name="SuccessPrint" component={SuccessPrintScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}
