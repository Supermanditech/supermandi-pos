// VoiceButton - VOICE-001
// Floating push-to-talk microphone button for voice commands

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../theme";

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

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * VoiceButton - Push-to-talk floating action button.
 *
 * Press and hold to record, release to submit.
 * Shows pulsing animation while recording, spinner while processing.
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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.6)).current;

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

  const buttonBackgroundColor = isRecording
    ? theme.colors.error
    : theme.colors.primary;

  return (
    <View style={styles.container} testID={testID}>
      {/* Pulse ring (visible when recording) */}
      {isRecording && (
        <Animated.View
          style={[
            styles.pulseRing,
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
          styles.button,
          { backgroundColor: buttonBackgroundColor },
          isDisabled && styles.buttonDisabled,
        ]}
        onPressIn={isDisabled ? undefined : onPressIn}
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
            color={theme.colors.textInverse}
            testID={`${testID}-spinner`}
          />
        ) : (
          <MaterialCommunityIcons
            name={isRecording ? "microphone" : "microphone-outline"}
            size={28}
            color={theme.colors.textInverse}
            testID={`${testID}-icon`}
          />
        )}
      </Pressable>
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: PULSE_SIZE,
    height: PULSE_SIZE,
    borderRadius: PULSE_SIZE / 2,
    backgroundColor: theme.colors.error,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default VoiceButton;
