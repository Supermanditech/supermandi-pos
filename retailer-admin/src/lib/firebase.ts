import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  Auth,
} from 'firebase/auth';

// Firebase configuration from environment variables
// These must be set in .env or .env.production
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if Firebase is configured
const isFirebaseConfigured = (): boolean => {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

// Initialize Firebase only if configured
if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  } catch {
    // Firebase initialization failed - isFirebaseReady() will return false
  }
}

// Store recaptcha verifier and confirmation result
let recaptchaVerifier: RecaptchaVerifier | null = null;
let confirmationResult: ConfirmationResult | null = null;
// POST-BATCH-018-FIX-004: Track last button ID for auto-re-init
let lastRecaptchaButtonId: string | null = null;

/**
 * Setup invisible reCAPTCHA verifier
 * Must be called before sendOtp
 */
export function setupRecaptcha(buttonId: string): void {
  if (!auth) {
    throw new Error('Firebase not configured');
  }

  // STG-722: Defensive check — button must exist in DOM before RecaptchaVerifier init
  if (!document.getElementById(buttonId)) {
    throw new Error(`reCAPTCHA target element '${buttonId}' not found in DOM`);
  }

  // Clean up existing verifier
  if (recaptchaVerifier) {
    try { recaptchaVerifier.clear(); } catch { /* ignore cleanup errors */ }
    recaptchaVerifier = null;
  }

  lastRecaptchaButtonId = buttonId;

  recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA verified
    },
    'expired-callback': () => {
      // POST-BATCH-018-FIX-004: Auto-re-init on expiry instead of going null
      try { recaptchaVerifier?.clear(); } catch { /* ignore */ }
      recaptchaVerifier = null;
      if (auth && lastRecaptchaButtonId && document.getElementById(lastRecaptchaButtonId)) {
        try {
          recaptchaVerifier = new RecaptchaVerifier(auth, lastRecaptchaButtonId, {
            size: 'invisible',
          });
        } catch { /* will be re-created in sendOtp if needed */ }
      }
    },
  });
}

/**
 * POST-BATCH-018-FIX-004: Ensure reCAPTCHA is ready, re-creating if needed
 */
function ensureRecaptcha(buttonId: string): RecaptchaVerifier {
  if (!auth) throw new Error('Firebase not configured');

  if (recaptchaVerifier) return recaptchaVerifier;

  // Auto-re-init: verifier was cleared (error/expiry) — recreate it
  const targetId = buttonId || lastRecaptchaButtonId;
  if (!targetId || !document.getElementById(targetId)) {
    throw new Error('reCAPTCHA button not found. Please reload the page.');
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, targetId, { size: 'invisible' });
  return recaptchaVerifier;
}

/**
 * Send OTP to phone number
 * Returns true if OTP was sent successfully
 */
export async function sendOtp(phoneNumber: string, buttonId?: string): Promise<boolean> {
  if (!auth) {
    throw new Error('Firebase not configured. Check VITE_FIREBASE_* environment variables.');
  }

  // POST-BATCH-018-FIX-004: Auto-ensure reCAPTCHA (handles expiry/cleared states)
  const verifier = ensureRecaptcha(buttonId || lastRecaptchaButtonId || 'send-otp-button');

  // Normalize phone number (ensure +91 prefix for Indian numbers)
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  try {
    confirmationResult = await signInWithPhoneNumber(auth, normalizedPhone, verifier);
    return true;
  } catch (error: unknown) {
    // Reset recaptcha on error (will be auto-recreated on next send attempt)
    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch { /* ignore */ }
      recaptchaVerifier = null;
    }

    // FIREBASE-OTP-001: Map Firebase error codes to user-friendly messages
    const firebaseError = error as { code?: string; message?: string };
    const errorCode = firebaseError.code || '';

    // Log technical error for debugging (only in dev, stripped in prod build)
    console.error('[Firebase OTP Error]', { code: errorCode, message: firebaseError.message });

    // User-friendly error messages
    let userMessage = 'Unable to send OTP. Please try again.';

    if (errorCode === 'auth/invalid-app-credential' || errorCode === 'auth/captcha-check-failed') {
      userMessage = 'Unable to send OTP. Please reload and try again, or contact support.';
    } else if (errorCode === 'auth/too-many-requests') {
      userMessage = 'Too many attempts. Please wait a few minutes and try again.';
    } else if (errorCode === 'auth/invalid-phone-number') {
      userMessage = 'Invalid phone number. Please check and try again.';
    } else if (errorCode === 'auth/quota-exceeded') {
      userMessage = 'Service temporarily unavailable. Please try again later.';
    } else if (errorCode === 'auth/network-request-failed') {
      userMessage = 'Network error. Please check your connection and try again.';
    } else if (errorCode === 'auth/internal-error') {
      userMessage = 'Authentication service error. Please reload and try again.';
    }

    throw new Error(userMessage);
  }
}

/**
 * Verify OTP and get Firebase ID token
 * Returns the ID token that should be sent to backend
 */
export async function verifyOtp(otp: string): Promise<string> {
  if (!confirmationResult) {
    throw new Error('No OTP pending. Send OTP first.');
  }

  try {
    const userCredential = await confirmationResult.confirm(otp);
    const idToken = await userCredential.user.getIdToken();
    confirmationResult = null;
    return idToken;
  } catch (error: unknown) {
    // ISSUE-005 FIX: Differentiate rate-limit errors from invalid OTP
    const firebaseError = error as { code?: string; message?: string };
    const errorCode = firebaseError.code || '';

    if (errorCode === 'auth/too-many-requests') {
      throw new Error('Too many attempts. Please wait 30 minutes and try again.');
    } else if (errorCode === 'auth/quota-exceeded') {
      throw new Error('Verification service temporarily unavailable. Please try again later.');
    } else if (errorCode === 'auth/code-expired') {
      throw new Error('OTP has expired. Please request a new one.');
    } else if (errorCode === 'auth/invalid-verification-code') {
      throw new Error('Invalid OTP. Please check the code and try again.');
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Verification failed: ${errorMessage}`);
  }
}

/**
 * Normalize phone number to E.164 format
 * Assumes Indian numbers if no country code provided
 */
function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // If starts with +, assume it's already in E.164 format
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // Remove leading 0 if present (common in Indian numbers)
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // If 10 digits, assume Indian number and add +91
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }

  // If already has country code (11+ digits), add +
  if (cleaned.length >= 11) {
    return `+${cleaned}`;
  }

  // Return as-is for invalid numbers (will fail Firebase validation)
  return cleaned;
}

/**
 * Check if Firebase is ready for authentication
 */
export function isFirebaseReady(): boolean {
  return auth !== null;
}

/**
 * Clean up resources
 */
export function cleanup(): void {
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }
  // NOTE: Don't clear confirmationResult here - it's needed for OTP verification
  // confirmationResult is cleared after successful verification in verifyOtp()
}

export { auth };
