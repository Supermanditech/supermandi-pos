// Voice Services - VOICE-001, VOICE-002
// Central export for voice-related functionality

export {
  getMicrophonePermissionStatus,
  requestMicrophonePermission,
  openAppSettings,
  configureAudioSession,
  resetAudioSession,
  prepareForRecording,
  type PermissionStatus,
  type PermissionResult,
} from "./voicePermissions";

export {
  startRecording,
  stopRecording,
  cancelRecording,
  isRecording,
  setOnAutoStop,
  interpretVoice,
  executeVoiceAction,
  submitVoiceCommand,
  confirmAndExecuteVoice,
  VoiceRateLimitError,
  VoiceTimeoutError,
  type VoiceInterpretResponse,
  type VoiceIntent,
  type VoiceActionResult,
  type VoiceCommandResult,
} from "./voiceClient";
