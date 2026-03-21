// T-123: Session timeout hook for POS app
// Tracks idle time and auto-logs out after 35 minutes of inactivity
// Shows warning at 30 minutes

import { useEffect, useRef, useCallback } from "react";
import { AppState, Alert } from "react-native";
import type { AppStateStatus } from "react-native";

// GCP-STG-0005: Soft-lock after 30min idle for kirana POS (not 10min)
// PIN re-entry only — device session stays intact
const IDLE_WARNING_MS = 25 * 60 * 1000;  // 25 minutes (warn 5 min before lock)
const IDLE_LOGOUT_MS = 30 * 60 * 1000;  // 30 minutes (soft-lock to PIN re-entry)
const CHECK_INTERVAL_MS = 15000;         // Check every 15 seconds

// ISSUE-128: Accept isFocused flag — skip auto-logout when PaymentScreen is on top
export function useSessionTimeout(onLogout: () => void, isFocused = true) {
  const lastActivity = useRef(Date.now());
  const warningShown = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    lastActivity.current = Date.now();
    warningShown.current = false;
  }, []);

  useEffect(() => {
    const checkIdle = () => {
      // ISSUE-128: Don't auto-logout when another screen (e.g. PaymentScreen) is on top
      // The user may be actively completing a payment — treat as active
      if (!isFocused) {
        lastActivity.current = Date.now();
        return;
      }

      const idle = Date.now() - lastActivity.current;

      if (idle >= IDLE_LOGOUT_MS) {
        onLogout();
      } else if (idle >= IDLE_WARNING_MS && !warningShown.current) {
        warningShown.current = true;
        Alert.alert(
          "Session Expiring",
          "You've been idle for 25 minutes. Screen will lock in 5 minutes — tap to stay logged in.",
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
  }, [onLogout, resetTimer, isFocused]);

  return { resetTimer };
}
