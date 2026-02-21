// SA-P2-003: Force update screen — blocks POS access when app version is below minimum
// SCR-S2-HARDENING: Loading spinner, offline handling, param validation, a11y, throttle, theme tokens
import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Linking, Platform, ActivityIndicator, BackHandler, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import NetInfo from "@react-native-community/netinfo";

import { fetchUiStatusStrict } from "../services/api/uiStatusApi";
import { clearDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { theme, colors, typography, spacing } from "../theme";
import BrandShortmark from "../components/BrandShortmark";

type RootStackParamList = {
  ForceUpdate: { currentVersion?: string; requiredVersion?: string };
  SellScan: undefined;
  EnrollDevice: undefined;
  DeviceBlocked: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "ForceUpdate">;

// Store links — update these once listings are live
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.supermanditech.supermandipos";
const APP_STORE_URL = ""; // TODO: Add App Store URL after first iOS submission

/** S2-8: Theme token constants for icon/layout sizes */
const ICON_SIZE = 28;
const ICON_WRAP_SIZE = 52;

/** S2-9: Retry cooldown to prevent rapid taps */
const RETRY_COOLDOWN_MS = 3000;

export default function ForceUpdateScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, "ForceUpdate">>();
  const [checking, setChecking] = useState(false);
  const lastRetryRef = useRef(0);

  // DEPLOY-390: Prevent Android back gesture from bypassing force update gate
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  // S2-5: Validate route params — fallback to "unknown" for missing/invalid values
  const rawCurrent = route.params?.currentVersion;
  const rawRequired = route.params?.requiredVersion;
  const currentVersion = rawCurrent && rawCurrent.trim() ? rawCurrent.trim() : "unknown";
  const requiredVersion = rawRequired && rawRequired.trim() ? rawRequired.trim() : "unknown";

  const handleUpdate = () => {
    const url = Platform.OS === "ios" && APP_STORE_URL ? APP_STORE_URL : PLAY_STORE_URL;
    Linking.openURL(url).catch(() =>
      Alert.alert("Cannot Open Store", "Please update the app manually from your app store.")
    );
  };

  const handleRetry = async () => {
    // S2-9: Throttle rapid retries
    const now = Date.now();
    if (now - lastRetryRef.current < RETRY_COOLDOWN_MS) {
      return;
    }
    lastRetryRef.current = now;

    // S2-3: Check network connectivity before making API call
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert("No Internet", "Please connect to the internet and try again.");
        return;
      }
    } catch {
      // NetInfo failed — proceed anyway (best effort)
    }

    setChecking(true);
    try {
      // DESIGN: Uses fetchUiStatusStrict (strict) intentionally — throws on server errors.
      // SplashScreen uses fetchUiStatus (non-strict) which returns safe defaults on error,
      // enabling offline-first access. Here we MUST throw because returning defaults
      // (forceUpdate: false) would bypass this security gate → navigate to SellScan.
      const status = await fetchUiStatusStrict();
      if (status.forceUpdate) {
        Alert.alert(
          "Update Still Required",
          `Please update your app to version ${status.minAppVersion ?? requiredVersion} or later.`
        );
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: "SellScan" }] });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.message === "device_unauthorized" || error.message === "device_not_enrolled") {
          await clearDeviceSession();
          navigation.reset({ index: 0, routes: [{ name: "EnrollDevice" }] });
          return;
        }
      }
      Alert.alert("Check Failed", "Unable to verify app version status. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      testID="force-update-screen"
      accessibilityLabel="App update required screen"
    >
      <View style={styles.card} testID="force-update-card">
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
        <View
          style={styles.iconWrap}
          accessibilityElementsHidden
        >
          <MaterialCommunityIcons name="cellphone-arrow-down" size={ICON_SIZE} color={theme.colors.error} />
        </View>
        <Text
          style={styles.title}
          testID="force-update-title"
          accessibilityRole="header"
        >
          Update Required
        </Text>
        <Text
          style={styles.subtitle}
          testID="force-update-subtitle"
          accessibilityLabel={`Your app version ${currentVersion} is below minimum required version ${requiredVersion}. Please update to continue.`}
        >
          Your app version ({currentVersion}) is below the minimum required
          version ({requiredVersion}). Please update to continue using the POS.
        </Text>

        <View style={styles.versionRow} accessibilityLabel={`Current version ${currentVersion}, required version ${requiredVersion}`}>
          <View style={styles.versionBox}>
            <Text style={styles.versionLabel}>Current</Text>
            <Text style={styles.versionValue} testID="force-update-current-version">{currentVersion}</Text>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={theme.colors.textSecondary} accessibilityElementsHidden />
          <View style={styles.versionBox}>
            <Text style={styles.versionLabel}>Required</Text>
            <Text style={[styles.versionValue, { color: theme.colors.primary }]} testID="force-update-required-version">{requiredVersion}</Text>
          </View>
        </View>

        <Pressable
          style={styles.button}
          onPress={handleUpdate}
          testID="force-update-update-button"
          accessibilityLabel="Update now — opens app store"
          accessibilityRole="button"
        >
          <MaterialCommunityIcons name="download" size={18} color={colors.textInverse} style={{ marginRight: 6 }} accessibilityElementsHidden />
          <Text style={styles.buttonText}>Update Now</Text>
        </Pressable>

        <Pressable
          style={[styles.secondaryButton, checking && styles.buttonDisabled]}
          onPress={handleRetry}
          disabled={checking}
          testID="force-update-check-button"
          accessibilityLabel={checking ? "Checking for updates" : "Check again for updates"}
          accessibilityRole="button"
          accessibilityState={{ disabled: checking }}
        >
          {/* S2-2: Show ActivityIndicator while checking */}
          {checking ? (
            <View style={styles.checkingRow}>
              <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.secondaryButtonText}>Checking...</Text>
            </View>
          ) : (
            <Text style={styles.secondaryButtonText}>Check Again</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
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
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  versionBox: {
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: theme.borderRadius.md,
  },
  versionLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  versionValue: {
    ...typography.bodySmall,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: theme.borderRadius.lg,
    width: "100%",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  secondaryButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: "600",
  },
  checkingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
