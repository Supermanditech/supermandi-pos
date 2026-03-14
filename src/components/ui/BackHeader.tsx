// T-122: Reusable back navigation header for POS detail screens
import React, { useEffect, useMemo } from "react";
import { BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { useThemeColors } from "../../theme";

interface BackHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

export function BackHeader({ title, subtitle, onBack }: BackHeaderProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

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

  const styles = useMemo(() => StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 8,
    },
    backButton: {
      // STG-394: Minimum 44dp touch target for accessibility
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 22,
    },
    titleContainer: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    spacer: {
      // STG-394: Match back button width for centering
      width: 44,
    },
  }), [colors]);

  return (
    <View style={[styles.header, { paddingTop: 8 + insets.top }]}>
      <TouchableOpacity
        onPress={handleBack}
        style={styles.backButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.titleContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {/* Spacer for centering title */}
      <View style={styles.spacer} />
    </View>
  );
}
