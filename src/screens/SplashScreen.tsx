import React, { useEffect } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { theme } from "../theme";
import { eventLogger } from "../services/eventLogger";

export default function SplashScreen() {
  const navigation = useNavigation();

  useEffect(() => {
    eventLogger.log("APP_START", { screen: "Splash" });

    const timer = setTimeout(() => {
      navigation.replace("SellScan");
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SuperMandi POS</Text>
      <ActivityIndicator size="small" color={theme.colors.primary} />
      <Text style={styles.subtext}>Preparing POS...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12 },
  subtext: { marginTop: 8, fontSize: 16 }
});
