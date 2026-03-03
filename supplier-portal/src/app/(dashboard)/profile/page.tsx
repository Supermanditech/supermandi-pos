'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth';
import { updateSupplierProfile, changePassword } from '@/lib/api';
// T-113: Breadcrumb navigation
import Breadcrumb from '@/components/Breadcrumb';
import { useUnsavedChanges } from '@/hooks/useNavigationSafety';

// STG-372: Password strength checklist (parity with forgot-password page)
function PasswordChecklist({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', pass: password.length >= 8 },
    { label: 'One uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'One digit', pass: /\d/.test(password) },
  ];
  return (
    <ul className="list-none p-0 mt-1 text-xs space-y-0.5">
      {checks.map((c) => (
        <li key={c.label} className={`flex items-center gap-1 ${c.pass ? 'text-green-600' : 'text-slate-400'}`}>
          <span>{c.pass ? '\u2713' : '\u2022'}</span> {c.label}
        </li>
      ))}
    </ul>
  );
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { supplier, refreshProfile, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'bank'>('profile');

  // Profile form state
  const [profileData, setProfileData] = useState({
    contactName: supplier?.contactName || '',
    email: supplier?.email || '',
    phone: supplier?.phone || '',
    address: supplier?.address || '',
    city: supplier?.city || '',
    state: supplier?.state || '',
    pincode: supplier?.pincode || '',
  });

  // Password form state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  // STG-372: Show/hide password toggles
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Bank details form state
  const [bankData, setBankData] = useState({
    accountName: supplier?.bankDetails?.accountName || '',
    accountNumber: supplier?.bankDetails?.accountNumber || '',
    ifscCode: supplier?.bankDetails?.ifscCode || '',
    bankName: supplier?.bankDetails?.bankName || '',
  });

  // LIVE.NAV.SUPPLIER.PROFILE_FORM_GUARD.001: Snapshot refs for dirty tracking
  const profileSnapshotRef = useRef<string>('');
  const bankSnapshotRef = useRef<string>('');

  // SUP-017: Sync form state when supplier data loads
  useEffect(() => {
    if (!supplier) return;
    const profile = {
      contactName: supplier.contactName || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      city: supplier.city || '',
      state: supplier.state || '',
      pincode: supplier.pincode || '',
    };
    const bank = {
      accountName: supplier.bankDetails?.accountName || '',
      accountNumber: supplier.bankDetails?.accountNumber || '',
      ifscCode: supplier.bankDetails?.ifscCode || '',
      bankName: supplier.bankDetails?.bankName || '',
    };
    setProfileData(profile);
    setBankData(bank);
    profileSnapshotRef.current = JSON.stringify(profile);
    bankSnapshotRef.current = JSON.stringify(bank);
  }, [supplier]);

  // LIVE.NAV.SUPPLIER.PROFILE_FORM_GUARD.001: Unsaved-change guard across all tabs
  const isDirty = useMemo(() => {
    const profileChanged = profileSnapshotRef.current !== '' &&
      JSON.stringify(profileData) !== profileSnapshotRef.current;
    const bankChanged = bankSnapshotRef.current !== '' &&
      JSON.stringify(bankData) !== bankSnapshotRef.current;
    const passwordStarted = passwordData.currentPassword !== '' ||
      passwordData.newPassword !== '' || passwordData.confirmPassword !== '';
    return profileChanged || bankChanged || passwordStarted;
  }, [profileData, bankData, passwordData]);
  useUnsavedChanges(isDirty);

  const updateProfileMutation = useMutation({
    mutationFn: updateSupplierProfile,
    onSuccess: (_data, variables) => {
      toast.success('Profile updated successfully!');
      // Reset dirty snapshot after successful save
      if ('bankDetails' in variables) {
        bankSnapshotRef.current = JSON.stringify(bankData);
      } else {
        profileSnapshotRef.current = JSON.stringify(profileData);
      }
      refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['supplier-profile'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update profile');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success('Password changed successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to change password');
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileData);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  };

  const handleBankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // AUDIT-SUP-013: Validate IFSC code format (4 letters + 0 + 6 alphanumeric)
    // UIUX-SUP-012: Use toast.error instead of native alert()
    if (bankData.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankData.ifscCode)) {
      toast.error('Invalid IFSC code format. Expected: 4 letters + 0 + 6 alphanumeric (e.g., HDFC0001234)');
      return;
    }
    updateProfileMutation.mutate({ bankDetails: bankData });
  };

  const verificationStatusBadge = () => {
    const status = supplier?.verificationStatus || 'pending';
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      verified: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (authLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/3" />
        <div className="h-4 bg-slate-100 rounded w-1/2" />
        <div className="h-10 bg-slate-200 rounded w-full mt-4" />
        <div className="card space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-200 rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* T-113: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Profile' }]} />
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Profile Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Manage your business profile, security settings, and bank details.
        </p>
      </div>

      {/* Business Info Card */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
              {supplier?.businessName || 'Business Name'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">GSTIN: {supplier?.gstin || '—'}</p>
          </div>
          {verificationStatusBadge()}
        </div>
      </div>

      {/* Tabs — STG-371: Added tablist/tab semantics */}
      <div className="card mb-6 p-0">
        <div className="flex border-b border-slate-200" role="tablist" aria-label="Profile sections">
          {[
            { key: 'profile', label: 'Contact Details' },
            { key: 'bank', label: 'Bank Details' },
            { key: 'password', label: 'Change Password' },
          ].map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
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
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Contact Person Name</label>
                  <input
                    type="text"
                    value={profileData.contactName}
                    onChange={(e) =>
                      setProfileData({ ...profileData, contactName: e.target.value })
                    }
                    className="input"
                    placeholder="Full name"
                  />
                </div>

                <div>
                  <label className="label">Email Address</label>
                  {/* GO-LIVE-025: Email is read-only after registration for security */}
                  <input
                    type="email"
                    value={profileData.email}
                    disabled
                    className="input bg-slate-100 cursor-not-allowed"
                    placeholder="email@example.com"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Email cannot be changed. Contact support if needed.
                  </p>
                </div>

                <div>
                  <label className="label">Phone Number</label>
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) =>
                      setProfileData({ ...profileData, phone: e.target.value })
                    }
                    className="input"
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="label">Business Address</label>
                  <textarea
                    value={profileData.address}
                    onChange={(e) =>
                      setProfileData({ ...profileData, address: e.target.value })
                    }
                    className="input"
                    rows={2}
                    placeholder="Street address"
                  />
                </div>

                <div>
                  <label className="label">City</label>
                  <input
                    type="text"
                    value={profileData.city}
                    onChange={(e) =>
                      setProfileData({ ...profileData, city: e.target.value })
                    }
                    className="input"
                    placeholder="City"
                  />
                </div>

                <div>
                  <label className="label">State</label>
                  <input
                    type="text"
                    value={profileData.state}
                    onChange={(e) =>
                      setProfileData({ ...profileData, state: e.target.value })
                    }
                    className="input"
                    placeholder="State"
                  />
                </div>

                <div>
                  <label className="label">PIN Code</label>
                  <input
                    type="text"
                    value={profileData.pincode}
                    onChange={(e) =>
                      setProfileData({ ...profileData, pincode: e.target.value })
                    }
                    className="input"
                    placeholder="400001"
                    maxLength={6}
                  />
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {/* Bank Details Tab */}
          {activeTab === 'bank' && (
            <form onSubmit={handleBankSubmit} className="space-y-4">
              {/* SA-P1-008: Bank verification status banner */}
              {supplier?.bankVerificationStatus === 'pending' && supplier?.bankDetails && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-700 font-medium">
                    Bank details are under review. Payouts are paused until verified.
                  </p>
                </div>
              )}
              {supplier?.bankVerificationStatus === 'rejected' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-red-700 font-medium">
                    Bank details were rejected. Please update and resubmit.
                  </p>
                </div>
              )}
              {supplier?.bankVerificationStatus === 'verified' && supplier?.bankDetails && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-green-700 font-medium">
                    Bank details verified.
                  </p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-700">
                  Bank details are used for order payouts. Please ensure the account
                  is in your business name for smooth transactions.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Account Holder Name</label>
                  <input
                    type="text"
                    value={bankData.accountName}
                    onChange={(e) =>
                      setBankData({ ...bankData, accountName: e.target.value })
                    }
                    className="input"
                    placeholder="As per bank records"
                  />
                </div>

                <div>
                  <label className="label">Bank Name</label>
                  <input
                    type="text"
                    value={bankData.bankName}
                    onChange={(e) =>
                      setBankData({ ...bankData, bankName: e.target.value })
                    }
                    className="input"
                    placeholder="e.g., HDFC Bank"
                  />
                </div>

                <div>
                  <label className="label">Account Number</label>
                  <input
                    type="text"
                    value={bankData.accountNumber}
                    onChange={(e) =>
                      setBankData({ ...bankData, accountNumber: e.target.value })
                    }
                    className="input font-mono"
                    placeholder="Account number"
                  />
                </div>

                <div>
                  <label className="label">IFSC Code</label>
                  <input
                    type="text"
                    value={bankData.ifscCode}
                    onChange={(e) =>
                      setBankData({ ...bankData, ifscCode: e.target.value.toUpperCase() })
                    }
                    className="input font-mono"
                    placeholder="e.g., HDFC0001234"
                    maxLength={11}
                    pattern="[A-Z]{4}0[A-Z0-9]{6}"
                    title="4 letters + 0 + 6 alphanumeric (e.g., HDFC0001234)"
                  />
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Bank Details'}
                </button>
              </div>
            </form>
          )}

          {/* Password Tab — STG-372: Added strength indicators + show/hide toggles */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="label">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, currentPassword: e.target.value })
                    }
                    className="input pr-12"
                    placeholder="Enter current password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    aria-pressed={showCurrentPw}
                    aria-label={showCurrentPw ? 'Hide current password' : 'Show current password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium"
                  >
                    {showCurrentPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, newPassword: e.target.value })
                    }
                    className="input pr-12"
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    aria-pressed={showNewPw}
                    aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium"
                  >
                    {showNewPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                <PasswordChecklist password={passwordData.newPassword} />
              </div>

              <div>
                <label className="label">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                    }
                    className="input pr-12"
                    placeholder="Re-enter new password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    aria-pressed={showConfirmPw}
                    aria-label={showConfirmPw ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 text-xs font-medium"
                  >
                    {showConfirmPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && (
                  <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
                )}
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={changePasswordMutation.isPending}
                >
                  {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
