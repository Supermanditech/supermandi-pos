'use client';

// GL-WF-018: KYC Document Upload Page
// GL-WF-008: Bank Verification with IFSC Lookup

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock } from 'lucide-react';
// T-113: Breadcrumb navigation
import Breadcrumb from '@/components/Breadcrumb';
// REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001
import { MAX_KYC_DOCUMENT_SIZE_BYTES, MAX_KYC_DOCUMENT_SIZE_LABEL } from '@/lib/fileLimits';
import {
  getKycDocuments,
  getKycStatus,
  uploadKycDocument,
  deleteKycDocument,
  verifyIFSC,
  verifyBankAccount,
  KycDocument,
  KycStatus,
  IFSCLookupResult,
} from '@/lib/api';

const DOCUMENT_TYPES: { key: KycDocument['documentType']; label: string; description: string; required: boolean }[] = [
  { key: 'pan_card', label: 'PAN Card', description: 'Business or proprietor PAN', required: true },
  { key: 'gstin_certificate', label: 'GSTIN Certificate', description: 'GST registration certificate', required: false },
  { key: 'cancelled_cheque', label: 'Cancelled Cheque', description: 'For bank account verification', required: true },
  { key: 'address_proof', label: 'Address Proof', description: 'Utility bill or rental agreement', required: false },
  { key: 'business_license', label: 'Business License', description: 'Shop license or FSSAI (if applicable)', required: false },
];

