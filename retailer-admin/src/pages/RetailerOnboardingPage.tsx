import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_GATEWAY_BASE } from '../lib/api';
import { setupRecaptcha, sendOtp as firebaseSendOtp, verifyOtp as firebaseVerifyOtp, isFirebaseReady, cleanup } from '../lib/firebase';

// REG-AUTH-301: Registration-First Onboarding for New Retailers
// Flow: Business Details → Phone OTP → KYC Documents → Success

type Step = 'business' | 'phone' | 'otp' | 'kyc' | 'success';

// GSTIN validation: 15 characters, specific pattern
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function validateGSTIN(gstin: string): string | null {
  if (!gstin) return 'GSTIN is required';
  const normalized = gstin.toUpperCase().replace(/\s/g, '');
  if (normalized.length !== 15) return 'GSTIN must be 15 characters';
  if (!GSTIN_REGEX.test(normalized)) return 'Invalid GSTIN format';
  return null;
}

// Pincode validation: 6 digits
function validatePincode(pincode: string): string | null {
  if (!pincode) return 'Pincode is required';
  if (!/^\d{6}$/.test(pincode)) return 'Pincode must be 6 digits';
  return null;
}

interface ApplicationResponse {
  success: boolean;
  applicationId: string;
  status: string;
  message?: string;
  action?: 'CREATED' | 'RESUMED';
}

// GO-LIVE-AUTH-FIX: StatusResponse interface removed (unused in current flow)

