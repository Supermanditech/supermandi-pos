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

/**
 * Setup invisible reCAPTCHA verifier
 * Must be called before sendOtp
 */
export function setupRecaptcha(buttonId: string): void {
  if (!auth) {
    throw new Error('Firebase not configured');
  }

  // Clean up existing verifier
  if (recaptchaVerifier) {
    recaptchaVerifier.clear();
    recaptchaVerifier = null;
  }

  recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA verified
    },
    'expired-callback': () => {
      recaptchaVerifier = null;
    },
  });
}

/**
 * Send OTP to phone number
 * Returns true if OTP was sent successfully
 */
export async function sendOtp(phoneNumber: string): Promise<boolean> {
  if (!auth) {
    throw new Error('Firebase not configured. Check VITE_FIREBASE_* environment variables.');
  }

  if (!recaptchaVerifier) {
    throw new Error('reCAPTCHA not initialized. Call setupRecaptcha first.');
  }

  // Normalize phone number (ensure +91 prefix for Indian numbers)
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  try {
    confirmationResult = await signInWithPhoneNumber(auth, normalizedPhone, recaptchaVerifier);
    return true;
  } catch (error: unknown) {
    // Reset recaptcha on error
    if (recaptchaVerifier) {
      recaptchaVerifier.clear();
      recaptchaVerifier = null;
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to send OTP: ${errorMessage}`);
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Invalid OTP: ${errorMessage}`);
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
