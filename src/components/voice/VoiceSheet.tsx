// VoiceSheet - VOICE-001
// Bottom sheet modal for voice interaction feedback

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../../theme";

// =============================================================================
// TYPES
// =============================================================================

export type VoiceSheetState =
  | "hidden"
  | "recording"
  | "processing"
  | "success"
  | "error";

// T-135: Voice language locale type
export type VoiceLocale = "EN" | "HI";

export interface VoiceSheetProps {
  /**
   * Current state of the voice sheet.
   */
  state: VoiceSheetState;

  /**
   * Transcribed text from speech (shown after processing).
   */
  transcript?: string;

  /**
   * Response message to show user.
   */
  message?: string;

  /**
   * Error message if state is "error".
   */
  errorMessage?: string;

  /**
   * Called when user dismisses the sheet.
   */
  onDismiss: () => void;

  /**
   * T-135: Currently selected voice language locale.
   */
  locale?: VoiceLocale;

  /**
   * T-135: Called when user changes voice language.
   */
  onLocaleChange?: (locale: VoiceLocale) => void;

  /**
   * Optional test ID for e2e testing.
   */
  testID?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const WAVEFORM_BARS = 5;

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * VoiceSheet - Bottom sheet for voice interaction feedback.
 *
 * Shows recording animation, processing spinner, and results.
 *
 * @example
 * <VoiceSheet
 *   state={voiceSheetState}
 *   transcript={recognizedText}
 *   message={responseMessage}
 *   onDismiss={handleDismiss}
 * />
 */
export function VoiceSheet({
  state,
  transcript,
  message,
  errorMessage,
  onDismiss,
  locale = "EN",
  onLocaleChange,
  testID = "voice-sheet",
}: VoiceSheetProps) {
  const insets = useSafeAreaInsets();
  const visible = state !== "hidden";

  // Auto-dismiss success/error states after delay
  useEffect(() => {
    if (state === "success" || state === "error") {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [state, onDismiss]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      testID={testID}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDismiss} />

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* T-135: Language toggle pill */}
          {onLocaleChange && (state === "recording" || state === "hidden") ? null : null}
          {onLocaleChange && (
            <View style={styles.languageToggleRow}>
              <Pressable
                style={[
                  styles.languageToggleButton,
                  locale === "EN" && styles.languageToggleActive,
                ]}
                onPress={() => onLocaleChange("EN")}
                testID={`${testID}-locale-en`}
              >
                <Text
                  style={[
                    styles.languageToggleText,
                    locale === "EN" && styles.languageToggleTextActive,
                  ]}
                >
                  EN
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.languageToggleButton,
                  locale === "HI" && styles.languageToggleActive,
                ]}
                onPress={() => onLocaleChange("HI")}
                testID={`${testID}-locale-hi`}
              >
                <Text
                  style={[
                    styles.languageToggleText,
                    locale === "HI" && styles.languageToggleTextActive,
                  ]}
                >
                  HI
                </Text>
              </Pressable>
            </View>
          )}

          {/* Content based on state */}
          {state === "recording" && (
            <RecordingContent testID={`${testID}-recording`} />
          )}

          {state === "processing" && (
            <ProcessingContent
              transcript={transcript}
              testID={`${testID}-processing`}
            />
          )}

          {state === "success" && (
            <SuccessContent
              message={message}
              testID={`${testID}-success`}
            />
          )}

          {state === "error" && (
            <ErrorContent
              errorMessage={errorMessage}
              testID={`${testID}-error`}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface RecordingContentProps {
  testID?: string;
}

function RecordingContent({ testID }: RecordingContentProps) {
  return (
    <View style={styles.content} testID={testID}>
      <WaveformAnimation />
      <Text style={styles.title}>Listening...</Text>
      <Text style={styles.subtitle}>Release to submit</Text>
    </View>
  );
}

interface ProcessingContentProps {
  transcript?: string;
  testID?: string;
}

function ProcessingContent({ transcript, testID }: ProcessingContentProps) {
  return (
    <View style={styles.content} testID={testID}>
      <ActivityIndicator
        size="large"
        color={theme.colors.primary}
        style={styles.spinner}
      />
      <Text style={styles.title}>Processing...</Text>
      {transcript && (
        <Text style={styles.transcript} numberOfLines={2}>
          "{transcript}"
        </Text>
      )}
    </View>
  );
}

interface SuccessContentProps {
  message?: string;
  testID?: string;
}

function SuccessContent({ message, testID }: SuccessContentProps) {
  return (
    <View style={styles.content} testID={testID}>
      <View style={[styles.iconCircle, styles.successCircle]}>
        <MaterialCommunityIcons
          name="check"
          size={32}
          color={theme.colors.textInverse}
        />
      </View>
      <Text style={styles.title}>Done!</Text>
      {message && (
        <Text style={styles.message} numberOfLines={3}>
          {message}
        </Text>
      )}
    </View>
  );
}

interface ErrorContentProps {
  errorMessage?: string;
  testID?: string;
}

function ErrorContent({ errorMessage, testID }: ErrorContentProps) {
  return (
    <View style={styles.content} testID={testID}>
      <View style={[styles.iconCircle, styles.errorCircle]}>
        <MaterialCommunityIcons
          name="alert"
          size={32}
          color={theme.colors.textInverse}
        />
      </View>
      <Text style={styles.title}>Couldn't understand</Text>
      <Text style={styles.errorText}>
        {errorMessage || "Please try again"}
      </Text>
    </View>
  );
}

// =============================================================================
// WAVEFORM ANIMATION
// =============================================================================

function WaveformAnimation() {
  const animValues = useRef(
    Array.from({ length: WAVEFORM_BARS }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    const animations = animValues.map((anim, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration: 300 + index * 50,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.3,
            duration: 300 + index * 50,
            useNativeDriver: true,
          }),
        ])
      )
    );

    animations.forEach((anim) => anim.start());

    return () => animations.forEach((anim) => anim.stop());
  }, [animValues]);

  return (
    <View style={styles.waveformContainer}>
      {animValues.map((anim, index) => (
        <Animated.View
          key={index}
          style={[
            styles.waveformBar,
            {
              transform: [{ scaleY: anim }],
            },
          ]}
        />
      ))}
    </View>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    minHeight: 200,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: theme.spacing.lg,
  },
  content: {
    alignItems: "center",
    paddingVertical: theme.spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.md,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  transcript: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: "center",
    fontStyle: "italic",
    paddingHorizontal: theme.spacing.md,
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: "center",
    paddingHorizontal: theme.spacing.md,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.error,
    marginTop: theme.spacing.sm,
    textAlign: "center",
  },
  spinner: {
    marginBottom: theme.spacing.sm,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  successCircle: {
    backgroundColor: theme.colors.success,
  },
  errorCircle: {
    backgroundColor: theme.colors.error,
  },
  // T-135: Language toggle styles
  languageToggleRow: {
    flexDirection: "row",
    alignSelf: "center",
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  languageToggleButton: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "transparent",
  },
  languageToggleActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  languageToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textTertiary,
  },
  languageToggleTextActive: {
    color: theme.colors.textInverse,
  },
  // Waveform styles
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 60,
    gap: 6,
  },
  waveformBar: {
    width: 6,
    height: 40,
    backgroundColor: theme.colors.error,
    borderRadius: 3,
  },
});

export default VoiceSheet;
