import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect, Circle } from "react-native-svg";

// V3 Splash — matches prototype: SuperMandi logo + loading
// Delegates to existing session check logic via onReady callback

type Props = { onReady: (hasSession: boolean) => void };

export default function SplashScreenV3({ onReady }: Props) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => setDots((d) => d.length >= 3 ? "" : d + "."), 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.logoWrap}>
        <Svg width={72} height={72} viewBox="0 0 32 32">
          <Rect x={2} y={2} width={28} height={28} rx={8} fill="#2563EB" />
          <Rect x={9} y={9} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={14.4} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={19.8} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Circle cx={16} cy={25.3} r={2.1} fill="#fff" />
        </Svg>
      </View>
      <Text style={styles.brand}>SuperMandi</Text>
      <Text style={styles.sub}>Point of Sale</Text>
      <View style={styles.loader}>
        <View style={styles.spinner} />
      </View>
      <Text style={styles.loadingText}>Connecting{dots}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  logoWrap: { marginBottom: 16 },
  brand: { fontSize: 30, fontWeight: "900", color: "#2563EB", letterSpacing: -0.8 },
  sub: { fontSize: 14, color: "#64748B", fontWeight: "500", marginTop: 4 },
  loader: { marginTop: 40 },
  spinner: { width: 32, height: 32, borderWidth: 3, borderColor: "#2563EB", borderTopColor: "transparent", borderRadius: 16 },
  loadingText: { color: "#64748B", fontSize: 12, fontWeight: "500", marginTop: 12 },
});
