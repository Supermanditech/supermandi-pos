// T-122: Reusable back navigation header for POS detail screens
import React, { useEffect } from "react";
import { BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";

interface BackHeaderProps {
  title: string;
  onBack?: () => void;
}

export function BackHeader({ title, onBack }: BackHeaderProps) {
  const navigation = useNavigation();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigation.goBack();
    }
  };

  // T-122: Handle Android hardware back button
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });

    return () => handler.remove();
  }, [onBack]);

  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={handleBack}
        style={styles.backButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={theme.colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {/* Spacer for centering title */}
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  spacer: {
    width: 40,
  },
});
