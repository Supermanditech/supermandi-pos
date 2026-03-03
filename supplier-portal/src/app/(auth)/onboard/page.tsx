'use client';

// REG-AUTH-302: Registration-First Onboarding for New Suppliers
// Flow: Business Details → Phone OTP → KYC Documents → Success

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
// STG-361: Prevent accidental navigation losing multi-step form data
import { useUnsavedChanges } from '@/hooks/useNavigationSafety';
// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
import { MAX_KYC_DOCUMENT_SIZE_BYTES, MAX_KYC_DOCUMENT_SIZE_LABEL } from '@/lib/fileLimits';
import {
  createSupplierApplication,
  verifySupplierOtp,
  submitSupplierKyc,
  uploadSupplierDocument,
  hasAuthCookie,
  ApiError,
} from '@/lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '@/lib/firebase';

type Step = 'business' | 'phone' | 'otp' | 'kyc' | 'success';

// GSTIN validation: 15 characters, specific pattern
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$/;

function validateGSTIN(gstin: string): string | null {
  if (!gstin) return 'GSTIN is required';
  const normalized = gstin.toUpperCase().replace(/\s/g, '');
  if (normalized.length !== 15) return 'GSTIN must be 15 characters';
  if (!GSTIN_REGEX.test(normalized)) return 'Invalid GSTIN format';
  return null;
}

function validatePincode(pincode: string): string | null {
  if (!pincode) return null; // Optional for suppliers
  if (!/^\d{6}$/.test(pincode)) return 'Pincode must be 6 digits';
  return null;
}

