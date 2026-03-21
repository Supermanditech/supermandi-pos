/**
 * V3-BOOT-001: Unified v3 splash — matches prototype exactly.
 * V3-NAV-002: No legacy EnrollDevice leakage — all recovery stays in v3 flow.
 *
 * Prototype spec:
 * - White background
 * - SuperMandi shortmark (blue square)
 * - "SuperMandi" brand text
 * - "Point of Sale" subtitle
 * - Spinner
 * - "Connecting to store..." status text
 * - Bottom "Continue" CTA (navigates based on session state)
 *
 * Boot logic (from legacy SplashScreen, cleaned up):
 * - Init infra (cloud logger, printer, offline DB, sync)
 * - Check session → no session = V3Phone
 * - Check ui-status → blocked/update/auth-fail/ok
 * - Timeout/network = retry within v3 flow (no EnrollDevice)
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, BackHandler, ActivityIndicator } from "react-native";
import Svg, { Rect, Circle } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { startCloudEventLogger } from "../../services/cloudEventLogger";
import { printerService } from "../../services/printerService";
import { startAutoSync } from "../../services/syncService";
import { initOfflineDb } from "../../services/offline/localDb";
import { syncOutbox } from "../../services/offline/sync";
import { getDeviceSession, clearDeviceSession } from "../../services/deviceSession";
import { fetchUiStatus } from "../../services/api/uiStatusApi";
import { useStaffSessionStore } from "../../stores/staffSessionStore";
import { getDeviceMeta } from "../../services/deviceInfo";
import { showToast } from "../../utils/showToast";

type Nav = NativeStackNavigationProp<any>;

const SESSION_TIMEOUT_MS = 5000;

export default function SplashScreenV3() {
  const navigation = useNavigation<Nav>();
  const [statusText, setStatusText] = useState("Connecting to store...");
  const [errorState, setErrorState] = useState<string | null>(null);
  const hasNavigated = useRef(false);

  // V3-NAV-002: Prevent Android back button during splash
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  const safeNavigate = useCallback((screen: string, params?: any) => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    navigation.reset({ index: 0, routes: [{ name: screen, params }] });
  }, [navigation]);

  const navigateAfterSession = useCallback(async () => {
    if (hasNavigated.current) return;
    try {
      // Session check with timeout
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Session check timed out")), SESSION_TIMEOUT_MS)
      );
      const session = await Promise.race([getDeviceSession(), timeoutPromise]);

      if (!session) {
        // No device session — fresh install or cleared data.
        // Navigate to enrollment screen where user enters activation code from SuperAdmin.
        setStatusText("Welcome!");
        safeNavigate("EnrollDevice");
        return;
      }

      // Check device status (blocked / force update / auth failure)
      try {
        setStatusText("Checking status...");
        const status = await fetchUiStatus();

        if (status.forceUpdate) {
          safeNavigate("ForceUpdate", {
            currentVersion: getDeviceMeta().appVersion ?? "unknown",
            requiredVersion: status.minAppVersion ?? undefined,
          });
          return;
        }
        if (status.deviceActive === false) {
          safeNavigate("DeviceBlocked");
          return;
        }
      } catch (uiErr) {
        // V3-API-005: Distinguish auth failure from network failure
        const errMsg = uiErr instanceof Error ? uiErr.message : String(uiErr);
        if (errMsg.includes("DEVICE_UNAUTHORIZED") || errMsg.includes("TOKEN_EXPIRED") || errMsg.includes("TOKEN_REVOKED")) {
          // GCP-STG-0038: Auth failure — clear stale device session, navigate to EnrollDevice
          // V3Phone requires a working backend config-status endpoint; EnrollDevice is the safe fallback
          await clearDeviceSession();
          setStatusText("Session expired — please re-enroll");
          safeNavigate("EnrollDevice");
          return;
        }
        // Network failure — proceed offline (offline-first)
        setStatusText("Continuing offline...");
      }

      // V3-OWNER-023: If device bound but no staff session, route to staff login
      const staffSession = useStaffSessionStore.getState().session;
      if (staffSession) {
        setStatusText("Ready!");
        safeNavigate("SellScan");
      } else {
        setStatusText("Staff login required");
        safeNavigate("V3StaffLogin");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (__DEV__) console.warn("[SplashV3] Session check failed:", msg);
      setErrorState(msg);
    }
  }, [safeNavigate]);

  // Boot infra + session check
  useEffect(() => {
    // Non-blocking infra init
    startCloudEventLogger();
    printerService.initialize().catch(() => {});
    initOfflineDb().catch(() => {});
    syncOutbox().catch(() => {});
    startAutoSync();

    // Instant session check (no splash delay in v3)
    navigateAfterSession();
  }, [navigateAfterSession]);

  const handleRetry = useCallback(() => {
    setErrorState(null);
    hasNavigated.current = false;
    setStatusText("Connecting to store...");
    navigateAfterSession();
  }, [navigateAfterSession]);

  // V3-BOOT-001: Continue CTA navigates based on current state
  const handleContinue = useCallback(() => {
    if (errorState) {
      handleRetry();
    } else if (!hasNavigated.current) {
      // Force navigation to phone if session check hasn't completed
      safeNavigate("V3Phone");
    }
  }, [errorState, handleRetry, safeNavigate]);

  return (
    <View style={styles.container} testID="splash-screen" accessibilityLabel="SuperMandi loading screen">
      {/* SuperMandi shortmark */}
      <View testID="splash-logo" accessibilityLabel="SuperMandi logo">
        <Svg width={80} height={80} viewBox="0 0 32 32">
          <Rect x={2} y={2} width={28} height={28} rx={8} fill="#2563EB" />
          <Rect x={9} y={9} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={14.4} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={19.8} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Circle cx={16} cy={25.3} r={2.1} fill="#fff" />
        </Svg>
      </View>

      <Text style={styles.brand} accessibilityRole="header">SuperMandi</Text>
      <Text style={styles.sub}>Point of Sale</Text>

      {/* Spinner */}
      <ActivityIndicator
        size="small"
        color="#2563EB"
        style={styles.loader}
        testID="splash-spinner"
        accessibilityLabel="Loading"
      />

      {/* Status text */}
      <Text style={styles.statusText} testID="splash-status">
        {errorState ? `Error: ${errorState}` : statusText}
      </Text>

      {/* Bottom Continue CTA — always visible per prototype */}
      <View style={styles.bottomArea}>
        <Pressable
          style={styles.continueBtn}
          onPress={handleContinue}
          testID="splash-continue-cta"
          accessibilityLabel={errorState ? "Retry" : "Continue"}
          accessibilityRole="button"
        >
          <Text style={styles.continueBtnText}>
            {errorState ? "Retry" : "Continue"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 32, fontWeight: "900", color: "#2563EB", letterSpacing: -0.8, marginTop: 16 },
  sub: { fontSize: 14, color: "#64748B", fontWeight: "500", marginTop: 4 },
  loader: { marginTop: 40 },
  statusText: { color: "#64748B", fontSize: 12, fontWeight: "500", marginTop: 12 },
  bottomArea: { position: "absolute", bottom: 40, width: "100%", paddingHorizontal: 32 },
  continueBtn: { backgroundColor: "#2563EB", paddingVertical: 16, borderRadius: 16, alignItems: "center" },
  continueBtnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
});
