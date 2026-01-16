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
  interpretVoice,
  executeVoiceAction,
  submitVoiceCommand,
  type VoiceInterpretResponse,
  type VoiceIntent,
  type VoiceActionResult,
} from "./voiceClient";
