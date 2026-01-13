import React from "react";
import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { theme } from "../theme";

type RootStackParamList = {
  SalesHistory: undefined;
  BarcodeSheet: undefined;
  OrderHistory: undefined;
  ReorderSettings: undefined;
  ReorderPolicies: undefined;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function MenuScreen() {
  const navigation = useNavigation<Nav>();
  const goToBills = () => navigation.navigate("SalesHistory");
  const goToOrders = () => navigation.navigate("OrderHistory");
  const goToReorderSettings = () => navigation.navigate("ReorderSettings");
  const goToReorderPolicies = () => navigation.navigate("ReorderPolicies");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Menu</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={goToBills}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"receipt-text" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Bills / Sales History</Text>
          <Text style={styles.menuSubtitle}>View bills and sales history</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <View style={styles.billActions}>
        <Pressable style={styles.billAction} onPress={goToBills}>
          <MaterialCommunityIcons name="printer-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.billActionText}>Reprint</Text>
        </Pressable>
        <Pressable style={styles.billAction} onPress={goToBills}>
          <MaterialCommunityIcons name="download" size={18} color={theme.colors.primary} />
          <Text style={styles.billActionText}>Download</Text>
        </Pressable>
        <Pressable style={styles.billAction} onPress={goToBills}>
          <MaterialCommunityIcons name="share-variant" size={18} color={theme.colors.primary} />
          <Text style={styles.billActionText}>Share</Text>
        </Pressable>
      </View>

      <Pressable style={styles.menuItem} onPress={() => navigation.navigate("BarcodeSheet")}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"barcode" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Barcode Sheets</Text>
          <Text style={styles.menuSubtitle}>Generate tiered barcode PDFs</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      {/* V3.0.9 Menu Items */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Purchasing</Text>
      </View>

      <Pressable style={styles.menuItem} onPress={goToOrders}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"clipboard-list" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Purchase Orders</Text>
          <Text style={styles.menuSubtitle}>View and manage purchase orders</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <Pressable style={styles.menuItem} onPress={goToReorderSettings}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"cog" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Reorder Settings</Text>
          <Text style={styles.menuSubtitle}>Configure auto-reorder preferences</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>

      <Pressable style={styles.menuItem} onPress={goToReorderPolicies}>
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons name={"format-list-checks" as any} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Reorder Policies</Text>
          <Text style={styles.menuSubtitle}>Set min/max stock levels per product</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textSecondary} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
  },
  billActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  billAction: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    alignItems: "center",
    gap: 6
  },
  billActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textSecondary
  },
  sectionHeader: {
    marginTop: 24,
    marginBottom: 4,
    paddingHorizontal: 4
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5
  }
});
