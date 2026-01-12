// ErrorToast - V3.0.9 compliant
// Toast component for displaying API errors

import React, { useEffect, useRef, useCallback } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../theme";
import type { ParsedApiError } from "../utils/errorHandler";

// =============================================================================
// TYPES
// =============================================================================

export type ToastType = "error" | "warning" | "info" | "success";

export interface ErrorToastProps {
  error: ParsedApiError | null;
  type?: ToastType;
  onDismiss?: () => void;
  autoDismiss?: boolean;
  autoDismissMs?: number;
  position?: "top" | "bottom";
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TOAST_ANIMATION_MS = 300;
const DEFAULT_AUTO_DISMISS_MS = 4000;

const TOAST_CONFIGS: Record<
  ToastType,
  { icon: keyof typeof MaterialCommunityIcons.glyphMap; color: string; bgColor: string }
> = {
  error: {
    icon: "alert-circle",
    color: theme.colors.error,
    bgColor: theme.colors.errorSoft,
  },
  warning: {
    icon: "alert",
    color: theme.colors.warning,
    bgColor: theme.colors.warningSoft,
  },
  info: {
    icon: "information",
    color: theme.colors.primary,
    bgColor: theme.colors.accentSoft,
  },
  success: {
    icon: "check-circle",
    color: theme.colors.success,
    bgColor: theme.colors.successSoft,
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ErrorToast({
  error,
  type = "error",
  onDismiss,
  autoDismiss = true,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  position = "bottom",
}: ErrorToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = TOAST_CONFIGS[type];
  const isVisible = error !== null;

  const clearDismissTimeout = useCallback(() => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
  }, []);

  const handleDismiss = useCallback(() => {
    clearDismissTimeout();

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: position === "top" ? -100 : 100,
        duration: TOAST_ANIMATION_MS,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: TOAST_ANIMATION_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss?.();
    });
  }, [clearDismissTimeout, onDismiss, opacity, position, translateY]);

  useEffect(() => {
    if (isVisible) {
      // Animate in
      translateY.setValue(position === "top" ? -100 : 100);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: TOAST_ANIMATION_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: TOAST_ANIMATION_MS,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss
      if (autoDismiss) {
        clearDismissTimeout();
        dismissTimeoutRef.current = setTimeout(handleDismiss, autoDismissMs);
      }
    }

    return clearDismissTimeout;
  }, [
    isVisible,
    autoDismiss,
    autoDismissMs,
    clearDismissTimeout,
    handleDismiss,
    opacity,
    position,
    translateY,
  ]);

  if (!error) {
    return null;
  }

  const positionStyle =
    position === "top"
      ? { top: insets.top + theme.spacing.md }
      : { bottom: insets.bottom + theme.spacing.md };

  return (
    <Animated.View
      style={[
        styles.container,
        positionStyle,
        {
          backgroundColor: config.bgColor,
          borderColor: config.color,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.content}
        onPress={handleDismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <MaterialCommunityIcons
          name={config.icon}
          size={20}
          color={config.color}
          style={styles.icon}
        />
        <View style={styles.textContainer}>
          <Text style={[styles.message, { color: config.color }]} numberOfLines={3}>
            {error.message}
          </Text>
          {error.code && !error.isNetworkError && (
            <Text style={styles.code}>{error.code}</Text>
          )}
        </View>
        <MaterialCommunityIcons
          name="close"
          size={18}
          color={theme.colors.textTertiary}
          style={styles.closeIcon}
        />
      </Pressable>
    </Animated.View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: theme.spacing.md,
    right: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    ...theme.shadows.md,
    zIndex: 9999,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    padding: theme.spacing.md,
  },
  icon: {
    marginRight: theme.spacing.sm,
  },
  textContainer: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  message: {
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
  },
  code: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  closeIcon: {
    opacity: 0.6,
  },
});

export default ErrorToast;