export default function RetailerOnboardingPage() {
  const navigate = useNavigate();

  // Form state
  const [step, setStep] = useState<Step>('business');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Business details (Step 1)
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // Phone verification (Step 2-3)
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const recaptchaInitialized = useRef(false);

  // Application state
  const [applicationId, setApplicationId] = useState('');
  const [applicationStatus, setApplicationStatus] = useState('');
  // GO-LIVE-AUTH-FIX: Store code kept for future display in success step
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_approvedStoreCode, setApprovedStoreCode] = useState('');

  // KYC documents (Step 4)
  const [panFile, setPanFile] = useState<File | null>(null);
  const [gstinFile, setGstinFile] = useState<File | null>(null);
  const [addressProofFile, setAddressProofFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, boolean>>({});

  // Setup reCAPTCHA when on phone step
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
      if (step !== 'phone' && step !== 'otp') {
        cleanup();
        recaptchaInitialized.current = false;
      }
    };
  }, [step]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Check if GSTIN already exists and create/resume application
  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate all fields
    if (!storeName.trim()) {
      setError('Store name is required');
      return;
    }
    if (!ownerName.trim()) {
      setError('Owner name is required');
      return;
    }
    const gstinError = validateGSTIN(gstin);
    if (gstinError) {
      setError(gstinError);
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
    if (!state.trim()) {
      setError('State is required');
      return;
    }
    const pincodeError = validatePincode(pincode);
    if (pincodeError) {
      setError(pincodeError);
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required');
      return;
    }

    setIsLoading(true);

    try {
      // REG-AUTH-201: First check if GSTIN already exists
      const checkResponse = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/registration/check-gstin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gstin: gstin.toUpperCase() }),
      });

      const checkData = await checkResponse.json();

      if (checkData.exists && checkData.applicationId) {
        // GSTIN exists - resume existing application
        setApplicationId(checkData.applicationId);
        setApplicationStatus(checkData.status);

        if (checkData.status === 'ACTIVE' && checkData.storeCode) {
          // Already approved - redirect to login
          setApprovedStoreCode(checkData.storeCode);
          setStep('success');
        } else {
          // Resume - go to phone verification
          setStep('phone');
        }
        return;
      }

      // Create new application
      const createResponse = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/registration/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/[\s-]/g, ''),
          email: email.trim().toLowerCase() || undefined,
          storeName: storeName.trim(),
          ownerName: ownerName.trim(),
          gstin: gstin.toUpperCase(),
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim() || undefined,
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
        }),
      });

      const createData = await createResponse.json() as ApplicationResponse;

      if (!createResponse.ok) {
        throw new Error(createData.message || 'Failed to create application');
      }

      setApplicationId(createData.applicationId);
      setApplicationStatus(createData.status);
      setStep('phone');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Send OTP to phone
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!isFirebaseReady()) {
        throw new Error('Phone verification is currently unavailable.');
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

  // Verify OTP and link to application
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Verify OTP with Firebase
      const idToken = await firebaseVerifyOtp(otp);

      // REG-AUTH-201: Exchange Firebase token with backend (requires applicationId!)
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/registration/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          applicationId,  // CRITICAL: Must include applicationId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Verification failed');
      }

      // Store application info locally
      localStorage.setItem('retailer_application_id', applicationId);
      localStorage.setItem('retailer_application_status', data.status || 'DRAFT');

      setApplicationStatus(data.status || 'DRAFT');

      // Move to KYC step
      setStep('kyc');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Upload a single document
  const uploadDocument = async (file: File, documentType: string): Promise<boolean> => {
    try {
      setUploadProgress(prev => ({ ...prev, [documentType]: true }));

      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      formData.append('entityType', 'retailer_application');
      formData.append('entityId', applicationId);

      const response = await fetch(API_GATEWAY_BASE + '/api/v1/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || `Failed to upload ${documentType}`);
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to upload ${documentType}`);
      return false;
    } finally {
      setUploadProgress(prev => ({ ...prev, [documentType]: false }));
    }
  };

  // Submit KYC documents
  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate all required documents
    if (!panFile) {
      setError('PAN card image is required');
      return;
    }
    if (!gstinFile) {
      setError('GSTIN certificate is required');
      return;
    }
    if (!addressProofFile) {
      setError('Address proof is required');
      return;
    }

    setIsLoading(true);

    try {
      // Upload all documents
      const panSuccess = await uploadDocument(panFile, 'PAN');
      if (!panSuccess) return;

      const gstinSuccess = await uploadDocument(gstinFile, 'GSTIN_CERTIFICATE');
      if (!gstinSuccess) return;

      const addressSuccess = await uploadDocument(addressProofFile, 'ADDRESS_PROOF');
      if (!addressSuccess) return;

      // Submit KYC
      const response = await fetch(API_GATEWAY_BASE + '/api/v1/retailer-admin/registration/submit-kyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to submit KYC');
      }

      setApplicationStatus('KYC_SUBMITTED');
      localStorage.setItem('retailer_application_status', 'KYC_SUBMITTED');
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'KYC submission failed. Please try again.');
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

  // File input handler
  const handleFileChange = (setter: (file: File | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        setError('Only JPEG, PNG, WebP, or PDF files are allowed');
        return;
      }
      setError('');
    }
    setter(file);
  };

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: step === 'business' || step === 'kyc' ? '480px' : '400px' }}>
        <h1 className="login-title">SuperMandi</h1>
        <p className="login-subtitle">
          {step === 'business' && 'Register Your Store'}
          {step === 'phone' && 'Verify Your Phone'}
          {step === 'otp' && 'Enter OTP'}
          {step === 'kyc' && 'Upload Documents'}
          {step === 'success' && 'Registration Complete'}
        </p>

        {/* Progress indicator */}
        {step !== 'success' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {['business', 'phone', 'otp', 'kyc'].map((s, i) => (
              <div
                key={s}
                style={{
                  width: '2rem',
                  height: '4px',
                  borderRadius: '2px',
                  background: ['business', 'phone', 'otp', 'kyc'].indexOf(step) >= i ? '#2563eb' : '#e5e7eb',
                }}
              />
            ))}
          </div>
        )}

        {/* Firebase warning */}
        {!isFirebaseReady() && (step === 'phone' || step === 'otp') && (
          <div style={{
            background: '#fee2e2',
            border: '1px solid #ef4444',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            <strong>Phone Verification Unavailable</strong>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
              Phone verification is currently unavailable. Please try again later.
            </p>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {/* Step 1: Business Details */}
        {step === 'business' && (
          <form onSubmit={handleBusinessSubmit}>
            <div className="form-group">
              <label className="form-label">Store Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Your Store Name"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Owner Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Full Name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">GSTIN *</label>
              <input
                type="text"
                className="form-input"
                placeholder="22AAAAA0000A1Z5"
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                maxLength={15}
                required
                style={{ textTransform: 'uppercase' }}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                15-character GST Identification Number
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+91 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email (Optional)</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Address Line 1 *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Shop/Building name, Street"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Address Line 2</label>
              <input
                type="text"
                className="form-input"
                placeholder="Area, Landmark (Optional)"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">City *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">State *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="State"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Pincode *</label>
              <input
                type="text"
                className="form-input"
                placeholder="123456"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={isLoading}
            >
              {isLoading ? 'Checking...' : 'Continue'}
            </button>

            <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280', marginTop: '1rem' }}>
              Already registered?{' '}
              <Link to="/retailer/login" style={{ color: '#2563eb' }}>
                Login
              </Link>
            </p>
          </form>
        )}

        {/* Step 2: Phone - Send OTP */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp}>
            <div style={{ background: '#ecfdf5', color: '#059669', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
              Application created! Now verify your phone number.
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                value={phone}
                readOnly
                style={{ background: '#f3f4f6' }}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                We'll send an OTP to verify this number
              </p>
            </div>

            <button
              id="send-otp-button"
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              disabled={isLoading || !isFirebaseReady()}
            >
              {isLoading ? 'Sending OTP...' : 'Send OTP'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => setStep('business')}
            >
              Back
            </button>
          </form>
        )}

        {/* Step 3: OTP Verification */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Enter the 6-digit code sent to {phone}
              </p>
              <input
                type="text"
                className="form-input"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={{ letterSpacing: '0.5rem', textAlign: 'center', fontSize: '1.25rem' }}
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              disabled={isLoading || otp.length !== 6}
            >
              {isLoading ? 'Verifying...' : 'Verify OTP'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setOtp('');
                  recaptchaInitialized.current = false;
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
                disabled={isLoading}
              >
                Back
              </button>

              <button
                id="resend-otp-button"
                type="button"
                onClick={handleResendOtp}
                style={{
                  background: 'none',
                  border: 'none',
                  color: resendCooldown > 0 ? '#9ca3af' : '#2563eb',
                  fontSize: '0.875rem',
                  cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  padding: 0,
                }}
                disabled={isLoading || resendCooldown > 0}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
              </button>
            </div>
          </form>
        )}

        {/* Step 4: KYC Documents */}
        {step === 'kyc' && (
          <form onSubmit={handleKycSubmit}>
            <div style={{ background: '#ecfdf5', color: '#059669', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
              Phone verified! Now upload your KYC documents.
            </div>

            <div className="form-group">
              <label className="form-label">PAN Card *</label>
              <input
                type="file"
                className="form-input"
                accept="image/*,.pdf"
                onChange={handleFileChange(setPanFile)}
                required
              />
              {panFile && (
                <p style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem' }}>
                  ✓ {panFile.name}
                </p>
              )}
              {uploadProgress['PAN'] && (
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Uploading...
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">GSTIN Certificate *</label>
              <input
                type="file"
                className="form-input"
                accept="image/*,.pdf"
                onChange={handleFileChange(setGstinFile)}
                required
              />
              {gstinFile && (
                <p style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem' }}>
                  ✓ {gstinFile.name}
                </p>
              )}
              {uploadProgress['GSTIN_CERTIFICATE'] && (
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Uploading...
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Address Proof *</label>
              <input
                type="file"
                className="form-input"
                accept="image/*,.pdf"
                onChange={handleFileChange(setAddressProofFile)}
                required
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Utility bill, rent agreement, or bank statement
              </p>
              {addressProofFile && (
                <p style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem' }}>
                  ✓ {addressProofFile.name}
                </p>
              )}
              {uploadProgress['ADDRESS_PROOF'] && (
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Uploading...
                </p>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={isLoading || !panFile || !gstinFile || !addressProofFile}
            >
              {isLoading ? 'Submitting...' : 'Submit Documents'}
            </button>
          </form>
        )}

        {/* Step 5: Success */}
        {step === 'success' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '64px',
              height: '64px',
              background: applicationStatus === 'ACTIVE' ? '#ecfdf5' : '#fef3c7',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              fontSize: '2rem',
            }}>
              {applicationStatus === 'ACTIVE' ? '✓' : '⏳'}
            </div>

            {applicationStatus === 'ACTIVE' ? (
              <>
                <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#059669' }}>
                  Registration Approved!
                </h2>
                <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
                  Your store has been approved. You can now login and start using SuperMandi.
                </p>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => navigate('/retailer/login')}
                >
                  Go to Login
                </button>
              </>
            ) : (
              <>
                <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#d97706' }}>
                  Application Submitted
                </h2>
                <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                  Your application is pending approval. Our team will review your documents and notify you once approved.
                </p>

                <div style={{
                  background: '#f3f4f6',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                  textAlign: 'left',
                }}>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.25rem' }}>Application ID</p>
                  <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', margin: 0 }}>{applicationId}</p>

                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '1rem 0 0.25rem' }}>Status</p>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.5rem',
                    background: '#fef3c7',
                    color: '#92400e',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                  }}>
                    {applicationStatus}
                  </span>
                </div>

                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                  You can check your application status anytime by logging in.
                </p>

                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => navigate('/retailer/login')}
                >
                  Go to Login
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
