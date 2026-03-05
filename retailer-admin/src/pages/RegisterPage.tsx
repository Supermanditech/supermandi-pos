// STG-208: Replaced hardcoded hex colors with CSS variables for dark mode
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
// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
import { MAX_DOCUMENT_SIZE_BYTES, MAX_DOCUMENT_SIZE_LABEL } from '../lib/fileLimits';
import { logger } from '../lib/logger';

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

// Styles moved to index.css under .reg-* classes for dark mode support

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
  // REQ.AUTH.PARITY.REGISTRATION_FLOW: Track idToken age for 50-min expiry check (parity with supplier)
  const idTokenObtainedAt = useRef<number>(0);

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
        logger.error('Failed to setup reCAPTCHA:', err);
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
      idTokenObtainedAt.current = Date.now();
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
    setApplicationId('');
    setError('');
    recaptchaInitialized.current = false;
  };

  // === STEP 3: Submit Business Details → Create Application + Verify OTP ===
  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // REQ.AUTH.PARITY.REGISTRATION_FLOW: Validate idToken hasn't expired (parity with supplier REG-SUP-002)
    const TOKEN_MAX_AGE_MS = 50 * 60 * 1000; // 50 minutes
    if (!idToken || (idTokenObtainedAt.current > 0 && Date.now() - idTokenObtainedAt.current > TOKEN_MAX_AGE_MS)) {
      setError('Phone verification expired. Please verify your phone again.');
      setIdToken('');
      setStep('phone');
      return;
    }

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

      // ISSUE-002 FIX: Always verify OTP on backend, even if previously verified.
      // This re-links the fresh Firebase UID and prevents stale-session resume bypass.
      await verifyRetailerOtp({ idToken, applicationId: appId });
      setStep('documents');
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string; status?: number; applicationId?: string; applicationStatus?: string };
      // STAGING-FIX-009 + OTP_SUCCESS_ERROR_CONFLICT fix:
      // Auto-resume existing application from 409 error body.
      // Prevent contradictory success+error banners by handling every resume path explicitly.
      if (error.code === 'APPLICATION_EXISTS' && error.applicationId) {
        try {
          setApplicationId(error.applicationId);
          // ISSUE-002 FIX: Always verify OTP on resume, never skip based on status.
          // This ensures fresh phone ownership verification on every resume attempt.
          await verifyRetailerOtp({ idToken, applicationId: error.applicationId });
          setStep('documents');
          return;
        } catch (resumeErr: unknown) {
          // If verifyRetailerOtp failed because app is already approved/past-OTP, navigate to documents
          const re = resumeErr as { code?: string; message?: string };
          if (re.code === 'ALREADY_APPROVED') {
            setStep('documents');
            return;
          }
          // Unresumable — show single clear error (no conflicting success banner)
          setError('A registration already exists for this GSTIN. Please contact support.');
          return;
        }
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
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setDocuments(prev => ({
        ...prev,
        [docType]: { ...prev[docType], status: 'error', error: `File must be under ${MAX_DOCUMENT_SIZE_LABEL}` },
      }));
      return;
    }

    // Set uploading state with preview
    // STG-456: Revoke old blob URL before creating new one to prevent memory leak
    setDocuments(prev => {
      if (prev[docType]?.preview) URL.revokeObjectURL(prev[docType].preview!);
      return prev;
    });
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
    <div className="reg-page">
      {/* Header */}
      <header className="reg-header">
        <div className="reg-header-inner">
          <div className="reg-logo">
            <span className="reg-logo-text">SuperMandi</span>
            <span className="reg-logo-separator">|</span>
            <span className="reg-logo-subtext">Retailer Portal</span>
          </div>
        </div>
      </header>

      <main className="reg-main">
        <div className="reg-container">
          {/* Title */}
          <div className="reg-title-section">
            <h1 className="reg-page-title">
              Register as Retailer
            </h1>
            <p className="reg-page-subtitle">
              Complete the registration form to join SuperMandi as a retailer partner
            </p>
          </div>

          {/* Progress Indicator — AUTH-PARITY-007: Stepper geometry matching supplier */}
          {step !== 'success' && (
            <div className="reg-card reg-progress-card">
              <div className="reg-progress-bar">
                {PROGRESS_LABELS.map((label, i) => (
                  <div key={label} className="reg-progress-step">
                    <div className="reg-progress-inner">
                      <div className={`reg-progress-circle ${progressStep > i ? 'reg-progress-circle--completed' : progressStep === i ? 'reg-progress-circle--active' : 'reg-progress-circle--pending'}`}>
                        {progressStep > i ? (
                          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : i + 1}
                      </div>
                      <span className={`reg-progress-label ${progressStep === i ? 'reg-progress-label--active' : progressStep > i ? 'reg-progress-label--completed' : 'reg-progress-label--pending'}`}>{label}</span>
                    </div>
                    {i < PROGRESS_LABELS.length - 1 && (
                      <div className={`reg-progress-connector ${progressStep > i ? 'reg-progress-connector--completed' : ''}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 1: Phone */}
          {step === 'phone' && (
            <div className="reg-card">
              <h2 className="reg-card-title">Verify your phone number</h2>
              <p className="reg-card-subtitle">We'll send a verification code to confirm your identity.</p>

              {!isFirebaseReady() && (
                <div className="reg-alert-warning">
                  <strong>Phone Verification Unavailable</strong>
                  <p className="reg-alert-body">
                    Registration requires phone verification which is currently unavailable.
                    Please try again later or contact us at{' '}
                    <a href="mailto:hello@supermandi.tech" className="reg-firebase-link">hello@supermandi.tech</a>.
                  </p>
                </div>
              )}

              {error && <div className="reg-alert-error" role="alert">{error}</div>}

              <form onSubmit={handleSendOtp}>
                <div className="reg-form-group">
                  <label className="reg-label" htmlFor="reg-phone">Phone Number</label>
                  <input
                    id="reg-phone" name="phone"
                    type="tel" className="reg-input" placeholder="+91 9876543210"
                    value={phone} onChange={(e) => setPhone(e.target.value)}
                    disabled={isLoading} autoFocus
                  />
                </div>
                <button
                  id="send-otp-button" type="submit"
                  className="reg-btn-primary"
                  disabled={isLoading || !isFirebaseReady()}
                >
                  {isLoading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>

              <div className="reg-divider">
                <p className="reg-divider-text">
                  Already registered?{' '}
                  <Link to="/retailer/login" className="reg-text-link">Sign In</Link>
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: OTP */}
          {step === 'otp' && (
            <div className="reg-card">
              <h2 className="reg-card-title">Enter verification code</h2>
              <p className="reg-card-subtitle">Enter the 6-digit code sent to {phone}</p>

              {error && <div className="reg-alert-error" role="alert">{error}</div>}

              <form onSubmit={handleVerifyOtp}>
                <div className="reg-form-group">
                  <label className="reg-label" htmlFor="reg-otp">Verification Code</label>
                  <input
                    id="reg-otp" name="otp"
                    type="text"
                    className="reg-input reg-input--otp"
                    placeholder="------" value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6} disabled={isLoading} autoFocus
                  />
                </div>

                <div aria-live="polite">
                {otpExpirySeconds > 0 && (
                  <p className={`reg-otp-expiry ${otpExpirySeconds <= 60 ? 'reg-otp-expiry--warning' : ''}`}>
                    Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
                  </p>
                )}
                {otpExpirySeconds === 0 && (
                  <p className="reg-otp-expiry reg-otp-expiry--warning">
                    Code expired. Please resend OTP.
                  </p>
                )}
                </div>

                <button
                  type="submit"
                  className="reg-btn-primary"
                  disabled={isLoading || otp.length !== 6}
                >
                  {isLoading ? 'Verifying...' : 'Verify OTP'}
                </button>

                <div className="reg-otp-actions">
                  <button type="button" onClick={handleChangePhone} className="reg-text-link" disabled={isLoading}>
                    Change Phone
                  </button>
                  <button
                    id="resend-otp-button" type="button" onClick={handleResendOtp}
                    className="reg-text-link"
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
            <form onSubmit={handleSubmitDetails} className="reg-details-form">
              {/* Phone verified banner — hidden when error is active to prevent conflicting state */}
              {!error && (
                <div className="reg-alert-success reg-alert-flex">
                  <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Phone verified: <strong>{phone}</strong></span>
                </div>
              )}

              {error && <div className="reg-alert-error reg-alert--no-margin" role="alert">{error}</div>}

              {/* Business Identity Card */}
              <div className="reg-section-card">
                <h3 className="reg-section-header">Business Identity</h3>
                <div className="reg-grid-two">
                  <div className="reg-grid-full">
                    <label className="reg-label" htmlFor="reg-business-name">Business / Store Name <span className="reg-required-star">*</span></label>
                    <input id="reg-business-name" name="businessName" type="text" className="reg-input" placeholder="e.g. Sharma General Store"
                      value={businessName} onChange={(e) => setBusinessName(e.target.value)} disabled={isLoading} autoFocus />
                    {fieldErrors.businessName && <div className="reg-field-error">{fieldErrors.businessName}</div>}
                  </div>
                  <div>
                    <label className="reg-label" htmlFor="reg-business-type">Business Type <span className="reg-required-star">*</span></label>
                    <select id="reg-business-type" name="businessType" className="reg-select" value={businessType} onChange={(e) => setBusinessType(e.target.value)} disabled={isLoading}>
                      <option value="">Select business type</option>
                      {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {fieldErrors.businessType && <div className="reg-field-error">{fieldErrors.businessType}</div>}
                  </div>
                  {businessType === 'other' && (
                    <div>
                      <label className="reg-label" htmlFor="reg-business-type-other">Specify Business Type <span className="reg-required-star">*</span></label>
                      <input id="reg-business-type-other" name="businessTypeOther" type="text" className="reg-input" placeholder="e.g. Wholesale Club"
                        value={businessTypeOther} onChange={(e) => setBusinessTypeOther(e.target.value)} disabled={isLoading} />
                      {fieldErrors.businessTypeOther && <div className="reg-field-error">{fieldErrors.businessTypeOther}</div>}
                    </div>
                  )}
                  <div>
                    <label className="reg-label" htmlFor="reg-gstin">GSTIN <span className="reg-required-star">*</span></label>
                    <input id="reg-gstin" name="gstin" type="text" className="reg-input reg-input--mono" placeholder="22AAAAA0000A1Z5" maxLength={15}
                      value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} disabled={isLoading} />
                    <div className={`reg-field-counter ${gstin.length === 15 ? 'reg-field-counter--valid' : ''}`}>
                      {gstin.length}/15 characters {gstin.length === 15 ? '— Valid length' : '— GST Identification Number'}
                    </div>
                    {fieldErrors.gstin && <div className="reg-field-error">{fieldErrors.gstin}</div>}
                  </div>
                </div>
              </div>

              {/* Contact Person Card */}
              <div className="reg-section-card">
                <h3 className="reg-section-header">Contact Person</h3>
                <div className="reg-grid-two">
                  <div>
                    <label className="reg-label" htmlFor="reg-owner-name">Owner / Authorized Person Name <span className="reg-required-star">*</span></label>
                    <input id="reg-owner-name" name="ownerName" type="text" className="reg-input" placeholder="e.g. Rajesh Sharma"
                      value={ownerName} onChange={(e) => setOwnerName(e.target.value)} disabled={isLoading} />
                    {fieldErrors.ownerName && <div className="reg-field-error">{fieldErrors.ownerName}</div>}
                  </div>
                  <div>
                    <label className="reg-label" htmlFor="reg-email">Email <span className="reg-optional-badge">(optional)</span></label>
                    <input id="reg-email" name="email" type="email" className="reg-input" placeholder="store@example.com"
                      value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
                    {fieldErrors.email && <div className="reg-field-error">{fieldErrors.email}</div>}
                  </div>
                  <div>
                    <label className="reg-label" htmlFor="reg-phone-verified">Phone (Verified)</label>
                    <input id="reg-phone-verified" type="text" className="reg-input"
                      value={phone} disabled />
                  </div>
                </div>
              </div>

              {/* Business Address Card */}
              <div className="reg-section-card">
                <h3 className="reg-section-header">Business Address</h3>
                <div className="reg-grid-two">
                  <div className="reg-grid-full">
                    <label className="reg-label" htmlFor="reg-address1">Address Line 1 <span className="reg-required-star">*</span></label>
                    <input id="reg-address1" name="addressLine1" type="text" className="reg-input" placeholder="Building name, Street"
                      value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} disabled={isLoading} />
                    {fieldErrors.addressLine1 && <div className="reg-field-error">{fieldErrors.addressLine1}</div>}
                  </div>
                  <div className="reg-grid-full">
                    <label className="reg-label" htmlFor="reg-address2">Address Line 2 <span className="reg-optional-badge">(optional)</span></label>
                    <input id="reg-address2" name="addressLine2" type="text" className="reg-input" placeholder="Area, Landmark"
                      value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} disabled={isLoading} />
                  </div>
                  <div>
                    <label className="reg-label" htmlFor="reg-city">City <span className="reg-required-star">*</span></label>
                    <input id="reg-city" name="city" type="text" className="reg-input" placeholder="City"
                      value={city} onChange={(e) => setCity(e.target.value)} disabled={isLoading} />
                    {fieldErrors.city && <div className="reg-field-error">{fieldErrors.city}</div>}
                  </div>
                  <div>
                    <label className="reg-label" htmlFor="reg-state">State <span className="reg-required-star">*</span></label>
                    <select id="reg-state" name="state" className="reg-select" value={selectedState} onChange={(e) => setSelectedState(e.target.value)} disabled={isLoading}>
                      <option value="">Select state</option>
                      {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {fieldErrors.state && <div className="reg-field-error">{fieldErrors.state}</div>}
                  </div>
                  <div>
                    <label className="reg-label" htmlFor="reg-pincode">Pincode <span className="reg-required-star">*</span></label>
                    <input id="reg-pincode" name="pincode" type="text" className="reg-input reg-input--mono" placeholder="400001" maxLength={6}
                      value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={isLoading} />
                    <div className={`reg-field-counter ${pincode.length === 6 ? 'reg-field-counter--valid' : ''}`}>
                      {pincode.length}/6 digits {pincode.length === 6 ? '— Valid' : ''}
                    </div>
                    {fieldErrors.pincode && <div className="reg-field-error">{fieldErrors.pincode}</div>}
                  </div>
                </div>
              </div>

              {/* Agreement Card */}
              <div className={`reg-section-card reg-agreement-card ${agreement ? 'reg-agreement-card--agreed' : 'reg-agreement-card--pending'}`}>
                <label className="reg-checkbox-label">
                  <input type="checkbox" checked={agreement} onChange={(e) => setAgreement(e.target.checked)} disabled={isLoading}
                    className="reg-checkbox" />
                  <span>
                    I confirm that all the details provided are correct and accurate. I agree to the{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="reg-terms-link">Terms of Service</a> and{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="reg-terms-link">Privacy Policy</a>. <span className="reg-required-star">*</span>
                  </span>
                </label>
                {fieldErrors.agreement && <div className="reg-field-error">{fieldErrors.agreement}</div>}
              </div>

              <div className="reg-action-row">
                <button
                  type="button"
                  className="reg-btn-secondary reg-btn-large"
                  onClick={() => { setStep('phone'); setError(''); setFieldErrors({}); }}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="reg-btn-primary reg-btn-large"
                  disabled={isLoading || !agreement}
                >
                  {isLoading ? (
                    <span className="reg-btn-spinner">
                      <span className="reg-spinner" />
                      Saving Details...
                    </span>
                  ) : 'Continue to Document Upload'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: KYC Documents — Card-per-document layout matching Supplier Portal */}
          {step === 'documents' && (
            <div className="reg-details-form">
              {/* Upload guidelines */}
              <div className="reg-alert-info">
                <h4 className="reg-guidelines-title">Document Upload Guidelines</h4>
                <ul className="reg-guidelines-list">
                  <li>Supported formats: JPEG, PNG, PDF</li>
                  <li>Maximum file size: {MAX_DOCUMENT_SIZE_LABEL} per document</li>
                  <li>Ensure documents are clear and readable</li>
                </ul>
              </div>

              {error && <div className="reg-alert-error reg-alert--no-margin" role="alert">{error}</div>}

              {/* Individual document cards */}
              {Object.entries(DOCUMENT_TYPES).map(([key, config]) => {
                const doc = documents[key];
                const isUploaded = doc?.status === 'uploaded';
                const isUploading = doc?.status === 'uploading';
                const hasError = doc?.status === 'error';

                return (
                  <div key={key} className="reg-section-card">
                    <h3 className="reg-doc-title">
                      {config.label} {config.required && '*'}
                    </h3>
                    <p className="reg-doc-subtitle">
                      Upload a clear copy of your {config.label.toLowerCase()}
                    </p>
                    <label className={`reg-upload-box ${isUploaded ? 'reg-upload-box--uploaded' : ''} ${hasError ? 'reg-upload-box--error' : ''}`}>
                      <input
                        type="file"
                        accept={config.accept}
                        className="reg-hidden-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(key, file);
                          e.target.value = '';
                        }}
                        disabled={isUploading}
                      />
                      {isUploading && (
                        <div className="reg-upload-center">
                          <div className="reg-upload-spinner" />
                          <p className="reg-upload-text">Uploading...</p>
                          <div className="reg-upload-progress-track">
                            <div className="reg-upload-progress-fill" />
                          </div>
                        </div>
                      )}
                      {isUploaded && (
                        <div className="reg-upload-center">
                          <svg width="32" height="32" fill="none" stroke="#22c55e" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <p className="reg-uploaded-name">{doc.file?.name || 'Uploaded'}</p>
                          <p className="reg-uploaded-hint">Click to replace</p>
                        </div>
                      )}
                      {hasError && (
                        <div className="reg-upload-center">
                          <p className="reg-upload-error-text">{doc.error || 'Upload failed'}</p>
                          <p className="reg-uploaded-hint">Click to try again</p>
                        </div>
                      )}
                      {doc?.status === 'pending' && (
                        <div className="reg-upload-center">
                          <svg width="40" height="40" fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="reg-pending-text">Click to upload</p>
                          <p className="reg-pending-hint">PNG, JPG up to {MAX_DOCUMENT_SIZE_LABEL}</p>
                        </div>
                      )}
                    </label>
                    {doc?.preview && (
                      <div className="reg-doc-preview">
                        <img src={doc.preview} alt="Preview" />
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="reg-action-row">
                <button
                  type="button"
                  className="reg-btn-secondary reg-btn-large"
                  onClick={() => { setStep('details'); setError(''); }}
                  disabled={isLoading}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmitKyc}
                  className="reg-btn-primary reg-btn-large"
                  disabled={!allRequiredDocsUploaded || isLoading}
                >
                  {isLoading ? (
                    <span className="reg-btn-spinner">
                      <span className="reg-spinner" />
                      Submitting Application...
                    </span>
                  ) : 'Submit Application'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Success */}
          {step === 'success' && (
            <div className="reg-card">
              <div className="reg-success-center">
                <div className="reg-success-icon" aria-hidden="true">
                  &#10003;
                </div>

                <h2 className="reg-card-title">Application Submitted</h2>
                <p className="reg-card-subtitle">
                  Your registration is pending verification. We'll review your documents and notify you shortly.
                </p>

                {applicationId && (
                  <div className="reg-app-id-box">
                    <div className="reg-app-id-label">Application ID</div>
                    <div className="reg-app-id-value">
                      {applicationId}
                    </div>
                  </div>
                )}

                {/* #329-332: Updated success message — phone-based activation */}
                <div className="reg-alert-success">
                  <strong>What happens next?</strong>
                  <ol className="reg-next-steps">
                    <li>We review your documents (usually 1-2 business days)</li>
                    <li>Once approved, you'll receive a <strong>welcome message</strong> via WhatsApp and Email</li>
                    <li><a href="/pos" target="_blank" rel="noopener noreferrer" className="reg-pos-link">Download the SuperMandi POS app</a>, enter your phone number, and your store activates automatically</li>
                  </ol>
                </div>

                <div className="reg-help-text">
                  Need help? Contact us at{' '}
                  <a href="mailto:hello@supermandi.tech" className="reg-email-link">hello@supermandi.tech</a>
                </div>

                <Link
                  to="/retailer/login"
                  className="reg-btn-primary reg-link-as-btn"
                >
                  Go to Login
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="reg-footer">
        <div className="reg-footer-inner">
          <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
          <div className="reg-footer-links">
            <Link to="/retailer/help" className="reg-footer-link">Help</Link>
            <BuildStamp />
          </div>
        </div>
      </footer>
    </div>
  );
}
