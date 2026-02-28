import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_GATEWAY_BASE, safeJson } from '../lib/api';
import { setupRecaptcha, sendOtp as firebaseSendOtp, verifyOtp as firebaseVerifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';
import { BuildStamp } from '../components/BuildStamp';
import { useUnsavedChanges } from '../hooks/useNavigationSafety';
// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
import { MAX_DOCUMENT_SIZE_BYTES, MAX_DOCUMENT_SIZE_LABEL } from '../lib/fileLimits';
import { logger } from '../lib/logger';

// UI-SPEC-002: Stripe-level calm infrastructure design for registration
// Layout: Header (64px) + Wide container (1024px) + Footer - solid #F7F9FC background

// Indian states for dropdown
const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

// GSTIN validation: 15 characters, specific pattern
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function validateGSTIN(gstin: string): string | null {
  if (!gstin) return null; // Optional for retailers
  const normalized = gstin.toUpperCase().replace(/\s/g, '');
  if (normalized.length !== 15) return 'GSTIN must be 15 characters';
  if (!GSTIN_REGEX.test(normalized)) return 'Invalid GSTIN format';
  return null;
}

function validatePincode(pincode: string): string | null {
  if (!pincode) return 'Pincode is required';
  if (!/^\d{6}$/.test(pincode)) return 'Pincode must be 6 digits';
  return null;
}

// Document types with labels
const DOCUMENT_TYPES = {
  pan_card: { label: 'PAN Card', accept: 'image/*,application/pdf' },
  gstin_certificate: { label: 'GSTIN Certificate', accept: 'image/*,application/pdf' },
  address_proof: { label: 'Address Proof (Utility Bill/Rent Agreement)', accept: 'image/*,application/pdf' },
};

type Step = 'phone' | 'otp' | 'details' | 'documents' | 'success';

interface DocumentUpload {
  file: File | null;
  preview: string | null;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  error?: string;
}

interface ApplicationResponse {
  success: boolean;
  applicationId: string;
  status: string;
  message?: string;
  action?: 'CREATED' | 'RESUMED';
}

export default function RetailerOnboardingPage() {
  const navigate = useNavigate();

  // Step state
  const [step, setStep] = useState<Step>('phone');

  // Step 1: Phone
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const recaptchaInitialized = useRef(false);
  const [idToken, setIdToken] = useState('');

  // Step 2: Store Details
  const [applicationId, setApplicationId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [agreement, setAgreement] = useState(false);

  // Step 3: Documents
  const [documents, setDocuments] = useState<Record<string, DocumentUpload>>({
    pan_card: { file: null, preview: null, status: 'pending' },
    gstin_certificate: { file: null, preview: null, status: 'pending' },
    address_proof: { file: null, preview: null, status: 'pending' },
  });

  // LIVE.NAV.RESILIENCE.BACK_FORWARD_DRAFT_RECOVERY.001: Unsaved-change guard
  // Prevents accidental page close/refresh when user has entered store details
  const hasUnsavedDetails = useMemo(
    () => (step === 'details' || step === 'documents') && (storeName !== '' || ownerName !== '' || email !== ''),
    [step, storeName, ownerName, email],
  );
  useUnsavedChanges(hasUnsavedDetails);

  // Setup reCAPTCHA on mount
  useEffect(() => {
    if (isFirebaseReady() && !recaptchaInitialized.current && step === 'phone') {
      try {
        setupRecaptcha('send-otp-button');
        recaptchaInitialized.current = true;
      } catch (err) {
        logger.error('Failed to setup reCAPTCHA:', err);
      }
    }

    return () => {
      cleanup();
      recaptchaInitialized.current = false;
    };
  }, [step]);

  // STBT-184.16: Resume incomplete registration from localStorage
  useEffect(() => {
    const savedAppId = localStorage.getItem('retailer_application_id');
    const savedStatus = localStorage.getItem('retailer_application_status');
    if (savedAppId && savedStatus !== 'KYC_SUBMITTED') {
      setApplicationId(savedAppId);
      setStep('documents');
    }
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Validate phone number
  const validatePhone = (value: string): boolean => {
    const cleaned = value.replace(/[\s-]/g, '');
    return /^(\+91)?[6-9]\d{9}$/.test(cleaned) || /^\+?[0-9]{10,13}$/.test(cleaned);
  };

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validatePhone(phone)) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsLoading(true);

    try {
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required for registration.');
      }

      await firebaseSendOtp(phone);
      setStep('otp');
      setResendCooldown(60);
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

  // Resend OTP
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Submit Business Details
  // REG-RET-002: Fixed to ensure proper error handling and step transition
  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate required fields
    if (!storeName.trim()) {
      setError('Store name is required');
      return;
    }
    if (!ownerName.trim()) {
      setError('Owner name is required');
      return;
    }
    if (!addressLine1.trim()) {
      setError('Address is required');
      return;
    }
    if (!city.trim()) {
      setError('City is required');
      return;
    }
    if (!state) {
      setError('State is required');
      return;
    }
    const pincodeError = validatePincode(pincode);
    if (pincodeError) {
      setError(pincodeError);
      return;
    }
    if (gstin) {
      const gstinError = validateGSTIN(gstin);
      if (gstinError) {
        setError(gstinError);
        return;
      }
    }
    if (!agreement) {
      setError('Please agree to the terms and conditions');
      return;
    }

    // REG-RET-002: Validate idToken exists before making API call
    if (!idToken) {
      setError('Phone verification expired. Please start over.');
      setStep('phone');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/registration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseIdToken: idToken,
          phone: phone.replace(/[\s-]/g, ''),
          storeName: storeName.trim(),
          ownerName: ownerName.trim(),
          gstin: gstin.trim().toUpperCase() || undefined,
          email: email.trim() || undefined,
          address: {
            line1: addressLine1.trim(),
            line2: addressLine2.trim() || undefined,
            city: city.trim(),
            state: state,
            pincode: pincode.trim(),
          },
        }),
      });

      const data = (await safeJson(response)) as ApplicationResponse;

      if (!response.ok) {
        // REG-COPY-001: Map backend error codes to user-friendly messages
        const errorData = data as { error?: { code?: string; message?: string } };
        const errorCode = errorData.error?.code;
        const errorMsg = errorData.error?.message;

        if (errorCode === 'REGISTRATION_REQUIRED' || errorCode === 'UNAUTHORIZED') {
          setError('Please complete registration to continue.');
        } else {
          setError(errorMsg || 'Failed to submit details. Please try again.');
        }
        return;
      }

      // REG-RET-002: Validate applicationId before proceeding
      if (!data.applicationId) {
        setError('Unable to create application. Please try again.');
        return;
      }

      setApplicationId(data.applicationId);
      localStorage.setItem('retailer_application_id', data.applicationId);
      setStep('documents');
    } catch (err) {
      // REG-RET-002: Improved error handling
      if (err instanceof Error) {
        // Handle network errors specifically
        if (err.message.includes('fetch') || err.message.includes('network')) {
          setError('Network error. Please check your connection and try again.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to submit details. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle document selection
  const handleDocumentSelect = useCallback((docType: string, file: File | null) => {
    if (!file) return;

    // Validate file size (REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001)
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setDocuments(prev => ({
        ...prev,
        [docType]: { ...prev[docType], error: `File size must be less than ${MAX_DOCUMENT_SIZE_LABEL}`, status: 'error' }
      }));
      return;
    }

    // Create preview for images
    let preview: string | null = null;
    if (file.type.startsWith('image/')) {
      preview = URL.createObjectURL(file);
    }

    setDocuments(prev => ({
      ...prev,
      [docType]: { file, preview, status: 'pending', error: undefined }
    }));
  }, []);

  // Upload document to server
  const uploadDocument = async (docType: string, file: File): Promise<boolean> => {
    setDocuments(prev => ({
      ...prev,
      [docType]: { ...prev[docType], status: 'uploading' }
    }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', docType);
      formData.append('applicationId', applicationId);

      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/registration/upload-document', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await safeJson(response);
        throw new Error(data.error?.message || 'Upload failed');
      }

      setDocuments(prev => ({
        ...prev,
        [docType]: { ...prev[docType], status: 'uploaded' }
      }));
      return true;
    } catch (err) {
      setDocuments(prev => ({
        ...prev,
        [docType]: {
          ...prev[docType],
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed'
        }
      }));
      return false;
    }
  };

  // Submit all documents and application
  const handleSubmitDocuments = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate required documents
    const requiredDocs = ['pan_card', 'address_proof'];
    // GSTIN certificate required only if GSTIN provided
    if (gstin.trim()) {
      requiredDocs.push('gstin_certificate');
    }

    for (const docType of requiredDocs) {
      const doc = documents[docType];
      if (!doc.file && doc.status !== 'uploaded') {
        const label = DOCUMENT_TYPES[docType as keyof typeof DOCUMENT_TYPES]?.label || docType;
        setError(`Please upload: ${label}`);
        return;
      }
    }

    setIsLoading(true);

    try {
      // Upload all pending documents
      for (const [docType, doc] of Object.entries(documents)) {
        if (doc.file && doc.status !== 'uploaded') {
          const success = await uploadDocument(docType, doc.file);
          if (!success) {
            setError(`Failed to upload ${DOCUMENT_TYPES[docType as keyof typeof DOCUMENT_TYPES]?.label || docType}`);
            setIsLoading(false);
            return;
          }
        }
      }

      // Submit KYC for review
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/registration/submit-kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });

      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to submit KYC');
      }

      localStorage.setItem('retailer_application_status', 'KYC_SUBMITTED');
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit application. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get step progress
  const getStepNumber = () => {
    switch (step) {
      case 'phone':
      case 'otp':
        return 1;
      case 'details':
        return 2;
      case 'documents':
        return 3;
      default:
        return 0;
    }
  };

  const stepLabels = ['Verify Phone', 'Store Details', 'KYC Documents'];

  return (
    <div className="onb-page">
      {/* Header Bar */}
      <header className="onb-header">
        <div className="onb-header-inner">
          <div className="onb-logo">
            <span className="onb-logo-text">SuperMandi</span>
            <span className="onb-logo-sep">|</span>
            <span className="onb-logo-sub">Retailer Portal</span>
          </div>
{/* REG-RET-001: "Already registered? Sign In" link removed per requirement */}
        </div>
      </header>

      {/* Main Content */}
      <main className="onb-main">
        {/* Page Title */}
        <div className="onb-page-title-wrap">
          <h2 className="onb-page-title">
            {step === 'success' ? 'Application Submitted' : 'Register as Retailer'}
          </h2>
          {step !== 'success' && (
            <p className="onb-page-subtitle">
              Complete the registration form to join SuperMandi as a retail partner
            </p>
          )}
        </div>

        {/* Full-Width Stepper */}
        {step !== 'success' && (
          <div className="onb-card">
            <div className="onb-stepper">
              {stepLabels.map((label, index) => {
                const stepNum = index + 1;
                const isActive = getStepNumber() === stepNum;
                const isCompleted = getStepNumber() > stepNum;

                return (
                  <div key={label} className="onb-step-item">
                    <div className="onb-step-inner">
                      <div className="onb-step-circle" style={{
                        background: isCompleted ? 'var(--success)' : isActive ? 'var(--primary)' : 'var(--border)',
                        color: isCompleted || isActive ? 'white' : 'var(--text-muted)',
                      }}>
                        {isCompleted ? (
                          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          stepNum
                        )}
                      </div>
                      <span className="onb-step-label" style={{
                        color: isActive ? 'var(--primary)' : isCompleted ? 'var(--success)' : 'var(--text-muted)',
                      }}>
                        {label}
                      </span>
                    </div>
                    {index < stepLabels.length - 1 && (
                      <div className="onb-step-line" style={{
                        background: isCompleted ? 'var(--success)' : 'var(--border)',
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Firebase warning */}
        {!isFirebaseReady() && step === 'phone' && (
          <div className="onb-alert-error">
            <strong>Phone Verification Unavailable</strong>
            <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              Registration requires phone verification which is currently unavailable.
              Please try again later or contact support.
            </p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="onb-alert-error">{error}</div>
        )}

        {/* Step 1: Phone Number */}
        {step === 'phone' && (
          <div className="onb-card-centered">
            <h3 className="onb-step-subtitle">
              Verify Your Phone Number
            </h3>
            <p className="onb-step-desc">
              We'll send a one-time password (OTP) to verify your phone number
            </p>

            <form onSubmit={handleSendOtp}>
              <div className="onb-field-wrap">
                <label htmlFor="phone" className="onb-label">Phone Number *</label>
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="onb-input onb-input--lg"
                  placeholder="+91 9876543210"
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              <button
                id="send-otp-button"
                type="submit"
                className="onb-btn-primary"
                disabled={isLoading || !isFirebaseReady()}
              >
                {isLoading ? (
                  <>
                    <span className="onb-spinner" />
                    Sending OTP...
                  </>
                ) : (
                  'Send OTP'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Step 1b: OTP Verification */}
        {step === 'otp' && (
          <div className="onb-card-centered">
            <h3 className="onb-step-subtitle">
              Enter Verification Code
            </h3>
            <p className="onb-step-desc">
              Enter the 6-digit code sent to <strong>{phone}</strong>
            </p>

            <form onSubmit={handleVerifyOtp}>
              <div className="onb-field-wrap">
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="onb-input onb-input--otp"
                  placeholder="------"
                  maxLength={6}
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="onb-btn-primary"
                disabled={isLoading || otp.length !== 6}
              >
                {isLoading ? (
                  <>
                    <span className="onb-spinner" />
                    Verifying...
                  </>
                ) : (
                  'Verify OTP'
                )}
              </button>

              <div className="onb-resend-row">
                <button
                  type="button"
                  className="onb-btn-secondary"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setError('');
                    recaptchaInitialized.current = false;
                  }}
                  disabled={isLoading}
                >
                  Change Phone Number
                </button>

                <button
                  id="resend-otp-button"
                  type="button"
                  className="onb-btn-secondary"
                  style={{
                    color: resendCooldown > 0 ? '#94a3b8' : '#2563eb',
                    fontWeight: 500,
                    cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  }}
                  onClick={handleResendOtp}
                  disabled={isLoading || resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 2: Store Details - Full-width form */}
        {step === 'details' && (
          <form onSubmit={handleSubmitDetails}>
            {/* Phone verified banner */}
            <div className="onb-alert-success">
              <svg width="20" height="20" fill="none" stroke="#22c55e" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Phone verified: <strong>{phone}</strong></span>
            </div>

            {/* Store Identity Section */}
            <div className="onb-card-section">
              <h3 className="onb-section-title">Store Identity</h3>
              <div className="onb-grid-2">
                <div className="onb-grid-full">
                  <label htmlFor="storeName" className="onb-label">Store / Shop Name *</label>
                  <input
                    type="text"
                    id="storeName"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="onb-input"
                    placeholder="Your Store Name"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="gstin" className="onb-label">GSTIN (Optional)</label>
                  <input
                    type="text"
                    id="gstin"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    className="onb-input onb-input--mono"
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                    disabled={isLoading}
                  />
                  <p className="onb-hint">15-character GST Identification Number</p>
                </div>
              </div>
            </div>

            {/* Contact Person Section */}
            <div className="onb-card-section">
              <h3 className="onb-section-title">Contact Person</h3>
              <div className="onb-grid-2">
                <div>
                  <label htmlFor="ownerName" className="onb-label">Owner / Manager Name *</label>
                  <input
                    type="text"
                    id="ownerName"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="onb-input"
                    placeholder="Full name"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="email" className="onb-label">Email (Optional)</label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="onb-input"
                    placeholder="store@example.com"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="onb-label">Phone (Verified)</label>
                  <input
                    type="text"
                    value={phone}
                    className="onb-input onb-input--disabled"
                    disabled
                  />
                </div>
              </div>
            </div>

            {/* Address Section */}
            <div className="onb-card-section">
              <h3 className="onb-section-title">Store Address</h3>
              <div className="onb-grid-2">
                <div className="onb-grid-full">
                  <label htmlFor="addressLine1" className="onb-label">Address Line 1 *</label>
                  <input
                    type="text"
                    id="addressLine1"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    className="onb-input"
                    placeholder="Shop/Building name, Street"
                    disabled={isLoading}
                  />
                </div>

                <div className="onb-grid-full">
                  <label htmlFor="addressLine2" className="onb-label">Address Line 2 (Optional)</label>
                  <input
                    type="text"
                    id="addressLine2"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    className="onb-input"
                    placeholder="Area, Landmark"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="city" className="onb-label">City *</label>
                  <input
                    type="text"
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="onb-input"
                    placeholder="City"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="state" className="onb-label">State *</label>
                  <select
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="onb-select"
                    disabled={isLoading}
                  >
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pincode" className="onb-label">Pincode *</label>
                  <input
                    type="text"
                    id="pincode"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="onb-input onb-input--mono"
                    placeholder="400001"
                    maxLength={6}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            {/* Agreement Section */}
            <div className="onb-card-section">
              <label className="onb-checkbox-label">
                <input
                  type="checkbox"
                  checked={agreement}
                  onChange={(e) => setAgreement(e.target.checked)}
                  className="onb-checkbox"
                  disabled={isLoading}
                />
                <span className="onb-checkbox-text">
                  I confirm that all the details provided are correct and accurate. I agree to the Terms of Service and Privacy Policy. *
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="onb-btn-primary onb-btn-primary--lg"
              disabled={isLoading || !agreement}
            >
              {isLoading ? (
                <>
                  <span className="onb-spinner" />
                  Saving Details...
                </>
              ) : (
                'Continue to Document Upload'
              )}
            </button>
          </form>
        )}

        {/* Step 3: KYC Documents - Full-width form */}
        {step === 'documents' && (
          <form onSubmit={handleSubmitDocuments}>
            {/* Instructions */}
            <div className="onb-alert-info">
              <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Document Upload Guidelines</h4>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li>Supported formats: JPEG, PNG, PDF</li>
                <li>Maximum file size: {MAX_DOCUMENT_SIZE_LABEL} per document</li>
                <li>Ensure documents are clear and readable</li>
              </ul>
            </div>

            {/* PAN Card */}
            <div className="onb-card-section">
              <h3 className="onb-doc-title">
                PAN Card *
              </h3>
              <p className="onb-doc-desc">
                Upload a clear copy of your PAN card
              </p>
              <DocumentUploadField
                docType="pan_card"
                document={documents.pan_card}
                onSelect={(file) => handleDocumentSelect('pan_card', file)}
                accept="image/*,application/pdf"
                disabled={isLoading}
              />
            </div>

            {/* GSTIN Certificate (only if GSTIN provided) */}
            {gstin.trim() && (
              <div className="onb-card-section">
                <h3 className="onb-doc-title">
                  GSTIN Certificate *
                </h3>
                <p className="onb-doc-desc">
                  Upload your GST registration certificate
                </p>
                <DocumentUploadField
                  docType="gstin_certificate"
                  document={documents.gstin_certificate}
                  onSelect={(file) => handleDocumentSelect('gstin_certificate', file)}
                  accept="image/*,application/pdf"
                  disabled={isLoading}
                />
              </div>
            )}

            {/* Address Proof */}
            <div className="onb-card-section">
              <h3 className="onb-doc-title">
                Address Proof *
              </h3>
              <p className="onb-doc-desc">
                Upload utility bill, rent agreement, or shop license as address proof
              </p>
              <DocumentUploadField
                docType="address_proof"
                document={documents.address_proof}
                onSelect={(file) => handleDocumentSelect('address_proof', file)}
                accept="image/*,application/pdf"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="onb-btn-primary onb-btn-primary--lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="onb-spinner" />
                  Submitting Application...
                </>
              ) : (
                'Submit Application'
              )}
            </button>
          </form>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <div className="onb-card-centered onb-success-card">
            <div className="onb-success-icon">
              <svg width="40" height="40" fill="none" stroke="#d97706" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="onb-success-title">
              Pending Verification
            </h3>
            <p className="onb-success-text">
              Your retailer application has been submitted for review.
              You will receive a notification once your account is approved.
            </p>
            <div className="onb-success-app-id">
              <p className="onb-success-app-label">Application ID</p>
              <p className="onb-success-app-value">{applicationId}</p>
            </div>
            <button
              className="onb-btn-primary"
              onClick={() => navigate('/retailer/login')}
            >
              Go to Login
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="onb-footer">
        <div className="onb-footer-inner">
          &copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd. All rights reserved.
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}

// Document upload field component
function DocumentUploadField({
  docType: _docType,
  document,
  onSelect,
  accept,
  disabled,
}: {
  docType: string;
  document: DocumentUpload;
  onSelect: (file: File | null) => void;
  accept: string;
  disabled?: boolean;
}) {
  const dropzoneClass = `onb-doc-dropzone${disabled ? ' onb-doc-dropzone--disabled' : ''}${document.status === 'uploaded' ? ' onb-doc-dropzone--uploaded' : ''}`;

  return (
    <div>
      <label className={dropzoneClass}>
        <input
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => onSelect(e.target.files?.[0] || null)}
          disabled={disabled}
        />
        {document.status === 'uploading' ? (
          <div style={{ textAlign: 'center' }}>
            <span className="onb-doc-spinner" />
            <p className="onb-doc-status-text">Uploading...</p>
          </div>
        ) : document.file || document.status === 'uploaded' ? (
          <div style={{ textAlign: 'center' }}>
            <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginBottom: '0.5rem', color: 'var(--success)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="onb-doc-file-name">{document.file?.name || 'Uploaded'}</p>
            <p className="onb-doc-replace-text">Click to replace</p>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="onb-doc-upload-text">Click to upload</p>
            <p className="onb-doc-hint-text">or drag and drop</p>
          </div>
        )}
      </label>

      {document.preview && (
        <div className="onb-doc-preview">
          <img
            src={document.preview}
            alt="Preview"
          />
        </div>
      )}

      {document.error && (
        <p className="onb-doc-error">{document.error}</p>
      )}
    </div>
  );
}
