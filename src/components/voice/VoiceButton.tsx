// VoiceButton - VOICE-001
// STG-012: Brand-colored FAB with contextual "Tap to speak" label
// STG-048: Position fix — proper elevation/shadow for floating effect
// Floating push-to-talk microphone button for voice commands

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ActivityIndicator,
  View,
  Text,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useThemeColors } from "../../theme";

// =============================================================================
// TYPES
// =============================================================================

export type VoiceButtonState = "idle" | "recording" | "processing";

export interface VoiceButtonProps {
  /**
   * Current state of the voice button.
   */
  state: VoiceButtonState;

  /**
   * Called when user presses down on the button (start recording).
   */
  onPressIn: () => void;

  /**
   * Called when user releases the button (stop recording).
   */
  onPressOut: () => void;

  /**
   * Whether the button is disabled.
   */
  disabled?: boolean;

  /**
   * Optional test ID for e2e testing.
   */
  testID?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const BUTTON_SIZE = 56;
const PULSE_SIZE = 72;
/** AsyncStorage key for tracking first-use label dismissal */
const VOICE_LABEL_DISMISSED_KEY = "@supermandi/voice_label_dismissed";

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * VoiceButton - Push-to-talk floating action button.
 *
 * Press and hold to record, release to submit.
 * Shows pulsing animation while recording, spinner while processing.
 * STG-012: Shows contextual "Tap to speak" label on first use.
 *
 * @example
 * <VoiceButton
 *   state={voiceState}
 *   onPressIn={handleStartRecording}
 *   onPressOut={handleStopRecording}
 * />
 */
export function VoiceButton({
  state,
  onPressIn,
  onPressOut,
  disabled = false,
  testID = "voice-button",
}: VoiceButtonProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;

  // STG-012: Contextual label — shown once on first use, then hidden
  const [showLabel, setShowLabel] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(VOICE_LABEL_DISMISSED_KEY)
      .then((value) => {
        if (mounted && value !== "true") {
          setShowLabel(true);
          // Fade in
          Animated.timing(labelOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }
      })
      .catch(() => {
        // Silently ignore storage errors — label just won't show
      });
    return () => { mounted = false; };
  }, [labelOpacity]);

  const dismissLabel = useCallback(() => {
    if (!showLabel) return;
    // Fade out then persist dismissal
    Animated.timing(labelOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowLabel(false);
      AsyncStorage.setItem(VOICE_LABEL_DISMISSED_KEY, "true").catch(() => {});
    });
  }, [showLabel, labelOpacity]);

  // Pulsing animation when recording
  useEffect(() => {
    if (state === "recording") {
      const pulseAnimation = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.3,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(opacityAnim, {
              toValue: 0.2,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.6,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulseAnimation.start();
      return () => pulseAnimation.stop();
    } else {
      // Reset animation values
      pulseAnim.setValue(1);
      opacityAnim.setValue(0.6);
    }
  }, [state, pulseAnim, opacityAnim]);

  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const isDisabled = disabled || isProcessing;

  // STG-012: Brand colors from theme (not hardcoded)
  const buttonBackgroundColor = isRecording
    ? colors.error
    : colors.primary;

  // STG-048: Dynamic styles with proper elevation/shadow for floating effect
  const dynamicStyles = useMemo(() => ({
    container: {
      width: PULSE_SIZE,
      height: PULSE_SIZE,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    pulseRing: {
      position: "absolute" as const,
      width: PULSE_SIZE,
      height: PULSE_SIZE,
      borderRadius: PULSE_SIZE / 2,
      backgroundColor: colors.error,
    },
    button: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: BUTTON_SIZE / 2,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      // STG-048: Enhanced elevation/shadow for proper floating effect
      elevation: 8,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    // STG-012: Contextual label styles
    labelContainer: {
      position: "absolute" as const,
      right: PULSE_SIZE + 4,
      top: (PULSE_SIZE - 28) / 2,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      elevation: 4,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      // Prevent label from wrapping
      ...Platform.select({
        ios: { minWidth: 100 },
        android: { minWidth: 100 },
        default: { minWidth: 100 },
      }),
    },
    labelText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "600" as const,
      textAlign: "center" as const,
    },
  }), [colors]);

  const handlePressIn = useCallback(() => {
    // Dismiss contextual label on first interaction
    dismissLabel();
    if (!isDisabled) {
      onPressIn();
    }
  }, [isDisabled, onPressIn, dismissLabel]);

  return (
    <View style={dynamicStyles.container} testID={testID}>
      {/* STG-012: Contextual "Tap to speak" label (first use only) */}
      {showLabel && state === "idle" && !isDisabled && (
        <Animated.View
          style={[dynamicStyles.labelContainer, { opacity: labelOpacity }]}
          testID={`${testID}-label`}
        >
          <Text style={dynamicStyles.labelText}>
            {t("voice.tapToSpeak")}
          </Text>
        </Animated.View>
      )}

      {/* Pulse ring (visible when recording) */}
      {isRecording && (
        <Animated.View
          style={[
            dynamicStyles.pulseRing,
            {
              transform: [{ scale: pulseAnim }],
              opacity: opacityAnim,
            },
          ]}
        />
      )}

      {/* Main button */}
      <Pressable
        style={[
          dynamicStyles.button,
          { backgroundColor: buttonBackgroundColor },
          isDisabled && dynamicStyles.buttonDisabled,
        ]}
        onPressIn={handlePressIn}
        onPressOut={isDisabled ? undefined : onPressOut}
        disabled={isDisabled}
        testID={`${testID}-pressable`}
        accessibilityRole="button"
        accessibilityLabel={
          isRecording
            ? "Recording voice command. Release to submit."
            : isProcessing
            ? "Processing voice command"
            : "Press and hold to speak"
        }
        accessibilityState={{ disabled: isDisabled }}
      >
        {isProcessing ? (
          <ActivityIndicator
            size="small"
            color={colors.textInverse}
            testID={`${testID}-spinner`}
          />
        ) : (
          <MaterialCommunityIcons
            name={isRecording ? "microphone" : "microphone-outline"}
            size={28}
            color={colors.textInverse}
            testID={`${testID}-icon`}
          />
        )}
      </Pressable>
    </View>
  );
}

export default VoiceButton;
