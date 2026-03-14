// VoiceSheet - VOICE-001
// Bottom sheet modal for voice interaction feedback
// STG-360: Confirmation step before executing voice commands
// STG-363: Picker UI for NEEDS_CLARIFICATION with candidate options
// STG-364: Visual confidence score for voice recognition results
// STG-365: Microphone permission denied guidance with Open Settings button
// STG-409: Recording duration countdown timer

import React, { useEffect, useRef, useCallback } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
  Linking,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { theme, useThemeColors } from "../../theme";

// =============================================================================
// TYPES
// =============================================================================

export type VoiceSheetState =
  | "hidden"
  | "recording"
  | "processing"
  | "success"
  | "error"
  | "confirm"          // STG-360: Awaiting user confirmation
  | "clarify"          // STG-363: Needs clarification picker
  | "permissionDenied" // STG-365: Mic permission denied
  | "timeout"          // STG-366: API timeout
  | "rateLimited";     // STG-410: 429 rate limited

// T-135: Voice language locale type
export type VoiceLocale = "EN" | "HI";

// STG-363: Clarification candidate
export interface VoiceClarifyOption {
  label: string;
  value: string;
  confidence?: number;
}

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
   * STG-360: Called when user confirms a voice command.
   */
  onConfirm?: () => void;

  /**
   * STG-360: Called when user cancels a voice command confirmation.
   */
  onCancel?: () => void;

  /**
   * STG-360: Interpreted command description shown in confirm state.
   */
  interpretedCommand?: string;

  /**
   * STG-363: Clarification options when state is "clarify".
   */
  clarifyOptions?: VoiceClarifyOption[];

  /**
   * STG-363: Called when user selects a clarification option.
   */
  onClarifySelect?: (option: VoiceClarifyOption) => void;

  /**
   * STG-364: Confidence score (0-1) for voice recognition.
   */
  confidence?: number;

  /**
   * STG-366/410: Called when user taps retry after timeout/rate-limit/error.
   */
  onRetry?: () => void;

  /**
   * STG-409: Current recording elapsed seconds.
   */
  recordingElapsed?: number;

  /**
   * STG-409: Max recording duration in seconds.
   */
  recordingMaxDuration?: number;

  /**
   * STG-410: Retry-after seconds from 429 response.
   */
  retryAfterSeconds?: number;

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
 * STG-360: Shows confirmation UI before executing commands.
 * STG-363: Shows clarification picker for ambiguous results.
 * STG-364: Shows confidence score for recognition results.
 * STG-365: Shows permission denied guidance with settings button.
 * STG-409: Shows recording countdown timer.
 * STG-410: Shows rate limit feedback with retry-after countdown.
 */
