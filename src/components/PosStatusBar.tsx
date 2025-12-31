import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";
import { printerService } from "../services/printerService";
import { theme } from "../theme";
import { composePosMessage, getPrimaryTone } from "../utils/uiStatus";

type PosStatusBarProps = {
  storeActive?: boolean | null;
  deviceActive?: boolean | null;
  pendingOutboxCount?: number | null;
  mode?: "SELL" | "DIGITISE";
};

export default function PosStatusBar({ storeActive, deviceActive, pendingOutboxCount, mode }: PosStatusBarProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [scannerActive, setScannerActive] = useState(false);
  const [printerConnected, setPrinterConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? false);
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

  const storeColor =
    storeActive === false ? theme.colors.error : storeActive === true ? theme.colors.success : theme.colors.textTertiary;
  const storeLabel = storeActive === false ? "Store Inactive" : storeActive === true ? "Store Active" : "Store Unknown";
  const deviceLabel =
    deviceActive === false ? "Device Disabled" : deviceActive === true ? "Device Active" : "Device Unknown";

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

  const message = composePosMessage({
    storeActive: storeActive ?? null,
    deviceActive: deviceActive ?? null,
    pendingOutboxCount: pendingOutboxCount ?? 0,
    printerOk: printerConnected,
    scannerOk: scannerActive ? true : null,
    networkOnline: isOnline,
    mode
  });
  const messageTone = getPrimaryTone({
    storeActive: storeActive ?? null,
    deviceActive: deviceActive ?? null,
    pendingOutboxCount: pendingOutboxCount ?? 0,
    printerOk: printerConnected,
    scannerOk: scannerActive ? true : null,
    networkOnline: isOnline,
    mode
  });

  const messageColor =
    messageTone === "error"
      ? theme.colors.error
      : messageTone === "warning"
      ? theme.colors.warning
      : theme.colors.textSecondary;

  return (
    <View style={styles.container}>
      <View style={styles.chipRow}>
      <View
        style={[
          styles.chip,
          { backgroundColor: isOnline ? tones.success.bg : tones.error.bg, borderColor: isOnline ? tones.success.border : tones.error.border }
        ]}
      >
        <MaterialCommunityIcons
          name="wifi"
          size={14}
          color={isOnline ? tones.success.text : tones.error.text}
        />
        <Text style={[styles.text, { color: isOnline ? tones.success.text : tones.error.text }]}>
          {isOnline ? "Online" : "Offline"}
        </Text>
      </View>

      <View
        style={[
          styles.chip,
          {
            backgroundColor: printerConnected ? tones.success.bg : tones.neutral.bg,
            borderColor: printerConnected ? tones.success.border : tones.neutral.border
          }
        ]}
      >
        <MaterialCommunityIcons
          name="printer"
          size={14}
          color={printerConnected ? tones.success.text : tones.neutral.text}
        />
        <Text style={[styles.text, { color: printerConnected ? tones.success.text : tones.neutral.text }]}>
          Printer
        </Text>
      </View>

      <View
        style={[
          styles.chip,
          {
            backgroundColor: scannerActive ? tones.success.bg : tones.neutral.bg,
            borderColor: scannerActive ? tones.success.border : tones.neutral.border
          }
        ]}
      >
        <MaterialCommunityIcons
          name="barcode-scan"
          size={14}
          color={scannerActive ? tones.success.text : tones.neutral.text}
        />
        <Text style={[styles.text, { color: scannerActive ? tones.success.text : tones.neutral.text }]}>
          Scanner
        </Text>
      </View>

      <View
        style={[
          styles.chip,
          {
            backgroundColor: storeActive === false ? tones.error.bg : storeActive === true ? tones.success.bg : tones.neutral.bg,
            borderColor: storeActive === false ? tones.error.border : storeActive === true ? tones.success.border : tones.neutral.border
          }
        ]}
      >
        <MaterialCommunityIcons name="storefront" size={14} color={storeColor} />
        <Text style={[styles.text, { color: storeColor }]}>{storeLabel}</Text>
      </View>

      <View
        style={[
          styles.chip,
          {
            backgroundColor: deviceActive === false ? tones.error.bg : deviceActive === true ? tones.success.bg : tones.neutral.bg,
            borderColor: deviceActive === false ? tones.error.border : deviceActive === true ? tones.success.border : tones.neutral.border
          }
        ]}
      >
        <MaterialCommunityIcons name="cellphone-check" size={14} color={deviceActive === false ? tones.error.text : tones.success.text} />
        <Text
          style={[
            styles.text,
            { color: deviceActive === false ? tones.error.text : deviceActive === true ? tones.success.text : tones.neutral.text }
          ]}
        >
          {deviceLabel}
        </Text>
      </View>

      {(pendingOutboxCount ?? 0) > 0 && (
        <View
          style={[
            styles.chip,
            { backgroundColor: tones.warning.bg, borderColor: tones.warning.border }
          ]}
        >
          <MaterialCommunityIcons name="sync-alert" size={14} color={tones.warning.text} />
          <Text style={[styles.text, { color: tones.warning.text }]}>Sync {pendingOutboxCount}</Text>
        </View>
      )}

      </View>

      <Text style={[styles.message, { color: messageColor }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 36,
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: "600",
  },
  message: {
    fontSize: 12,
    fontWeight: "600",
  },
});
