// SCR-AUDIT-310: Production-grade DeviceBlocked with strict fetch + theme tokens + a11y
import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, BackHandler } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import NetInfo from "@react-native-community/netinfo";

import { fetchUiStatusStrict } from "../services/api/uiStatusApi";
import { clearDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { POS_MESSAGES } from "../utils/uiStatus";
import { theme, typography, spacing, useThemeColors } from "../theme";
import BrandShortmark from "../components/BrandShortmark";

type RootStackParamList = {
  DeviceBlocked: undefined;
  SellScan: undefined;
  EnrollDevice: undefined;
  ForceUpdate: { currentVersion?: string; requiredVersion?: string };
};

type Nav = NativeStackNavigationProp<RootStackParamList, "DeviceBlocked">;

/** Icon/layout constants */
const ICON_SIZE = 28;
const ICON_WRAP_SIZE = 52;

// ISSUE-073: Retry cooldown to prevent rapid retries
const RETRY_COOLDOWN_MS = 3000;

export default function DeviceBlockedScreen() {
  const colors = useThemeColors();
  const navigation = useNavigation<Nav>();
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  // DEPLOY-390: Prevent Android back gesture from bypassing device blocked gate
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  const handleRetry = async () => {
    if (cooldown) return; // ISSUE-073: Throttle rapid retries

    // ISSUE-074: Check network before API call — differentiate "No Connection"
    let isConnected = true;
    try {
      const netState = await NetInfo.fetch();
      isConnected = netState.isConnected ?? true;
    } catch {
      // NetInfo failed — proceed anyway
    }
    if (!isConnected) {
      Alert.alert("No Connection", "Please connect to the internet and try again.");
      return;
    }

    setChecking(true);
    try {
      // SCR-AUDIT-310: Use strict fetch that throws on server errors.
      // Regular fetchUiStatus returns safe defaults (deviceActive: true),
      // which would incorrectly let the user exit the blocked state.
      const status = await fetchUiStatusStrict();
      if (!status.deviceActive) {
        Alert.alert("Device Disabled", POS_MESSAGES.deviceInactive);
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: "SellScan" }] });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.message === "device_unauthorized") {
          try { await clearDeviceSession(); } catch { /* best-effort */ }
          navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
          return;
        }
        if (error.message === "device_not_enrolled") {
          navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
          return;
        }
        if (error.message === "device_inactive") {
          Alert.alert("Device Disabled", POS_MESSAGES.deviceInactive);
          return;
        }
      }
      // ISSUE-074: Differentiate network errors from server errors
      const isNetworkError = error instanceof TypeError || (error instanceof Error && /network|fetch|timeout/i.test(error.message));
      Alert.alert(
        isNetworkError ? "No Connection" : "Check Failed",
        isNetworkError
          ? "Could not reach the server. Check your internet connection."
          : "Unable to verify device status. Please try again."
      );
    } finally {
      setChecking(false);
      // ISSUE-073: Start cooldown timer
      setCooldown(true);
      setTimeout(() => setCooldown(false), RETRY_COOLDOWN_MS);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.lg,
      justifyContent: "center",
      alignItems: "center",
    },
    card: {
      width: "100%",
      backgroundColor: colors.surface,
      borderRadius: theme.borderRadius.xl,
      padding: spacing.lg,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    brandLockup: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    brandPillText: {
      backgroundColor: colors.primary,
      color: colors.textInverse,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 999,
      fontWeight: "700",
      letterSpacing: -0.2,
    },
    iconWrap: {
      width: ICON_WRAP_SIZE,
      height: ICON_WRAP_SIZE,
      borderRadius: ICON_WRAP_SIZE / 2,
      backgroundColor: colors.errorSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.md,
    },
    title: {
      ...typography.h4,
      fontWeight: "800",
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: spacing.lg,
    },
    button: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: theme.borderRadius.lg,
      width: "100%",
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      ...typography.button,
      color: colors.textInverse,
    },
    checkingRow: {
      flexDirection: "row",
      alignItems: "center",
    },
  }), [colors]);

  return (
    <View
      style={styles.container}
      testID="device-blocked-screen"
      accessibilityLabel="Device disabled screen"
    >
      <View style={styles.card} testID="device-blocked-card">
        <View style={styles.brandLockup}>
          <BrandShortmark
            size={30}
            backgroundColor={colors.primary}
            lineColor={colors.textInverse}
            dotColor={colors.textInverse}
            radius={8}
          />
          <Text style={styles.brandPillText}>SuperMandi</Text>
        </View>
        <View style={styles.iconWrap} accessibilityElementsHidden>
          <MaterialCommunityIcons name="shield-alert" size={ICON_SIZE} color={colors.error} />
        </View>
        <Text
          style={styles.title}
          testID="device-blocked-title"
          accessibilityRole="header"
        >
          Device Disabled
        </Text>
        <Text
          style={styles.subtitle}
          testID="device-blocked-subtitle"
          accessibilityLabel="This device has been disabled by the administrator. Contact your SuperAdmin."
        >
          {POS_MESSAGES.deviceInactive}
        </Text>

        <Pressable
          style={[styles.button, (checking || cooldown) && styles.buttonDisabled]}
          onPress={handleRetry}
          disabled={checking || cooldown}
          testID="device-blocked-check-button"
          accessibilityLabel={checking ? "Checking device status" : "Check again"}
          accessibilityRole="button"
          accessibilityState={{ disabled: checking || cooldown }}
        >
          {checking ? (
            <View style={styles.checkingRow}>
              <ActivityIndicator size="small" color={colors.textInverse} style={{ marginRight: spacing.xs }} />
              <Text style={styles.buttonText}>Checking...</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Check Again</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
