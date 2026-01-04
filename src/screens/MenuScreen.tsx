import React from "react";
import { StyleSheet, Text, Pressable, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { theme } from "../theme";

type RootStackParamList = {
  Menu: undefined;
  SalesHistory: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList, "Menu">;

export default function MenuScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Menu</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={() => navigation.navigate("SalesHistory")}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name="receipt-text" size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Sales History</Text>
          <Text style={styles.menuSubtitle}>Reprint or resend bills</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16
  },
  header: {
    paddingVertical: 8,
    alignItems: "center"
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.textPrimary
  },
  menuItem: {
    marginTop: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center"
  },
  menuText: {
    flex: 1
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.textPrimary
  },
  menuSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: theme.colors.textSecondary
  }
});
