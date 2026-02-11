/**
 * STAGING-FIX-004: Retailer Registration — 5-step KYC flow matching Supplier Portal
 *
 * Flow:
 * 1. Phone → Firebase OTP send
 * 2. OTP verification → get idToken
 * 3. Business Details → create application + verify OTP on backend
 * 4. KYC Documents → upload 3 required docs + submit
 * 5. Success → "Pending Verification"
 *
 * Backend: POST /api/v1/retailer-admin/registration/* (REG-AUTH-201)
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  createRetailerApplication,
  verifyRetailerOtp,
  uploadDocument,
  submitRetailerKyc,
} from '../lib/api';
import {
  setupRecaptcha,
  sendOtp as firebaseSendOtp,
  verifyOtp as firebaseVerifyOtp,
  isFirebaseReady,
  cleanup,
} from '../lib/firebase';
import { BuildStamp } from '../components/BuildStamp';

// GSTIN: 15 chars, position 14 can be any alphanumeric (GL-CRIT-0031)
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$/;

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

const BUSINESS_TYPES = [
  { value: 'kirana', label: 'Kirana Store' },
  { value: 'supermarket', label: 'Supermarket' },
  { value: 'hypermarket', label: 'Hypermarket' },
  { value: 'other', label: 'Other' },
];

const DOCUMENT_TYPES = {
  pan: { label: 'PAN Card', accept: 'image/*,application/pdf', required: true },
  gstin_certificate: { label: 'GSTIN Registration Certificate', accept: 'image/*,application/pdf', required: true },
  address_proof: { label: 'Address Proof (Electricity Bill / Rent Agreement)', accept: 'image/*,application/pdf', required: true },
};

type Step = 'phone' | 'otp' | 'details' | 'documents' | 'success';

interface DocumentUpload {
  file: File | null;
  preview: string | null;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  error?: string;
}

// Progress step mapping: phone+otp = step 1, details = step 2, documents = step 3
function getProgressStep(step: Step): number {
  if (step === 'phone' || step === 'otp') return 0;
  if (step === 'details') return 1;
  if (step === 'documents') return 2;
  return 3; // success
}

const PROGRESS_LABELS = ['Verify Phone', 'Business Details', 'KYC Documents'];

// Styles matching supplier portal's clean design
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
    maxWidth: '720px',
    width: '100%',
    margin: '0 auto',
    padding: '0 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  logoText: { fontSize: '1.5rem', fontWeight: 600, color: '#2563eb' },
  logoSeparator: { color: '#94a3b8' },
  logoSubtext: { color: '#475569', fontSize: '0.875rem', fontWeight: 500 },
  main: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    padding: '2rem 1rem',
  },
  container: { width: '100%', maxWidth: '640px' },
  card: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    padding: '2rem',
    marginBottom: '1.5rem',
  },
  cardTitle: { fontSize: '1.5rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' },
  cardSubtitle: { color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: '1rem', marginTop: '1.5rem' },
  formGroup: { marginBottom: '1rem' },
  formRow: { display: 'flex', gap: '1rem', marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#0F172A', marginBottom: '0.5rem' },
  input: {
    width: '100%', height: '42px', padding: '0 1rem', fontSize: '0.9375rem',
    border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none',
    boxSizing: 'border-box' as const, transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  select: {
    width: '100%', height: '42px', padding: '0 0.75rem', fontSize: '0.9375rem',
    border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none',
    boxSizing: 'border-box' as const, background: 'white', cursor: 'pointer',
  },
  btnPrimary: {
    width: '100%', height: '46px', padding: '0 1.5rem', fontSize: '0.9375rem',
    fontWeight: 500, color: 'white', background: '#2563eb', border: 'none',
    borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s',
  },
  btnPrimaryDisabled: { background: '#93c5fd', cursor: 'not-allowed' },
  btnSecondary: {
    width: '100%', height: '46px', padding: '0 1.5rem', fontSize: '0.9375rem',
    fontWeight: 500, color: '#0F172A', background: 'white', border: '1px solid #e2e8f0',
    borderRadius: '6px', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s',
  },
  alertError: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
    padding: '0.875rem 1rem', borderRadius: '6px', fontSize: '0.875rem', marginBottom: '1rem',
  },
  alertWarning: {
    background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
    padding: '0.875rem 1rem', borderRadius: '6px', fontSize: '0.875rem', marginBottom: '1rem',
  },
  alertSuccess: {
    background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534',
    padding: '0.875rem 1rem', borderRadius: '6px', fontSize: '0.875rem', marginBottom: '1rem',
  },
  textLink: {
    color: '#2563eb', textDecoration: 'none', fontWeight: 500, fontSize: '0.875rem',
    cursor: 'pointer', background: 'none', border: 'none', padding: 0,
  },
  textLinkDisabled: { color: '#9ca3af', cursor: 'not-allowed' },
  optionalBadge: { fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400, marginLeft: '0.25rem' },
  fieldError: { fontSize: '0.8125rem', color: '#dc2626', marginTop: '0.25rem' },
  footer: { background: 'white', borderTop: '1px solid #e2e8f0' },
  footerInner: {
    maxWidth: '720px', margin: '0 auto', padding: '1rem 1.5rem',
    textAlign: 'center' as const, fontSize: '0.8125rem', color: '#64748b',
  },
  // Document upload styles
  uploadBox: {
    border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '1.5rem',
    textAlign: 'center' as const, cursor: 'pointer', transition: 'border-color 0.15s',
    background: '#fafbfc',
  },
  uploadBoxUploaded: {
    border: '2px solid #22c55e', background: '#f0fdf4',
  },
  uploadBoxError: {
    border: '2px solid #ef4444', background: '#fef2f2',
  },
  checkboxLabel: {
    display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
    fontSize: '0.875rem', color: '#374151', cursor: 'pointer',
  },
};

export default function RegisterPage() {
  // Step state
  const [step, setStep] = useState<Step>('phone');

  // Phone + OTP
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [idToken, setIdToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const recaptchaInitialized = useRef(false);

  // Business Details
  const [applicationId, setApplicationId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [businessTypeOther, setBusinessTypeOther] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [pincode, setPincode] = useState('');
  const [agreement, setAgreement] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Documents
  const [documents, setDocuments] = useState<Record<string, DocumentUpload>>({
    pan: { file: null, preview: null, status: 'pending' },
    gstin_certificate: { file: null, preview: null, status: 'pending' },
    address_proof: { file: null, preview: null, status: 'pending' },
  });

  // Setup reCAPTCHA
  useEffect(() => {
    if (isFirebaseReady() && !recaptchaInitialized.current && step === 'phone') {
      try {
        setupRecaptcha('send-otp-button');
        recaptchaInitialized.current = true;
      } catch (err) {
        console.error('Failed to setup reCAPTCHA:', err);
      }
    }
    return () => { cleanup(); recaptchaInitialized.current = false; };
  }, [step]);

  // Timers
  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  useEffect(() => {
    if (otpExpirySeconds > 0) {
      const t = setTimeout(() => setOtpExpirySeconds(otpExpirySeconds - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [otpExpirySeconds]);

  const normalizePhone = (raw: string): string => {
    const cleaned = raw.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('0')) return `+91${cleaned.substring(1)}`;
    if (cleaned.length === 10) return `+91${cleaned}`;
    return cleaned;
  };

  // === STEP 1: Send OTP ===
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
      if (!isFirebaseReady()) throw new Error('Firebase is not configured. Phone verification is required.');
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

  // === STEP 2: Verify OTP ===
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

  // === STEP 3: Submit Business Details → Create Application + Verify OTP ===
  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate
    const errors: Record<string, string> = {};
    if (!businessName.trim()) errors.businessName = 'Business name is required';
    if (!businessType) errors.businessType = 'Business type is required';
    if (businessType === 'other' && !businessTypeOther.trim()) errors.businessTypeOther = 'Please specify business type';
    if (!gstin.trim()) {
      errors.gstin = 'GSTIN is required';
    } else {
      const normalized = gstin.toUpperCase().replace(/\s/g, '');
      if (normalized.length !== 15 || !GSTIN_REGEX.test(normalized)) {
        errors.gstin = 'Invalid GSTIN format (15 characters)';
      }
    }
    if (!ownerName.trim()) errors.ownerName = 'Owner name is required';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Invalid email address';
    if (!addressLine1.trim()) errors.addressLine1 = 'Address is required';
    if (!city.trim()) errors.city = 'City is required';
    if (!selectedState) errors.state = 'State is required';
    if (!pincode.trim()) {
      errors.pincode = 'Pincode is required';
    } else if (!/^\d{6}$/.test(pincode.trim())) {
      errors.pincode = 'Pincode must be 6 digits';
    }
    if (!agreement) errors.agreement = 'You must agree to the terms';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setIsLoading(true);

    try {
      const normalizedPhone = normalizePhone(phone);
      const effectiveBusinessType = businessType === 'other' ? `other: ${businessTypeOther.trim()}` : businessType;

      // 1. Create application
      const appResult = await createRetailerApplication({
        phone: normalizedPhone,
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        gstin: gstin.toUpperCase().replace(/\s/g, ''),
        businessType: effectiveBusinessType,
        email: email.trim() || undefined,
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim(),
        state: selectedState,
        pincode: pincode.trim(),
      });

      const appId = appResult.application.id;
      setApplicationId(appId);

      // 2. Verify OTP on backend (links firebase_uid to application)
      await verifyRetailerOtp({ idToken, applicationId: appId });

      setStep('documents');
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string; status?: number };
      if (error.code === 'GSTIN_EXISTS') {
        setError('This GSTIN is already registered. Please login instead.');
      } else if (error.code === 'APPLICATION_EXISTS') {
        setError('A registration with this GSTIN is already in progress. Please contact support.');
      } else if (error.code === 'DUPLICATE_ENTRY') {
        setError('This phone number or GSTIN is already registered.');
      } else {
        setError(error.message || 'Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // === STEP 4: Document Upload ===
  const handleFileSelect = async (docType: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setDocuments(prev => ({
        ...prev,
        [docType]: { ...prev[docType], status: 'error', error: 'File must be under 5MB' },
      }));
      return;
    }

    // Set uploading state with preview
    const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    setDocuments(prev => ({
      ...prev,
      [docType]: { file, preview, status: 'uploading', error: undefined },
    }));

    try {
      await uploadDocument(file, docType, 'application', applicationId);
      setDocuments(prev => ({
        ...prev,
        [docType]: { ...prev[docType], status: 'uploaded' },
      }));
    } catch (err: unknown) {
      const error = err as { message?: string };
      setDocuments(prev => ({
        ...prev,
        [docType]: { ...prev[docType], status: 'error', error: error.message || 'Upload failed' },
      }));
    }
  };

  const handleSubmitKyc = async () => {
    setError('');
    setIsLoading(true);
    try {
      await submitRetailerKyc(applicationId);
      setStep('success');
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string; missingDocuments?: string[] };
      if (error.code === 'MISSING_DOCUMENTS' && error.missingDocuments) {
        setError(`Missing required documents: ${error.missingDocuments.join(', ')}`);
      } else {
        setError(error.message || 'Failed to submit KYC. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const allRequiredDocsUploaded = Object.entries(DOCUMENT_TYPES)
    .filter(([, cfg]) => cfg.required)
    .every(([key]) => documents[key]?.status === 'uploaded');

  const progressStep = getProgressStep(step);

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
          <Link to="/retailer/login" style={styles.textLink}>Sign In</Link>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.container}>
          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem' }}>
              Register as Retailer
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9375rem' }}>
              Complete the registration form to join SuperMandi as a retail partner
            </p>
          </div>

          {/* Progress Indicator */}
          {step !== 'success' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
              {PROGRESS_LABELS.map((label, i) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    opacity: progressStep >= i ? 1 : 0.4,
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8125rem', fontWeight: 600,
                      background: progressStep > i ? '#22c55e' : progressStep === i ? '#2563eb' : '#e2e8f0',
                      color: progressStep >= i ? 'white' : '#64748b',
                    }}>
                      {progressStep > i ? '\u2713' : i + 1}
                    </div>
                    <span style={{
                      fontSize: '0.8125rem', fontWeight: progressStep === i ? 600 : 400,
                      color: progressStep >= i ? '#0F172A' : '#94a3b8',
                    }}>{label}</span>
                  </div>
                  {i < PROGRESS_LABELS.length - 1 && (
                    <div style={{
                      width: '40px', height: '2px',
                      background: progressStep > i ? '#22c55e' : '#e2e8f0',
                    }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* STEP 1: Phone */}
          {step === 'phone' && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Verify your phone number</h2>
              <p style={styles.cardSubtitle}>We'll send a verification code to confirm your identity.</p>

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
                    type="tel" style={styles.input} placeholder="+91 9876543210"
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    disabled={isLoading} autoFocus
                  />
                </div>
                <button
                  id="send-otp-button" type="submit"
                  style={{ ...styles.btnPrimary, ...(isLoading || !isFirebaseReady() ? styles.btnPrimaryDisabled : {}) }}
                  disabled={isLoading || !isFirebaseReady()}
                >
                  {isLoading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>

              <div style={{ borderTop: '1px solid #e5e7eb', margin: '1.5rem 0', paddingTop: '1rem' }}>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0, textAlign: 'center' }}>
                  Already registered?{' '}
                  <Link to="/retailer/login" style={styles.textLink}>Sign In</Link>
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: OTP */}
          {step === 'otp' && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Enter verification code</h2>
              <p style={styles.cardSubtitle}>Enter the 6-digit code sent to {phone}</p>

              {error && <div style={styles.alertError}>{error}</div>}

              <form onSubmit={handleVerifyOtp}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Verification Code</label>
                  <input
                    type="text"
                    style={{ ...styles.input, textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.5rem', fontFamily: 'monospace' }}
                    placeholder="------" value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6} disabled={isLoading} autoFocus
                  />
                </div>

                {otpExpirySeconds > 0 && (
                  <p style={{ fontSize: '0.8125rem', color: otpExpirySeconds <= 60 ? '#dc2626' : '#64748b', textAlign: 'center', marginBottom: '1rem' }}>
                    Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
                  </p>
                )}
                {otpExpirySeconds === 0 && (
                  <p style={{ fontSize: '0.8125rem', color: '#dc2626', textAlign: 'center', marginBottom: '1rem' }}>
                    Code expired. Please resend OTP.
                  </p>
                )}

                <button
                  type="submit"
                  style={{ ...styles.btnPrimary, ...(isLoading || otp.length !== 6 ? styles.btnPrimaryDisabled : {}) }}
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? 'Verifying...' : 'Verify OTP'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" onClick={handleChangePhone} style={styles.textLink} disabled={isLoading}>
                    Change Phone
                  </button>
                  <button
                    id="resend-otp-button" type="button" onClick={handleResendOtp}
                    style={{ ...styles.textLink, ...(resendCooldown > 0 ? styles.textLinkDisabled : {}) }}
                    disabled={isLoading || resendCooldown > 0}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 3: Business Details */}
          {step === 'details' && (
            <div style={styles.card}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#166534' }}>
                Phone verified: {phone}
              </div>

              {error && <div style={styles.alertError}>{error}</div>}

              <form onSubmit={handleSubmitDetails}>
                {/* Business Identity */}
                <h3 style={styles.sectionTitle}>Business Identity</h3>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Business / Store Name *</label>
                  <input type="text" style={styles.input} placeholder="e.g. Sharma General Store"
                    value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={isLoading} autoFocus />
                  {fieldErrors.businessName && <div style={styles.fieldError}>{fieldErrors.businessName}</div>}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Business Type *</label>
                  <select style={styles.select} value={businessType} onChange={(e) => setBusinessType(e.target.value)} disabled={isLoading}>
                    <option value="">Select business type</option>
                    {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  {fieldErrors.businessType && <div style={styles.fieldError}>{fieldErrors.businessType}</div>}
                </div>

                {businessType === 'other' && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Specify Business Type *</label>
                    <input type="text" style={styles.input} placeholder="e.g. Wholesale Club"
                      value={businessTypeOther} onChange={(e) => setBusinessTypeOther(e.target.value)} disabled={isLoading} />
                    {fieldErrors.businessTypeOther && <div style={styles.fieldError}>{fieldErrors.businessTypeOther}</div>}
                  </div>
                )}

                <div style={styles.formGroup}>
                  <label style={styles.label}>GSTIN *</label>
                  <input type="text" style={styles.input} placeholder="22AAAAA0000A1Z5" maxLength={15}
                    value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} disabled={isLoading} />
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>15-character GST Identification Number</div>
                  {fieldErrors.gstin && <div style={styles.fieldError}>{fieldErrors.gstin}</div>}
                </div>

                {/* Contact Person */}
                <h3 style={styles.sectionTitle}>Contact Person</h3>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Owner / Authorized Person Name *</label>
                  <input type="text" style={styles.input} placeholder="e.g. Rajesh Sharma"
                    value={ownerName} onChange={(e) => setOwnerName(e.target.value)} disabled={isLoading} />
                  {fieldErrors.ownerName && <div style={styles.fieldError}>{fieldErrors.ownerName}</div>}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Phone (Verified)</label>
                  <input type="text" style={{ ...styles.input, background: '#f8fafc', cursor: 'not-allowed' }}
                    value={phone} disabled />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Email <span style={styles.optionalBadge}>(optional)</span></label>
                  <input type="email" style={styles.input} placeholder="store@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
                  {fieldErrors.email && <div style={styles.fieldError}>{fieldErrors.email}</div>}
                </div>

                {/* Business Address */}
                <h3 style={styles.sectionTitle}>Business Address</h3>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Address Line 1 *</label>
                  <input type="text" style={styles.input} placeholder="Shop No., Building, Street"
                    value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} disabled={isLoading} />
                  {fieldErrors.addressLine1 && <div style={styles.fieldError}>{fieldErrors.addressLine1}</div>}
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Address Line 2 <span style={styles.optionalBadge}>(optional)</span></label>
                  <input type="text" style={styles.input} placeholder="Area, Landmark"
                    value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} disabled={isLoading} />
                </div>

                <div style={styles.formRow}>
                  <div style={{ flex: 1 }}>
                    <label style={styles.label}>City *</label>
                    <input type="text" style={styles.input} placeholder="City"
                      value={city} onChange={(e) => setCity(e.target.value)} disabled={isLoading} />
                    {fieldErrors.city && <div style={styles.fieldError}>{fieldErrors.city}</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={styles.label}>Pincode *</label>
                    <input type="text" style={styles.input} placeholder="110001" maxLength={6}
                      value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={isLoading} />
                    {fieldErrors.pincode && <div style={styles.fieldError}>{fieldErrors.pincode}</div>}
                  </div>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>State *</label>
                  <select style={styles.select} value={selectedState} onChange={(e) => setSelectedState(e.target.value)} disabled={isLoading}>
                    <option value="">Select state</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {fieldErrors.state && <div style={styles.fieldError}>{fieldErrors.state}</div>}
                </div>

                {/* Agreement */}
                <div style={{ ...styles.formGroup, marginTop: '1.5rem' }}>
                  <label style={styles.checkboxLabel}>
                    <input type="checkbox" checked={agreement} onChange={(e) => setAgreement(e.target.checked)} disabled={isLoading}
                      style={{ marginTop: '0.125rem' }} />
                    <span>
                      I confirm that all the details provided are correct and accurate. I agree to the{' '}
                      <span style={{ color: '#2563eb' }}>Terms of Service</span> and{' '}
                      <span style={{ color: '#2563eb' }}>Privacy Policy</span>. *
                    </span>
                  </label>
                  {fieldErrors.agreement && <div style={styles.fieldError}>{fieldErrors.agreement}</div>}
                </div>

                <button
                  type="submit"
                  style={{ ...styles.btnPrimary, marginTop: '0.5rem', ...(isLoading ? styles.btnPrimaryDisabled : {}) }}
                  disabled={isLoading}
                >
                  {isLoading ? 'Submitting...' : 'Continue to Document Upload'}
                </button>
              </form>
            </div>
          )}

          {/* STEP 4: KYC Documents */}
          {step === 'documents' && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Upload KYC Documents</h2>
              <p style={styles.cardSubtitle}>
                Upload the required documents to complete your registration. Accepted formats: JPEG, PNG, PDF (max 5MB each).
              </p>

              {error && <div style={styles.alertError}>{error}</div>}

              {Object.entries(DOCUMENT_TYPES).map(([key, config]) => {
                const doc = documents[key];
                const isUploaded = doc?.status === 'uploaded';
                const isUploading = doc?.status === 'uploading';
                const hasError = doc?.status === 'error';

                return (
                  <div key={key} style={{ marginBottom: '1.5rem' }}>
                    <label style={styles.label}>
                      {config.label} {config.required && '*'}
                    </label>
                    <label
                      style={{
                        ...styles.uploadBox,
                        ...(isUploaded ? styles.uploadBoxUploaded : {}),
                        ...(hasError ? styles.uploadBoxError : {}),
                        display: 'block',
                      }}
                    >
                      <input
                        type="file"
                        accept={config.accept}
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(key, file);
                          e.target.value = '';
                        }}
                        disabled={isUploading}
                      />
                      {isUploading && (
                        <div style={{ color: '#2563eb', fontWeight: 500 }}>Uploading...</div>
                      )}
                      {isUploaded && (
                        <div>
                          <div style={{ color: '#16a34a', fontWeight: 500, marginBottom: '0.25rem' }}>
                            &#10003; {doc.file?.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Click to replace</div>
                        </div>
                      )}
                      {hasError && (
                        <div>
                          <div style={{ color: '#dc2626', fontWeight: 500, marginBottom: '0.25rem' }}>
                            {doc.error || 'Upload failed'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Click to try again</div>
                        </div>
                      )}
                      {doc?.status === 'pending' && (
                        <div>
                          <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>
                            Click to upload or drag and drop
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>JPEG, PNG, or PDF — max 5MB</div>
                        </div>
                      )}
                    </label>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleSubmitKyc}
                style={{
                  ...styles.btnPrimary,
                  ...(!allRequiredDocsUploaded || isLoading ? styles.btnPrimaryDisabled : {}),
                }}
                disabled={!allRequiredDocsUploaded || isLoading}
              >
                {isLoading ? 'Submitting...' : 'Submit Application'}
              </button>
            </div>
          )}

          {/* STEP 5: Success */}
          {step === 'success' && (
            <div style={styles.card}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '4rem', height: '4rem', background: '#dcfce7', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1rem', fontSize: '1.75rem',
                }}>
                  &#10003;
                </div>

                <h2 style={{ ...styles.cardTitle, textAlign: 'center' }}>Application Submitted</h2>
                <p style={{ ...styles.cardSubtitle, textAlign: 'center' }}>
                  Your registration is pending verification. We'll review your documents and notify you once approved.
                </p>

                {applicationId && (
                  <div style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
                    padding: '1rem', textAlign: 'center', marginBottom: '1rem',
                  }}>
                    <div style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '0.25rem' }}>Application ID</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>
                      {applicationId}
                    </div>
                  </div>
                )}

                <div style={styles.alertSuccess}>
                  You will receive a notification once your application is approved. After approval, you can login to manage your store.
                </div>

                <Link
                  to="/retailer/login"
                  style={{
                    ...styles.btnPrimary, display: 'block', textDecoration: 'none',
                    textAlign: 'center', lineHeight: '46px',
                  }}
                >
                  Go to Login
                </Link>
              </div>
            </div>
          )}
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
