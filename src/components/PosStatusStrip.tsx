import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import NetInfo from "@react-native-community/netinfo";

export default function PosStatusStrip() {
  const [isOnline, setIsOnline] = useState(true);
  const [scannerActive, setScannerActive] = useState(false);

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

  return (
    <View style={styles.container}>
      <View style={styles.item}>
        <MaterialCommunityIcons
          name="wifi"
          size={14}
          color={isOnline ? "#16A34A" : "#DC2626"}
        />
        <Text style={styles.text}>{isOnline ? "Online" : "Offline"}</Text>
      </View>

      <View style={styles.item}>
        <MaterialCommunityIcons name="bluetooth" size={14} color="#2563EB" />
      </View>

      <View style={styles.item}>
        <MaterialCommunityIcons
          name="barcode-scan"
          size={14}
          color={scannerActive ? "#16A34A" : "#9CA3AF"}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  text: {
    fontSize: 11,
    color: "#111827",
    fontWeight: "500",
  },
});
