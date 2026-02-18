// SA-P2-003: Force update screen — blocks POS access when app version is below minimum
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Linking, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchUiStatus } from "../services/api/uiStatusApi";
import { clearDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { theme, colors, typography, spacing } from "../theme";

type RootStackParamList = {
  ForceUpdate: { currentVersion?: string; requiredVersion?: string };
  SellScan: undefined;
  EnrollDevice: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "ForceUpdate">;

// Store links — update these once listings are live
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.supermanditech.supermandipos";
const APP_STORE_URL = ""; // TODO: Add App Store URL after first iOS submission

export default function ForceUpdateScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, "ForceUpdate">>();
  const [checking, setChecking] = useState(false);

  const currentVersion = route.params?.currentVersion ?? "unknown";
  const requiredVersion = route.params?.requiredVersion ?? "unknown";

  const handleUpdate = () => {
    const url = Platform.OS === "ios" && APP_STORE_URL ? APP_STORE_URL : PLAY_STORE_URL;
    Linking.openURL(url).catch(() =>
      Alert.alert("Cannot Open Store", "Please update the app manually from your app store.")
    );
  };

  const handleRetry = async () => {
    setChecking(true);
    try {
      const status = await fetchUiStatus();
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
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="cellphone-arrow-down" size={28} color={theme.colors.error} />
        </View>
        <Text style={styles.title}>Update Required</Text>
        <Text style={styles.subtitle}>
          Your app version ({currentVersion}) is below the minimum required
          version ({requiredVersion}). Please update to continue using the POS.
        </Text>

        <View style={styles.versionRow}>
          <View style={styles.versionBox}>
            <Text style={styles.versionLabel}>Current</Text>
            <Text style={styles.versionValue}>{currentVersion}</Text>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={theme.colors.textSecondary} />
          <View style={styles.versionBox}>
            <Text style={styles.versionLabel}>Required</Text>
            <Text style={[styles.versionValue, { color: theme.colors.primary }]}>{requiredVersion}</Text>
          </View>
        </View>

        <Pressable style={styles.button} onPress={handleUpdate}>
          <MaterialCommunityIcons name="download" size={18} color={colors.textInverse} style={{ marginRight: 6 }} />
          <Text style={styles.buttonText}>Update Now</Text>
        </Pressable>

        <Pressable
          style={[styles.secondaryButton, checking && styles.buttonDisabled]}
          onPress={handleRetry}
          disabled={checking}
        >
          <Text style={styles.secondaryButtonText}>{checking ? "Checking..." : "Check Again"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.errorSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: spacing.lg,
  },
  versionBox: {
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  versionLabel: {
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
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
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
    marginTop: 12,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: "600",
  },
});
