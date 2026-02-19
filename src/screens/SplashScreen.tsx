// T-107: Brand-styled splash screen with shortmark icon
// SCR-S1-HARDENING: Production-grade error handling, timeout, retry, a11y
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Svg, { Path } from "react-native-svg";

import { theme, colors, typography, spacing } from "../theme";
import { startCloudEventLogger } from "../services/cloudEventLogger";
import { printerService } from "../services/printerService";
import { startAutoSync } from "../services/syncService";
import { initOfflineDb } from "../services/offline/localDb";
import { syncOutbox } from "../services/offline/sync";
import { getDeviceSession } from "../services/deviceSession";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { getDeviceMeta } from "../services/deviceInfo";

type RootStackParamList = {
  Splash: undefined;
  EnrollDevice: undefined;
  SellScan: undefined;
  ForceUpdate: { currentVersion?: string; requiredVersion?: string };
  DeviceBlocked: undefined;
  Payment: undefined;
  SuccessPrint: undefined;
};

type NavProp = NativeStackNavigationProp<RootStackParamList, "Splash">;

/** S1-8: Named constant for splash hold time */
const SPLASH_DURATION_MS = 1000;

/** S1-3: Timeout for getDeviceSession() to prevent infinite hang */
const SESSION_TIMEOUT_MS = 5000;

/** T-107: Brand shortmark — S-curve icon rendered as inline SVG */
function BrandShortmark({ size = 64, color = colors.textInverse }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none" accessibilityElementsHidden>
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
  const [errorState, setErrorState] = useState<string | null>(null);

  /** S1-3: Race getDeviceSession against a timeout */
  const getSessionWithTimeout = useCallback(async () => {
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error("Session check timed out")), SESSION_TIMEOUT_MS)
    );
    return Promise.race([getDeviceSession(), timeoutPromise]);
  }, []);

  /** S1-1 + S1-2 + S1-3 + #337: Session + version/blocked check */
  const navigateAfterSession = useCallback(async () => {
    try {
      const session = await getSessionWithTimeout();
      if (!session) {
        navigation.replace("EnrollDevice");
        return;
      }

      // #337: Check version enforcement and device-blocked status before SellScan.
      // fetchUiStatus returns safe defaults on error (forceUpdate=false, deviceActive=true)
      // so offline users are NOT blocked — PosRootLayout re-checks with polling.
      try {
        const status = await fetchUiStatus();
        if (status.forceUpdate) {
          navigation.replace("ForceUpdate", {
            currentVersion: getDeviceMeta().appVersion ?? "unknown",
            requiredVersion: status.minAppVersion ?? undefined,
          });
          return;
        }
        if (status.deviceActive === false) {
          navigation.replace("DeviceBlocked");
          return;
        }
      } catch {
        // Network/parse error — proceed to SellScan (offline-first)
      }

      navigation.replace("SellScan");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.warn("[SplashScreen] Session check failed:", msg);
      setErrorState(msg);
    }
  }, [navigation, getSessionWithTimeout]);

  /** S1-4: Retry handler — resets error and re-runs session check */
  const handleRetry = useCallback(() => {
    setErrorState(null);
    navigateAfterSession();
  }, [navigateAfterSession]);

  useEffect(() => {
    // S1-6: Non-blocking infra boot with error logging (not silent swallow)
    startCloudEventLogger();
    printerService.initialize().catch((err) =>
      console.warn("[SplashScreen] Printer init failed:", err)
    );
    initOfflineDb().catch((err) =>
      console.warn("[SplashScreen] OfflineDB init failed:", err)
    );
    syncOutbox().catch((err) =>
      console.warn("[SplashScreen] SyncOutbox failed:", err)
    );
    startAutoSync();

    let cancelled = false;
    // Controlled splash time (UX stability)
    const timer = setTimeout(() => {
      if (!cancelled) {
        navigateAfterSession();
      }
    }, SPLASH_DURATION_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigateAfterSession]);

  // S1-1 + S1-4: Error state with retry button
  if (errorState) {
    return (
      <View
        style={styles.container}
        testID="splash-error-screen"
        accessibilityLabel="Splash screen error"
      >
        <BrandShortmark size={64} color={theme.colors.textInverse} />
        <Text style={styles.brandName} accessibilityRole="header">SuperMandi</Text>
        <View style={styles.errorCard} testID="splash-error-card">
          <Text
            style={styles.errorText}
            accessibilityLabel={`Error: ${errorState}`}
            accessibilityRole="alert"
          >
            Something went wrong
          </Text>
          <Text style={styles.errorDetail}>{errorState}</Text>
          <Pressable
            onPress={handleRetry}
            style={styles.retryButton}
            testID="splash-retry-button"
            accessibilityLabel="Retry loading"
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.replace("EnrollDevice")}
            style={styles.skipButton}
            testID="splash-skip-button"
            accessibilityLabel="Continue to enrollment"
            accessibilityRole="button"
          >
            <Text style={styles.skipText}>Continue without session</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // S1-7: Normal loading state with a11y labels and testIDs
  return (
    <View
      style={styles.container}
      testID="splash-screen"
      accessibilityLabel="SuperMandi loading screen"
    >
      <BrandShortmark size={64} color={theme.colors.textInverse} />
      <Text
        style={styles.brandName}
        testID="splash-brand-name"
        accessibilityRole="header"
      >
        SuperMandi
      </Text>
      <Text
        style={styles.subtitle}
        testID="splash-subtitle"
      >
        POS
      </Text>
      {/* S1-5: Use theme token for indicator color */}
      <ActivityIndicator
        size="small"
        color={theme.colors.textInverse}
        style={styles.loader}
        testID="splash-loader"
        accessibilityLabel="Loading"
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
    ...typography.h2,
    color: colors.textInverse,
    marginTop: spacing.md,
  },
  subtitle: {
    ...typography.label,
    color: colors.textInverse,
    opacity: 0.8,
    marginTop: spacing.xs,
  },
  loader: {
    marginTop: spacing.xl,
  },
  // S1-1: Error state styles
  errorCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.overlayInverse,
    borderRadius: theme.borderRadius.lg,
    padding: spacing.lg,
    alignItems: "center",
    maxWidth: 280,
  },
  errorText: {
    ...typography.label,
    color: colors.textInverse,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  errorDetail: {
    ...typography.caption,
    color: colors.textInverse,
    opacity: 0.7,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.textInverse,
    borderRadius: theme.borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  retryText: {
    ...typography.label,
    color: colors.primary,
    fontWeight: "600",
  },
  skipButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  skipText: {
    ...typography.caption,
    color: colors.textInverse,
    opacity: 0.8,
    textDecorationLine: "underline",
  },
});
