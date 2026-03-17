import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import Svg, { Rect, Circle } from "react-native-svg";
import { getDeviceToken } from "../../services/deviceSession";
import { fetchUiStatusStrict } from "../../services/api/uiStatusApi";

// V3-047: Splash — animated logo + session check + navigation decision
// Matches prototype: SuperMandi logo scales in, checks auth, routes to Phone or POS

type Props = { onReady: (destination: "phone" | "pos" | "blocked" | "update") => void };

export default function SplashScreenV3({ onReady }: Props) {
  const [statusText, setStatusText] = useState("Loading...");
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Logo entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 40, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    // Spinner rotation
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [scaleAnim, opacityAnim, spinAnim]);

  // Session check
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const token = await getDeviceToken();
        if (!token) {
          setStatusText("Welcome!");
          onReady("phone");
          return;
        }

        // Check device status (blocked / force update)
        try {
          setStatusText("Checking status...");
          const status = await fetchUiStatusStrict();
          if (status?.deviceActive === false) {
            onReady("blocked");
            return;
          }
          if (status?.forceUpdate) {
            onReady("update");
            return;
          }
        } catch {
          // Offline — proceed to POS (offline-first)
        }

        setStatusText("Ready!");
        onReady("pos");
      } catch {
        setStatusText("Welcome!");
        onReady("phone");
      }
    }, 1200); // 1.2s minimum splash for brand impression

    return () => clearTimeout(timer);
  }, [onReady]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoWrap, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
        <Svg width={80} height={80} viewBox="0 0 32 32">
          <Rect x={2} y={2} width={28} height={28} rx={8} fill="#2563EB" />
          <Rect x={9} y={9} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={14.4} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Rect x={9} y={19.8} width={14} height={3.2} rx={1.6} fill="#fff" />
          <Circle cx={16} cy={25.3} r={2.1} fill="#fff" />
        </Svg>
      </Animated.View>
      <Animated.Text style={[styles.brand, { opacity: opacityAnim }]}>SuperMandi</Animated.Text>
      <Animated.Text style={[styles.sub, { opacity: opacityAnim }]}>Point of Sale</Animated.Text>
      <View style={styles.loader}>
        <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />
      </View>
      <Text style={styles.loadingText}>{statusText}</Text>
      <Text style={styles.version}>v3.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  logoWrap: { marginBottom: 16 },
  brand: { fontSize: 32, fontWeight: "900", color: "#2563EB", letterSpacing: -0.8 },
  sub: { fontSize: 14, color: "#64748B", fontWeight: "500", marginTop: 4 },
  loader: { marginTop: 40 },
  spinner: { width: 32, height: 32, borderWidth: 3, borderColor: "#2563EB", borderTopColor: "transparent", borderRadius: 16 },
  loadingText: { color: "#64748B", fontSize: 12, fontWeight: "500", marginTop: 12 },
  version: { position: "absolute", bottom: 24, color: "#CBD5E1", fontSize: 11, fontWeight: "500" },
});
