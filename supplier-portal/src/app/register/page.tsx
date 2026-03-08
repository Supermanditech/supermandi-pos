'use client';

// P0-SUP-001: Full Supplier Registration + KYC Form
// 3-Step Flow: Phone OTP → Business Details → KYC Documents
// FULL-WIDTH ONBOARDING LAYOUT (not compact login-card)

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ApiError, createSupplierApplication, verifySupplierOtp, submitSupplierKyc, lookupSupplierRegistration } from '@/lib/api';
import { setupRecaptcha, sendOtp, verifyOtp, isFirebaseReady, cleanup } from '@/lib/firebase';
import { useUnsavedChanges } from '@/hooks/useNavigationSafety';

// ISSUE-177: Detect Facebook/Instagram in-app browser where reCAPTCHA fails
function isInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line\/|Snapchat|Twitter|LinkedIn/i.test(ua);
}

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

// Supplier types per ticket
const SUPPLIER_TYPES = [
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'wholesaler', label: 'Wholesaler / Distributor' },
  { value: 'brand_owner', label: 'Brand Owner' },
  { value: 'importer', label: 'Importer' },
  { value: 'other', label: 'Other' },
];

// Document types with labels
// STG-074: Added address_proof and cancelled_cheque (required per migration 103)
const DOCUMENT_TYPES = {
  gstin_certificate: { label: 'GST Certificate', accept: 'image/*,application/pdf' },
  pan_card: { label: 'ID Proof (Aadhaar/PAN/Driving License)', accept: 'image/*,application/pdf' },
  address_proof: { label: 'Address Proof (Utility Bill/Rent Agreement)', accept: 'image/*,application/pdf' },
  cancelled_cheque: { label: 'Cancelled Cheque / Bank Passbook', accept: 'image/*,application/pdf' },
  business_license: { label: 'Business Proof (Shop License/MSME/Trade License)', accept: 'image/*,application/pdf' },
  owner_photo: { label: 'Authorized Person Selfie', accept: 'image/*' },
};

type Step = 'phone' | 'otp' | 'details' | 'documents' | 'success';

interface DocumentUpload {
  file: File | null;
  preview: string | null;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  error?: string;
  progress?: number; // FIX-065: Upload progress percentage (0-100)
}

// API Base URL from environment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

// T-005: SessionStorage key for registration state persistence
const SUP_REG_STORAGE_KEY = 'supermandi_supplier_reg_state';

function loadSavedSupRegState(): Partial<{
  step: Step; phone: string; applicationId: string;
  businessName: string; supplierType: string; supplierTypeOther: string;
  ownerName: string; gstin: string; email: string;
  addressLine1: string; addressLine2: string; city: string;
  state: string; pincode: string;
  idProofType: 'aadhaar' | 'pan' | 'driving_license';
  businessProofType: 'shop_license' | 'msme' | 'incorporation' | 'trade_license';
  sessionDowngraded: boolean;
}> {
  try {
    const raw = sessionStorage.getItem(SUP_REG_STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    // Don't restore 'otp' step — fall back to 'phone'
    if (data.step === 'otp') data.step = 'phone';
    // UNMAPPED.038: Don't restore 'details'/'documents' steps since idToken
    // is not persisted (security) — user must re-verify phone on page refresh
    // ISSUE-171: Flag the downgrade so we can show a helpful message
    if (data.step === 'details' || data.step === 'documents') {
      data.sessionDowngraded = true;
      data.step = 'phone';
    }
    return data;
  } catch { return {}; }
}

export default function RegisterPageWrapper() {
  return (
    <Suspense fallback={<RegisterSkeleton />}>
      <RegisterPage />
    </Suspense>
  );
}

function RegisterSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-slate-200 rounded w-2/3" />
      <div className="h-4 bg-slate-100 rounded w-full" />
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i}>
            <div className="h-4 bg-slate-100 rounded w-1/4 mb-2" />
            <div className="h-10 bg-slate-100 rounded w-full" />
          </div>
        ))}
      </div>
      <div className="h-12 bg-slate-200 rounded w-full" />
    </div>
  );
}

