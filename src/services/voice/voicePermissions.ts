// Voice Permissions Service - VOICE-002
// Handles microphone permission requests with denied path handling

import { Audio } from "expo-av";
import { Alert, Linking, Platform } from "react-native";

// =============================================================================
// TYPES
// =============================================================================

export type PermissionStatus = "undetermined" | "granted" | "denied";

export interface PermissionResult {
  status: PermissionStatus;
  canAskAgain: boolean;
}

// =============================================================================
// PERMISSION FUNCTIONS
// =============================================================================

/**
 * Get current microphone permission status without prompting.
 */
export async function getMicrophonePermissionStatus(): Promise<PermissionResult> {
  try {
    const { status, canAskAgain } = await Audio.getPermissionsAsync();

    if (status === "granted") {
      return { status: "granted", canAskAgain: true };
    }

    if (status === "denied") {
      return { status: "denied", canAskAgain: canAskAgain ?? false };
    }

    return { status: "undetermined", canAskAgain: true };
  } catch (error) {
    console.error("[voicePermissions] Failed to get permission status:", error);
    return { status: "undetermined", canAskAgain: true };
  }
}

/**
 * Request microphone permission.
 * Shows system permission dialog if status is undetermined.
 * Shows settings prompt if permanently denied.
 *
 * @returns true if permission was granted
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    // First check current status
    const currentStatus = await getMicrophonePermissionStatus();

    if (currentStatus.status === "granted") {
      return true;
    }

    // If denied and can't ask again, show settings prompt
    if (currentStatus.status === "denied" && !currentStatus.canAskAgain) {
      showPermissionDeniedAlert();
      return false;
    }

    // Request permission
    const { status, canAskAgain } = await Audio.requestPermissionsAsync();

    if (status === "granted") {
      return true;
    }

    // Permission denied
    if (!canAskAgain) {
      // Permanently denied - show settings prompt
      showPermissionDeniedAlert();
    }

    return false;
  } catch (error) {
    console.error("[voicePermissions] Failed to request permission:", error);
    return false;
  }
}

/**
 * Show alert when microphone permission is permanently denied.
 * Provides option to open app settings.
 */
function showPermissionDeniedAlert(): void {
  Alert.alert(
    "Microphone Access Required",
    "Voice commands need microphone access. Please enable it in Settings to use voice features.",
    [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Open Settings",
        onPress: openAppSettings,
      },
    ],
    { cancelable: true }
  );
}

/**
 * Open app settings where user can enable microphone permission.
 */
export async function openAppSettings(): Promise<void> {
  try {
    if (Platform.OS === "ios") {
      await Linking.openURL("app-settings:");
    } else {
      await Linking.openSettings();
    }
  } catch (error) {
    console.error("[voicePermissions] Failed to open settings:", error);
  }
}

// =============================================================================
// AUDIO SESSION CONFIGURATION
// =============================================================================

/**
 * Configure audio session for voice recording.
 * Sets appropriate mode for speech recording.
 *
 * @returns true if audio session was configured successfully
 */
export async function configureAudioSession(): Promise<boolean> {
  try {
    await Audio.setAudioModeAsync({
      // Allow recording
      allowsRecordingIOS: true,
      // Use speech recognition mode for better voice capture
      playsInSilentModeIOS: true,
      // Don't interrupt other audio when not recording
      staysActiveInBackground: false,
      // Use default audio output (speaker)
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    return true;
  } catch (error) {
    console.error("[voicePermissions] Failed to configure audio session:", error);
    return false;
  }
}

/**
 * Reset audio session after recording.
 * Restores normal audio behavior.
 */
export async function resetAudioSession(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (error) {
    console.error("[voicePermissions] Failed to reset audio session:", error);
  }
}

// =============================================================================
// COMBINED PERMISSION + AUDIO SETUP
// =============================================================================

/**
 * Request permission and configure audio session for voice recording.
 * Call this before starting a voice recording session.
 *
 * @returns true if ready to record
 */
export async function prepareForRecording(): Promise<boolean> {
  // Step 1: Get permission
  const hasPermission = await requestMicrophonePermission();
  if (!hasPermission) {
    return false;
  }

  // Step 2: Configure audio session
  const isConfigured = await configureAudioSession();
  if (!isConfigured) {
    console.error("[voicePermissions] Audio session configuration failed");
    return false;
  }

  return true;
}

export default {
  getMicrophonePermissionStatus,
  requestMicrophonePermission,
  openAppSettings,
  configureAudioSession,
  resetAudioSession,
  prepareForRecording,
};
