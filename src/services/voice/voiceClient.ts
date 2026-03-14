// Voice Client Service - VOICE-001
// Handles audio recording and voice command submission
// STG-362: Locale pass-through to backend STT
// STG-366: API timeout handling with AbortController
// STG-410: 429 rate limit response handling

import { Audio } from "expo-av";
import { API_BASE_URL } from "../../config/api";
import { getAuthToken } from "../api/storage";
import { getDeviceToken } from "../deviceSession";
import {
  prepareForRecording,
  resetAudioSession,
} from "./voicePermissions";

// STG-366: Default API timeout in milliseconds
const VOICE_API_TIMEOUT_MS = 10_000;

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
    // FIX-042: Reset audio session + state on error to unblock other audio
    currentRecording = null;
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer);
      maxDurationTimer = null;
    }
    await resetAudioSession();
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

// STG-410: Custom error class for rate limiting with retry-after info
export class VoiceRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfter: number) {
    super(`Rate limited. Retry after ${retryAfter} seconds.`);
    this.name = "VoiceRateLimitError";
    this.retryAfterSeconds = retryAfter;
  }
}

// STG-366: Custom error class for API timeout
export class VoiceTimeoutError extends Error {
  constructor() {
    super("Voice API request timed out");
    this.name = "VoiceTimeoutError";
  }
}

/**
 * Upload audio file and get voice interpretation.
 * STG-362: Accepts locale to pass to backend STT engine.
 * STG-366: Uses AbortController for 10s timeout.
 * STG-410: Throws VoiceRateLimitError on 429 with retry-after.
 *
 * @param audioUri - URI of the recorded audio file
 * @param storeId - Store ID for context
 * @param locale - STG-362: Language locale for STT engine ("EN" | "HI")
 * @returns Interpretation response with transcript and intent
 */
export async function interpretVoice(
  audioUri: string,
  storeId: string,
  locale?: string
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

  // STG-362: Pass locale to backend for STT language model selection
  if (locale) {
    formData.append("locale", locale);
  }

  const url = `${API_BASE_URL}/api/v1/voice/interpret`;
  console.log("[voiceClient] Uploading audio to:", url, "locale:", locale ?? "default");

  // STG-366: AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VOICE_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(deviceToken ? { "x-device-token": deviceToken } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    // STG-366: Detect abort/timeout
    if (error instanceof Error && error.name === "AbortError") {
      throw new VoiceTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  console.log("[voiceClient] Response:", response.status, text.slice(0, 200));

  if (!response.ok) {
    // STG-410: Handle 429 rate limiting with retry-after header
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 30;
      throw new VoiceRateLimitError(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 30);
    }

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
    // ISSUE-071: Handle 401 Unauthorized with user-friendly message
    if (response.status === 401 || errorCode === "DEVICE_UNAUTHORIZED") {
      errorMessage = "Session expired. Please restart the app.";
    } else if (response.status === 503 || errorCode === "VOICE_NOT_CONFIGURED") {
      errorMessage = "Voice service is not available. Please try again later.";
    } else if (response.status === 404) {
      errorMessage = "Voice service not found. Please update the app.";
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
 * STG-360: Result from submitVoiceCommand — extended with confirm/clarify fields.
 */
export interface VoiceCommandResult {
  success: boolean;
  transcript: string;
  message: string;
  intent?: VoiceIntent;
  /** STG-360: Request ID for deferred execution after confirm */
  requestId?: string;
  /** STG-360: Whether the command needs user confirmation before execution */
  needsConfirm?: boolean;
  /** STG-360: Human-readable interpreted command description */
  interpretedCommand?: string;
  /** STG-363: Whether the result needs clarification (multiple candidates) */
  needsClarification?: boolean;
  /** STG-363: Candidate options for clarification */
  clarifyOptions?: Array<{ label: string; value: string; confidence?: number }>;
  /** STG-364: Confidence score (0-1) */
  confidence?: number;
}

/**
 * Complete voice flow: stop recording → upload → interpret.
 * STG-360: Returns interpreted command for confirmation instead of auto-executing.
 * STG-362: Passes locale to backend for STT language selection.
 *
 * @param storeId - Store ID for context
 * @param locale - STG-362: Language locale for STT engine
 * @returns Command result — caller should check needsConfirm/needsClarification
 */
export async function submitVoiceCommand(
  storeId: string,
  locale?: string
): Promise<VoiceCommandResult> {
  // Stop recording and get URI
  const audioUri = await stopRecording();
  if (!audioUri) {
    return {
      success: false,
      transcript: "",
      message: "No audio recorded. Please try again.",
    };
  }

  // STG-362: Pass locale to interpretVoice
  // STG-366/410: Let VoiceTimeoutError and VoiceRateLimitError propagate to caller
  const interpretResult = await interpretVoice(audioUri, storeId, locale);

  if (!interpretResult.success) {
    return {
      success: false,
      transcript: "",
      message: "Could not understand. Please try again.",
    };
  }

  const { transcript, intent, confidence, requestId } = interpretResult.data;

  // For unknown intent, just return transcript
  if (intent.action === "unknown" || intent.action === "UNKNOWN") {
    return {
      success: false,
      transcript,
      message: "I didn't understand that command. Try saying 'Add 2 kg rice' or 'Search for dal'.",
      intent,
      confidence,
    };
  }

  // STG-360: Build human-readable interpreted command description
  const interpretedCommand = buildInterpretedCommand(intent);

  // STG-360: Return result for confirmation instead of auto-executing
  return {
    success: true,
    transcript,
    message: interpretedCommand,
    intent,
    requestId,
    needsConfirm: true,
    interpretedCommand,
    confidence,
  };
}

/**
 * STG-360: Execute a confirmed voice command by requestId.
 */
export async function confirmAndExecuteVoice(
  requestId: string,
  storeId: string
): Promise<VoiceCommandResult> {
  try {
    const executeResult = await executeVoiceAction(requestId, storeId, true);
    return {
      success: executeResult.success,
      transcript: "",
      message: executeResult.message,
    };
  } catch (error) {
    console.error("[voiceClient] Confirmed voice execution failed:", error);
    return {
      success: false,
      transcript: "",
      message: error instanceof Error ? error.message : "Voice command failed.",
    };
  }
}

/**
 * STG-360: Build a human-readable description of the interpreted voice command.
 */
function buildInterpretedCommand(intent: VoiceIntent): string {
  const action = intent.action.toUpperCase();
  const query = intent.slots?.query || intent.productName || "";
  const qty = intent.slots?.quantity ?? intent.quantity;
  const unit = intent.slots?.unit ?? intent.unit ?? "";

  switch (action) {
    case "ADD_TO_CART":
      return qty ? `Add ${qty} ${unit} ${query}`.trim() : `Add ${query}`.trim();
    case "SEARCH":
      return `Search: ${query}`.trim();
    case "CHECK_STOCK":
      return `Check stock: ${query}`.trim();
    case "REMOVE_FROM_CART":
      return `Remove: ${query}`.trim();
    case "CLEAR_CART":
      return "Clear cart";
    case "TOTAL":
      return "Show total";
    case "CHECKOUT_CONFIRM":
      return "Proceed to checkout";
    case "HELP":
      return "Show help";
    default:
      return query || action;
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
  confirmAndExecuteVoice,
};
