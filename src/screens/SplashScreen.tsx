// T-107: Brand-styled splash screen with shortmark icon
import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Svg, { Path } from "react-native-svg";

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

/** T-107: Brand shortmark — S-curve icon rendered as inline SVG */
function BrandShortmark({ size = 64, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* S-curve path representing the SuperMandi brand shortmark */}
      <Path
        d="M44 16C44 16 40 12 32 12C24 12 18 17 18 23C18 29 24 31 32 33C40 35 46 37 46 43C46 49 40 52 32 52C24 52 20 48 20 48"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Top dot accent */}
      <Path
        d="M32 8C33.6569 8 35 6.65685 35 5C35 3.34315 33.6569 2 32 2C30.3431 2 29 3.34315 29 5C29 6.65685 30.3431 8 32 8Z"
        fill={color}
      />
    </Svg>
  );
}

export default function SplashScreen() {
  const navigation = useNavigation<NavProp>();

  useEffect(() => {
    // Non-blocking infra boot (POS-safe)
    startCloudEventLogger();
    printerService.initialize().catch(() => undefined);
    initOfflineDb().catch(() => undefined);
    syncOutbox().catch(() => undefined);
    startAutoSync();

    let cancelled = false;
    // Controlled splash time (UX stability)
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
      <BrandShortmark size={64} color="#FFFFFF" />
      <Text style={styles.brandName}>SuperMandi</Text>
      <Text style={styles.subtitle}>POS</Text>
      <ActivityIndicator
        size="small"
        color="rgba(255,255,255,0.7)"
        style={styles.loader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
  },
  brandName: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#FFFFFF",
    opacity: 0.8,
    marginTop: 4,
  },
  loader: {
    marginTop: 32,
  },
});
