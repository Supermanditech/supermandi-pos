// AUDIT-POS-028: Cross-platform toast utility
// ToastAndroid crashes on iOS — this wrapper falls back to console.log on non-Android

import { Platform, ToastAndroid } from "react-native";

export function showToast(message: string, duration: "short" | "long" = "short"): void {
  if (Platform.OS === "android") {
    ToastAndroid.show(
      message,
      duration === "long" ? ToastAndroid.LONG : ToastAndroid.SHORT
    );
  } else {
    // iOS/web: no-op for now (could integrate react-native-toast-message later)
    console.log(`[Toast] ${message}`);
  }
}
