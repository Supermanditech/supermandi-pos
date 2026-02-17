'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth';
import { updateSupplierProfile, changePassword } from '@/lib/api';
// T-113: Breadcrumb navigation
import Breadcrumb from '@/components/Breadcrumb';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { supplier, refreshProfile } = useAuth();
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

  // Bank details form state
  const [bankData, setBankData] = useState({
    accountName: supplier?.bankDetails?.accountName || '',
    accountNumber: supplier?.bankDetails?.accountNumber || '',
    ifscCode: supplier?.bankDetails?.ifscCode || '',
    bankName: supplier?.bankDetails?.bankName || '',
  });

  const updateProfileMutation = useMutation({
    mutationFn: updateSupplierProfile,
    onSuccess: () => {
      toast.success('Profile updated successfully!');
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

  return (
    <div>
      {/* T-113: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Dashboard', path: '/dashboard' }, { label: 'Profile' }]} />
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Profile Settings</h1>
        <p className="text-slate-500 mt-1">
          Manage your business profile, security settings, and bank details.
        </p>
      </div>

      {/* Business Info Card */}
      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">
              {supplier?.businessName}
            </h2>
            <p className="text-slate-500 mt-1">GSTIN: {supplier?.gstin}</p>
          </div>
          {verificationStatusBadge()}
        </div>
      </div>

      {/* Tabs */}
      <div className="card mb-6 p-0">
        <div className="flex border-b border-slate-200">
          {[
            { key: 'profile', label: 'Contact Details' },
            { key: 'bank', label: 'Bank Details' },
            { key: 'password', label: 'Change Password' },
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

          {/* Password Tab */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="label">Current Password</label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, currentPassword: e.target.value })
                  }
                  className="input"
                  placeholder="Enter current password"
                  required
                />
              </div>

              <div>
                <label className="label">New Password</label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, newPassword: e.target.value })
                  }
                  className="input"
                  placeholder="Minimum 8 characters"
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="label">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                  }
                  className="input"
                  placeholder="Re-enter new password"
                  required
                />
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