function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // T-005: Load saved registration state on mount
  const saved = useRef(loadSavedSupRegState());

  // Step state
  const [step, setStep] = useState<Step>(saved.current.step || 'phone');
  // ISSUE-171: Show message when step was downgraded due to session refresh
  const [sessionDowngraded, setSessionDowngraded] = useState(!!saved.current.sessionDowngraded);

  // Step 1: Phone — pre-fill from login redirect, then sessionStorage, then empty
  const [phone, setPhone] = useState(searchParams.get('phone') || saved.current.phone || '');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  // REQ.AUTH.PARITY.REGISTRATION_FLOW: OTP expiry countdown (parity with retailer — 5 min)
  const [otpExpirySeconds, setOtpExpirySeconds] = useState(0);
  const recaptchaInitialized = useRef(false);
  const [idToken, setIdToken] = useState('');
  const idTokenObtainedAt = useRef<number>(0);
  // ISSUE-161: Proactive token expiry warning (minutes remaining, null = no warning)
  const [tokenMinutesLeft, setTokenMinutesLeft] = useState<number | null>(null);

  // Step 2: Business Details — restore from sessionStorage
  const [applicationId, setApplicationId] = useState(saved.current.applicationId || '');
  const [businessName, setBusinessName] = useState(saved.current.businessName || '');
  const [supplierType, setSupplierType] = useState(saved.current.supplierType || '');
  const [supplierTypeOther, setSupplierTypeOther] = useState(saved.current.supplierTypeOther || '');
  const [gstin, setGstin] = useState(saved.current.gstin || '');
  const [ownerName, setOwnerName] = useState(saved.current.ownerName || '');
  const [email, setEmail] = useState(saved.current.email || '');
  const [addressLine1, setAddressLine1] = useState(saved.current.addressLine1 || '');
  const [addressLine2, setAddressLine2] = useState(saved.current.addressLine2 || '');
  const [city, setCity] = useState(saved.current.city || '');
  const [state, setState] = useState(saved.current.state || '');
  const [pincode, setPincode] = useState(saved.current.pincode || '');
  const [agreement, setAgreement] = useState(false);

  // Step 3: Documents
  // BLK-SUP-KYC1: Include address_proof and cancelled_cheque (required by backend)
  const [documents, setDocuments] = useState<Record<string, DocumentUpload>>({
    gstin_certificate: { file: null, preview: null, status: 'pending' },
    pan_card: { file: null, preview: null, status: 'pending' },
    address_proof: { file: null, preview: null, status: 'pending' },
    cancelled_cheque: { file: null, preview: null, status: 'pending' },
    business_license: { file: null, preview: null, status: 'pending' },
    owner_photo: { file: null, preview: null, status: 'pending' },
  });
  const [idProofType, setIdProofType] = useState<'aadhaar' | 'pan' | 'driving_license'>(saved.current.idProofType || 'aadhaar');
  const [businessProofType, setBusinessProofType] = useState<'shop_license' | 'msme' | 'incorporation' | 'trade_license'>(saved.current.businessProofType || 'shop_license');

  // Track if component has mounted (for SSR compatibility)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // LIVE.NAV.RESILIENCE.BACK_FORWARD_DRAFT_RECOVERY.001: Unsaved-change guard
  // Prevents accidental page close/refresh when user has entered business details
  // ISSUE-159: Suppress beforeunload during active form submission (isLoading)
  // ISSUE-170: Also track document uploads (any file selected = unsaved work)
  const hasDocumentWork = useMemo(
    () => Object.values(documents).some(d => d.file !== null || d.status === 'uploading' || d.status === 'uploaded'),
    [documents],
  );
  const hasUnsavedDetails = useMemo(
    () => !isLoading && (step === 'details' || step === 'documents') && (businessName !== '' || ownerName !== '' || email !== '' || hasDocumentWork),
    [step, businessName, ownerName, email, isLoading, hasDocumentWork],
  );
  useUnsavedChanges(hasUnsavedDetails);

  // FIX-027: Revoke all blob URLs on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      Object.values(documents).forEach(doc => {
        if (doc.preview) URL.revokeObjectURL(doc.preview);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // T-005: Persist registration state to sessionStorage on key changes
  useEffect(() => {
    if (step === 'success') {
      sessionStorage.removeItem(SUP_REG_STORAGE_KEY);
      return;
    }
    const stateToSave = {
      step, phone, applicationId, businessName, supplierType, supplierTypeOther,
      ownerName, gstin, email, addressLine1, addressLine2, city, state, pincode,
      idProofType, businessProofType,
    };
    sessionStorage.setItem(SUP_REG_STORAGE_KEY, JSON.stringify(stateToSave));
  }, [step, phone, applicationId, businessName, supplierType, supplierTypeOther,
      ownerName, gstin, email, addressLine1, addressLine2, city, state, pincode,
      idProofType, businessProofType]);

  // STAGING-FIX-006: Resume registration flow — when arriving from login with resume=true,
  // look up existing application and skip to the appropriate step
  const resumeChecked = useRef(false);
  useEffect(() => {
    if (resumeChecked.current) return;
    const isResume = searchParams.get('resume') === 'true';
    const resumePhone = searchParams.get('phone');
    if (!isResume || !resumePhone) return;
    resumeChecked.current = true;

    (async () => {
      try {
        setIsLoading(true);
        let normalizedPhone = resumePhone.replace(/[\s-]/g, '');
        if (!normalizedPhone.startsWith('+')) {
          normalizedPhone = normalizedPhone.length === 10 ? `+91${normalizedPhone}` : `+${normalizedPhone}`;
        }
        const lookup = await lookupSupplierRegistration(normalizedPhone);
        if (lookup.application_id) {
          setApplicationId(lookup.application_id);
          if (lookup.nextStep === 'UPLOAD_DOCUMENTS') {
            setStep('documents');
            toast.success('Welcome back! Please complete your document uploads.');
          } else if (lookup.nextStep === 'FIX_REQUIRED') {
            setStep('documents');
            toast.error('Some documents need to be re-uploaded.');
          } else {
            // VERIFY_PHONE or other — need to go through phone verification first
            toast('Please verify your phone to resume registration.');
          }
        }
      } catch {
        // Lookup failed — proceed with normal registration
      } finally {
        setIsLoading(false);
      }
    })();
  }, [searchParams]);

  // STG-762: Setup reCAPTCHA on mount (mounted gate matches STG-722 fix pattern)
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
      cleanup();
      recaptchaInitialized.current = false;
    };
  }, [mounted, step]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // REQ.AUTH.PARITY.REGISTRATION_FLOW: OTP expiry countdown timer (parity with retailer)
  useEffect(() => {
    if (otpExpirySeconds > 0) {
      const t = setTimeout(() => setOtpExpirySeconds(otpExpirySeconds - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [otpExpirySeconds]);

  // ISSUE-161: Proactive idToken expiry warning — check every 30s on details/documents steps
  useEffect(() => {
    if ((step !== 'details' && step !== 'documents') || !idTokenObtainedAt.current) {
      setTokenMinutesLeft(null);
      return;
    }
    const TOKEN_TTL_MS = 50 * 60 * 1000;
    const WARNING_THRESHOLD_MS = 5 * 60 * 1000;
    const check = () => {
      const elapsed = Date.now() - idTokenObtainedAt.current;
      const remaining = TOKEN_TTL_MS - elapsed;
      if (remaining <= 0) {
        setError('Phone verification expired. Please verify your phone again. Your details are saved.');
        setIdToken('');
        setStep('phone');
        setTokenMinutesLeft(null);
      } else if (remaining <= WARNING_THRESHOLD_MS) {
        setTokenMinutesLeft(Math.ceil(remaining / 60000));
      } else {
        setTokenMinutesLeft(null);
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [step, idToken]);

  // FIX-030: Validate phone — enforce Indian format (+91 prefix + 10 digits starting 6-9)
  const validatePhone = (value: string): boolean => {
    const cleaned = value.replace(/[\s-]/g, '');
    return /^(\+91)?[6-9]\d{9}$/.test(cleaned);
  };

  // Validate GSTIN format (GL-CRIT-0031)
  const validateGSTIN = (value: string): boolean => {
    if (!value.trim()) return true; // Optional
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[0-9A-Z]{1}[0-9A-Z]{1}$/.test(value.trim().toUpperCase());
  };

  // Validate pincode (6 digits)
  const validatePincode = (value: string): boolean => {
    return /^\d{6}$/.test(value.trim());
  };

  // Step 1: Send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validatePhone(phone)) {
      setError('Please enter a valid Indian mobile number (e.g. +919876543210 or 9876543210)');
      return;
    }

    setIsLoading(true);

    try {
      if (!isFirebaseReady()) {
        throw new Error('Firebase is not configured. Phone verification is required for registration.');
      }

      await sendOtp(phone);
      setStep('otp');
      setResendCooldown(60);
      setOtpExpirySeconds(300);
      toast.success('OTP sent successfully!');
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
      const token = await verifyOtp(otp);
      setIdToken(token);
      idTokenObtainedAt.current = Date.now();
      setStep('details');
      toast.success('Phone verified successfully!');
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

      await sendOtp(phone);
      setResendCooldown(60);
      setOtpExpirySeconds(300);
      toast.success('OTP sent successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Submit business details
  // REG-SUP-002: Fixed to prevent wrong error message during registration
  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate required fields
    if (!businessName.trim()) {
      setError('Business name is required');
      return;
    }
    if (!supplierType) {
      setError('Please select supplier type');
      return;
    }
    if (supplierType === 'other' && !supplierTypeOther.trim()) {
      setError('Please specify supplier type');
      return;
    }
    if (!ownerName.trim()) {
      setError('Authorized person name is required');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }
    if (!addressLine1.trim()) {
      setError('Address line 1 is required');
      return;
    }
    if (!city.trim()) {
      setError('City is required');
      return;
    }
    if (!state) {
      setError('Please select state');
      return;
    }
    if (!validatePincode(pincode)) {
      setError('Please enter a valid 6-digit pincode');
      return;
    }
    if (gstin.trim() && !validateGSTIN(gstin)) {
      setError('Please enter a valid 15-character GSTIN');
      return;
    }
    if (!agreement) {
      setError('Please confirm that the details are correct');
      return;
    }

    // REG-SUP-002: Validate idToken exists and hasn't expired (Firebase tokens ~55min)
    const TOKEN_MAX_AGE_MS = 50 * 60 * 1000; // 50 minutes
    if (!idToken || (idTokenObtainedAt.current > 0 && Date.now() - idTokenObtainedAt.current > TOKEN_MAX_AGE_MS)) {
      setError('Phone verification expired. Please verify your phone again.');
      setIdToken('');
      setStep('phone');
      return;
    }

    setIsLoading(true);

    try {
      // Normalize phone number
      let normalizedPhone = phone.replace(/[\s-]/g, '');
      if (!normalizedPhone.startsWith('+')) {
        if (normalizedPhone.length === 10) {
          normalizedPhone = `+91${normalizedPhone}`;
        } else {
          normalizedPhone = `+${normalizedPhone}`;
        }
      }

      // STAGING-FIX-012: Send idToken with create to verify phone inline (one API call)
      const result = await createSupplierApplication({
        phone: normalizedPhone,
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        gstin: gstin.trim().toUpperCase() || '',
        email: email.trim().toLowerCase(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim(),
        state: state,
        pincode: pincode.trim(),
        idToken,
      });

      const appId = result.application?.id || result.applicationId;
      const appStatus = result.application?.status || result.status;

      if (!appId) {
        setError('Unable to create application. Please try again.');
        return;
      }

      setApplicationId(appId);

      // If phone was verified inline or already OTP_VERIFIED, go to documents
      if (result.phoneVerified || appStatus === 'OTP_VERIFIED') {
        setStep('documents');
        toast.success('Details saved! Please upload documents.');
      } else {
        // Fallback: try separate verify-otp call
        try {
          await verifySupplierOtp(idToken, appId);
          setStep('documents');
          toast.success('Details saved! Please upload documents.');
        } catch {
          // ISSUE-160: Phone verification failed — show warning instead of silent success
          setStep('documents');
          toast.error('Phone verification failed. Your details are saved, but you may need to re-verify your phone before final submission.');
        }
      }
    } catch (err) {
      // ISSUE-194: GSTIN conflict — never auto-resume another user's application.
      // Show clear error and let user contact support or use different GSTIN.
      if (err instanceof ApiError && (err.code === 'APPLICATION_EXISTS' || err.code === 'GSTIN_EXISTS')) {
        setError(err.message || 'This GSTIN is already associated with another application. Please use a different GSTIN or contact support.');
        return;
      }

      // REG-SUP-002 & REG-COPY-001: Map error codes to user-friendly messages
      if (err instanceof ApiError) {
        // Don't show "Registration required before login" during registration flow
        if (err.code === 'REGISTRATION_REQUIRED' || err.code === 'UNAUTHORIZED') {
          setError('Please complete registration to continue.');
        } else if (err.message.toLowerCase().includes('registration required')) {
          // REG-SUP-002: Catch the specific error message and replace it
          setError('Please complete registration to continue.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to save details. Please try again.');
      }
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
        [docType]: { ...prev[docType], status: 'error', error: 'File size must be less than 5MB' }
      }));
      return;
    }

    // Create preview for images
    let preview: string | null = null;
    if (file.type.startsWith('image/')) {
      preview = URL.createObjectURL(file);
    }

    // FIX-027: Revoke old blob URL before replacing with new one
    setDocuments(prev => {
      const old = prev[docType]?.preview;
      if (old) URL.revokeObjectURL(old);
      return {
        ...prev,
        [docType]: { file, preview, status: 'pending', error: undefined },
      };
    });
  }, []);

  // Upload a single document
  // FIX-065: Use XMLHttpRequest for upload progress tracking
  const uploadDocument = async (docType: string, file: File): Promise<boolean> => {
    if (!applicationId) return false;

    setDocuments(prev => ({
      ...prev,
      [docType]: { ...prev[docType], status: 'uploading', progress: 0 }
    }));

    return new Promise<boolean>((resolve) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', docType);
      formData.append('entity_type', 'application');
      formData.append('entity_id', applicationId);

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setDocuments(prev => ({
            ...prev,
            [docType]: { ...prev[docType], progress: pct }
          }));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setDocuments(prev => ({
            ...prev,
            [docType]: { ...prev[docType], status: 'uploaded', progress: 100 }
          }));
          resolve(true);
        } else {
          let msg = 'Upload failed';
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.message) msg = data.message;
          } catch { /* ignore parse error */ }
          setDocuments(prev => ({
            ...prev,
            [docType]: { ...prev[docType], status: 'error', error: msg, progress: undefined }
          }));
          resolve(false);
        }
      };

      xhr.onerror = () => {
        setDocuments(prev => ({
          ...prev,
          [docType]: { ...prev[docType], status: 'error', error: 'Network error', progress: undefined }
        }));
        resolve(false);
      };

      xhr.open('POST', `${API_BASE_URL}/api/v1/documents/upload`);
      // R7.SUP.001: Send auth credentials (HttpOnly cookies) with XHR upload
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.send(formData);
    });
  };

  // ISSUE-189: Ref guard to prevent double-submit on documents
  const submittingDocsRef = useRef(false);

  // Submit all documents and application
  const handleSubmitDocuments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingDocsRef.current) return;
    submittingDocsRef.current = true;
    setError('');

    // BLK-SUP-KYC1: Validate all backend-required documents
    const requiredDocs = ['pan_card', 'address_proof', 'cancelled_cheque', 'business_license', 'owner_photo'];
    if (gstin.trim()) {
      requiredDocs.unshift('gstin_certificate');
    }

    for (const docType of requiredDocs) {
      const doc = documents[docType];
      if (!doc.file && doc.status !== 'uploaded') {
        const label = DOCUMENT_TYPES[docType as keyof typeof DOCUMENT_TYPES]?.label || docType;
        setError(`Please upload: ${label}`);
        submittingDocsRef.current = false;
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
            return;
          }
        }
      }

      // Submit KYC for review
      await submitSupplierKyc(applicationId);

      setStep('success');
      toast.success('Application submitted successfully!');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to submit application. Please try again.');
      }
    } finally {
      setIsLoading(false);
      submittingDocsRef.current = false;
    }
  };

  // Camera capture for selfie
  const handleCameraCapture = (docType: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'user'; // Front camera for selfie
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleDocumentSelect(docType, file);
      }
    };
    input.click();
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

  const stepLabels = ['Verify Phone', 'Business Details', 'KYC Documents'];

  return (
    <div className="space-y-8">
      {/* ISSUE-177: In-app browser warning — reCAPTCHA fails in FB/IG WebView */}
      {isInAppBrowser() && (step === 'phone' || step === 'otp') && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '12px 16px', fontSize: 14 }}>
          <strong>Open in your browser for best experience.</strong>
          <p style={{ margin: '4px 0 8px' }}>Phone verification may not work in this app. Tap below to open in your default browser.</p>
          <button
            onClick={() => {
              try { navigator.clipboard.writeText(window.location.href); } catch { /* ignore */ }
              window.open(window.location.href, '_system');
            }}
            style={{ background: '#ffc107', border: 'none', borderRadius: 4, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}
          >
            Open in Browser
          </button>
        </div>
      )}
      {/* Page Title */}
      <div className="text-center">
        <h2 className="text-[1.75rem] font-bold text-slate-900">
          {step === 'success' ? 'Application Submitted' : 'Register as Supplier'}
        </h2>
        {step !== 'success' && (
          <p className="text-slate-600 mt-2">
            Complete the registration form to join SuperMandi as a supplier partner
          </p>
        )}
      </div>

      {/* Full-Width Stepper */}
      {step !== 'success' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            {stepLabels.map((label, index) => {
              const stepNum = index + 1;
              const isActive = getStepNumber() === stepNum;
              const isCompleted = getStepNumber() > stepNum;

              return (
                <div key={label} className="flex-1 flex items-center">
                  {/* Step indicator */}
                  <div className="flex items-center">
                    <div
                      className={`w-[34px] h-[34px] rounded-full flex items-center justify-center text-[13px] font-semibold transition-colors ${
                        isCompleted
                          ? 'bg-green-500 text-white'
                          : isActive
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {isCompleted ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        stepNum
                      )}
                    </div>
                    <span
                      className={`ml-3 text-sm font-medium ${
                        isActive ? 'text-primary-600' : isCompleted ? 'text-green-600' : 'text-slate-500'
                      }`}
                    >
                      {label}
                    </span>
                  </div>

                  {/* Connector line */}
                  {index < stepLabels.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-4 rounded-full ${
                        isCompleted ? 'bg-green-500' : 'bg-slate-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Firebase warning - only show after client mount */}
      {mounted && !isFirebaseReady() && step === 'phone' && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-lg text-sm" role="alert">
          <strong>Phone Verification Unavailable</strong>
          <p className="mt-1">
            Registration requires phone verification which is currently unavailable.
            Please try again later or contact support.
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg text-sm" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {/* Step 1: Phone Number - Centered card for phone entry */}
      {step === 'phone' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
          {/* ISSUE-171: Session downgrade notification */}
          {sessionDowngraded && (
            <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>
              <strong>Session expired.</strong> Please verify your phone again to continue. Your business details are saved.
              {' '}<button type="button" onClick={() => setSessionDowngraded(false)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', textDecoration: 'underline', fontSize: 14 }}>Dismiss</button>
            </div>
          )}
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Verify your phone number</h3>
          <p className="text-slate-600 text-sm mb-6">
            We&apos;ll send a verification code to confirm your identity.
          </p>

          <form onSubmit={handleSendOtp} className="space-y-6">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-2">
                Phone Number *
              </label>
              <input
                type="tel"
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input text-lg"
                placeholder="+91 9876543210"
                disabled={isLoading}
                autoFocus
              />
            </div>

            <button
              id="send-otp-button"
              type="submit"
              className="btn btn-primary w-full py-3 text-base"
              disabled={isLoading || !isFirebaseReady()}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Sending OTP...
                </span>
              ) : (
                'Send OTP'
              )}
            </button>
          </form>

          {/* T-007: Sign In link for existing users */}
          <div className="mt-6 pt-4 border-t border-slate-200 text-center">
            <p className="text-slate-600 text-sm">
              Already registered?{' '}
              <Link href="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Step 1b: OTP Verification - Centered card */}
      {step === 'otp' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Enter Verification Code</h3>
          <p className="text-slate-600 text-sm mb-6">
            Enter the 6-digit code sent to <strong>{phone}</strong>
          </p>

          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
              <label htmlFor="otp" className="sr-only">Verification code</label>
              <input
                type="text"
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input text-center text-2xl tracking-[0.5em] font-mono"
                placeholder="------"
                maxLength={6}
                disabled={isLoading}
                autoFocus
              />
            </div>

            {/* REQ.AUTH.PARITY.REGISTRATION_FLOW: OTP expiry countdown (parity with retailer) */}
            {/* REQ.REGRESSION.AUTH.REGISTRATION.OTP_EXPIRY_SUBMIT_GUARD: show expired message regardless of otp length */}
            <div aria-live="polite" className="text-center">
              {otpExpirySeconds > 0 && (
                <p className={`text-xs ${otpExpirySeconds <= 60 ? 'text-red-600' : 'text-slate-500'}`}>
                  Code expires in {Math.floor(otpExpirySeconds / 60)}:{String(otpExpirySeconds % 60).padStart(2, '0')}
                </p>
              )}
              {otpExpirySeconds === 0 && (
                <p className="text-xs text-red-600">Code expired. Please resend OTP.</p>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full py-3 text-base"
              disabled={isLoading || otp.length !== 6 || otpExpirySeconds === 0}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Verifying...
                </span>
              ) : (
                'Verify OTP'
              )}
            </button>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="text-sm text-slate-600 hover:text-slate-900"
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
          </form>
        </div>
      )}

      {/* Step 2: Business Details - Full-width spacious form */}
      {step === 'details' && (
        <form onSubmit={handleSubmitDetails} className="space-y-6">
          {/* ISSUE-161: Token expiry warning banner */}
          {tokenMinutesLeft !== null && (
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
              <strong>Session expiring in ~{tokenMinutesLeft} min.</strong> Please submit your details soon, or you&apos;ll need to verify your phone again.
            </div>
          )}
          {/* Phone verified banner */}
          <div className="bg-green-50 border border-green-200 text-green-700 px-6 py-4 rounded-lg flex items-center gap-3">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Phone verified: <strong>{phone}</strong></span>
          </div>

          {/* Business Identity Section */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-6 pb-3 border-b border-slate-200">
              Business Identity
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="sm:col-span-2">
                <label htmlFor="businessName" className="block text-sm font-medium text-slate-700 mb-2">
                  Business / Company Name *
                </label>
                <input
                  type="text"
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="input"
                  placeholder="Your Company Name"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="supplierType" className="block text-sm font-medium text-slate-700 mb-2">
                  Supplier Type *
                </label>
                <select
                  id="supplierType"
                  value={supplierType}
                  onChange={(e) => setSupplierType(e.target.value)}
                  className="input"
                  disabled={isLoading}
                >
                  <option value="">Select supplier type</option>
                  {SUPPLIER_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {supplierType === 'other' && (
                <div>
                  <label htmlFor="supplierTypeOther" className="block text-sm font-medium text-slate-700 mb-2">
                    Specify Supplier Type *
                  </label>
                  <input
                    type="text"
                    id="supplierTypeOther"
                    value={supplierTypeOther}
                    onChange={(e) => setSupplierTypeOther(e.target.value)}
                    className="input"
                    placeholder="Enter supplier type"
                    disabled={isLoading}
                  />
                </div>
              )}

              <div>
                <label htmlFor="gstin" className="block text-sm font-medium text-slate-700 mb-2">
                  GSTIN (Optional)
                </label>
                <input
                  type="text"
                  id="gstin"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  className="input font-mono"
                  placeholder="22AAAAA0000A1Z5"
                  maxLength={15}
                  disabled={isLoading}
                />
                <p className="text-xs text-slate-500 mt-1">
                  15-character GST Identification Number
                </p>
              </div>
            </div>
          </div>

          {/* Contact Person Section */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-6 pb-3 border-b border-slate-200">
              Contact Person
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="ownerName" className="block text-sm font-medium text-slate-700 mb-2">
                  Authorized Person Name *
                </label>
                <input
                  type="text"
                  id="ownerName"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="input"
                  placeholder="Full name of authorized person"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                  Email *
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="supplier@example.com"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="phoneVerified" className="block text-sm font-medium text-slate-700 mb-2">Phone (Verified)</label>
                <input
                  type="text"
                  id="phoneVerified"
                  value={phone}
                  className="input bg-slate-100 cursor-not-allowed"
                  disabled
                />
              </div>
            </div>
          </div>

          {/* Address Section */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-6 pb-3 border-b border-slate-200">
              Business Address
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="sm:col-span-2">
                <label htmlFor="addressLine1" className="block text-sm font-medium text-slate-700 mb-2">
                  Address Line 1 *
                </label>
                <input
                  type="text"
                  id="addressLine1"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="input"
                  placeholder="Building name, Street"
                  disabled={isLoading}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="addressLine2" className="block text-sm font-medium text-slate-700 mb-2">
                  Address Line 2 (Optional)
                </label>
                <input
                  type="text"
                  id="addressLine2"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  className="input"
                  placeholder="Area, Landmark"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="city" className="block text-sm font-medium text-slate-700 mb-2">
                  City *
                </label>
                <input
                  type="text"
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="input"
                  placeholder="City"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="state" className="block text-sm font-medium text-slate-700 mb-2">
                  State *
                </label>
                <select
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="input"
                  disabled={isLoading}
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="pincode" className="block text-sm font-medium text-slate-700 mb-2">
                  Pincode *
                </label>
                <input
                  type="text"
                  id="pincode"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="input font-mono"
                  placeholder="400001"
                  maxLength={6}
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Agreement Section */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
            <label className="flex items-start gap-4 cursor-pointer">
              <input
                type="checkbox"
                checked={agreement}
                onChange={(e) => setAgreement(e.target.checked)}
                className="mt-1 w-5 h-5 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                disabled={isLoading}
              />
              <span className="text-slate-700">
                I confirm that all the details provided are correct and accurate. I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 underline">
                  Privacy Policy
                </a>. *
              </span>
            </label>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              className="btn w-full py-4 text-base font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
              onClick={() => {
                setStep('otp');
                setError('');
              }}
              disabled={isLoading}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn-primary w-full py-4 text-base font-semibold"
              disabled={isLoading || !agreement}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Saving Details...
                </span>
              ) : (
                'Continue to Document Upload'
              )}
            </button>
          </div>
        </form>
      )}

      {/* Step 3: KYC Documents - Full-width spacious form */}
      {step === 'documents' && (
        <form onSubmit={handleSubmitDocuments} className="space-y-6">
          {/* ISSUE-161: Token expiry warning banner */}
          {tokenMinutesLeft !== null && (
            <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontSize: 14 }}>
              <strong>Session expiring in ~{tokenMinutesLeft} min.</strong> Please submit your documents soon, or you&apos;ll need to verify your phone again.
            </div>
          )}
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 text-blue-800 px-6 py-4 rounded-lg">
            <h4 className="font-medium mb-1">Document Upload Guidelines</h4>
            <ul className="text-sm list-disc list-inside space-y-1">
              <li>Supported formats: JPEG, PNG, PDF</li>
              <li>Maximum file size: 5MB per document</li>
              <li>Ensure documents are clear and readable</li>
            </ul>
          </div>

          {/* GST Certificate (required if GSTIN provided) */}
          {gstin.trim() && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">GST Certificate *</h3>
              <p className="text-slate-600 text-sm mb-4">Upload your GST registration certificate</p>
              <DocumentUploadField
                label=""
                docType="gstin_certificate"
                document={documents.gstin_certificate}
                onSelect={(file) => handleDocumentSelect('gstin_certificate', file)}
                accept="image/*,application/pdf"
                disabled={isLoading}
                hideLabelSpace
              />
            </div>
          )}

          {/* ID Proof */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Authorized Signatory ID Proof *</h3>
            <p className="text-slate-600 text-sm mb-4">Select ID type and upload a clear copy</p>

            <div className="flex flex-wrap gap-3 mb-6" role="radiogroup" aria-label="ID proof type">
              {(['aadhaar', 'pan', 'driving_license'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={idProofType === type}
                  className={`px-4 py-2 text-sm rounded-lg border-2 transition-colors ${
                    idProofType === type
                      ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setIdProofType(type)}
                  disabled={isLoading}
                >
                  {type === 'aadhaar' ? 'Aadhaar Card' : type === 'pan' ? 'PAN Card' : 'Driving License'}
                </button>
              ))}
            </div>

            <DocumentUploadField
              label=""
              docType="pan_card"
              document={documents.pan_card}
              onSelect={(file) => handleDocumentSelect('pan_card', file)}
              accept="image/*,application/pdf"
              disabled={isLoading}
              hideLabelSpace
            />
          </div>

          {/* BLK-SUP-KYC1: Address Proof (required by backend) */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Address Proof *</h3>
            <p className="text-slate-600 text-sm mb-6">
              Upload a utility bill, rent agreement, or any official document showing your business address
            </p>

            <DocumentUploadField
              label=""
              docType="address_proof"
              document={documents.address_proof}
              onSelect={(file) => handleDocumentSelect('address_proof', file)}
              accept="image/*,application/pdf"
              disabled={isLoading}
              hideLabelSpace
            />
          </div>

          {/* BLK-SUP-KYC1: Cancelled Cheque (required by backend for bank verification) */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Cancelled Cheque / Bank Passbook *</h3>
            <p className="text-slate-600 text-sm mb-6">
              Upload a cancelled cheque or first page of bank passbook for payment verification
            </p>

            <DocumentUploadField
              label=""
              docType="cancelled_cheque"
              document={documents.cancelled_cheque}
              onSelect={(file) => handleDocumentSelect('cancelled_cheque', file)}
              accept="image/*,application/pdf"
              disabled={isLoading}
              hideLabelSpace
            />
          </div>

          {/* Business Proof */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Business Proof *</h3>
            <p className="text-slate-600 text-sm mb-4">Select proof type and upload a clear copy</p>

            <div className="flex flex-wrap gap-3 mb-6" role="radiogroup" aria-label="Business proof type">
              {(['shop_license', 'msme', 'incorporation', 'trade_license'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={businessProofType === type}
                  className={`px-4 py-2 text-sm rounded-lg border-2 transition-colors ${
                    businessProofType === type
                      ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setBusinessProofType(type)}
                  disabled={isLoading}
                >
                  {type === 'shop_license' ? 'Shop License' :
                   type === 'msme' ? 'MSME Certificate' :
                   type === 'incorporation' ? 'Incorporation Cert' : 'Trade License'}
                </button>
              ))}
            </div>

            <DocumentUploadField
              label=""
              docType="business_license"
              document={documents.business_license}
              onSelect={(file) => handleDocumentSelect('business_license', file)}
              accept="image/*,application/pdf"
              disabled={isLoading}
              hideLabelSpace
            />
          </div>

          {/* Selfie */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Authorized Person Selfie *</h3>
            <p className="text-slate-600 text-sm mb-6">
              Take a clear photo of yourself for identity verification
            </p>

            <div className="flex gap-4 mb-4">
              <button
                type="button"
                className="flex-1 py-3 px-6 border-2 border-primary-500 text-primary-600 rounded-lg hover:bg-primary-50 font-medium flex items-center justify-center gap-2"
                onClick={() => handleCameraCapture('owner_photo')}
                disabled={isLoading}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Take Photo
              </button>
              <label className="flex-1 py-3 px-6 border-2 border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 font-medium flex items-center justify-center gap-2 cursor-pointer">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Upload from Gallery
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleDocumentSelect('owner_photo', e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                  disabled={isLoading}
                />
              </label>
            </div>

            {documents.owner_photo.preview && (
              <div className="mt-4">
                <img
                  src={documents.owner_photo.preview}
                  alt="Selfie preview"
                  className="w-32 h-32 object-cover rounded-lg border-2 border-slate-200"
                />
              </div>
            )}
            {documents.owner_photo.status === 'uploaded' && (
              <p className="text-green-600 text-sm mt-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Uploaded successfully
              </p>
            )}
            {documents.owner_photo.error && (
              <p className="text-red-600 text-sm mt-2">{documents.owner_photo.error}</p>
            )}
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              className="btn w-full py-4 text-base font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
              onClick={() => {
                setStep('details');
                setError('');
              }}
              disabled={isLoading}
            >
              Back
            </button>
            <button
              type="submit"
              className="btn btn-primary w-full py-4 text-base font-semibold"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Submitting Application...
                </span>
              ) : (
                'Submit Application'
              )}
            </button>
          </div>
        </form>
      )}

      {/* Step 4: Success */}
      {step === 'success' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-semibold text-slate-900 mb-2">
            Application Submitted
          </h3>
          <p className="text-slate-600 mb-6 text-sm">
            Your registration is pending verification. We&apos;ll review your documents and notify you shortly.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-slate-500">Application ID</p>
            <p className="font-mono text-slate-900">{applicationId}</p>
          </div>
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-4 text-sm text-left">
            <strong>What happens next?</strong>
            <ol className="mt-2 ml-4 list-decimal space-y-1">
              <li>We review your documents (usually 1-2 business days)</li>
              <li>Once approved, you&apos;ll receive a <strong>welcome message</strong> via WhatsApp and Email</li>
              <li>Sign in to the Supplier Portal to manage your products and orders</li>
            </ol>
          </div>
          <div className="text-[13px] text-slate-500 mb-4">
            Need help? Contact us at{' '}
            <a href="mailto:hello@supermandi.tech" className="text-primary-600">
              hello@supermandi.tech
            </a>
          </div>
          <button
            className="btn btn-primary w-full py-4 text-base font-semibold"
            onClick={() => router.push('/login')}
          >
            Go to Login
          </button>
        </div>
      )}
    </div>
  );
}

// Document upload field component
function DocumentUploadField({
  label,
  docType,
  document,
  onSelect,
  accept,
  disabled,
  hideLabelSpace,
}: {
  label: string;
  docType: string;
  document: DocumentUpload;
  onSelect: (file: File | null) => void;
  accept: string;
  disabled?: boolean;
  hideLabelSpace?: boolean;
}) {
  return (
    <div>
      {label && <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>}

      <label className="flex flex-col items-center justify-center w-full py-8 px-6 border-2 border-dashed border-slate-300 rounded-lg hover:border-primary-400 hover:bg-primary-50/50 cursor-pointer transition-colors">
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            onSelect(e.target.files?.[0] || null);
            // UNMAPPED.039: Reset input so re-selecting the same file triggers onChange
            e.target.value = '';
          }}
          disabled={disabled}
        />
        {document.status === 'uploading' ? (
          <div className="text-center w-full px-4">
            <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 inline-block mb-2" />
            <p className="text-slate-500 font-medium">
              Uploading{document.progress != null ? ` ${document.progress}%` : '...'}
            </p>
            {document.progress != null && (
              <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                <div
                  className="bg-primary-600 h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${document.progress}%` }}
                />
              </div>
            )}
          </div>
        ) : document.file || document.status === 'uploaded' ? (
          <div className="text-center">
            <svg className="w-8 h-8 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-green-600 font-medium">{document.file?.name || 'Uploaded'}</p>
            <p className="text-slate-500 text-sm mt-1">Click to replace</p>
          </div>
        ) : (
          <div className="text-center">
            <svg className="w-10 h-10 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-slate-600 font-medium">Click to upload</p>
            <p className="text-slate-400 text-sm mt-1">PNG, JPG, PDF up to 5 MB</p>
          </div>
        )}
      </label>

      {document.preview && (
        <div className="mt-4">
          <img
            src={document.preview}
            alt="Preview"
            className="max-w-full h-24 object-contain rounded-lg border border-slate-200"
          />
        </div>
      )}

      {document.error && (
        <p className="text-red-600 text-sm mt-2">{document.error}</p>
      )}
    </div>
  );
}
