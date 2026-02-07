/**
 * RO-003: Portal Registration UI
 *
 * Simplified single-step registration flow:
 * 1. Phone → Firebase OTP
 * 2. OTP verification
 * 3. Business details form
 * 4. Success (store code + POS CTA)
 *
 * Calls POST /api/v1/retailer/register with source: 'PORTAL'
 * Replaces old 4-step RetailerOnboardingPage application flow.
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { API_GATEWAY_BASE } from '../lib/api';
import {
  setupRecaptcha,
  sendOtp as firebaseSendOtp,
  verifyOtp as firebaseVerifyOtp,
  isFirebaseReady,
  cleanup,
} from '../lib/firebase';
import { BuildStamp } from '../components/BuildStamp';

// GSTIN validation: 15 characters, specific pattern
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

type Step = 'phone' | 'otp' | 'details' | 'success';

interface RegistrationResult {
  storeId: string;
  storeCode: string;
  ownerUserId: string;
  storeName: string;
  isExisting: boolean;
}

// UI-SPEC: Matches LoginPage design system — Stripe-level calm infrastructure
const styles = {
  pageContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#F7F9FC',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    background: 'white',
    borderBottom: '1px solid #e2e8f0',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
  },
  headerInner: {
    maxWidth: '1152px',
    width: '100%',
    margin: '0 auto',
    padding: '0 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  logoText: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#2563eb',
  },
  logoSeparator: {
    color: '#94a3b8',
  },
  logoSubtext: {
    color: '#475569',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  main: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
  },
  cardContainer: {
    width: '100%',
    maxWidth: '448px',
  },
  card: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    padding: '2rem',
  },
  cardTitle: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#0F172A',
    marginBottom: '0.5rem',
  },
  cardSubtitle: {
    color: '#64748b',
    fontSize: '0.875rem',
    marginBottom: '1.5rem',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#0F172A',
    marginBottom: '0.5rem',
  },
  input: {
    width: '100%',
    height: '42px',
    padding: '0 1rem',
    fontSize: '0.9375rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  inputDisabled: {
    background: '#f8fafc',
    cursor: 'not-allowed',
  },
  btnPrimary: {
    width: '100%',
    height: '46px',
    padding: '0 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: 'white',
    background: '#2563eb',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.15s',
    marginBottom: '1rem',
  },
  btnPrimaryDisabled: {
    background: '#93c5fd',
    cursor: 'not-allowed',
  },
  btnSecondary: {
    width: '100%',
    height: '46px',
    padding: '0 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: '#0F172A',
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
  },
  alertError: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    padding: '0.875rem 1rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  alertWarning: {
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: '#92400e',
    padding: '0.875rem 1rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  alertSuccess: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#166534',
    padding: '0.875rem 1rem',
    borderRadius: '6px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  footer: {
    background: 'white',
    borderTop: '1px solid #e2e8f0',
  },
  footerInner: {
    maxWidth: '1152px',
    margin: '0 auto',
    padding: '1rem 1.5rem',
    textAlign: 'center' as const,
    fontSize: '0.8125rem',
    color: '#64748b',
  },
  textLink: {
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 500,
    fontSize: '0.875rem',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    padding: 0,
  },
  textLinkDisabled: {
    color: '#9ca3af',
    cursor: 'not-allowed',
  },
  divider: {
    borderTop: '1px solid #e5e7eb',
    margin: '1.5rem 0',
    paddingTop: '1rem',
  },
  optionalBadge: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontWeight: 400,
    marginLeft: '0.25rem',
  },
  fieldError: {
    fontSize: '0.8125rem',
    color: '#dc2626',
    marginTop: '0.25rem',
  },
  successIcon: {
    width: '4rem',
    height: '4rem',
    background: '#dcfce7',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1rem',
    fontSize: '1.75rem',
  },
  storeCodeBox: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1rem',
    textAlign: 'center' as const,
    marginBottom: '1rem',
  },
  storeCodeLabel: {
    fontSize: '0.8125rem',
    color: '#64748b',
    marginBottom: '0.25rem',
  },
  storeCodeValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#0F172A',
    fontFamily: 'monospace',
    letterSpacing: '0.05rem',
  },
};

export default function RegisterPage() {
  const location = useLocation();

  // RO-003: Accept pre-filled phone from LoginPage "not_onboarded" state
  const prefillPhone = (location.state as { phone?: string })?.phone || '';

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState(prefillPhone);
  const [otp, setOtp] = useState('');
  const [idToken, setIdToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const recaptchaInitialized = useRef(false);

  // Business details form
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Success state
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Setup reCAPTCHA on phone step
  useEffect(() => {
    if (isFirebaseReady() && !recaptchaInitialized.current && step === 'phone') {
      try {
        setupRecaptcha('send-otp-button');
        recaptchaInitialized.current = true;
      } catch (err) {
        console.error('Failed to setup reCAPTCHA:', err);
      }
    }

    return () => {
      cleanup();
      recaptchaInitialized.current = false;
    };
  }, [step]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // OTP expiry countdown
  useEffect(() => {
    if (otpExpirySeconds > 0) {
      const timer = setTimeout(() => setOtpExpirySeconds(otpExpirySeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpExpirySeconds]);

  // Normalize phone to E.164
  const normalizePhone = (raw: string): string => {
    const cleaned = raw.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('0')) return `+91${cleaned.substring(1)}`;
    if (cleaned.length === 10) return `+91${cleaned}`;
    return cleaned;
  };

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanedPhone = phone.replace(/[\s-]/g, '');
    if (!/^(\+91)?[6-9]\d{9}$/.test(cleanedPhone) && !/^\+?[0-9]{10,13}$/.test(cleanedPhone)) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);

    try {
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required.');
      }

      await firebaseSendOtp(phone);
      setStep('otp');
      setResendCooldown(60);
      setOtpExpirySeconds(300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const token = await firebaseVerifyOtp(otp);
      setIdToken(token);
      setStep('details');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Submit registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation
    const errors: Record<string, string> = {};
    if (!businessName.trim()) errors.businessName = 'Business name is required';
    if (!ownerName.trim()) errors.ownerName = 'Owner name is required';
    if (gstin.trim()) {
      const normalized = gstin.toUpperCase().replace(/\s/g, '');
      if (normalized.length !== 15 || !GSTIN_REGEX.test(normalized)) {
        errors.gstin = 'Invalid GSTIN format (15 characters)';
      }
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Invalid email address';
    }
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      errors.pincode = 'Pincode must be 6 digits';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setIsLoading(true);

    try {
      const normalizedPhone = normalizePhone(phone);

      const response = await fetch(`${API_GATEWAY_BASE}/api/v1/retailer/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: normalizedPhone,
          otpProof: idToken,
          businessName: businessName.trim(),
          ownerName: ownerName.trim(),
          gstin: gstin.trim() ? gstin.toUpperCase().replace(/\s/g, '') : undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          pincode: pincode.trim() || undefined,
          source: 'PORTAL',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Map backend error codes to user messages
        if (data.error === 'PHONE_EXISTS') {
          setError('This phone number is already registered. Please login instead.');
        } else if (data.error === 'GSTIN_EXISTS') {
          setError('A store with this GSTIN already exists. Please login instead.');
        } else if (data.error === 'VALIDATION_ERROR' && data.fields) {
          const newFieldErrors: Record<string, string> = {};
          for (const [field, msg] of Object.entries(data.fields)) {
            newFieldErrors[field] = msg as string;
          }
          setFieldErrors(newFieldErrors);
          return;
        } else if (data.error === 'RATE_LIMITED') {
          setError('Too many attempts. Please wait a minute and try again.');
        } else {
          setError(data.message || 'Registration failed. Please try again.');
        }
        return;
      }

      setResult(data as RegistrationResult);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setError('');
    setIsLoading(true);

    try {
      cleanup();
      recaptchaInitialized.current = false;
      setupRecaptcha('resend-otp-button');
      recaptchaInitialized.current = true;

      await firebaseSendOtp(phone);
      setResendCooldown(60);
      setOtpExpirySeconds(300);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePhone = () => {
    setStep('phone');
    setOtp('');
    setIdToken('');
    setError('');
    recaptchaInitialized.current = false;
  };

  const handleCopyStoreCode = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.storeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  return (
    <div style={styles.pageContainer}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoText}>SuperManditech</span>
            <span style={styles.logoSeparator}>|</span>
            <span style={styles.logoSubtext}>Retailer Portal</span>
          </div>
          <Link to="/retailer/login" style={styles.textLink}>
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        <div style={styles.cardContainer}>
          <div style={styles.card}>
            {/* Step 1: Phone */}
            {step === 'phone' && (
              <>
                <h2 style={styles.cardTitle}>Register your store</h2>
                <p style={styles.cardSubtitle}>
                  Enter your phone number to get started. Your store will be created instantly.
                </p>

                {!isFirebaseReady() && (
                  <div style={styles.alertWarning}>
                    <strong>Phone Verification Unavailable</strong>
                    <p style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                      Registration requires phone verification which is currently unavailable.
                    </p>
                  </div>
                )}

                {error && <div style={styles.alertError}>{error}</div>}

                <form onSubmit={handleSendOtp}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Phone Number</label>
                    <input
                      type="tel"
                      style={styles.input}
                      placeholder="+91 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>

                  <button
                    id="send-otp-button"
                    type="submit"
                    style={{
                      ...styles.btnPrimary,
                      ...(isLoading || !isFirebaseReady() ? styles.btnPrimaryDisabled : {}),
                    }}
                    disabled={isLoading || !isFirebaseReady()}
                  >
                    {isLoading ? 'Sending OTP...' : 'Send OTP'}
                  </button>
                </form>

                <div style={styles.divider}>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0, textAlign: 'center' }}>
                    Already have an account?{' '}
                    <Link to="/retailer/login" style={styles.textLink}>
                      Sign In
                    </Link>
                  </p>
                </div>
              </>
            )}

            {/* Step 2: OTP Verification */}
            {step === 'otp' && (
              <>
                <h2 style={styles.cardTitle}>Verify your phone</h2>
                <p style={styles.cardSubtitle}>Enter the 6-digit code sent to {phone}</p>

                {error && <div style={styles.alertError}>{error}</div>}

                <form onSubmit={handleVerifyOtp}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Verification Code</label>
                    <input
                      type="text"
                      style={{
                        ...styles.input,
                        textAlign: 'center',
                        fontSize: '1.25rem',
                        letterSpacing: '0.5rem',
                        fontFamily: 'monospace',
                      }}
                      placeholder="------"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>

                  {otpExpirySeconds > 0 && (
                    <p style={{
                      fontSize: '0.8125rem',
                      color: otpExpirySeconds <= 60 ? '#dc2626' : '#64748b',
                      textAlign: 'center',
                      marginBottom: '1rem',
                    }}>
                      Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
                    </p>
                  )}
                  {otpExpirySeconds === 0 && (
                    <p style={{
                      fontSize: '0.8125rem',
                      color: '#dc2626',
                      textAlign: 'center',
                      marginBottom: '1rem',
                    }}>
                      Code expired. Please resend OTP.
                    </p>
                  )}

                  <button
                    type="submit"
                    style={{
                      ...styles.btnPrimary,
                      ...(isLoading || otp.length !== 6 ? styles.btnPrimaryDisabled : {}),
                    }}
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? 'Verifying...' : 'Verify'}
                  </button>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={handleChangePhone}
                      style={styles.textLink}
                      disabled={isLoading}
                    >
                      Change Phone
                    </button>

                    <button
                      id="resend-otp-button"
                      type="button"
                      onClick={handleResendOtp}
                      style={{
                        ...styles.textLink,
                        ...(resendCooldown > 0 ? styles.textLinkDisabled : {}),
                      }}
                      disabled={isLoading || resendCooldown > 0}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Step 3: Business Details */}
            {step === 'details' && (
              <>
                <h2 style={styles.cardTitle}>Store details</h2>
                <p style={styles.cardSubtitle}>
                  Tell us about your business. Your store will be created immediately.
                </p>

                {error && <div style={styles.alertError}>{error}</div>}

                <form onSubmit={handleRegister}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Business Name *</label>
                    <input
                      type="text"
                      style={styles.input}
                      placeholder="e.g. Sharma General Store"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      disabled={isLoading}
                      autoFocus
                    />
                    {fieldErrors.businessName && (
                      <div style={styles.fieldError}>{fieldErrors.businessName}</div>
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Owner Name *</label>
                    <input
                      type="text"
                      style={styles.input}
                      placeholder="e.g. Rajesh Sharma"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      disabled={isLoading}
                    />
                    {fieldErrors.ownerName && (
                      <div style={styles.fieldError}>{fieldErrors.ownerName}</div>
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      GSTIN <span style={styles.optionalBadge}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      style={styles.input}
                      placeholder="22AAAAA0000A1Z5"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value.toUpperCase())}
                      maxLength={15}
                      disabled={isLoading}
                    />
                    {fieldErrors.gstin && (
                      <div style={styles.fieldError}>{fieldErrors.gstin}</div>
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Email <span style={styles.optionalBadge}>(optional)</span>
                    </label>
                    <input
                      type="email"
                      style={styles.input}
                      placeholder="store@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                    />
                    {fieldErrors.email && (
                      <div style={styles.fieldError}>{fieldErrors.email}</div>
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Address <span style={styles.optionalBadge}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      style={styles.input}
                      placeholder="Shop No. 1, Main Market"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      disabled={isLoading}
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Pincode <span style={styles.optionalBadge}>(optional)</span>
                    </label>
                    <input
                      type="text"
                      style={styles.input}
                      placeholder="110001"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                      disabled={isLoading}
                    />
                    {fieldErrors.pincode && (
                      <div style={styles.fieldError}>{fieldErrors.pincode}</div>
                    )}
                  </div>

                  <button
                    type="submit"
                    style={{
                      ...styles.btnPrimary,
                      ...(isLoading ? styles.btnPrimaryDisabled : {}),
                      marginTop: '0.5rem',
                    }}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating your store...' : 'Create Store'}
                  </button>
                </form>
              </>
            )}

            {/* Step 4: Success */}
            {step === 'success' && result && (
              <div style={{ textAlign: 'center' }}>
                <div style={styles.successIcon}>
                  <span role="img" aria-label="checkmark">&#10003;</span>
                </div>

                <h2 style={{ ...styles.cardTitle, textAlign: 'center' }}>
                  {result.isExisting ? 'Store already registered' : 'Store created!'}
                </h2>
                <p style={{ ...styles.cardSubtitle, textAlign: 'center' }}>
                  {result.isExisting
                    ? `Your store "${result.storeName}" was already registered. You can login now.`
                    : `"${result.storeName}" is ready. Save your store code below.`
                  }
                </p>

                {/* Store Code */}
                <div style={styles.storeCodeBox}>
                  <div style={styles.storeCodeLabel}>Your Store Code</div>
                  <div style={styles.storeCodeValue}>{result.storeCode}</div>
                  <button
                    type="button"
                    onClick={handleCopyStoreCode}
                    style={{
                      ...styles.textLink,
                      marginTop: '0.5rem',
                      display: 'inline-block',
                    }}
                  >
                    {copied ? 'Copied!' : 'Copy to clipboard'}
                  </button>
                </div>

                {/* Next Steps */}
                <div style={styles.alertSuccess}>
                  <strong>Next steps:</strong>
                  <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', textAlign: 'left' }}>
                    <li>Login to your dashboard to manage products & inventory</li>
                    <li>Download the POS app on your phone to start billing</li>
                  </ul>
                </div>

                {/* CTA Buttons */}
                <Link
                  to="/retailer/login"
                  style={{
                    ...styles.btnPrimary,
                    display: 'block',
                    textDecoration: 'none',
                    textAlign: 'center',
                    lineHeight: '46px',
                  }}
                >
                  Login to Dashboard
                </Link>

                <a
                  href="https://supermandi.tech/pos"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    ...styles.btnSecondary,
                    display: 'block',
                    textDecoration: 'none',
                    textAlign: 'center',
                    lineHeight: '46px',
                  }}
                >
                  Download POS App
                </a>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          &copy; 2026 SuperManditech. All rights reserved.
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}
