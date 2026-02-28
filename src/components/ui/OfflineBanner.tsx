// T-126: Offline indicator banner for POS app
// Shows a yellow banner at the top when the device loses internet connectivity

import React, { useEffect, useState, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { colors } from "../../theme/colors";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected;
      setIsOffline(offline);
      Animated.timing(slideAnim, {
        toValue: offline ? 0 : -50,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });

    return () => unsubscribe();
  }, [slideAnim]);

  if (!isOffline) return null;

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}>
      <Text style={styles.text}>No internet connection — working offline</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.warning,
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 1000,
  },
  text: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
