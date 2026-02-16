// Voice Client Service - VOICE-001
// Handles audio recording and voice command submission

import { Audio } from "expo-av";
import { API_BASE_URL } from "../../config/api";
import { getAuthToken } from "../api/storage";
import { getDeviceToken } from "../deviceSession";
import {
  prepareForRecording,
  resetAudioSession,
} from "./voicePermissions";

// =============================================================================
// TYPES
// =============================================================================

export interface VoiceInterpretResponse {
  success: boolean;
  data: {
    requestId: string;
    transcript: string;
    intent: VoiceIntent;
    confidence: number;
  };
}

// VOICE-004: Intent types for retail-safe operations
export type VoiceAction =
  | "ADD_TO_CART"
  | "SEARCH"
  | "CHECK_STOCK"
  | "REMOVE_FROM_CART"
  | "CLEAR_CART"
  | "TOTAL"
  | "CHECKOUT_CONFIRM"
  | "HELP"
  | "UNKNOWN"
  // Legacy lowercase support
  | "add_to_cart"
  | "search"
  | "check_stock"
  | "info"
  | "unknown";

export interface VoiceIntent {
  action: VoiceAction;
  slots?: {
    query?: string;
    quantity?: number;
    unit?: "pcs" | "kg" | "g" | "l" | "ml";
    barcode?: string | null;
  };
  // Legacy fields for backward compatibility
  productName?: string;
  quantity?: number;
  unit?: string;
  rawQuery?: string;
  confidence?: number;
}

export interface VoiceActionResult {
  success: boolean;
  message: string;
  data?: {
    productId?: string;
    productName?: string;
    quantity?: number;
    price?: number;
  };
}

// =============================================================================
// RECORDING STATE
// =============================================================================

let currentRecording: Audio.Recording | null = null;
let maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECORDING_DURATION_MS = 60_000; // FIX-040: Auto-stop after 60 seconds
let onAutoStopCallback: (() => void) | null = null;

// Recording preset optimized for speech
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};

// =============================================================================
// RECORDING FUNCTIONS
// =============================================================================

/**
 * Start audio recording.
 * Requests permission if needed and configures audio session.
 *
 * @returns true if recording started successfully
 */
export async function startRecording(): Promise<boolean> {
  try {
    // Clean up any existing recording first (fixes "Only one Recording object" error)
    if (currentRecording) {
      try {
        await currentRecording.stopAndUnloadAsync();
      } catch {
        // Ignore cleanup errors
      }
      currentRecording = null;
    }

    // Prepare audio session and check permissions
    const ready = await prepareForRecording();
    if (!ready) {
      console.log("[voiceClient] Not ready to record (permission or audio session failed)");
      return false;
    }

    // Create and start new recording
    const { recording } = await Audio.Recording.createAsync(RECORDING_OPTIONS);
    currentRecording = recording;

    // FIX-040: Auto-stop after max duration
    if (maxDurationTimer) clearTimeout(maxDurationTimer);
    maxDurationTimer = setTimeout(async () => {
      console.log("[voiceClient] Max recording duration reached, auto-stopping");
      maxDurationTimer = null;
      await stopRecording();
      onAutoStopCallback?.();
    }, MAX_RECORDING_DURATION_MS);

    console.log("[voiceClient] Recording started");
    return true;
  } catch (error) {
    console.error("[voiceClient] Failed to start recording:", error);
    // Reset state on error
    currentRecording = null;
    return false;
  }
}

/**
 * Stop recording and get the audio file URI.
 *
 * @returns URI of the recorded audio file, or null if failed
 */
export async function stopRecording(): Promise<string | null> {
  // FIX-040: Clear auto-stop timer
  if (maxDurationTimer) {
    clearTimeout(maxDurationTimer);
    maxDurationTimer = null;
  }

  if (!currentRecording) {
    console.log("[voiceClient] No recording to stop");
    return null;
  }

  try {
    await currentRecording.stopAndUnloadAsync();
    const uri = currentRecording.getURI();
    currentRecording = null;

    // Reset audio session
    await resetAudioSession();

    console.log("[voiceClient] Recording stopped, URI:", uri);
    return uri;
  } catch (error) {
    console.error("[voiceClient] Failed to stop recording:", error);
    currentRecording = null;
    await resetAudioSession();
    return null;
  }
}

/**
 * Cancel recording without saving.
 */
export async function cancelRecording(): Promise<void> {
  // FIX-040: Clear auto-stop timer
  if (maxDurationTimer) {
    clearTimeout(maxDurationTimer);
    maxDurationTimer = null;
  }

  if (!currentRecording) {
    return;
  }

  try {
    await currentRecording.stopAndUnloadAsync();
  } catch (error) {
    console.error("[voiceClient] Error canceling recording:", error);
  } finally {
    currentRecording = null;
    await resetAudioSession();
  }
}

/**
 * Check if currently recording.
 */
// FIX-040: Register callback for auto-stop notification
export function setOnAutoStop(callback: (() => void) | null): void {
  onAutoStopCallback = callback;
}

