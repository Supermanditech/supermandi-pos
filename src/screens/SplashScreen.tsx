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

type SplashScreenNavigationProp =
  NativeStackNavigationProp<RootStackParamList, "Splash">;

export default function SplashScreen() {
  const navigation = useNavigation<SplashScreenNavigationProp>();
  const loadProducts = useProductsStore((state) => state.loadProducts);

  useEffect(() => {
    const initializeApp = async () => {
      // 1️⃣ Start cloud logger early (never blocks UI)
      startCloudEventLogger();

      // 2️⃣ Log app start (fire-and-forget)
      eventLogger.log("APP_START", { screen: "Splash" });
      void logPosEvent("APP_START", { screen: "Splash" });

      // 3️⃣ Initialize services safely (POS rule: never crash)
      const initPromises = [
        printerService.initialize().catch(() => undefined),

        // Backend session is OPTIONAL at boot
        ensureSession()
          .then(() => {
            console.log("Backend session ready");
          })
          .catch(() => {
            console.warn("Backend not ready (safe to continue)");
          }),

        loadProducts().catch(() => undefined),
      ];

      // 4️⃣ NEVER block splash on failures
      await Promise.allSettled(initPromises);

      // 5️⃣ Start background sync (non-blocking)
      startAutoSync();
      await syncPendingTransactions().catch(() => undefined);

      // 6️⃣ Always move to Sell screen
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
      <Text style={styles.subtext}>Initializing...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 12,
  },
  subtext: {
    marginTop: 8,
    fontSize: 16,
  },
});
