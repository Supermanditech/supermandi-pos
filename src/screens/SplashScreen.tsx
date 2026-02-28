// T-107: Brand-styled splash screen with shortmark icon
// SCR-S1-HARDENING: Production-grade error handling, timeout, retry, a11y
// STG-283: Converted error card/retry styles to use dynamic theme colors
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, BackHandler } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { theme, typography, spacing, useThemeColors } from "../theme";
import { startCloudEventLogger } from "../services/cloudEventLogger";
import { printerService } from "../services/printerService";
import { startAutoSync } from "../services/syncService";
import { initOfflineDb } from "../services/offline/localDb";
import { syncOutbox } from "../services/offline/sync";
import { getDeviceSession } from "../services/deviceSession";
import { fetchUiStatus } from "../services/api/uiStatusApi";
import { getDeviceMeta } from "../services/deviceInfo";
import BrandShortmark from "../components/BrandShortmark";

type RootStackParamList = {
  Splash: undefined;
  EnrollDevice: undefined;
  SellScan: undefined;
  ForceUpdate: { currentVersion?: string; requiredVersion?: string };
  DeviceBlocked: undefined;
};

type NavProp = NativeStackNavigationProp<RootStackParamList, "Splash">;

/** S1-8: Named constant for splash hold time */
const SPLASH_DURATION_MS = 1000;

/** S1-3: Timeout for getDeviceSession() to prevent infinite hang */
const SESSION_TIMEOUT_MS = 5000;

export default function SplashScreen() {
  const navigation = useNavigation<NavProp>();
  const [errorState, setErrorState] = useState<string | null>(null);
  // LIVE.POS.THEME.TOKENS_BRAND_PARITY.001: Dynamic theme colors for brand treatment
  const tc = useThemeColors();

  const dynamicStyles = useMemo(() => StyleSheet.create({
    brandName: {
      ...typography.h2,
      color: tc.textInverse,
      marginTop: spacing.md,
    },
    subtitle: {
      ...typography.label,
      color: tc.textInverse,
      opacity: 0.8,
      marginTop: spacing.xs,
    },
    errorCard: {
      marginTop: spacing.xl,
      backgroundColor: tc.overlayInverse,
      borderRadius: theme.borderRadius.lg,
      padding: spacing.lg,
      alignItems: "center",
      maxWidth: 280,
    },
    errorText: {
      ...typography.label,
      color: tc.textInverse,
      fontWeight: "600",
      marginBottom: spacing.xs,
    },
    errorDetail: {
      ...typography.caption,
      color: tc.textInverse,
      opacity: 0.7,
      textAlign: "center",
      marginBottom: spacing.md,
    },
    retryButton: {
      backgroundColor: tc.textInverse,
      borderRadius: theme.borderRadius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xl,
      marginBottom: spacing.sm,
    },
    retryText: {
      ...typography.label,
      color: tc.primary,
      fontWeight: "600",
    },
    skipText: {
      ...typography.caption,
      color: tc.textInverse,
      opacity: 0.8,
      textDecorationLine: "underline",
    },
  }), [tc]);

  // #405: Prevent Android back button during splash (consistent with gate screens)
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

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
      // DESIGN: Uses fetchUiStatus (non-strict) intentionally — returns safe defaults on
      // error (forceUpdate=false, deviceActive=true) so offline users are NOT blocked.
      // Gate screens (ForceUpdate, DeviceBlocked) use fetchUiStatusStrict which throws on
      // error to prevent gate bypass. PosRootLayout re-checks with polling.
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
      } catch (uiErr) {
        // Network/parse error — proceed to SellScan (offline-first).
        // SCREENS-CONSOLE-LOG-IN-PROD: guard diagnostic logs from release builds
        if (__DEV__) console.warn("[SplashScreen] fetchUiStatus failed, proceeding offline-first:", uiErr instanceof Error ? uiErr.message : uiErr);
      }

      navigation.replace("SellScan");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (__DEV__) console.warn("[SplashScreen] Session check failed:", msg);
      setErrorState(msg);
    }
  }, [navigation, getSessionWithTimeout]);

  /** S1-4: Retry handler — resets error and re-runs session check */
  const handleRetry = useCallback(() => {
    setErrorState(null);
    navigateAfterSession();
  }, [navigateAfterSession]);

  useEffect(() => {
    // S1-6: Non-blocking infra boot with error logging
    // REQ.AUDIT.W5.POS.SPLASH-INFRA-INIT-FAILURE-MASKING.001: log init failures in all environments
    startCloudEventLogger();
    printerService.initialize().catch((err) => {
      console.warn("[SplashScreen] Printer init failed:", err);
    });
    initOfflineDb().catch((err) => {
      console.warn("[SplashScreen] OfflineDB init failed:", err);
    });
    syncOutbox().catch((err) => {
      console.warn("[SplashScreen] SyncOutbox failed:", err);
    });
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
        style={[styles.container, { backgroundColor: tc.primary }]}
        testID="splash-error-screen"
        accessibilityLabel="Splash screen error"
      >
        <BrandShortmark
          size={64}
          backgroundColor={tc.primaryDark}
          lineColor={tc.textInverse}
          dotColor={tc.textInverse}
          radius={10}
        />
        <Text style={dynamicStyles.brandName} accessibilityRole="header">SuperMandi</Text>
        <View style={dynamicStyles.errorCard} testID="splash-error-card">
          <Text
            style={dynamicStyles.errorText}
            accessibilityLabel={`Error: ${errorState}`}
            accessibilityRole="alert"
          >
            Something went wrong
          </Text>
          <Text style={dynamicStyles.errorDetail}>{errorState}</Text>
          <Pressable
            onPress={handleRetry}
            style={dynamicStyles.retryButton}
            testID="splash-retry-button"
            accessibilityLabel="Retry loading"
            accessibilityRole="button"
          >
            <Text style={dynamicStyles.retryText}>Retry</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.replace("EnrollDevice")}
            style={styles.skipButton}
            testID="splash-skip-button"
            accessibilityLabel="Continue to enrollment"
            accessibilityRole="button"
          >
            <Text style={dynamicStyles.skipText}>Continue without session</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // S1-7: Normal loading state with a11y labels and testIDs
  return (
    <View
      style={[styles.container, { backgroundColor: tc.primary }]}
      testID="splash-screen"
      accessibilityLabel="SuperMandi loading screen"
    >
      <BrandShortmark
        size={64}
        backgroundColor={tc.primaryDark}
        lineColor={tc.textInverse}
        dotColor={tc.textInverse}
        radius={10}
      />
      <Text
        style={dynamicStyles.brandName}
        testID="splash-brand-name"
        accessibilityRole="header"
      >
        SuperMandi
      </Text>
      <Text
        style={dynamicStyles.subtitle}
        testID="splash-subtitle"
      >
        POS
      </Text>
      {/* S1-5: Use theme token for indicator color */}
      <ActivityIndicator
        size="small"
        color={tc.textInverse}
        style={styles.loader}
        testID="splash-loader"
        accessibilityLabel="Loading"
      />
    </View>
  );
}

// Layout-only styles that don't depend on theme colors
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loader: {
    marginTop: spacing.xl,
  },
  skipButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
});
