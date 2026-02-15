// T-123: Session timeout hook for POS app
// Tracks idle time and auto-logs out after 35 minutes of inactivity
// Shows warning at 30 minutes

import { useEffect, useRef, useCallback } from "react";
import { AppState, Alert } from "react-native";
import type { AppStateStatus } from "react-native";

const IDLE_WARNING_MS = 30 * 60 * 1000; // 30 minutes
const IDLE_LOGOUT_MS = 35 * 60 * 1000;  // 35 minutes
const CHECK_INTERVAL_MS = 30000;         // Check every 30 seconds

export function useSessionTimeout(onLogout: () => void) {
  const lastActivity = useRef(Date.now());
  const warningShown = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    lastActivity.current = Date.now();
    warningShown.current = false;
  }, []);

  useEffect(() => {
    const checkIdle = () => {
      const idle = Date.now() - lastActivity.current;

      if (idle >= IDLE_LOGOUT_MS) {
        onLogout();
      } else if (idle >= IDLE_WARNING_MS && !warningShown.current) {
        warningShown.current = true;
        Alert.alert(
          "Session Expiring",
          "You've been idle for 30 minutes. You will be logged out in 5 minutes.",
          [{ text: "Stay Logged In", onPress: resetTimer }]
        );
      }
    };

    intervalRef.current = setInterval(checkIdle, CHECK_INTERVAL_MS);

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === "active") {
        // When app comes to foreground, check idle time immediately
        checkIdle();
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      subscription.remove();
    };
  }, [onLogout, resetTimer]);

  return { resetTimer };
}
