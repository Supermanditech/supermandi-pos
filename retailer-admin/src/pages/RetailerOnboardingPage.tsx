import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_GATEWAY_BASE } from '../lib/api';
import { setupRecaptcha, sendOtp as firebaseSendOtp, verifyOtp as firebaseVerifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';
import { BuildStamp } from '../components/BuildStamp';

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

// UI-SPEC: Stripe-level infrastructure design system
const styles = {
  // Layout - solid neutral background per spec
  pageContainer: {
    minHeight: '100vh',
    background: '#F7F9FC',
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    background: 'white',
    borderBottom: '1px solid #e2e8f0',
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
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
  headerLink: {
    fontSize: '0.875rem',
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 500,
  },
  main: {
    maxWidth: '1024px',
    margin: '0 auto',
    padding: '2rem 1rem',
    flex: 1,
    width: '100%',
  },
  footer: {
    borderTop: '1px solid #e2e8f0',
    background: 'white',
    marginTop: 'auto',
  },
  footerInner: {
    maxWidth: '1152px',
    margin: '0 auto',
    padding: '1rem 1.5rem',
    textAlign: 'center' as const,
    fontSize: '0.8125rem',
    color: '#64748b',
  },
  // Cards - white with subtle shadow per spec
  card: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    padding: '1.5rem 2rem',
    marginBottom: '1.5rem',
  },
  cardCentered: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    padding: '2rem',
    maxWidth: '512px',
    margin: '0 auto 1.5rem',
  },
  cardSection: {
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    padding: '1.5rem 2rem',
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontSize: '1.125rem',
    fontWeight: 600,
    color: '#0F172A',
    marginBottom: '1.5rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #e2e8f0',
  },
  // Typography per spec scale
  pageTitle: {
    fontSize: '1.75rem',
    fontWeight: 600,
    color: '#0F172A',
    textAlign: 'center' as const,
    marginBottom: '0.5rem',
  },
  pageSubtitle: {
    color: '#64748b',
    textAlign: 'center' as const,
    marginBottom: '2rem',
  },
  // Form - 40-44px height per spec
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
    transition: 'border-color 0.15s, box-shadow 0.15s',
    boxSizing: 'border-box' as const,
  },
  inputDisabled: {
    background: '#f8fafc',
    cursor: 'not-allowed',
  },
  select: {
    width: '100%',
    height: '42px',
    padding: '0 1rem',
    fontSize: '0.9375rem',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    outline: 'none',
    background: 'white',
    cursor: 'pointer',
    boxSizing: 'border-box' as const,
  },
  inputHint: {
    fontSize: '0.8125rem',
    color: '#64748b',
    marginTop: '0.25rem',
  },
  // Buttons - 44-48px height per spec
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'background 0.15s',
  },
  btnPrimaryDisabled: {
    background: '#93c5fd',
    cursor: 'not-allowed',
  },
  btnSecondary: {
    height: '46px',
    padding: '0 1rem',
    fontSize: '0.875rem',
    color: '#64748b',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  // Alerts - soft background per spec
  alertError: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    padding: '1rem 1.5rem',
    borderRadius: '6px',
    marginBottom: '1.5rem',
    fontSize: '0.875rem',
  },
  alertSuccess: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    color: '#15803d',
    padding: '1rem 1.5rem',
    borderRadius: '6px',
    marginBottom: '1.5rem',
    fontSize: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  alertInfo: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    color: '#1e40af',
    padding: '1rem 1.5rem',
    borderRadius: '6px',
    marginBottom: '1.5rem',
    fontSize: '0.875rem',
  },
  // Grid
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1.5rem',
  },
  gridFull: {
    gridColumn: '1 / -1',
  },
  // Checkbox
  checkbox: {
    width: '1.25rem',
    height: '1.25rem',
    marginTop: '0.125rem',
    cursor: 'pointer',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    cursor: 'pointer',
  },
};

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

  // Setup reCAPTCHA on mount
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

      const data: ApplicationResponse = await response.json();

      if (!response.ok) {
        throw new Error((data as { error?: { message?: string } }).error?.message || 'Failed to submit details');
      }

      setApplicationId(data.applicationId);
      localStorage.setItem('retailer_application_id', data.applicationId);
      setStep('documents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle document selection
  const handleDocumentSelect = useCallback((docType: string, file: File | null) => {
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setDocuments(prev => ({
        ...prev,
        [docType]: { ...prev[docType], error: 'File size must be less than 5MB', status: 'error' }
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
        const data = await response.json();
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

      const data = await response.json();

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
    <div style={styles.pageContainer}>
      {/* Header Bar */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoText}>SuperManditech</span>
            <span style={styles.logoSeparator}>|</span>
            <span style={styles.logoSubtext}>Retailer Portal</span>
          </div>
          <Link to="/retailer/login" style={styles.headerLink}>
            Already registered? Sign In
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Page Title */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={styles.pageTitle}>
            {step === 'success' ? 'Application Submitted' : 'Register as Retailer'}
          </h2>
          {step !== 'success' && (
            <p style={styles.pageSubtitle}>
              Complete the registration form to join SuperManditech as a retail partner
            </p>
          )}
        </div>

        {/* Full-Width Stepper */}
        {step !== 'success' && (
          <div style={styles.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {stepLabels.map((label, index) => {
                const stepNum = index + 1;
                const isActive = getStepNumber() === stepNum;
                const isCompleted = getStepNumber() > stepNum;

                return (
                  <div key={label} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{
                        width: '2.125rem',
                        height: '2.125rem',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        background: isCompleted ? '#22c55e' : isActive ? '#2563eb' : '#e2e8f0',
                        color: isCompleted || isActive ? 'white' : '#64748b',
                        transition: 'background 0.2s',
                      }}>
                        {isCompleted ? (
                          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          stepNum
                        )}
                      </div>
                      <span style={{
                        marginLeft: '0.75rem',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: isActive ? '#2563eb' : isCompleted ? '#22c55e' : '#64748b',
                      }}>
                        {label}
                      </span>
                    </div>
                    {index < stepLabels.length - 1 && (
                      <div style={{
                        flex: 1,
                        height: '4px',
                        margin: '0 1rem',
                        borderRadius: '2px',
                        background: isCompleted ? '#22c55e' : '#e2e8f0',
                        transition: 'background 0.2s',
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
          <div style={styles.alertError}>
            <strong>Phone Verification Unavailable</strong>
            <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              Registration requires phone verification which is currently unavailable.
              Please try again later or contact support.
            </p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div style={styles.alertError}>{error}</div>
        )}

        {/* Step 1: Phone Number */}
        {step === 'phone' && (
          <div style={styles.cardCentered}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>
              Verify Your Phone Number
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              We'll send a one-time password (OTP) to verify your phone number
            </p>

            <form onSubmit={handleSendOtp}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="phone" style={styles.label}>Phone Number *</label>
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ ...styles.input, fontSize: '1.125rem' }}
                  placeholder="+91 9876543210"
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
                {isLoading ? (
                  <>
                    <span style={{
                      width: '1.25rem',
                      height: '1.25rem',
                      border: '2px solid white',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }} />
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
          <div style={styles.cardCentered}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>
              Enter Verification Code
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Enter the 6-digit code sent to <strong>{phone}</strong>
            </p>

            <form onSubmit={handleVerifyOtp}>
              <div style={{ marginBottom: '1.5rem' }}>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{
                    ...styles.input,
                    textAlign: 'center',
                    fontSize: '1.5rem',
                    letterSpacing: '0.5em',
                    fontFamily: 'monospace',
                  }}
                  placeholder="------"
                  maxLength={6}
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                style={{
                  ...styles.btnPrimary,
                  ...(isLoading || otp.length !== 6 ? styles.btnPrimaryDisabled : {}),
                }}
                disabled={isLoading || otp.length !== 6}
              >
                {isLoading ? (
                  <>
                    <span style={{
                      width: '1.25rem',
                      height: '1.25rem',
                      border: '2px solid white',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }} />
                    Verifying...
                  </>
                ) : (
                  'Verify OTP'
                )}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                <button
                  type="button"
                  style={styles.btnSecondary}
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
                  style={{
                    ...styles.btnSecondary,
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
            <div style={styles.alertSuccess}>
              <svg width="20" height="20" fill="none" stroke="#22c55e" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Phone verified: <strong>{phone}</strong></span>
            </div>

            {/* Store Identity Section */}
            <div style={styles.cardSection}>
              <h3 style={styles.sectionTitle}>Store Identity</h3>
              <div style={styles.grid2}>
                <div style={styles.gridFull}>
                  <label htmlFor="storeName" style={styles.label}>Store / Shop Name *</label>
                  <input
                    type="text"
                    id="storeName"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    style={styles.input}
                    placeholder="Your Store Name"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="gstin" style={styles.label}>GSTIN (Optional)</label>
                  <input
                    type="text"
                    id="gstin"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    style={{ ...styles.input, fontFamily: 'monospace' }}
                    placeholder="22AAAAA0000A1Z5"
                    maxLength={15}
                    disabled={isLoading}
                  />
                  <p style={styles.inputHint}>15-character GST Identification Number</p>
                </div>
              </div>
            </div>

            {/* Contact Person Section */}
            <div style={styles.cardSection}>
              <h3 style={styles.sectionTitle}>Contact Person</h3>
              <div style={styles.grid2}>
                <div>
                  <label htmlFor="ownerName" style={styles.label}>Owner / Manager Name *</label>
                  <input
                    type="text"
                    id="ownerName"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    style={styles.input}
                    placeholder="Full name"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="email" style={styles.label}>Email (Optional)</label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={styles.input}
                    placeholder="store@example.com"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label style={styles.label}>Phone (Verified)</label>
                  <input
                    type="text"
                    value={phone}
                    style={{ ...styles.input, ...styles.inputDisabled }}
                    disabled
                  />
                </div>
              </div>
            </div>

            {/* Address Section */}
            <div style={styles.cardSection}>
              <h3 style={styles.sectionTitle}>Store Address</h3>
              <div style={styles.grid2}>
                <div style={styles.gridFull}>
                  <label htmlFor="addressLine1" style={styles.label}>Address Line 1 *</label>
                  <input
                    type="text"
                    id="addressLine1"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    style={styles.input}
                    placeholder="Shop/Building name, Street"
                    disabled={isLoading}
                  />
                </div>

                <div style={styles.gridFull}>
                  <label htmlFor="addressLine2" style={styles.label}>Address Line 2 (Optional)</label>
                  <input
                    type="text"
                    id="addressLine2"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    style={styles.input}
                    placeholder="Area, Landmark"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="city" style={styles.label}>City *</label>
                  <input
                    type="text"
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    style={styles.input}
                    placeholder="City"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label htmlFor="state" style={styles.label}>State *</label>
                  <select
                    id="state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    style={styles.select}
                    disabled={isLoading}
                  >
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pincode" style={styles.label}>Pincode *</label>
                  <input
                    type="text"
                    id="pincode"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{ ...styles.input, fontFamily: 'monospace' }}
                    placeholder="400001"
                    maxLength={6}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            {/* Agreement Section */}
            <div style={styles.cardSection}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={agreement}
                  onChange={(e) => setAgreement(e.target.checked)}
                  style={styles.checkbox}
                  disabled={isLoading}
                />
                <span style={{ color: '#334155' }}>
                  I confirm that all the details provided are correct and accurate. I agree to the Terms of Service and Privacy Policy. *
                </span>
              </label>
            </div>

            <button
              type="submit"
              style={{
                ...styles.btnPrimary,
                padding: '1rem 1.5rem',
                ...(isLoading || !agreement ? styles.btnPrimaryDisabled : {}),
              }}
              disabled={isLoading || !agreement}
            >
              {isLoading ? (
                <>
                  <span style={{
                    width: '1.25rem',
                    height: '1.25rem',
                    border: '2px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
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
            <div style={styles.alertInfo}>
              <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Document Upload Guidelines</h4>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li>Supported formats: JPEG, PNG, PDF</li>
                <li>Maximum file size: 5MB per document</li>
                <li>Ensure documents are clear and readable</li>
              </ul>
            </div>

            {/* PAN Card */}
            <div style={styles.cardSection}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>
                PAN Card *
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
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
              <div style={styles.cardSection}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>
                  GSTIN Certificate *
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
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
            <div style={styles.cardSection}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>
                Address Proof *
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
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
              style={{
                ...styles.btnPrimary,
                padding: '1rem 1.5rem',
                ...(isLoading ? styles.btnPrimaryDisabled : {}),
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span style={{
                    width: '1.25rem',
                    height: '1.25rem',
                    border: '2px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
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
          <div style={{ ...styles.cardCentered, maxWidth: '560px', textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{
              width: '5rem',
              height: '5rem',
              background: '#fef3c7',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
            }}>
              <svg width="40" height="40" fill="none" stroke="#d97706" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#d97706', marginBottom: '0.75rem' }}>
              Pending Verification
            </h3>
            <p style={{ color: '#475569', marginBottom: '1.5rem', fontSize: '1.125rem' }}>
              Your retailer application has been submitted for review.
              You will receive a notification once your account is approved.
            </p>
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '1rem', marginBottom: '2rem' }}>
              <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem' }}>Application ID</p>
              <p style={{ fontFamily: 'monospace', color: '#0F172A' }}>{applicationId}</p>
            </div>
            <button
              style={styles.btnPrimary}
              onClick={() => navigate('/retailer/login')}
            >
              Go to Login
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          &copy; 2026 SuperManditech. All rights reserved.
          <BuildStamp />
        </div>
      </footer>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
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
  return (
    <div>
      <label style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: '2rem 1.5rem',
        border: '2px dashed #cbd5e1',
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        background: document.status === 'uploaded' ? '#f0fdf4' : 'transparent',
        borderColor: document.status === 'uploaded' ? '#86efac' : '#cbd5e1',
      }}>
        <input
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(e) => onSelect(e.target.files?.[0] || null)}
          disabled={disabled}
        />
        {document.status === 'uploading' ? (
          <div style={{ textAlign: 'center' }}>
            <span style={{
              display: 'inline-block',
              width: '2rem',
              height: '2rem',
              border: '2px solid #2563eb',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '0.5rem',
            }} />
            <p style={{ color: '#64748b' }}>Uploading...</p>
          </div>
        ) : document.file || document.status === 'uploaded' ? (
          <div style={{ textAlign: 'center' }}>
            <svg width="32" height="32" fill="none" stroke="#22c55e" viewBox="0 0 24 24" style={{ marginBottom: '0.5rem' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p style={{ color: '#22c55e', fontWeight: 500 }}>{document.file?.name || 'Uploaded'}</p>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem' }}>Click to replace</p>
          </div>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <svg width="40" height="40" fill="none" stroke="#94a3b8" viewBox="0 0 24 24" style={{ marginBottom: '0.75rem' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p style={{ color: '#475569', fontWeight: 500 }}>Click to upload</p>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>or drag and drop</p>
          </div>
        )}
      </label>

      {document.preview && (
        <div style={{ marginTop: '1rem' }}>
          <img
            src={document.preview}
            alt="Preview"
            style={{ maxWidth: '100%', height: '6rem', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0' }}
          />
        </div>
      )}

      {document.error && (
        <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.5rem' }}>{document.error}</p>
      )}
    </div>
  );
}
