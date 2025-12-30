import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fetchUiStatus } from "../services/api/uiStatusApi";
import { clearDeviceSession } from "../services/deviceSession";
import { ApiError } from "../services/api/apiClient";
import { POS_MESSAGES } from "../utils/uiStatus";
import { theme } from "../theme";

type RootStackParamList = {
  DeviceBlocked: undefined;
  SellScan: undefined;
  EnrollDevice: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "DeviceBlocked">;

export default function DeviceBlockedScreen() {
  const navigation = useNavigation<Nav>();
  const [checking, setChecking] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    try {
      const status = await fetchUiStatus();
      if (!status.deviceActive) {
        Alert.alert("Device Disabled", POS_MESSAGES.deviceInactive);
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: "SellScan" }] });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.message === "device_unauthorized") {
          await clearDeviceSession();
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
      Alert.alert("Check Failed", "Unable to verify device status.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="shield-alert" size={28} color={theme.colors.error} />
        </View>
        <Text style={styles.title}>Device Disabled</Text>
        <Text style={styles.subtitle}>
          {POS_MESSAGES.deviceInactive}
        </Text>

        <Pressable style={styles.button} onPress={handleRetry} disabled={checking}>
          <Text style={styles.buttonText}>{checking ? "Checking..." : "Check Again"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 24,
    justifyContent: "center",
    alignItems: "center"
  },
  card: {
    width: "100%",
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.errorSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: theme.colors.textPrimary,
    marginBottom: 10
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: 24
  },
  button: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10
  },
  buttonText: {
    color: theme.colors.textInverse,
    fontWeight: "700"
  }
});
