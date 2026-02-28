/**
 * DRX-001: Firebase configuration for POS phone OTP
 *
 * FIREBASE-HARDENING-E: POS Firebase scope — OUT OF SCOPE for production auth.
 * POS uses device enrollment + JWT (deviceSession.ts), not Firebase phone OTP.
 * This config exists as scaffolding for future POS OTP capability.
 * isFirebaseReady() is not consumed by any production screen or service.
 *
 * Reads Firebase config from EXPO_PUBLIC_* env vars (set via app.config.js).
 * Gracefully degrades: if not configured, isFirebaseReady() returns false
 * and OTP flows fall back to dev bypass mode.
 *
 * INSTALL: `npx expo install firebase` (JS SDK — no native modules needed)
 */

import { initializeApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";

// Firebase config from env vars (same values as retailer-admin)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/**
 * Check if Firebase has minimum required config
 */
function hasFirebaseConfig(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
}

// Initialize Firebase if configured
if (hasFirebaseConfig()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    if (__DEV__) {
      console.log("[DRX-001] Firebase initialized for POS phone OTP");
    }
  } catch (err) {
    console.warn("[DRX-001] Firebase initialization failed:", err);
  }
} else if (__DEV__) {
  console.log(
    "[DRX-001] Firebase not configured — OTP will use dev bypass. " +
      "Set EXPO_PUBLIC_FIREBASE_* env vars to enable."
  );
}

/**
 * Returns true if Firebase Auth is ready for phone OTP
 */
export function isFirebaseReady(): boolean {
  return auth !== null;
}

export { app, auth };
