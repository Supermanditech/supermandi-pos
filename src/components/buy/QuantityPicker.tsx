// QuantityPicker - V3.0.9 compliant
// Quantity input with +/- buttons, respects MOQ

import React, { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";

// =============================================================================
// TYPES
// =============================================================================

export interface QuantityPickerProps {
  value: number;
  onChange: (quantity: number) => void;
  moq: number;
  maxQty?: number;
  disabled?: boolean;
  compact?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function QuantityPicker({
  value,
  onChange,
  moq,
  maxQty,
  disabled = false,
  compact = false,
}: QuantityPickerProps) {
  const [inputValue, setInputValue] = useState(String(value));

  // Sync input value when prop changes
  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  // Normalize quantity to respect MOQ and max
  const normalizeQuantity = useCallback(
    (qty: number): number => {
      let normalized = Math.max(moq, Math.round(qty));
      if (maxQty !== undefined && maxQty > 0) {
        normalized = Math.min(normalized, maxQty);
      }
      return normalized;
    },
    [moq, maxQty]
  );

  // Handle decrement
  const handleDecrement = useCallback(() => {
    if (disabled) return;
    const newValue = value - 1;
    if (newValue >= moq) {
      onChange(newValue);
    }
  }, [value, moq, onChange, disabled]);

  // Handle increment
  const handleIncrement = useCallback(() => {
    if (disabled) return;
    const newValue = value + 1;
    if (maxQty === undefined || newValue <= maxQty) {
      onChange(newValue);
    }
  }, [value, maxQty, onChange, disabled]);

  // Handle text input change
  const handleInputChange = useCallback((text: string) => {
    // Allow only digits
    const cleaned = text.replace(/[^0-9]/g, "");
    setInputValue(cleaned);
  }, []);

  // Handle input blur - validate and normalize
  const handleInputBlur = useCallback(() => {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed < moq) {
      onChange(moq);
      setInputValue(String(moq));
    } else {
      const normalized = normalizeQuantity(parsed);
      onChange(normalized);
      setInputValue(String(normalized));
    }
  }, [inputValue, moq, normalizeQuantity, onChange]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    handleInputBlur();
  }, [handleInputBlur]);

  const canDecrement = !disabled && value > moq;
  const canIncrement = !disabled && (maxQty === undefined || value < maxQty);

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Pressable
        style={[
          styles.button,
          compact && styles.buttonCompact,
          !canDecrement && styles.buttonDisabled,
        ]}
        onPress={handleDecrement}
        disabled={!canDecrement}
      >
        <MaterialCommunityIcons
          name="minus"
          size={compact ? 16 : 20}
          color={canDecrement ? theme.colors.textPrimary : theme.colors.textTertiary}
        />
      </Pressable>

      <TextInput
        style={[
          styles.input,
          compact && styles.inputCompact,
          disabled && styles.inputDisabled,
        ]}
        value={inputValue}
        onChangeText={handleInputChange}
        onBlur={handleInputBlur}
        onSubmitEditing={handleSubmit}
        keyboardType="number-pad"
        selectTextOnFocus
        editable={!disabled}
        maxLength={5}
      />

      <Pressable
        style={[
          styles.button,
          compact && styles.buttonCompact,
          !canIncrement && styles.buttonDisabled,
        ]}
        onPress={handleIncrement}
        disabled={!canIncrement}
      >
        <MaterialCommunityIcons
          name="plus"
          size={compact ? 16 : 20}
          color={canIncrement ? theme.colors.textPrimary : theme.colors.textTertiary}
        />
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
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  containerCompact: {
    borderRadius: theme.borderRadius.sm,
  },
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonCompact: {
    width: 32,
    height: 32,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  input: {
    minWidth: 50,
    height: 40,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
  },
  inputCompact: {
    minWidth: 40,
    height: 32,
    fontSize: 14,
    paddingHorizontal: theme.spacing.xs,
  },
  inputDisabled: {
    color: theme.colors.textTertiary,
  },
});

export default QuantityPicker;
