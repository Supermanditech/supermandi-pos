'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { sendVerificationEmail, verifyEmail } from '@/lib/api';
// REG-AUTH-302: LIMITED MODE Banner
import LimitedModeBanner from '@/components/LimitedModeBanner';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/products', label: 'Products', icon: '📦' },
  { href: '/upload', label: 'CSV Upload', icon: '📄' },
  { href: '/orders', label: 'Orders', icon: '🛒' },
  { href: '/kyc', label: 'KYC Documents', icon: '📋' },
  { href: '/earnings', label: 'Earnings', icon: '💰' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supplier, isLoading, isAuthenticated, logout, refreshProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // GL-WF-061: Logout confirmation state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // GL-WF-034: Email verification state
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col">
        {/* Brand */}
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent">
            SuperMandi
          </h1>
          <p className="text-slate-400 text-sm mt-1">Supplier Portal</p>
        </div>

        {/* Supplier Info */}
        <div className="p-4 border-b border-slate-700">
          <p className="font-medium truncate">{supplier?.businessName}</p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`w-2 h-2 rounded-full ${
                supplier?.verificationStatus === 'verified'
                  ? 'bg-green-500'
                  : supplier?.verificationStatus === 'pending'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
            />
            <span className="text-sm text-slate-400 capitalize">
              {supplier?.verificationStatus || 'Unknown'}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-primary-600/20 text-white border border-primary-500/30'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout - GL-WF-061: With confirmation */}
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* GL-WF-061: Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Confirm Logout
            </h3>
            <p className="text-slate-600 mb-4">
              Are you sure you want to logout? Any unsaved changes will be lost.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  logout();
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Verification Banner */}
        {supplier?.verificationStatus === 'pending' && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3">
            <p className="text-yellow-800 text-sm">
              <span className="font-medium">Verification Pending:</span> Your
              account is under review. Products will be visible to retailers
              once approved.
            </p>
          </div>
        )}
        {supplier?.verificationStatus === 'rejected' && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3">
            <p className="text-red-800 text-sm">
              <span className="font-medium">Verification Rejected:</span>{' '}
              Please contact support for more information.
            </p>
          </div>
        )}

        {/* REG-AUTH-302: LIMITED MODE Banner for non-verified suppliers */}
        {supplier?.verificationStatus && supplier.verificationStatus !== 'verified' && (
          <div className="px-6 pt-4">
            <LimitedModeBanner
              status={supplier.verificationStatus}
              businessName={supplier.businessName}
            />
          </div>
        )}

        {/* GL-WF-034: Email Verification Banner */}
        {/* GL-WF-034: Email Verification Banner - GO-LIVE: Honest about email delivery */}
        {supplier && !supplier.emailVerified && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 flex items-center justify-between">
            <p className="text-blue-800 text-sm">
              <span className="font-medium">Email Not Verified:</span>{' '}
              Please verify your email to access all features.
            </p>
            <button
              onClick={async () => {
                setVerificationLoading(true);
                setVerificationMessage(null);
                try {
                  const result = await sendVerificationEmail();
                  // GO-LIVE: Check 'sent' field - only show modal if email was actually sent
                  if (result.sent) {
                    setVerificationMessage({ type: 'success', text: result.message });
                    setShowVerificationModal(true);
                  } else {
                    // Email failed to send - show error, don't open modal
                    setVerificationMessage({
                      type: 'error',
                      text: result.message || 'Failed to send verification email. Please try again.'
                    });
                  }
                } catch (error) {
                  setVerificationMessage({
                    type: 'error',
                    text: error instanceof Error ? error.message : 'Failed to send verification email'
                  });
                } finally {
                  setVerificationLoading(false);
                }
              }}
              disabled={verificationLoading}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
            >
              {verificationLoading ? 'Sending...' : 'Verify Email'}
            </button>
          </div>
        )}

        {/* GO-LIVE: Show error message banner if email send failed */}
        {verificationMessage && verificationMessage.type === 'error' && !showVerificationModal && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between">
            <p className="text-red-800 text-sm">
              <span className="font-medium">Error:</span> {verificationMessage.text}
            </p>
            <button
              onClick={() => setVerificationMessage(null)}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* GL-WF-034: Email Verification Modal */}
        {showVerificationModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowVerificationModal(false)}
          >
            <div
              className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                Verify Your Email
              </h3>
              <p className="text-slate-600 mb-4">
                Enter the 6-digit verification code sent to your email address.
              </p>

              {verificationMessage && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${
                  verificationMessage.type === 'success'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {verificationMessage.text}
                </div>
              )}

              <input
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit code"
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-center text-2xl tracking-widest font-mono mb-4 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowVerificationModal(false);
                    setVerificationCode('');
                    setVerificationMessage(null);
                  }}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (verificationCode.length !== 6) {
                      setVerificationMessage({ type: 'error', text: 'Please enter a 6-digit code' });
                      return;
                    }
                    setVerificationLoading(true);
                    setVerificationMessage(null);
                    try {
                      const result = await verifyEmail(verificationCode);
                      setVerificationMessage({ type: 'success', text: result.message });
                      // Refresh profile to update emailVerified status
                      await refreshProfile();
                      setTimeout(() => {
                        setShowVerificationModal(false);
                        setVerificationCode('');
                        setVerificationMessage(null);
                      }, 1500);
                    } catch (error) {
                      setVerificationMessage({
                        type: 'error',
                        text: error instanceof Error ? error.message : 'Failed to verify email'
                      });
                    } finally {
                      setVerificationLoading(false);
                    }
                  }}
                  disabled={verificationLoading || verificationCode.length !== 6}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-all"
                >
                  {verificationLoading ? 'Verifying...' : 'Verify'}
                </button>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200">
                <button
                  onClick={async () => {
                    setVerificationLoading(true);
                    setVerificationMessage(null);
                    try {
                      const result = await sendVerificationEmail();
                      // GO-LIVE: Check 'sent' field for honest feedback
                      if (result.sent) {
                        setVerificationMessage({ type: 'success', text: 'New code sent!' });
                      } else {
                        setVerificationMessage({
                          type: 'error',
                          text: result.message || 'Failed to resend code. Please try again.'
                        });
                      }
                    } catch (error) {
                      setVerificationMessage({
                        type: 'error',
                        text: error instanceof Error ? error.message : 'Failed to resend code'
                      });
                    } finally {
                      setVerificationLoading(false);
                    }
                  }}
                  disabled={verificationLoading}
                  className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
                >
                  Didn't receive the code? Resend
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