export function isRecording(): boolean {
  return currentRecording !== null;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

/**
 * Upload audio file and get voice interpretation.
 *
 * @param audioUri - URI of the recorded audio file
 * @param storeId - Store ID for context
 * @returns Interpretation response with transcript and intent
 */
export async function interpretVoice(
  audioUri: string,
  storeId: string
): Promise<VoiceInterpretResponse> {
  const token = await getAuthToken();
  const deviceToken = await getDeviceToken();

  // Create form data with audio file
  const formData = new FormData();

  // Get file name from URI
  const fileName = audioUri.split("/").pop() || "recording.m4a";

  // Append audio file
  formData.append("audio", {
    uri: audioUri,
    type: "audio/m4a",
    name: fileName,
  } as any);

  formData.append("storeId", storeId);

  const url = `${API_BASE_URL}/api/v1/voice/interpret`;
  console.log("[voiceClient] Uploading audio to:", url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(deviceToken ? { "x-device-token": deviceToken } : {}),
    },
    body: formData,
  });

  const text = await response.text();
  console.log("[voiceClient] Response:", response.status, text.slice(0, 200));

  if (!response.ok) {
    let errorMessage = `Voice interpret failed (${response.status})`;
    let errorCode = "";
    try {
      const parsed = text ? JSON.parse(text) : {};
      // Handle different error formats
      if (typeof parsed.error === "string") {
        errorMessage = parsed.error;
      } else if (parsed.error?.code) {
        errorCode = parsed.error.code;
        errorMessage = parsed.error.message || errorCode;
      } else if (parsed.error?.message) {
        errorMessage = parsed.error.message;
      } else if (parsed.message) {
        errorMessage = parsed.message;
      }
    } catch {
      // JSON parse failed, use status-based message
    }

    // VOICE-001: Handle specific error codes with user-friendly messages
    if (response.status === 503 || errorCode === "VOICE_NOT_CONFIGURED") {
      errorMessage = "Voice service is not available. Please try again later.";
    } else if (response.status === 404) {
      errorMessage = "Voice service not found. Please update the app.";
    } else if (response.status === 429) {
      errorMessage = "Too many requests. Please wait a moment.";
    } else if (response.status >= 500) {
      errorMessage = "Server error. Please try again.";
    }

    throw new Error(errorMessage);
  }

  return JSON.parse(text) as VoiceInterpretResponse;
}

/**
 * Execute a voice action after confirmation (if needed).
 *
 * @param requestId - Request ID from interpret response
 * @param storeId - Store ID
 * @param confirmed - Whether user confirmed the action
 * @returns Action execution result
 */
export async function executeVoiceAction(
  requestId: string,
  storeId: string,
  confirmed: boolean = true
): Promise<VoiceActionResult> {
  const token = await getAuthToken();
  const deviceToken = await getDeviceToken();

  const url = `${API_BASE_URL}/api/v1/voice/execute`;
  console.log("[voiceClient] Executing voice action:", requestId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(deviceToken ? { "x-device-token": deviceToken } : {}),
    },
    body: JSON.stringify({
      requestId,
      storeId,
      confirmed,
    }),
  });

  const text = await response.text();
  console.log("[voiceClient] Execute response:", response.status, text.slice(0, 200));

  if (!response.ok) {
    let errorMessage = `Voice execute failed (${response.status})`;
    try {
      const parsed = text ? JSON.parse(text) : {};
      if (typeof parsed.error === "string") {
        errorMessage = parsed.error;
      } else if (parsed.error?.message) {
        errorMessage = parsed.error.message;
      } else if (parsed.message) {
        errorMessage = parsed.message;
      }
    } catch {
      if (response.status === 404) {
        errorMessage = "Voice service not available";
      }
    }
    throw new Error(errorMessage);
  }

  return JSON.parse(text) as VoiceActionResult;
}

// =============================================================================
// HIGH-LEVEL CONVENIENCE FUNCTION
// =============================================================================

/**
 * Complete voice flow: stop recording → upload → interpret → execute.
 * Use this for simple flows where no confirmation is needed.
 *
 * @param storeId - Store ID for context
 * @returns Action result with message for user
 */
export async function submitVoiceCommand(
  storeId: string
): Promise<{
  success: boolean;
  transcript: string;
  message: string;
  intent?: VoiceIntent;
}> {
  // Stop recording and get URI
  const audioUri = await stopRecording();
  if (!audioUri) {
    return {
      success: false,
      transcript: "",
      message: "No audio recorded. Please try again.",
    };
  }

  try {
    // Upload and interpret
    const interpretResult = await interpretVoice(audioUri, storeId);

    if (!interpretResult.success) {
      return {
        success: false,
        transcript: "",
        message: "Could not understand. Please try again.",
      };
    }

    const { transcript, intent } = interpretResult.data;

    // For unknown intent, just return transcript
    if (intent.action === "unknown") {
      return {
        success: false,
        transcript,
        message: "I didn't understand that command. Try saying 'Add 2 kg rice' or 'Search for dal'.",
        intent,
      };
    }

    // Execute the action
    const executeResult = await executeVoiceAction(
      interpretResult.data.requestId,
      storeId,
      true // Auto-confirm for now
    );

    return {
      success: executeResult.success,
      transcript,
      message: executeResult.message,
      intent,
    };
  } catch (error) {
    console.error("[voiceClient] Voice command failed:", error);

    let message = "Voice command failed. Please try again.";
    if (error instanceof TypeError) {
      // Network error
      message = "Cannot connect to voice service. Check your connection.";
    } else if (error instanceof Error) {
      message = error.message;
    }

    return {
      success: false,
      transcript: "",
      message,
    };
  }
}

export default {
  startRecording,
  stopRecording,
  cancelRecording,
  isRecording,
  interpretVoice,
  executeVoiceAction,
  submitVoiceCommand,
};
