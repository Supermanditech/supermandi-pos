import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { theme } from "../theme";

export default function ReorderScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Reorder</Text>
        <Text style={styles.subtitle}>Automation status and settings coming soon.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: theme.colors.background,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
});