export default function KycPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'documents' | 'bank'>('documents');
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // AUDIT-SUP-017: Track last attempted file per doc type for retry on failure
  const [failedUploads, setFailedUploads] = useState<Record<string, File>>({});
  // UIUX-SUP-015: Two-click delete confirmation state
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Bank verification form state
  const [bankForm, setBankForm] = useState({
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    accountName: '',
  });
  const [ifscData, setIfscData] = useState<IFSCLookupResult | null>(null);
  const [ifscError, setIfscError] = useState('');
  // ISSUE-MICRO-054: Track latest IFSC request to ignore stale results
  const latestIfscRef = useRef('');

  // Fetch KYC documents
  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ['kyc-documents'],
    queryFn: getKycDocuments,
  });

  // Fetch KYC status
  const { data: kycStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: getKycStatus,
  });

  // Upload document mutation
  // AUDIT-SUP-017: Track failed uploads for retry
  const uploadMutation = useMutation({
    mutationFn: ({ type, file }: { type: KycDocument['documentType']; file: File }) =>
      uploadKycDocument(type, file),
    onSuccess: (data, variables) => {
      toast.success(data.message || 'Document uploaded successfully');
      // Clear failed upload tracker on success
      setFailedUploads(prev => { const next = { ...prev }; delete next[variables.type]; return next; });
      queryClient.invalidateQueries({ queryKey: ['kyc-documents'] });
      queryClient.invalidateQueries({ queryKey: ['kyc-status'] });
    },
    onError: (error: Error, variables) => {
      toast.error(error.message || 'Failed to upload document');
      // AUDIT-SUP-017: Store the failed file for retry
      setFailedUploads(prev => ({ ...prev, [variables.type]: variables.file }));
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: deleteKycDocument,
    onSuccess: () => {
      toast.success('Document deleted');
      queryClient.invalidateQueries({ queryKey: ['kyc-documents'] });
      queryClient.invalidateQueries({ queryKey: ['kyc-status'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete document');
    },
  });

  // IFSC lookup mutation
  const ifscMutation = useMutation({
    mutationFn: verifyIFSC,
    onSuccess: (data, ifscCode) => {
      // ISSUE-MICRO-054: Ignore stale results from superseded lookups
      if (ifscCode !== latestIfscRef.current) return;
      setIfscData(data);
      setIfscError('');
    },
    onError: (error: Error, ifscCode) => {
      // ISSUE-MICRO-054: Ignore stale errors from superseded lookups
      if (ifscCode !== latestIfscRef.current) return;
      setIfscData(null);
      setIfscError(error.message || 'Invalid IFSC code');
    },
  });

  // Bank verification mutation
  const bankVerifyMutation = useMutation({
    mutationFn: verifyBankAccount,
    onSuccess: (data) => {
      toast.success(data.message || 'Bank account verified successfully!');
      queryClient.invalidateQueries({ queryKey: ['kyc-status'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-profile'] });
      setBankForm({ accountNumber: '', confirmAccountNumber: '', ifscCode: '', accountName: '' });
      setIfscData(null);
    },
    onError: () => {
      // ISSUE-MICRO-095: Generic message — server error may contain bank details
      toast.error('Bank verification failed. Please check your details and try again.');
    },
  });

  const handleFileSelect = (type: KycDocument['documentType'], file: File | null) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPEG, PNG, and PDF files are allowed');
      return;
    }

    // Validate file size (REQ.AUDIT.W4.CROSS.HARDCODED-FILE-SIZE-LIMIT.001)
    if (file.size > MAX_KYC_DOCUMENT_SIZE_BYTES) {
      toast.error(`File size must be less than ${MAX_KYC_DOCUMENT_SIZE_LABEL}`);
      return;
    }

    uploadMutation.mutate({ type, file });
  };

  const handleIFSCLookup = () => {
    const ifsc = bankForm.ifscCode.toUpperCase();
    // GL-WF-040: Validate IFSC format
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifsc)) {
      setIfscError('Invalid IFSC format. Must be 11 characters (e.g., HDFC0001234)');
      return;
    }
    // ISSUE-MICRO-054: Track latest request to ignore stale results
    // REQ.AUDIT.W5.SUPPLIER.KYC-IFSC-RACE-CONDITION.001: reset stale state before new lookup
    latestIfscRef.current = ifsc;
    ifscMutation.reset();
    ifscMutation.mutate(ifsc);
  };

  const handleBankVerify = (e: React.FormEvent) => {
    e.preventDefault();

    // GL-WF-041: Validate account number
    const accountRegex = /^\d{9,18}$/;
    if (!accountRegex.test(bankForm.accountNumber)) {
      toast.error('Account number must be 9-18 digits');
      return;
    }

    if (bankForm.accountNumber !== bankForm.confirmAccountNumber) {
      toast.error('Account numbers do not match');
      return;
    }

    if (!ifscData) {
      toast.error('Please verify IFSC code first');
      return;
    }

    if (!bankForm.accountName.trim()) {
      toast.error('Account holder name is required');
      return;
    }

    bankVerifyMutation.mutate({
      accountNumber: bankForm.accountNumber,
      ifscCode: bankForm.ifscCode.toUpperCase(),
      accountName: bankForm.accountName.trim(),
    });
  };

  const getDocumentByType = (type: string) => documents.find((d) => d.documentType === type);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div>
      {/* T-113: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'KYC' }]} />
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">KYC & Bank Verification</h1>
        <p className="text-slate-500 mt-1">
          Upload documents and verify bank details to enable payouts.
        </p>
      </div>

      {/* Loading skeleton */}
      {(statusLoading || docsLoading) && !kycStatus && (
        <div className="card mb-6 animate-pulse">
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-slate-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-5 bg-slate-200 rounded w-1/3" />
              <div className="h-4 bg-slate-100 rounded w-2/3" />
            </div>
          </div>
        </div>
      )}

      {/* GL-WF-043: Payout Readiness Card */}
      {kycStatus && (
        <div className={`card mb-6 border-2 ${kycStatus.payoutReady ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'}`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${kycStatus.payoutReady ? 'bg-green-200' : 'bg-yellow-200'}`}>
              {kycStatus.payoutReady ? <CheckCircle2 size={24} /> : <Clock size={24} />}
            </div>
            <div className="flex-1">
              <h3 className={`font-semibold ${kycStatus.payoutReady ? 'text-green-800' : 'text-yellow-800'}`}>
                {kycStatus.payoutReady ? 'Payout Ready!' : 'Complete Requirements for Payouts'}
              </h3>
              <p className={`text-sm mt-1 ${kycStatus.payoutReady ? 'text-green-700' : 'text-yellow-700'}`}>
                {kycStatus.message}
              </p>

              {/* Requirements Checklist */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { key: 'bankVerified', label: 'Bank Verified' },
                  { key: 'panCardApproved', label: 'PAN Card' },
                  { key: 'cancelledChequeApproved', label: 'Cancelled Cheque' },
                  { key: 'profileVerified', label: 'Profile Verified' },
                ].map(({ key, label }) => (
                  <div
                    key={key}
                    className={`flex items-center gap-2 text-sm ${
                      kycStatus.requirements[key as keyof typeof kycStatus.requirements]
                        ? 'text-green-700'
                        : 'text-slate-500'
                    }`}
                  >
                    <span>
                      {kycStatus.requirements[key as keyof typeof kycStatus.requirements] ? '✓' : '○'}
                    </span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="card mb-6 p-0">
        <div className="flex border-b border-slate-200">
          {[
            { key: 'documents', label: 'KYC Documents' },
            { key: 'bank', label: 'Bank Verification' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-700">
                  <strong>Accepted formats:</strong> JPEG, PNG, PDF (max {MAX_KYC_DOCUMENT_SIZE_LABEL} per file).
                  Documents are reviewed within 1-2 business days.
                </p>
              </div>

              {DOCUMENT_TYPES.map((docType) => {
                const existingDoc = getDocumentByType(docType.key);
                return (
                  <div
                    key={docType.key}
                    className="border border-slate-200 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{docType.label}</span>
                        {docType.required && (
                          <span className="text-xs text-red-500">Required</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{docType.description}</p>

                      {existingDoc && (
                        <div className="mt-2 flex items-center gap-3">
                          {getStatusBadge(existingDoc.status)}
                          <span className="text-sm text-slate-500">
                            {existingDoc.fileName} ({formatFileSize(existingDoc.fileSize)})
                          </span>
                          {existingDoc.status === 'rejected' && existingDoc.rejectionReason && (
                            <span className="text-sm text-red-600">
                              Reason: {existingDoc.rejectionReason}
                            </span>
                          )}
                        </div>
                      )}
                      {/* AUDIT-SUP-017: Show failed upload info with retry hint */}
                      {!existingDoc && failedUploads[docType.key] && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">Upload Failed</span>
                          <span className="text-sm text-slate-500">
                            {failedUploads[docType.key].name} — click Retry to re-upload
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {existingDoc && (
                        <button
                          onClick={() => {
                            // UIUX-SUP-015: Confirm before deleting KYC document
                            if (pendingDelete === existingDoc.id) {
                              deleteMutation.mutate(existingDoc.id);
                              setPendingDelete(null);
                            } else {
                              setPendingDelete(existingDoc.id);
                            }
                          }}
                          className={`text-sm ${pendingDelete === existingDoc.id ? 'text-white bg-red-600 px-2 py-0.5 rounded' : 'text-red-600 hover:text-red-700'}`}
                          disabled={deleteMutation.isPending}
                          onBlur={() => setPendingDelete(null)}
                        >
                          {pendingDelete === existingDoc.id ? 'Confirm Delete' : 'Delete'}
                        </button>
                      )}

                      {/* AUDIT-SUP-017: Retry button for failed uploads */}
                      {failedUploads[docType.key] && (
                        <button
                          onClick={() => uploadMutation.mutate({ type: docType.key, file: failedUploads[docType.key] })}
                          className="text-amber-600 hover:text-amber-700 text-sm font-medium"
                          disabled={uploadMutation.isPending}
                        >
                          {/* REQ.AUDIT.W5.SUPPLIER.KYC-UPLOAD-RETRY-NO-PROGRESS.001: spinner during retry */}
                          {uploadMutation.isPending ? <><span className="inline-block w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin align-middle mr-1" />Retrying...</> : 'Retry'}
                        </button>
                      )}

                      <input
                        type="file"
                        ref={(el) => { fileInputRefs.current[docType.key] = el; }}
                        accept=".jpg,.jpeg,.png,.pdf"
                        className="hidden"
                        aria-label={`Upload ${docType.label}`}
                        onChange={(e) => handleFileSelect(docType.key, e.target.files?.[0] || null)}
                      />
                      <button
                        onClick={() => fileInputRefs.current[docType.key]?.click()}
                        className="btn btn-secondary text-sm"
                        disabled={uploadMutation.isPending}
                      >
                        {existingDoc ? 'Replace' : 'Upload'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bank Verification Tab - GL-WF-008 */}
          {activeTab === 'bank' && (
            <div>
              {/* GL-WF-042: Show current verification status */}
              {kycStatus?.requirements.bankVerified ? (
                /* GL-CRIT-0097: Show read-only state after verification - no form needed */
                <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">✓</span>
                    <div>
                      <p className="font-semibold text-green-800 text-lg">Bank Account Verified</p>
                      <p className="text-sm text-green-700 mt-1">
                        Your bank account is verified and ready for payouts.
                      </p>
                      <p className="text-xs text-green-600 mt-2">
                        To update bank details, please contact support.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-yellow-700">
                    <strong>Important:</strong> Verify your bank account to receive payouts.
                    Ensure the account is in your business name.
                  </p>
                </div>

              <form onSubmit={handleBankVerify} className="space-y-6">
                {/* IFSC Code with Lookup */}
                <div>
                  <label className="label">IFSC Code</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={bankForm.ifscCode}
                      onChange={(e) => {
                        setBankForm({ ...bankForm, ifscCode: e.target.value.toUpperCase() });
                        setIfscData(null);
                        setIfscError('');
                      }}
                      className="input flex-1 font-mono"
                      placeholder="e.g., HDFC0001234"
                      maxLength={11}
                    />
                    <button
                      type="button"
                      onClick={handleIFSCLookup}
                      className="btn btn-secondary"
                      disabled={ifscMutation.isPending || bankForm.ifscCode.length !== 11}
                    >
                      {ifscMutation.isPending ? 'Verifying...' : 'Verify IFSC'}
                    </button>
                  </div>
                  {ifscError && <p className="text-sm text-red-600 mt-1">{ifscError}</p>}

                  {/* IFSC Lookup Result */}
                  {ifscData && (
                    <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="font-medium text-green-800">{ifscData.bankName}</p>
                      <p className="text-sm text-green-700">{ifscData.branchName}</p>
                      <p className="text-sm text-green-600">{ifscData.address}, {ifscData.city}</p>
                    </div>
                  )}
                </div>

                {/* Account Number */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Account Number</label>
                    <input
                      type="text"
                      value={bankForm.accountNumber}
                      onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value.replace(/\D/g, '') })}
                      className="input font-mono"
                      placeholder="9-18 digit account number"
                      minLength={9}
                      maxLength={18}
                    />
                    {/* ISSUE-MICRO-051: Inline minimum length validation hint */}
                    {bankForm.accountNumber && bankForm.accountNumber.length < 9 && (
                      <p className="text-sm text-amber-600 mt-1">Account number must be at least 9 digits</p>
                    )}
                  </div>

                  <div>
                    <label className="label">Confirm Account Number</label>
                    <input
                      type="text"
                      value={bankForm.confirmAccountNumber}
                      onChange={(e) => setBankForm({ ...bankForm, confirmAccountNumber: e.target.value.replace(/\D/g, '') })}
                      className="input font-mono"
                      placeholder="Re-enter account number"
                      maxLength={18}
                    />
                    {bankForm.confirmAccountNumber && bankForm.accountNumber !== bankForm.confirmAccountNumber && (
                      <p className="text-sm text-red-600 mt-1">Account numbers do not match</p>
                    )}
                  </div>
                </div>

                {/* Account Holder Name */}
                <div>
                  <label className="label">Account Holder Name</label>
                  <input
                    type="text"
                    value={bankForm.accountName}
                    onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                    className="input"
                    placeholder="Name as per bank records"
                  />
                  <p className="text-sm text-slate-500 mt-1">
                    Must match the name on your bank account exactly.
                  </p>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      bankVerifyMutation.isPending ||
                      !ifscData ||
                      !bankForm.accountNumber ||
                      bankForm.accountNumber !== bankForm.confirmAccountNumber ||
                      !bankForm.accountName.trim()
                    }
                  >
                    {bankVerifyMutation.isPending ? 'Verifying...' : 'Verify & Save Bank Details'}
                  </button>
                </div>
              </form>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
