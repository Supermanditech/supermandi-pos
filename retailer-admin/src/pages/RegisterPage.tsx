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
import { Link, useLocation } from 'react-router-dom';
import {
  createRetailerApplication,
  verifyRetailerOtp,
  uploadDocument,
  submitRetailerKyc,
  lookupRetailerRegistration,
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
  container: { width: '100%', maxWidth: '720px' },
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
  sectionCard: {
    background: 'white', borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0', padding: '1.5rem 2rem',
  },
  sectionHeader: {
    fontSize: '1.125rem', fontWeight: 600, color: '#0F172A',
    marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e2e8f0',
  },
  gridTwo: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem',
  } as React.CSSProperties,
  gridFull: { gridColumn: '1 / -1' } as React.CSSProperties,
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

// T-005: SessionStorage key for registration state persistence
const REG_STORAGE_KEY = 'supermandi_retailer_reg_state';

function loadSavedRegState(): Partial<{
  step: Step; phone: string; applicationId: string;
  businessName: string; businessType: string; businessTypeOther: string;
  ownerName: string; gstin: string; email: string;
  addressLine1: string; addressLine2: string; city: string;
  selectedState: string; pincode: string; agreement: boolean;
}> {
  try {
    const raw = sessionStorage.getItem(REG_STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    // Don't restore 'otp' step — fall back to 'phone' (can't resume OTP verification)
    if (data.step === 'otp') data.step = 'phone';
    return data;
  } catch { return {}; }
}

export default function RegisterPage() {
  const location = useLocation();
  const locationState = location.state as { phone?: string; resume?: boolean } | null;

  // T-005: Load saved registration state on mount
  const saved = useRef(loadSavedRegState());

  // Step state
  const [step, setStep] = useState<Step>(saved.current.step || 'phone');

  // Phone + OTP — pre-fill from login redirect, then sessionStorage, then empty
  const [phone, setPhone] = useState(locationState?.phone || saved.current.phone || '');
  const [otp, setOtp] = useState('');
  const [idToken, setIdToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const recaptchaInitialized = useRef(false);

  // Business Details — restore from sessionStorage
  const [applicationId, setApplicationId] = useState(saved.current.applicationId || '');
  const [businessName, setBusinessName] = useState(saved.current.businessName || '');
  const [businessType, setBusinessType] = useState(saved.current.businessType || '');
  const [businessTypeOther, setBusinessTypeOther] = useState(saved.current.businessTypeOther || '');
  const [ownerName, setOwnerName] = useState(saved.current.ownerName || '');
  const [gstin, setGstin] = useState(saved.current.gstin || '');
  const [email, setEmail] = useState(saved.current.email || '');
  const [addressLine1, setAddressLine1] = useState(saved.current.addressLine1 || '');
  const [addressLine2, setAddressLine2] = useState(saved.current.addressLine2 || '');
  const [city, setCity] = useState(saved.current.city || '');
  const [selectedState, setSelectedState] = useState(saved.current.selectedState || '');
  const [pincode, setPincode] = useState(saved.current.pincode || '');
  // T-005 parity: Restore agreement from sessionStorage
  const [agreement, setAgreement] = useState(saved.current.agreement || false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Documents
  const [documents, setDocuments] = useState<Record<string, DocumentUpload>>({
    pan: { file: null, preview: null, status: 'pending' },
    gstin_certificate: { file: null, preview: null, status: 'pending' },
    address_proof: { file: null, preview: null, status: 'pending' },
  });

  // T-005: Persist registration state to sessionStorage on key changes
  useEffect(() => {
    if (step === 'success') {
      sessionStorage.removeItem(REG_STORAGE_KEY);
      return;
    }
    const stateToSave = {
      step, phone, applicationId, businessName, businessType, businessTypeOther,
      ownerName, gstin, email, addressLine1, addressLine2, city, selectedState, pincode, agreement,
    };
    sessionStorage.setItem(REG_STORAGE_KEY, JSON.stringify(stateToSave));
  }, [step, phone, applicationId, businessName, businessType, businessTypeOther,
      ownerName, gstin, email, addressLine1, addressLine2, city, selectedState, pincode, agreement]);

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

  // STAGING-FIX-006: Resume registration flow — when arriving from login with resume: true,
  // look up existing application and skip to the appropriate step
  const resumeChecked = useRef(false);
  useEffect(() => {
    if (resumeChecked.current) return;
    if (!locationState?.resume || !locationState?.phone) return;
    resumeChecked.current = true;

    (async () => {
      try {
        setIsLoading(true);
        let normalizedPhone = locationState.phone!.replace(/[\s-]/g, '');
        if (!normalizedPhone.startsWith('+')) {
          normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : `+${normalizedPhone}`;
        }
        const lookup = await lookupRetailerRegistration(normalizedPhone);
        if (lookup.application_id) {
          setApplicationId(lookup.application_id);
          if (lookup.action === 'UPLOAD_DOCUMENTS') {
            setStep('documents');
          } else if (lookup.action === 'FIX_REQUIRED') {
            setStep('documents');
            setError('Some documents need to be re-uploaded.');
          }
          // For VERIFY_PHONE or other states, stay on phone step (user needs OTP)
        }
      } catch {
        // Lookup failed — proceed with normal registration
      } finally {
        setIsLoading(false);
      }
    })();
  }, [locationState]);

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

      // If application was resumed and already OTP-verified, skip to documents
      if (appResult.application.status === 'OTP_VERIFIED') {
        setStep('documents');
      } else {
        // 2. Verify OTP on backend (links firebase_uid to application)
        await verifyRetailerOtp({ idToken, applicationId: appId });
        setStep('documents');
      }
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string; status?: number; applicationId?: string; applicationStatus?: string };
      // STAGING-FIX-009: Auto-resume existing application from 409 error body
      if (error.code === 'APPLICATION_EXISTS' && error.applicationId) {
        try {
          setApplicationId(error.applicationId);
          if (error.applicationStatus === 'OTP_VERIFIED' || error.applicationStatus === 'UPLOAD_DOCUMENTS') {
            // Already OTP-verified, skip directly to documents
            setStep('documents');
          } else {
            // Verify OTP to advance the application
            await verifyRetailerOtp({ idToken, applicationId: error.applicationId });
            setStep('documents');
          }
          return;
        } catch {
          // Resume failed — show fallback error
        }
        setError('A registration already exists for this GSTIN. Please contact support.');
      } else if (error.code === 'APPLICATION_EXISTS') {
        setError('A registration already exists for this GSTIN. Please contact support.');
      } else if (error.code === 'GSTIN_EXISTS') {
        setError('This GSTIN is already registered. Please login instead.');
      } else if (error.code === 'DUPLICATE_ENTRY') {
        setError('This GSTIN is already registered with a different account.');
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
          {/* Removed Sign In from registration header — matching supplier (REG-SUP-001) */}
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

          {/* STEP 3: Business Details — Multi-card layout matching Supplier Portal */}
          {step === 'details' && (
            <form onSubmit={handleSubmitDetails} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Phone verified banner */}
              <div style={{ ...styles.alertSuccess, display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 0 }}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Phone verified: <strong>{phone}</strong></span>
              </div>

              {error && <div style={{ ...styles.alertError, marginBottom: 0 }}>{error}</div>}

              {/* Business Identity Card */}
              <div style={styles.sectionCard}>
                <h3 style={styles.sectionHeader}>Business Identity</h3>
                <div style={styles.gridTwo}>
                  <div style={styles.gridFull}>
                    <label style={styles.label}>Business / Store Name *</label>
                    <input type="text" style={styles.input} placeholder="e.g. Sharma General Store"
                      value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={isLoading} autoFocus />
                    {fieldErrors.businessName && <div style={styles.fieldError}>{fieldErrors.businessName}</div>}
                  </div>
                  <div>
                    <label style={styles.label}>Business Type *</label>
                    <select style={styles.select} value={businessType} onChange={(e) => setBusinessType(e.target.value)} disabled={isLoading}>
                      <option value="">Select business type</option>
                      {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {fieldErrors.businessType && <div style={styles.fieldError}>{fieldErrors.businessType}</div>}
                  </div>
                  {businessType === 'other' && (
                    <div>
                      <label style={styles.label}>Specify Business Type *</label>
                      <input type="text" style={styles.input} placeholder="e.g. Wholesale Club"
                        value={businessTypeOther} onChange={(e) => setBusinessTypeOther(e.target.value)} disabled={isLoading} />
                      {fieldErrors.businessTypeOther && <div style={styles.fieldError}>{fieldErrors.businessTypeOther}</div>}
                    </div>
                  )}
                  <div>
                    <label style={styles.label}>GSTIN *</label>
                    <input type="text" style={{ ...styles.input, fontFamily: 'monospace' }} placeholder="22AAAAA0000A1Z5" maxLength={15}
                      value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} disabled={isLoading} />
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>15-character GST Identification Number</div>
                    {fieldErrors.gstin && <div style={styles.fieldError}>{fieldErrors.gstin}</div>}
                  </div>
                </div>
              </div>

              {/* Contact Person Card */}
              <div style={styles.sectionCard}>
                <h3 style={styles.sectionHeader}>Contact Person</h3>
                <div style={styles.gridTwo}>
                  <div>
                    <label style={styles.label}>Owner / Authorized Person Name *</label>
                    <input type="text" style={styles.input} placeholder="e.g. Rajesh Sharma"
                      value={ownerName} onChange={(e) => setOwnerName(e.target.value)} disabled={isLoading} />
                    {fieldErrors.ownerName && <div style={styles.fieldError}>{fieldErrors.ownerName}</div>}
                  </div>
                  <div>
                    <label style={styles.label}>Email <span style={styles.optionalBadge}>(optional)</span></label>
                    <input type="email" style={styles.input} placeholder="store@example.com"
                      value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
                    {fieldErrors.email && <div style={styles.fieldError}>{fieldErrors.email}</div>}
                  </div>
                  <div>
                    <label style={styles.label}>Phone (Verified)</label>
                    <input type="text" style={{ ...styles.input, background: '#f1f5f9', cursor: 'not-allowed' }}
                      value={phone} disabled />
                  </div>
                </div>
              </div>

              {/* Business Address Card */}
              <div style={styles.sectionCard}>
                <h3 style={styles.sectionHeader}>Business Address</h3>
                <div style={styles.gridTwo}>
                  <div style={styles.gridFull}>
                    <label style={styles.label}>Address Line 1 *</label>
                    <input type="text" style={styles.input} placeholder="Building name, Street"
                      value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} disabled={isLoading} />
                    {fieldErrors.addressLine1 && <div style={styles.fieldError}>{fieldErrors.addressLine1}</div>}
                  </div>
                  <div style={styles.gridFull}>
                    <label style={styles.label}>Address Line 2 <span style={styles.optionalBadge}>(optional)</span></label>
                    <input type="text" style={styles.input} placeholder="Area, Landmark"
                      value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} disabled={isLoading} />
                  </div>
                  <div>
                    <label style={styles.label}>City *</label>
                    <input type="text" style={styles.input} placeholder="City"
                      value={city} onChange={(e) => setCity(e.target.value)} disabled={isLoading} />
                    {fieldErrors.city && <div style={styles.fieldError}>{fieldErrors.city}</div>}
                  </div>
                  <div>
                    <label style={styles.label}>State *</label>
                    <select style={styles.select} value={selectedState} onChange={(e) => setSelectedState(e.target.value)} disabled={isLoading}>
                      <option value="">Select state</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {fieldErrors.state && <div style={styles.fieldError}>{fieldErrors.state}</div>}
                  </div>
                  <div>
                    <label style={styles.label}>Pincode *</label>
                    <input type="text" style={{ ...styles.input, fontFamily: 'monospace' }} placeholder="400001" maxLength={6}
                      value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={isLoading} />
                    {fieldErrors.pincode && <div style={styles.fieldError}>{fieldErrors.pincode}</div>}
                  </div>
                </div>
              </div>

              {/* Agreement Card */}
              <div style={styles.sectionCard}>
                <label style={styles.checkboxLabel}>
                  <input type="checkbox" checked={agreement} onChange={(e) => setAgreement(e.target.checked)} disabled={isLoading}
                    style={{ marginTop: '0.25rem', width: '20px', height: '20px' }} />
                  <span>
                    I confirm that all the details provided are correct and accurate. I agree to the{' '}
                    <span style={{ color: '#2563eb' }}>Terms of Service</span> and{' '}
                    <span style={{ color: '#2563eb' }}>Privacy Policy</span>. *
                  </span>
                </label>
                {fieldErrors.agreement && <div style={styles.fieldError}>{fieldErrors.agreement}</div>}
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  style={{ ...styles.btnSecondary, padding: '1rem 1.5rem', fontSize: '1rem', fontWeight: 600 }}
                  onClick={() => { setStep('otp'); setError(''); setFieldErrors({}); }}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  style={{ ...styles.btnPrimary, padding: '1rem 1.5rem', fontSize: '1rem', fontWeight: 600, ...(isLoading || !agreement ? styles.btnPrimaryDisabled : {}) }}
                  disabled={isLoading || !agreement}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'inline-block', width: '20px', height: '20px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Saving Details...
                    </span>
                  ) : 'Continue to Document Upload'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: KYC Documents — Card-per-document layout matching Supplier Portal */}
          {step === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Upload guidelines */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', padding: '1rem 1.5rem', borderRadius: '8px' }}>
                <h4 style={{ fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.9375rem' }}>Document Upload Guidelines</h4>
                <ul style={{ fontSize: '0.875rem', margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8 }}>
                  <li>Supported formats: JPEG, PNG, PDF</li>
                  <li>Maximum file size: 5MB per document</li>
                  <li>Ensure documents are clear and readable</li>
                </ul>
              </div>

              {error && <div style={{ ...styles.alertError, marginBottom: 0 }}>{error}</div>}

              {/* Individual document cards */}
              {Object.entries(DOCUMENT_TYPES).map(([key, config]) => {
                const doc = documents[key];
                const isUploaded = doc?.status === 'uploaded';
                const isUploading = doc?.status === 'uploading';
                const hasError = doc?.status === 'error';

                return (
                  <div key={key} style={styles.sectionCard}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>
                      {config.label} {config.required && '*'}
                    </h3>
                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                      Upload a clear copy of your {config.label.toLowerCase()}
                    </p>
                    <label
                      style={{
                        ...styles.uploadBox,
                        ...(isUploaded ? styles.uploadBoxUploaded : {}),
                        ...(hasError ? styles.uploadBoxError : {}),
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '2rem 1.5rem', cursor: 'pointer',
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
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '0.5rem' }} />
                          <p style={{ color: '#64748b', margin: 0 }}>Uploading...</p>
                        </div>
                      )}
                      {isUploaded && (
                        <div style={{ textAlign: 'center' }}>
                          <svg width="32" height="32" fill="none" stroke="#22c55e" viewBox="0 0 24 24" style={{ marginBottom: '0.5rem' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <p style={{ color: '#16a34a', fontWeight: 500, margin: 0 }}>{doc.file?.name || 'Uploaded'}</p>
                          <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>Click to replace</p>
                        </div>
                      )}
                      {hasError && (
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ color: '#dc2626', fontWeight: 500, margin: '0 0 0.25rem' }}>{doc.error || 'Upload failed'}</p>
                          <p style={{ color: '#64748b', fontSize: '0.8125rem', margin: 0 }}>Click to try again</p>
                        </div>
                      )}
                      {doc?.status === 'pending' && (
                        <div style={{ textAlign: 'center' }}>
                          <svg width="40" height="40" fill="none" stroke="#94a3b8" viewBox="0 0 24 24" style={{ marginBottom: '0.75rem' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p style={{ color: '#475569', fontWeight: 500, margin: '0 0 0.25rem' }}>Click to upload</p>
                          <p style={{ color: '#94a3b8', fontSize: '0.8125rem', margin: 0 }}>or drag and drop</p>
                        </div>
                      )}
                    </label>
                    {doc?.preview && (
                      <div style={{ marginTop: '1rem' }}>
                        <img src={doc.preview} alt="Preview" style={{ maxWidth: '100%', height: '96px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  style={{ ...styles.btnSecondary, padding: '1rem 1.5rem', fontSize: '1rem', fontWeight: 600 }}
                  onClick={() => { setStep('details'); setError(''); }}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmitKyc}
                  style={{
                    ...styles.btnPrimary, padding: '1rem 1.5rem', fontSize: '1rem', fontWeight: 600,
                    ...(!allRequiredDocsUploaded || isLoading ? styles.btnPrimaryDisabled : {}),
                  }}
                  disabled={!allRequiredDocsUploaded || isLoading}
                >
                  {isLoading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span style={{ display: 'inline-block', width: '20px', height: '20px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      Submitting Application...
                    </span>
                  ) : 'Submit Application'}
                </button>
              </div>
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
                  Your registration is pending verification. We'll review your documents and notify you shortly.
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

                {/* #329-332: Updated success message — phone-based activation */}
                <div style={styles.alertSuccess}>
                  <strong>What happens next?</strong>
                  <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', textAlign: 'left' }}>
                    <li>We review your documents (usually 1-2 business days)</li>
                    <li>Once approved, you'll receive a <strong>welcome message</strong> via WhatsApp and Email</li>
                    <li>Download the SuperMandi POS app, enter your phone number, and your store activates automatically</li>
                  </ol>
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
