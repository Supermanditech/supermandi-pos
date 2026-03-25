/**
 * GCP-STG-0454: Supplier Portal Missing Firebase Rate-Limit Auto-Switch
 *
 * Verifies:
 * 1. sendOtp throws rate-limit message suggesting password fallback
 * 2. verifyOtp throws differentiated error for rate-limit vs invalid OTP
 * 3. Login page auto-switches to password mode on rate-limit error
 */

import * as fs from 'fs';
import * as path from 'path';

describe('GCP-STG-0454: Firebase rate-limit auto-switch', () => {
  const firebasePath = path.resolve(__dirname, '../src/lib/firebase.ts');
  const loginPagePath = path.resolve(__dirname, '../src/app/(auth)/login/page.tsx');
  let firebaseSrc: string;
  let loginSrc: string;

  beforeAll(() => {
    firebaseSrc = fs.readFileSync(firebasePath, 'utf-8');
    loginSrc = fs.readFileSync(loginPagePath, 'utf-8');
  });

  // --- firebase.ts: sendOtp rate-limit message ---

  it('sendOtp handles auth/too-many-requests with password fallback suggestion', () => {
    // The error message must suggest password as an alternative (parity with retailer-admin GCP-STG-0147)
    expect(firebaseSrc).toContain("'auth/too-many-requests'");
    expect(firebaseSrc).toContain('Too many OTP requests. Try logging in with your password instead, or wait a few minutes.');
  });

  it('sendOtp handles auth/invalid-phone-number', () => {
    expect(firebaseSrc).toContain("'auth/invalid-phone-number'");
    expect(firebaseSrc).toContain('Invalid phone number. Please check and try again.');
  });

  it('sendOtp handles auth/quota-exceeded', () => {
    expect(firebaseSrc).toContain("'auth/quota-exceeded'");
    expect(firebaseSrc).toContain('Service temporarily unavailable. Please try again later.');
  });

  it('sendOtp handles auth/network-request-failed', () => {
    expect(firebaseSrc).toContain("'auth/network-request-failed'");
    expect(firebaseSrc).toContain('Network error. Please check your connection and try again.');
  });

  it('sendOtp handles auth/internal-error', () => {
    expect(firebaseSrc).toContain("'auth/internal-error'");
    expect(firebaseSrc).toContain('Authentication service error. Please reload and try again.');
  });

  // --- firebase.ts: verifyOtp rate-limit handling ---

  it('verifyOtp differentiates rate-limit from invalid OTP', () => {
    // Must have separate handling for auth/too-many-requests in verifyOtp
    const verifyOtpSection = firebaseSrc.split('export async function verifyOtp')[1];
    expect(verifyOtpSection).toBeDefined();
    expect(verifyOtpSection).toContain("errorCode === 'auth/too-many-requests'");
    expect(verifyOtpSection).toContain('Too many attempts. Please wait 30 minutes and try again.');
  });

  it('verifyOtp handles auth/code-expired', () => {
    const verifyOtpSection = firebaseSrc.split('export async function verifyOtp')[1];
    expect(verifyOtpSection).toContain("'auth/code-expired'");
    expect(verifyOtpSection).toContain('OTP has expired. Please request a new one.');
  });

  it('verifyOtp handles auth/invalid-verification-code', () => {
    const verifyOtpSection = firebaseSrc.split('export async function verifyOtp')[1];
    expect(verifyOtpSection).toContain("'auth/invalid-verification-code'");
    expect(verifyOtpSection).toContain('Invalid OTP. Please check the code and try again.');
  });

  it('verifyOtp handles auth/quota-exceeded', () => {
    const verifyOtpSection = firebaseSrc.split('export async function verifyOtp')[1];
    expect(verifyOtpSection).toContain("'auth/quota-exceeded'");
    expect(verifyOtpSection).toContain('Verification service temporarily unavailable. Please try again later.');
  });

  // --- login/page.tsx: auto-switch to password mode ---

  it('login page auto-switches to password mode on rate-limit in handleSendOtp', () => {
    // Must detect the rate-limit message and call setAuthMode('password')
    expect(loginSrc).toContain("msg.includes('Too many OTP requests')");
    expect(loginSrc).toContain("setAuthMode('password')");
  });

  it('login page auto-switches to password mode on rate-limit in handleResendOtp', () => {
    // Resend path must also auto-switch + reset step to phone
    const resendSection = loginSrc.split('handleResendOtp')[1];
    expect(resendSection).toBeDefined();
    expect(resendSection).toContain("msg.includes('Too many OTP requests')");
    expect(resendSection).toContain("setAuthMode('password')");
    expect(resendSection).toContain("setStep('phone')");
  });

  it('login page has AuthMode type with otp and password', () => {
    expect(loginSrc).toContain("type AuthMode = 'otp' | 'password'");
  });

  // --- Parity check: supplier matches retailer error codes ---

  it('supplier firebase.ts has all error codes from retailer-admin firebase.ts', () => {
    const requiredCodes = [
      'auth/invalid-app-credential',
      'auth/captcha-check-failed',
      'auth/too-many-requests',
      'auth/invalid-phone-number',
      'auth/quota-exceeded',
      'auth/network-request-failed',
      'auth/internal-error',
    ];
    for (const code of requiredCodes) {
      expect(firebaseSrc).toContain(code);
    }
  });
});