export function VoiceSheet({
  state,
  transcript,
  message,
  errorMessage,
  onDismiss,
  locale = "EN",
  onLocaleChange,
  onConfirm,
  onCancel,
  interpretedCommand,
  clarifyOptions,
  onClarifySelect,
  confidence,
  onRetry,
  recordingElapsed,
  recordingMaxDuration = 15,
  retryAfterSeconds,
  testID = "voice-sheet",
}: VoiceSheetProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const colors = useThemeColors();
  const visible = state !== "hidden";

  // Auto-dismiss success state after delay (but NOT confirm/clarify/permissionDenied)
  useEffect(() => {
    if (state === "success") {
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
            <RecordingContent
              testID={`${testID}-recording`}
              elapsed={recordingElapsed}
              maxDuration={recordingMaxDuration}
            />
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
              confidence={confidence}
              testID={`${testID}-success`}
            />
          )}

          {state === "error" && (
            <ErrorContent
              errorMessage={errorMessage}
              onRetry={onRetry}
              testID={`${testID}-error`}
            />
          )}

          {/* STG-360: Confirmation step */}
          {state === "confirm" && (
            <ConfirmContent
              transcript={transcript}
              interpretedCommand={interpretedCommand}
              confidence={confidence}
              onConfirm={onConfirm}
              onCancel={onCancel ?? onDismiss}
              testID={`${testID}-confirm`}
            />
          )}

          {/* STG-363: Clarification picker */}
          {state === "clarify" && (
            <ClarifyContent
              transcript={transcript}
              options={clarifyOptions}
              onSelect={onClarifySelect}
              onCancel={onCancel ?? onDismiss}
              testID={`${testID}-clarify`}
            />
          )}

          {/* STG-365: Permission denied guidance */}
          {state === "permissionDenied" && (
            <PermissionDeniedContent
              onDismiss={onDismiss}
              testID={`${testID}-permission-denied`}
            />
          )}

          {/* STG-366: API timeout */}
          {state === "timeout" && (
            <TimeoutContent
              onRetry={onRetry}
              onDismiss={onDismiss}
              testID={`${testID}-timeout`}
            />
          )}

          {/* STG-410: Rate limited */}
          {state === "rateLimited" && (
            <RateLimitedContent
              retryAfterSeconds={retryAfterSeconds}
              onDismiss={onDismiss}
              testID={`${testID}-rate-limited`}
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
  elapsed?: number;
  maxDuration?: number;
}

// STG-409: Recording content with countdown timer
function RecordingContent({ testID, elapsed = 0, maxDuration = 15 }: RecordingContentProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const elapsedStr = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`;
  const maxStr = `${Math.floor(maxDuration / 60)}:${(maxDuration % 60).toString().padStart(2, "0")}`;

  return (
    <View style={styles.content} testID={testID}>
      <WaveformAnimation />
      <Text style={styles.title}>{t("voice.listening")}</Text>
      <Text style={styles.subtitle}>{t("voice.releaseToSubmit")}</Text>
      {/* STG-409: Recording countdown */}
      <View style={countdownStyles.container}>
        <Text style={[countdownStyles.text, { color: colors.textSecondary }]}>
          {t("voice.recordingCountdown", { elapsed: elapsedStr, max: maxStr })}
        </Text>
        <View style={[countdownStyles.barBg, { backgroundColor: colors.border }]}>
          <View
            style={[
              countdownStyles.barFill,
              {
                backgroundColor: elapsed > maxDuration * 0.8 ? colors.error : colors.primary,
                width: `${Math.min((elapsed / maxDuration) * 100, 100)}%`,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

interface ProcessingContentProps {
  transcript?: string;
  testID?: string;
}

function ProcessingContent({ transcript, testID }: ProcessingContentProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.content} testID={testID}>
      <ActivityIndicator
        size="large"
        color={theme.colors.primary}
        style={styles.spinner}
      />
      <Text style={styles.title}>{t("voice.processing")}</Text>
      {transcript && (
        <Text style={styles.transcript} numberOfLines={2}>
          &ldquo;{transcript}&rdquo;
        </Text>
      )}
    </View>
  );
}

interface SuccessContentProps {
  message?: string;
  confidence?: number;
  testID?: string;
}

// STG-364: Success content with optional confidence score
function SuccessContent({ message, confidence, testID }: SuccessContentProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={styles.content} testID={testID}>
      <View style={[styles.iconCircle, styles.successCircle]}>
        <MaterialCommunityIcons
          name="check"
          size={32}
          color={theme.colors.textInverse}
        />
      </View>
      <Text style={styles.title}>{t("voice.done")}</Text>
      {message && (
        <Text style={styles.message} numberOfLines={3}>
          {message}
        </Text>
      )}
      {confidence != null && (
        <ConfidenceBar confidence={confidence} colors={colors} />
      )}
    </View>
  );
}

interface ErrorContentProps {
  errorMessage?: string;
  onRetry?: () => void;
  testID?: string;
}

function ErrorContent({ errorMessage, onRetry, testID }: ErrorContentProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={styles.content} testID={testID}>
      <View style={[styles.iconCircle, styles.errorCircle]}>
        <MaterialCommunityIcons
          name="alert"
          size={32}
          color={theme.colors.textInverse}
        />
      </View>
      <Text style={styles.title}>{t("voice.couldNotUnderstand")}</Text>
      <Text style={styles.errorText}>
        {errorMessage || t("voice.tryAgain")}
      </Text>
      {onRetry && (
        <Pressable
          style={[actionStyles.button, { backgroundColor: colors.primary, marginTop: 12 }]}
          onPress={onRetry}
          testID={`${testID}-retry`}
        >
          <Text style={[actionStyles.buttonText, { color: colors.textInverse }]}>
            {t("voice.retry")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// =============================================================================
// STG-360: CONFIRMATION CONTENT
// =============================================================================

interface ConfirmContentProps {
  transcript?: string;
  interpretedCommand?: string;
  confidence?: number;
  onConfirm?: () => void;
  onCancel: () => void;
  testID?: string;
}

function ConfirmContent({
  transcript,
  interpretedCommand,
  confidence,
  onConfirm,
  onCancel,
  testID,
}: ConfirmContentProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View style={styles.content} testID={testID}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
        <MaterialCommunityIcons
          name="message-processing"
          size={32}
          color={colors.textInverse}
        />
      </View>
      <Text style={styles.title}>{t("voice.confirmCommand")}</Text>

      {transcript && (
        <Text style={styles.transcript} numberOfLines={2}>
          &ldquo;{transcript}&rdquo;
        </Text>
      )}

      {interpretedCommand && (
        <View style={[confirmStyles.commandBox, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
          <Text style={[confirmStyles.commandLabel, { color: colors.textSecondary }]}>
            {t("voice.interpretedAs")}
          </Text>
          <Text style={[confirmStyles.commandText, { color: colors.textPrimary }]}>
            {interpretedCommand}
          </Text>
        </View>
      )}

      {confidence != null && (
        <ConfidenceBar confidence={confidence} colors={colors} />
      )}

      <View style={actionStyles.row}>
        <Pressable
          style={[actionStyles.button, actionStyles.buttonOutline, { borderColor: colors.border }]}
          onPress={onCancel}
          testID={`${testID}-cancel`}
        >
          <Text style={[actionStyles.buttonText, { color: colors.textSecondary }]}>
            {t("voice.cancelAction")}
          </Text>
        </Pressable>
        <Pressable
          style={[actionStyles.button, { backgroundColor: colors.primary }]}
          onPress={onConfirm}
          testID={`${testID}-confirm`}
        >
          <Text style={[actionStyles.buttonText, { color: colors.textInverse }]}>
            {t("voice.confirmAction")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// =============================================================================
// STG-363: CLARIFICATION PICKER CONTENT
// =============================================================================

interface ClarifyContentProps {
  transcript?: string;
  options?: VoiceClarifyOption[];
  onSelect?: (option: VoiceClarifyOption) => void;
  onCancel: () => void;
  testID?: string;
}

function ClarifyContent({
  transcript,
  options = [],
  onSelect,
  onCancel,
  testID,
}: ClarifyContentProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View style={styles.content} testID={testID}>
      <View style={[styles.iconCircle, { backgroundColor: colors.warning }]}>
        <MaterialCommunityIcons
          name="help"
          size={32}
          color={colors.textInverse}
        />
      </View>
      <Text style={styles.title}>{t("voice.needsClarification")}</Text>

      {transcript && (
        <Text style={styles.transcript} numberOfLines={2}>
          &ldquo;{transcript}&rdquo;
        </Text>
      )}

      <ScrollView
        style={clarifyStyles.optionsList}
        contentContainerStyle={clarifyStyles.optionsContent}
        showsVerticalScrollIndicator={false}
      >
        {options.map((option, index) => (
          <Pressable
            key={`${option.value}-${index}`}
            style={[
              clarifyStyles.optionItem,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor: colors.border,
              },
            ]}
            onPress={() => onSelect?.(option)}
            testID={`${testID}-option-${index}`}
          >
            <Text style={[clarifyStyles.optionLabel, { color: colors.textPrimary }]}>
              {option.label}
            </Text>
            {option.confidence != null && (
              <Text style={[clarifyStyles.optionConfidence, { color: colors.textTertiary }]}>
                {Math.round(option.confidence * 100)}%
              </Text>
            )}
          </Pressable>
        ))}
      </ScrollView>

      <Pressable
        style={[actionStyles.button, actionStyles.buttonOutline, { borderColor: colors.border, alignSelf: "center" }]}
        onPress={onCancel}
        testID={`${testID}-cancel`}
      >
        <Text style={[actionStyles.buttonText, { color: colors.textSecondary }]}>
          {t("voice.cancelAction")}
        </Text>
      </Pressable>
    </View>
  );
}

// =============================================================================
// STG-365: PERMISSION DENIED CONTENT
// =============================================================================

interface PermissionDeniedContentProps {
  onDismiss: () => void;
  testID?: string;
}

function PermissionDeniedContent({ onDismiss, testID }: PermissionDeniedContentProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      // Silently ignore if settings can't be opened
    });
  }, []);

  return (
    <View style={styles.content} testID={testID}>
      <View style={[styles.iconCircle, { backgroundColor: colors.warning }]}>
        <MaterialCommunityIcons
          name="microphone-off"
          size={32}
          color={colors.textInverse}
        />
      </View>
      <Text style={styles.title}>{t("voice.micPermissionDenied")}</Text>
      <Text style={[styles.message, { marginBottom: 8 }]}>
        {t("voice.micPermissionExplain")}
      </Text>

      <View style={actionStyles.row}>
        <Pressable
          style={[actionStyles.button, actionStyles.buttonOutline, { borderColor: colors.border }]}
          onPress={onDismiss}
          testID={`${testID}-dismiss`}
        >
          <Text style={[actionStyles.buttonText, { color: colors.textSecondary }]}>
            {t("voice.cancelAction")}
          </Text>
        </Pressable>
        <Pressable
          style={[actionStyles.button, { backgroundColor: colors.primary }]}
          onPress={handleOpenSettings}
          testID={`${testID}-open-settings`}
        >
          <MaterialCommunityIcons name="cog" size={16} color={colors.textInverse} style={{ marginRight: 4 }} />
          <Text style={[actionStyles.buttonText, { color: colors.textInverse }]}>
            {t("voice.openSettings")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// =============================================================================
// STG-366: TIMEOUT CONTENT
// =============================================================================

interface TimeoutContentProps {
  onRetry?: () => void;
  onDismiss: () => void;
  testID?: string;
}

function TimeoutContent({ onRetry, onDismiss, testID }: TimeoutContentProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View style={styles.content} testID={testID}>
      <View style={[styles.iconCircle, styles.errorCircle]}>
        <MaterialCommunityIcons
          name="clock-alert-outline"
          size={32}
          color={theme.colors.textInverse}
        />
      </View>
      <Text style={styles.title}>{t("voice.couldNotUnderstand")}</Text>
      <Text style={styles.errorText}>{t("voice.apiTimeout")}</Text>

      <View style={actionStyles.row}>
        <Pressable
          style={[actionStyles.button, actionStyles.buttonOutline, { borderColor: colors.border }]}
          onPress={onDismiss}
          testID={`${testID}-dismiss`}
        >
          <Text style={[actionStyles.buttonText, { color: colors.textSecondary }]}>
            {t("voice.cancelAction")}
          </Text>
        </Pressable>
        {onRetry && (
          <Pressable
            style={[actionStyles.button, { backgroundColor: colors.primary }]}
            onPress={onRetry}
            testID={`${testID}-retry`}
          >
            <Text style={[actionStyles.buttonText, { color: colors.textInverse }]}>
              {t("voice.retry")}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// =============================================================================
// STG-410: RATE LIMITED CONTENT
// =============================================================================

interface RateLimitedContentProps {
  retryAfterSeconds?: number;
  onDismiss: () => void;
  testID?: string;
}

function RateLimitedContent({ retryAfterSeconds = 30, onDismiss, testID }: RateLimitedContentProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [countdown, setCountdown] = React.useState(retryAfterSeconds);

  useEffect(() => {
    setCountdown(retryAfterSeconds);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [retryAfterSeconds]);

  return (
    <View style={styles.content} testID={testID}>
      <View style={[styles.iconCircle, { backgroundColor: colors.warning }]}>
        <MaterialCommunityIcons
          name="timer-sand"
          size={32}
          color={colors.textInverse}
        />
      </View>
      <Text style={styles.title}>{t("voice.couldNotUnderstand")}</Text>
      <Text style={styles.errorText}>
        {t("voice.rateLimited", { seconds: countdown })}
      </Text>

      <Pressable
        style={[actionStyles.button, actionStyles.buttonOutline, { borderColor: colors.border, alignSelf: "center", marginTop: 12 }]}
        onPress={onDismiss}
        testID={`${testID}-dismiss`}
      >
        <Text style={[actionStyles.buttonText, { color: colors.textSecondary }]}>
          {t("voice.cancelAction")}
        </Text>
      </Pressable>
    </View>
  );
}

// =============================================================================
// STG-364: CONFIDENCE BAR
// =============================================================================

interface ConfidenceBarProps {
  confidence: number;
  colors: ReturnType<typeof useThemeColors>;
}

function ConfidenceBar({ confidence, colors }: ConfidenceBarProps) {
  const { t } = useTranslation();
  const pct = Math.round(confidence * 100);
  const barColor = pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.error;

  return (
    <View style={confidenceStyles.container}>
      <Text style={[confidenceStyles.label, { color: colors.textTertiary }]}>
        {t("voice.confidence")}: {pct}%
      </Text>
      <View style={[confidenceStyles.barBg, { backgroundColor: colors.border }]}>
        <View
          style={[
            confidenceStyles.barFill,
            { backgroundColor: barColor, width: `${pct}%` },
          ]}
        />
      </View>
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

// STG-360: Confirm styles
const confirmStyles = StyleSheet.create({
  commandBox: {
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    width: "100%",
  },
  commandLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
  },
  commandText: {
    fontSize: 16,
    fontWeight: "600",
  },
});

// STG-360/363/365/366/410: Action button styles
const actionStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    marginTop: theme.spacing.lg,
    width: "100%",
  },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
  },
  buttonOutline: {
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});

// STG-363: Clarify picker styles
const clarifyStyles = StyleSheet.create({
  optionsList: {
    maxHeight: 200,
    width: "100%",
    marginTop: theme.spacing.md,
  },
  optionsContent: {
    gap: 8,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  optionConfidence: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 8,
  },
});

// STG-364: Confidence bar styles
const confidenceStyles = StyleSheet.create({
  container: {
    width: "100%",
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 4,
    textAlign: "center",
  },
  barBg: {
    height: 6,
    borderRadius: 3,
    width: "100%",
    overflow: "hidden",
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
});

// STG-409: Countdown timer styles
const countdownStyles = StyleSheet.create({
  container: {
    width: "80%",
    marginTop: theme.spacing.md,
    alignItems: "center",
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    marginBottom: 6,
  },
  barBg: {
    height: 4,
    borderRadius: 2,
    width: "100%",
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
});

export default VoiceSheet;
