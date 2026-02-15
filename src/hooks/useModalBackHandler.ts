// T-127: Hook to close modals on Android hardware back button press
// Apply this hook to any modal component that should close on back press

import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";

export function useModalBackHandler(isVisible: boolean, onClose: () => void) {
  useEffect(() => {
    if (Platform.OS !== "android" || !isVisible) return;

    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true; // Prevent default back behavior
    });

    return () => handler.remove();
  }, [isVisible, onClose]);
}
