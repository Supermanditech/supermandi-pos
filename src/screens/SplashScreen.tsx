import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { theme } from "../theme";
import { eventLogger } from "../services/eventLogger";
import { printerService } from "../services/printerService";
import { useProductsStore } from "../stores/productsStore";

type RootStackParamList = {
  Splash: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: undefined;
};

type SplashScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

export default function SplashScreen() {
  const navigation = useNavigation<SplashScreenNavigationProp>();
  const loadProducts = useProductsStore(state => state.loadProducts);

  useEffect(() => {
    const initializeApp = async () => {
      eventLogger.log("APP_START", { screen: "Splash" });

      // Initialize services in parallel
      const initPromises = [
        // Initialize printer service
        printerService.initialize().catch(error => {
          console.error("Failed to initialize printer service:", error);
        }),

        // Load products
        loadProducts().catch(error => {
          console.error("Failed to load products:", error);
        })
      ];

      await Promise.all(initPromises);
      console.log("App initialization completed");

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
      <Text style={styles.subtext}>Loading products...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  subtext: { marginTop: 8, fontSize: 16 }
});
