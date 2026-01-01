import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { printerService } from "../services/printerService";
import { theme } from "../theme";

type PosStatusBarProps = {
  storeActive?: boolean | null;
  deviceActive?: boolean | null;
  pendingOutboxCount?: number | null;
  mode?: "SELL" | "DIGITISE";
  storeName?: string | null;
  storeId?: string | null;
};

export default function PosStatusBar(_: PosStatusBarProps) {
  const [networkState, setNetworkState] = useState<{
    isConnected: boolean | null;
    isInternetReachable: boolean | null;
  }>({ isConnected: true, isInternetReachable: true });
  const [scannerActive, setScannerActive] = useState(false);
  const [printerConnected, setPrinterConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkState({
        isConnected: state.isConnected ?? null,
        isInternetReachable: state.isInternetReachable ?? null
      });
    });

    // Expose global scanner heartbeat function
    (global as any).__POS_SCANNER_PING__ = () => {
      setScannerActive(true);
      setTimeout(() => setScannerActive(false), 1500);
    };

    return () => {
      unsubscribe();
      delete (global as any).__POS_SCANNER_PING__;
    };
  }, []);

  useEffect(() => {
    const refresh = () => {
      const status = printerService.getStatus();
      setPrinterConnected(Boolean(status.connected && status.paperAvailable));
    };

    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const tones = {
    success: {
      bg: theme.colors.successSoft,
      border: theme.colors.success,
      text: theme.colors.success
    },
    error: {
      bg: theme.colors.errorSoft,
      border: theme.colors.error,
      text: theme.colors.error
    },
    warning: {
      bg: theme.colors.warningSoft,
      border: theme.colors.warning,
      text: theme.colors.warning
    },
    neutral: {
      bg: theme.colors.surfaceAlt,
      border: theme.colors.border,
      text: theme.colors.textSecondary
    }
  } as const;

  const networkStatus =
    networkState.isConnected === false
      ? "disconnected"
      : networkState.isInternetReachable === false
      ? "offline"
      : "online";
  const networkTone =
    networkStatus === "online" ? tones.success : networkStatus === "offline" ? tones.warning : tones.error;
  const networkIcon = networkStatus === "disconnected" ? "wifi-off" : "wifi";
  const networkLabel =
    networkStatus === "online" ? "Online" : networkStatus === "offline" ? "Offline" : "Disconnected";

  const printerTone = printerConnected ? tones.success : tones.warning;
  const printerIcon = "printer";
  const printerLabel = printerConnected ? "Printer connected" : "Printer not connected";

  const scannerTone = scannerActive ? tones.success : tones.neutral;
  const scannerLabel = scannerActive ? "Scanner active" : "Scanner idle";

  return (
    <View style={styles.container}>
      <View style={styles.iconRow}>
        <View
          accessible
          accessibilityLabel={`Network ${networkLabel}`}
          style={[
            styles.iconPill,
            { backgroundColor: networkTone.bg, borderColor: networkTone.border }
          ]}
        >
          <MaterialCommunityIcons name={networkIcon} size={16} color={networkTone.text} />
        </View>

        <View
          accessible
          accessibilityLabel={printerLabel}
          style={[
            styles.iconPill,
            { backgroundColor: printerTone.bg, borderColor: printerTone.border }
          ]}
        >
          <MaterialCommunityIcons name={printerIcon} size={16} color={printerTone.text} />
        </View>

        <View
          accessible
          accessibilityLabel={scannerLabel}
          style={[
            styles.iconPill,
            { backgroundColor: scannerTone.bg, borderColor: scannerTone.border }
          ]}
        >
          <MaterialCommunityIcons name="barcode-scan" size={16} color={scannerTone.text} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
