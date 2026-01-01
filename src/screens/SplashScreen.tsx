import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { theme } from "../theme";
import { startCloudEventLogger } from "../services/cloudEventLogger";
import { printerService } from "../services/printerService";
import { startAutoSync } from "../services/syncService";
import { initOfflineDb } from "../services/offline/localDb";
import { syncOutbox } from "../services/offline/sync";
import { getDeviceSession } from "../services/deviceSession";

type RootStackParamList = {
  Splash: undefined;
  EnrollDevice: undefined;
  SellScan: undefined;
  Payment: undefined;
  SuccessPrint: undefined;
};

type NavProp = NativeStackNavigationProp<RootStackParamList, "Splash">;

export default function SplashScreen() {
  const navigation = useNavigation<NavProp>();

  useEffect(() => {
    // 🔒 Non-blocking infra boot (POS-safe)
    startCloudEventLogger();
    printerService.initialize().catch(() => undefined);
    initOfflineDb().catch(() => undefined);
    syncOutbox().catch(() => undefined);
    startAutoSync();

    let cancelled = false;
    // ⏱ Controlled splash time (UX stability)
    const timer = setTimeout(() => {
      void (async () => {
        const session = await getDeviceSession();
        if (cancelled) return;
        navigation.replace(session ? "SellScan" : "EnrollDevice");
      })();
    }, 1000); // 1 second = best POS balance

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome To SuperMandi</Text>
      <ActivityIndicator size="small" color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 12,
    color: theme.colors.textPrimary,
    textTransform: "none"
  },
});
