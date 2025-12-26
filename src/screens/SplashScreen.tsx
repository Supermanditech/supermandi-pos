import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { theme } from "../theme";
import { eventLogger } from "../services/eventLogger";
import { printerService } from "../services/printerService";

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: undefined;
};

type SplashScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function SplashScreen() {
  const navigation = useNavigation<SplashScreenNavigationProp>();

  useEffect(() => {
    const initializeApp = async () => {
      eventLogger.log("APP_START", { screen: "Splash" });

      // Initialize printer service
      try {
        await printerService.initialize();
        console.log("Printer service initialized successfully");
      } catch (error) {
        console.error("Failed to initialize printer service:", error);
      }

      // Navigate after initialization
      setTimeout(() => {
        navigation.replace("SellScan");
      }, 1500);
    };

    initializeApp();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SuperMandi POS</Text>
      <ActivityIndicator size="small" color={theme.colors.primary} />
      <Text style={styles.subtext}>Initializing printer...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  subtext: { marginTop: 8, fontSize: 16 }
});
