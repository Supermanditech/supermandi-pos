/**
 * DRX-001: Phone OTP Service for POS App
 *
 * Provides sendOtp() and verifyOtp() for the POS registration flow.
 * Uses Firebase Auth JS SDK for phone authentication.
 *
 * Two modes:
 * 1. Production: Firebase configured → real OTP via SMS
 *    Requires a RecaptchaVerifier (set via setRecaptchaVerifier before sendOtp)
 * 2. Dev bypass: Firebase not configured → returns mock token
 *    Only available when __DEV__ is true
 *
 * Usage in RO-004 POS Registration Screen:
 *   import { sendOtp, verifyOtp, isOtpReady } from '@services/phoneOtp';
 *   await sendOtp('+919876543210');
 *   const idToken = await verifyOtp('123456');
 *   // Use idToken as otpProof in POST /api/v1/retailer/register
 */

import {
  signInWithPhoneNumber,
  ConfirmationResult,
  ApplicationVerifier,
} from "firebase/auth";
import { auth, isFirebaseReady } from "../config/firebase";

// Confirmation result from sendOtp — needed to verify the code
let confirmationResult: ConfirmationResult | null = null;

// External reCAPTCHA verifier (set by the screen component)
let recaptchaVerifier: ApplicationVerifier | null = null;

/**
 * Set the reCAPTCHA verifier before calling sendOtp().
 *
 * In React Native, this must be a custom verifier wrapping a WebView.
 * RO-004 (POS Registration Screen) creates and manages the verifier.
 */
export function setRecaptchaVerifier(
  verifier: ApplicationVerifier | null
): void {
  recaptchaVerifier = verifier;
}

/**
 * Check if the OTP service is ready to send codes.
 *
 * Returns true if:
 * - Firebase is configured AND recaptcha verifier is set, OR
 * - In dev mode (bypass mode)
 */
export function isOtpReady(): boolean {
  if (__DEV__ && !isFirebaseReady()) return true; // Dev bypass
  return isFirebaseReady() && recaptchaVerifier !== null;
}

/**
 * Normalize phone number to E.164 format (+91 for Indian numbers).
 */
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("0")) return `+91${cleaned.substring(1)}`;
  if (cleaned.length === 10) return `+91${cleaned}`;
  return cleaned;
}

/**
 * Send OTP to the given phone number.
 *
 * @param phone - Phone number (10-digit, +91..., or E.164)
 * @returns true if OTP was sent successfully
 * @throws Error with user-friendly message on failure
 */
export async function sendOtp(phone: string): Promise<boolean> {
  const normalized = normalizePhone(phone);

  // Dev bypass: no Firebase → pretend OTP was sent
  if (__DEV__ && !isFirebaseReady()) {
    console.log(
      `[DRX-001] DEV BYPASS: Pretending OTP sent to ${normalized}. Use code "123456".`
    );
    confirmationResult = null; // Will be handled in verifyOtp
    return true;
  }

  if (!auth) {
    throw new Error(
      "Firebase not configured. Set EXPO_PUBLIC_FIREBASE_* env vars."
    );
  }

  if (!recaptchaVerifier) {
    throw new Error(
      "reCAPTCHA verifier not set. Call setRecaptchaVerifier() first."
    );
  }

  try {
    confirmationResult = await signInWithPhoneNumber(
      auth,
      normalized,
      recaptchaVerifier
    );
    return true;
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    const code = firebaseError.code || "";

    if (__DEV__) {
      console.error("[DRX-001] Firebase OTP error:", code, firebaseError.message);
    }

    // Map Firebase errors to user-friendly messages
    if (code === "auth/too-many-requests") {
      throw new Error("Too many attempts. Please wait a few minutes.");
    }
    if (code === "auth/invalid-phone-number") {
      throw new Error("Invalid phone number. Please check and try again.");
    }
    if (
      code === "auth/invalid-app-credential" ||
      code === "auth/captcha-check-failed"
    ) {
      throw new Error("Verification failed. Please try again.");
    }
    if (code === "auth/network-request-failed") {
      throw new Error("Network error. Please check your connection.");
    }

    throw new Error("Unable to send OTP. Please try again.");
  }
}

/**
 * Verify OTP code and return Firebase ID token.
 *
 * @param code - 6-digit OTP code
 * @returns Firebase ID token (use as `otpProof` in registration API)
 * @throws Error if verification fails
 */
export async function verifyOtp(code: string): Promise<string> {
  // Dev bypass: return mock token
  if (__DEV__ && !isFirebaseReady()) {
    if (code === "123456") {
      console.log("[DRX-001] DEV BYPASS: OTP verified with mock code");
      return "dev-bypass-mock-firebase-id-token";
    }
    throw new Error("Invalid OTP. In dev mode, use code: 123456");
  }

  if (!confirmationResult) {
    throw new Error("No OTP pending. Please request a new code.");
  }

  try {
    const userCredential = await confirmationResult.confirm(code);
    const idToken = await userCredential.user.getIdToken();
    confirmationResult = null;
    return idToken;
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    const errorCode = firebaseError.code || "";

    if (errorCode === "auth/invalid-verification-code") {
      throw new Error("Wrong code. Please check and try again.");
    }
    if (errorCode === "auth/code-expired") {
      throw new Error("Code expired. Please request a new one.");
    }

    throw new Error("Verification failed. Please try again.");
  }
}

/**
 * Reset OTP state (call when changing phone number or navigating away).
 */
export function resetOtp(): void {
  confirmationResult = null;
}
