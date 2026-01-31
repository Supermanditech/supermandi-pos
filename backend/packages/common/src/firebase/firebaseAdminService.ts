// Firebase Admin Service - Retailer Admin Portal
// Handles Firebase ID token verification for phone OTP authentication

import * as admin from 'firebase-admin';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface FirebaseConfig {
  serviceAccountPath?: string;
  projectId?: string;
}

let firebaseApp: admin.app.App | null = null;

/**
 * Initialize Firebase Admin SDK
 */
export function initializeFirebase(config: FirebaseConfig): void {
  if (firebaseApp) {
    console.log('[Firebase] Already initialized, skipping...');
    return;
  }

  const initOptions: admin.AppOptions = {};

  if (config.serviceAccountPath) {
    // Use service account file
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(config.serviceAccountPath);
    initOptions.credential = admin.credential.cert(serviceAccount);
    initOptions.projectId = serviceAccount.project_id;
  } else if (config.projectId) {
    // Use Application Default Credentials (for GCE/Cloud Run)
    initOptions.credential = admin.credential.applicationDefault();
    initOptions.projectId = config.projectId;
  } else {
    throw new Error('Firebase config requires either serviceAccountPath or projectId');
  }

  firebaseApp = admin.initializeApp(initOptions);
  console.log(`[Firebase] Initialized with project: ${initOptions.projectId}`);
}

/**
 * Get Firebase app (throws if not initialized)
 */
function getApp(): admin.app.App {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return firebaseApp;
}

// =============================================================================
// TYPES
// =============================================================================

export interface FirebaseTokenPayload {
  uid: string;
  phone_number?: string;
  email?: string;
  name?: string;
  sign_in_provider: string;
  auth_time: number;
}

export interface VerifyTokenResult {
  success: true;
  payload: FirebaseTokenPayload;
}

export interface VerifyTokenError {
  success: false;
  error: string;
  code: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'TOKEN_REVOKED' | 'UNKNOWN';
}

export type VerifyTokenResponse = VerifyTokenResult | VerifyTokenError;

// =============================================================================
// TOKEN VERIFICATION
// =============================================================================

// GO-LIVE-HOME-001: Firebase verification timeout (10 seconds) to fail fast instead of hanging
const FIREBASE_VERIFY_TIMEOUT_MS = 10000;

/**
 * Verify a Firebase ID token
 * Returns the decoded token payload if valid
 * GO-LIVE-HOME-001: Added timeout to prevent hanging when credentials are misconfigured
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifyTokenResponse> {
  // Debug logging
  const tokenPreview = idToken
    ? `${idToken.substring(0, 20)}...${idToken.substring(idToken.length - 10)} (len=${idToken.length})`
    : 'EMPTY/NULL';
  console.log(`[Firebase] Verifying token: ${tokenPreview}`);

  const app = getApp();
  const auth = app.auth();

  try {
    // GO-LIVE-HOME-001: Add timeout to prevent hanging when Firebase creds are misconfigured
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Firebase verification timed out after 10 seconds - check GOOGLE_APPLICATION_CREDENTIALS'));
      }, FIREBASE_VERIFY_TIMEOUT_MS);
    });

    const decodedToken = await Promise.race([
      auth.verifyIdToken(idToken, false), // checkRevoked = false (ADC on GCE lacks identitytoolkit scope)
      timeoutPromise,
    ]);
    console.log(`[Firebase] Token verified! UID: ${decodedToken.uid}, phone: ${decodedToken.phone_number}`);

    // Extract sign-in provider
    const signInProvider = decodedToken.firebase?.sign_in_provider || 'unknown';

    return {
      success: true,
      payload: {
        uid: decodedToken.uid,
        phone_number: decodedToken.phone_number,
        email: decodedToken.email,
        name: decodedToken.name,
        sign_in_provider: signInProvider,
        auth_time: decodedToken.auth_time,
      },
    };
  } catch (error: unknown) {
    const firebaseError = error as { code?: string; message?: string };
    console.error(`[Firebase] Token verification error - code: ${firebaseError.code}, message: ${firebaseError.message}`);

    // GO-LIVE-HOME-001: Handle timeout errors specifically
    if (firebaseError.message?.includes('timed out')) {
      return {
        success: false,
        error: 'Firebase verification timed out - check credentials configuration',
        code: 'UNKNOWN',
      };
    }

    if (firebaseError.code === 'auth/id-token-expired') {
      return {
        success: false,
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED',
      };
    }

    if (firebaseError.code === 'auth/id-token-revoked') {
      return {
        success: false,
        error: 'Token has been revoked',
        code: 'TOKEN_REVOKED',
      };
    }

    if (
      firebaseError.code === 'auth/argument-error' ||
      firebaseError.code === 'auth/invalid-id-token'
    ) {
      return {
        success: false,
        error: `Invalid token format (${firebaseError.code})`,
        code: 'TOKEN_INVALID',
      };
    }

    return {
      success: false,
      error: firebaseError.message || 'Token verification failed',
      code: 'UNKNOWN',
    };
  }
}

/**
 * Get user by phone number
 */
export async function getUserByPhone(
  phoneNumber: string
): Promise<admin.auth.UserRecord | null> {
  const app = getApp();
  const auth = app.auth();

  try {
    const user = await auth.getUserByPhoneNumber(phoneNumber);
    return user;
  } catch (error: unknown) {
    const firebaseError = error as { code?: string };
    if (firebaseError.code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

/**
 * Get user by UID
 */
export async function getUserByUid(uid: string): Promise<admin.auth.UserRecord | null> {
  const app = getApp();
  const auth = app.auth();

  try {
    const user = await auth.getUser(uid);
    return user;
  } catch (error: unknown) {
    const firebaseError = error as { code?: string };
    if (firebaseError.code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Normalize phone number to E.164 format
 * Assumes Indian numbers if no country code provided
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If starts with 91 and has 12 digits, add +
  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }

  // If 10 digits, assume Indian number
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // If already has country code (starts with 91 or other)
  if (digits.length > 10) {
    return `+${digits}`;
  }

  // Return as-is with + prefix
  return `+${digits}`;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  // Indian phone number: +91 followed by 10 digits
  return /^\+91[6-9]\d{9}$/.test(normalized);
}

/**
 * Mask phone number for display
 * "9876543210" -> "98765****10"
 */
export function maskPhoneNumber(phone: string): string {
  // Get digits only
  const digits = phone.replace(/\D/g, '');

  // Take last 10 digits (phone without country code)
  const phoneDigits = digits.slice(-10);

  if (phoneDigits.length <= 7) {
    return phoneDigits;
  }

  const first = phoneDigits.slice(0, 5);
  const last = phoneDigits.slice(-2);
  const masked = '*'.repeat(phoneDigits.length - 7);

  return `${first}${masked}${last}`;
}