export default function SupplierOnboardingPage() {
  const router = useRouter();

  // AUDIT-SUP-001: Redirect authenticated users to dashboard
  // FIX-023: Use cookie check instead of in-memory token (survives page reload)
  useEffect(() => {
    if (hasAuthCookie()) {
      router.replace('/dashboard');
    }
  }, [router]);

  // Form state
  const [step, setStep] = useState<Step>('business');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Business details (Step 1)
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // Bank details (optional at registration)
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [upiVpa, setUpiVpa] = useState('');

  // Phone verification (Step 2-3)
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  // STG-462: OTP expiry countdown (Firebase OTP expires in 5 min)
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const recaptchaInitialized = useRef(false);

  // Application state
  const [applicationId, setApplicationId] = useState('');
  const [applicationStatus, setApplicationStatus] = useState('');

  // KYC documents (Step 4)
  const [panFile, setPanFile] = useState<File | null>(null);
  const [gstinFile, setGstinFile] = useState<File | null>(null);
  const [addressProofFile, setAddressProofFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, boolean>>({});

  // Track if component has mounted (for SSR compatibility)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // STG-361: Prevent accidental navigation losing multi-step onboard form data (parity with Register page)
  const hasUnsavedData = useMemo(
    () => (step === 'business' || step === 'phone' || step === 'otp' || step === 'kyc') && (businessName !== '' || ownerName !== '' || email !== '' || gstin !== ''),
    [step, businessName, ownerName, email, gstin],
  );
  useUnsavedChanges(hasUnsavedData);

  // Setup reCAPTCHA when on phone step
  // STG-722: Gate on `mounted` — button must exist in DOM after hydration
  useEffect(() => {
    if (mounted && isFirebaseReady() && !recaptchaInitialized.current && step === 'phone') {
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
  }, [mounted, step]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // STG-462: OTP expiry countdown
  useEffect(() => {
    if (otpExpirySeconds > 0) {
      const timer = setTimeout(() => setOtpExpirySeconds(otpExpirySeconds - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpExpirySeconds]);

  // Check GSTIN and create/resume application
  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate required fields
    if (!businessName.trim()) {
      setError('Business name is required');
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
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Valid email address is required');
      return;
    }
    if (!phone.trim()) {
      setError('Phone number is required');
      return;
    }
    const pincodeError = validatePincode(pincode);
    if (pincodeError) {
      setError(pincodeError);
      return;
    }

    setIsLoading(true);

    try {
      // Combined: Create application (backend handles GSTIN uniqueness check)
      const createResult = await createSupplierApplication({
        phone: phone.replace(/[\s-]/g, ''),
        email: email.trim().toLowerCase(),
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        gstin: gstin.toUpperCase(),
        addressLine1: addressLine1.trim() || undefined,
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        bankIfsc: bankIfsc.toUpperCase().trim() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        upiVpa: upiVpa.toLowerCase().trim() || undefined,
      });

      const appId = createResult.application?.id || createResult.applicationId;
      if (!appId || typeof appId !== 'string') {
        throw new Error('Server returned an unexpected response. Please try again.');
      }
      setApplicationId(appId);
      setApplicationStatus(createResult.application?.status || createResult.status || '');
      toast.success('Application created!');
      setStep('phone');
    } catch (err) {
      if (err instanceof ApiError) {
        // Handle GSTIN already exists — resume existing application
        const apiErr = err as ApiError & { applicationId?: string; applicationStatus?: string };
        if ((err.code === 'GSTIN_EXISTS' || err.code === 'APPLICATION_EXISTS') && apiErr.applicationId) {
          setApplicationId(apiErr.applicationId);
          setApplicationStatus(apiErr.applicationStatus || 'DRAFT');
          if (apiErr.applicationStatus === 'ACTIVE') {
            toast.success('Your account is already approved! Redirecting to login...');
            setTimeout(() => router.push('/login'), 2000);
            return;
          }
          toast.success('Existing application found. Continuing...');
          setStep('phone');
          return;
        }
        setError(err.message);
      } else {
        setError('Failed to submit. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (!isFirebaseReady()) {
        throw new Error('Phone verification is currently unavailable.');
      }

      await sendOtp(phone);
      setStep('otp');
      setResendCooldown(60);
      setOtpExpirySeconds(300); // STG-462: 5 min expiry
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP.');
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
      const idToken = await verifyOtp(otp);

      // Exchange with backend (CRITICAL: includes applicationId!)
      const result = await verifySupplierOtp(idToken, applicationId);

      // Store application info in session (cleared on tab close, not persisted across sessions)
      sessionStorage.setItem('supplier_application_id', applicationId);
      sessionStorage.setItem('supplier_application_status', result.status || 'DRAFT');

      setApplicationStatus(result.status || 'DRAFT');
      toast.success('Phone verified!');
      setStep('kyc');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Verification failed.');
      }
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

      await sendOtp(phone);
      setResendCooldown(60);
      setOtpExpirySeconds(300); // STG-462: Reset 5 min expiry
      toast.success('OTP sent!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  // Upload a single document
  const uploadDocument = async (file: File, documentType: string): Promise<boolean> => {
    try {
      setUploadProgress(prev => ({ ...prev, [documentType]: true }));
      await uploadSupplierDocument(applicationId, documentType, file);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(`Failed to upload ${documentType}`);
      }
      return false;
    } finally {
      setUploadProgress(prev => ({ ...prev, [documentType]: false }));
    }
  };

  // Submit KYC documents
  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!panFile) {
      setError('PAN card is required');
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
      // STG-073: Backend expects lowercase document type keys
      const panSuccess = await uploadDocument(panFile, 'pan_card');
      if (!panSuccess) return;

      const gstinSuccess = await uploadDocument(gstinFile, 'gstin_certificate');
      if (!gstinSuccess) return;

      const addressSuccess = await uploadDocument(addressProofFile, 'address_proof');
      if (!addressSuccess) return;

      // Submit KYC
      const result = await submitSupplierKyc(applicationId);
      setApplicationStatus('KYC_SUBMITTED');
      sessionStorage.setItem('supplier_application_status', 'KYC_SUBMITTED');
      toast.success('Documents submitted!');
      setStep('success');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('KYC submission failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // File input handler
  const handleFileChange = (setter: (file: File | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      if (file.size > MAX_KYC_DOCUMENT_SIZE_BYTES) {
        setError(`File size must be less than ${MAX_KYC_DOCUMENT_SIZE_LABEL}`);
        return;
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        setError('Only JPEG, PNG, WebP, or PDF files allowed');
        return;
      }
      setError('');
    }
    setter(file);
  };

  return (
    <>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        {step === 'success' ? 'Application Submitted' : 'Register as Supplier'}
      </h2>

      {/* Progress indicator */}
      <div className="flex justify-center gap-1 mb-6">
        {(['business', 'phone', 'otp', 'kyc', 'success'] as const).map((s, i) => (
          <div
            key={s}
            className={`h-1 w-8 rounded ${
              (['business', 'phone', 'otp', 'kyc', 'success'] as const).indexOf(step) >= i
                ? 'bg-primary-600'
                : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      {/* Firebase warning - only show after client mount */}
      {mounted && !isFirebaseReady() && (step === 'phone' || step === 'otp') && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4 text-sm" role="alert">
          <strong>Phone Verification Unavailable</strong>
          <p className="mt-1 text-xs">Please try again later.</p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {/* Step 1: Business Details */}
      {step === 'business' && (
        <form onSubmit={handleBusinessSubmit} className="space-y-4">
          <div>
            <label htmlFor="onboard-businessName" className="label">Business Name *</label>
            <input
              type="text"
              id="onboard-businessName"
              className="input"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your Company Name"
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="onboard-ownerName" className="label">Owner Name *</label>
            <input
              type="text"
              id="onboard-ownerName"
              className="input"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Full Name"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="onboard-gstin" className="label">GSTIN *</label>
            <input
              type="text"
              id="onboard-gstin"
              className="input uppercase"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              disabled={isLoading}
            />
            <p className="text-xs text-slate-500 mt-1">15-character GST Identification Number</p>
          </div>

          <div>
            <label htmlFor="onboard-email" className="label">Email *</label>
            <input
              type="email"
              id="onboard-email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="supplier@example.com"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="onboard-phone" className="label">Phone Number *</label>
            <input
              type="tel"
              id="onboard-phone"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="onboard-addressLine1" className="label">Address Line 1</label>
            <input
              type="text"
              id="onboard-addressLine1"
              className="input"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="Building, Street"
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="onboard-city" className="label">City</label>
              <input
                type="text"
                id="onboard-city"
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="onboard-pincode" className="label">Pincode</label>
              <input
                type="text"
                id="onboard-pincode"
                className="input"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Bank Details (Optional) */}
          <details className="border border-slate-200 rounded-lg p-4">
            <summary className="cursor-pointer font-medium text-slate-700">
              Bank Details (Optional - can add later)
            </summary>
            <div className="space-y-4 mt-4">
              <div>
                <label htmlFor="onboard-bankAccountNumber" className="label">Account Number</label>
                <input
                  type="text"
                  id="onboard-bankAccountNumber"
                  className="input"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="Account Number"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label htmlFor="onboard-bankIfsc" className="label">IFSC Code</label>
                <input
                  type="text"
                  id="onboard-bankIfsc"
                  className="input uppercase"
                  value={bankIfsc}
                  onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                  placeholder="SBIN0001234"
                  maxLength={11}
                  disabled={isLoading}
                />
              </div>
              <div>
                <label htmlFor="onboard-bankAccountName" className="label">Account Holder Name</label>
                <input
                  type="text"
                  id="onboard-bankAccountName"
                  className="input"
                  value={bankAccountName}
                  onChange={(e) => setBankAccountName(e.target.value)}
                  placeholder="Name as per bank"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label htmlFor="onboard-upiVpa" className="label">UPI VPA</label>
                <input
                  type="text"
                  id="onboard-upiVpa"
                  className="input lowercase"
                  value={upiVpa}
                  onChange={(e) => setUpiVpa(e.target.value.toLowerCase())}
                  placeholder="yourname@upi"
                  disabled={isLoading}
                />
              </div>
            </div>
          </details>

          <button
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Submitting...
              </span>
            ) : (
              'Continue'
            )}
          </button>

          <p className="text-center text-sm text-slate-600">
            Already registered?{' '}
            <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Sign In
            </Link>
          </p>
        </form>
      )}

      {/* Step 2: Phone - Send OTP */}
      {step === 'phone' && (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">
            Application created! Now verify your phone.
          </div>

          <div>
            <label htmlFor="onboard-phoneReadonly" className="label">Phone Number</label>
            <input
              type="tel"
              id="onboard-phoneReadonly"
              className="input bg-slate-50"
              value={phone}
              readOnly
            />
            <p className="text-xs text-slate-500 mt-1">
              We&apos;ll send an OTP to verify this number
            </p>
          </div>

          <button
            id="send-otp-button"
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading || !isFirebaseReady()}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Sending...
              </span>
            ) : (
              'Send OTP'
            )}
          </button>

          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={() => setStep('business')}
            disabled={isLoading}
          >
            Back
          </button>
        </form>
      )}

      {/* Step 3: OTP Verification */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label htmlFor="onboard-otp" className="label">Enter OTP</label>
            <p className="text-xs text-slate-500 mb-2">
              6-digit code sent to {phone}
            </p>
            <input
              type="text"
              id="onboard-otp"
              className="input text-center text-xl tracking-widest"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              disabled={isLoading}
              autoFocus
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading || otp.length !== 6}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Verifying...
              </span>
            ) : (
              'Verify OTP'
            )}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-sm text-slate-600 hover:text-slate-900"
              onClick={() => {
                setStep('phone');
                setOtp('');
                recaptchaInitialized.current = false;
              }}
              disabled={isLoading}
            >
              Back
            </button>

            <button
              id="resend-otp-button"
              type="button"
              className={`text-sm font-medium ${
                resendCooldown > 0
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-primary-600 hover:text-primary-700'
              }`}
              onClick={handleResendOtp}
              disabled={isLoading || resendCooldown > 0}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
            </button>
          </div>

          {/* STG-462: OTP expiry countdown */}
          {otpExpirySeconds > 0 && (
            <p className="text-center text-xs text-slate-400 mt-2">
              OTP expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
            </p>
          )}
          {otpExpirySeconds === 0 && step === 'otp' && (
            <p className="text-center text-xs text-red-500 mt-2">
              OTP has expired. Please request a new one.
            </p>
          )}
        </form>
      )}

      {/* Step 4: KYC Documents */}
      {step === 'kyc' && (
        <form onSubmit={handleKycSubmit} className="space-y-4">
          <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">
            Phone verified! Now upload your documents.
          </div>

          <div>
            <label htmlFor="onboard-panCard" className="label">PAN Card *</label>
            <input
              type="file"
              id="onboard-panCard"
              className="input"
              accept="image/*,.pdf"
              onChange={handleFileChange(setPanFile)}
            />
            {panFile && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>{panFile.name}</p>
            )}
            {uploadProgress['pan_card'] && (
              <p className="text-xs text-slate-500 mt-1">Uploading...</p>
            )}
          </div>

          <div>
            <label htmlFor="onboard-gstinCert" className="label">GSTIN Certificate *</label>
            <input
              type="file"
              id="onboard-gstinCert"
              className="input"
              accept="image/*,.pdf"
              onChange={handleFileChange(setGstinFile)}
            />
            {gstinFile && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>{gstinFile.name}</p>
            )}
            {uploadProgress['gstin_certificate'] && (
              <p className="text-xs text-slate-500 mt-1">Uploading...</p>
            )}
          </div>

          <div>
            <label htmlFor="onboard-addressProof" className="label">Address Proof *</label>
            <input
              type="file"
              id="onboard-addressProof"
              className="input"
              accept="image/*,.pdf"
              onChange={handleFileChange(setAddressProofFile)}
            />
            <p className="text-xs text-slate-500 mt-1">
              Utility bill, rent agreement, or bank statement
            </p>
            {addressProofFile && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>{addressProofFile.name}</p>
            )}
            {uploadProgress['address_proof'] && (
              <p className="text-xs text-slate-500 mt-1">Uploading...</p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full py-3"
            disabled={isLoading || !panFile || !gstinFile || !addressProofFile}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Submitting...
              </span>
            ) : (
              'Submit Documents'
            )}
          </button>
        </form>
      )}

      {/* Step 5: Success */}
      {step === 'success' && (
        <div className="text-center py-4">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <h3 className="text-lg font-semibold text-amber-600 mb-2">
            Pending Admin Approval
          </h3>
          <p className="text-slate-600 mb-4">
            Your supplier application has been submitted. We&apos;ll review your documents and notify you once approved.
          </p>

          <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs text-slate-500 mb-1">Application ID</p>
            <p className="text-sm font-mono">{applicationId}</p>
            <p className="text-xs text-slate-500 mt-3 mb-1">Status</p>
            <span className="inline-block px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium">
              {applicationStatus}
            </span>
          </div>

          <button
            className="btn btn-primary w-full py-3"
            onClick={() => router.push('/login')}
          >
            Go to Login
          </button>
        </div>
      )}
    </>
  );
}
