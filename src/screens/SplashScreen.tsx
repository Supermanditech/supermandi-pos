import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { theme } from "../theme";
import { eventLogger } from "../services/eventLogger";
import { logPosEvent, startCloudEventLogger } from "../services/cloudEventLogger";
import { printerService } from "../services/printerService";
import { useProductsStore } from "../stores/productsStore";
import { ensureSession } from "../services/sessionService";
import { startAutoSync, syncPendingTransactions } from "../services/syncService";

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
      // Start cloud logger early so offline/online transitions are captured.
      startCloudEventLogger();

      // Local + cloud events (fire-and-forget; never block UI).
      eventLogger.log("APP_START", { screen: "Splash" });
      void logPosEvent("APP_START", { screen: "Splash" });

      // Initialize services in parallel
      const initPromises = [
        // Initialize printer service
        printerService.initialize().catch(error => {
          console.error("Failed to initialize printer service:", error);
        }),

        // Ensure backend session (temporary until Login screen exists)
        ensureSession().catch(error => {
          console.error("Failed to initialize backend session:", error);
        }),

        // Load products
        loadProducts().catch(error => {
          console.error("Failed to load products:", error);
        })
      ];

      await Promise.all(initPromises);

      // Start background sync for any pending offline sales
      startAutoSync();
      await syncPendingTransactions().catch(() => undefined);
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
