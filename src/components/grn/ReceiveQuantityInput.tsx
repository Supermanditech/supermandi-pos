// ReceiveQuantityInput - V3.0.9 compliant
// Quantity input component for GRN receiving

import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";

// =============================================================================
// TYPES
// =============================================================================

export interface ReceiveQuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  max: number;
  disabled?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ReceiveQuantityInput({
  value,
  onChange,
  max,
  disabled,
}: ReceiveQuantityInputProps) {
  const canDecrease = value > 0 && !disabled;
  const canIncrease = value < max && !disabled;

  const handleDecrease = useCallback(() => {
    if (canDecrease) {
      onChange(Math.max(0, value - 1));
    }
  }, [canDecrease, value, onChange]);

  const handleIncrease = useCallback(() => {
    if (canIncrease) {
      onChange(Math.min(max, value + 1));
    }
  }, [canIncrease, max, value, onChange]);

  const handleSetMax = useCallback(() => {
    if (!disabled) {
      onChange(max);
    }
  }, [disabled, max, onChange]);

  // SA-P1-004: Allow typing values above max for excess receipt.
  // Buttons still cap at max; only text input allows exceeding.
  const handleTextChange = useCallback(
    (text: string) => {
      const num = parseInt(text, 10);
      if (isNaN(num)) {
        onChange(0);
      } else {
        onChange(Math.max(0, num));
      }
    },
    [onChange]
  );

  return (
    <View style={styles.container}>
      {/* Decrease Button */}
      <Pressable
        style={[styles.button, !canDecrease && styles.buttonDisabled]}
        onPress={handleDecrease}
        disabled={!canDecrease}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons
          name="minus"
          size={18}
          color={canDecrease ? theme.colors.textPrimary : theme.colors.textTertiary}
        />
      </Pressable>

      {/* Input */}
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        value={String(value)}
        onChangeText={handleTextChange}
        keyboardType="number-pad"
        selectTextOnFocus
        editable={!disabled}
      />

      {/* Increase Button */}
      <Pressable
        style={[styles.button, !canIncrease && styles.buttonDisabled]}
        onPress={handleIncrease}
        disabled={!canIncrease}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons
          name="plus"
          size={18}
          color={canIncrease ? theme.colors.textPrimary : theme.colors.textTertiary}
        />
      </Pressable>

      {/* Max Button */}
      <Pressable
        style={[styles.maxButton, (value === max || disabled) && styles.maxButtonDisabled]}
        onPress={handleSetMax}
        disabled={value === max || disabled}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
      >
        <Text
          style={[
            styles.maxButtonText,
            (value === max || disabled) && styles.maxButtonTextDisabled,
          ]}
        >
          All
        </Text>
      </Pressable>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    backgroundColor: theme.colors.backgroundTertiary,
    opacity: 0.5,
  },
  input: {
    width: 56,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.xs,
  },
  inputDisabled: {
    backgroundColor: theme.colors.backgroundSecondary,
    color: theme.colors.textTertiary,
  },
  maxButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
  },
  maxButtonDisabled: {
    backgroundColor: theme.colors.backgroundSecondary,
  },
  maxButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textInverse,
  },
  maxButtonTextDisabled: {
    color: theme.colors.textTertiary,
  },
});

export default ReceiveQuantityInput;
