'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { sendVerificationEmail, verifyEmail, getDashboardStats, markOrdersRead } from '@/lib/api';
import { BuildStamp } from '@/components/BuildStamp';
import { ThemeToggle } from '@/components/ThemeToggle';
// T-092: Shared Modal component
import Modal from '@/components/Modal';
// REG-AUTH-302: LIMITED MODE Banner
import LimitedModeBanner from '@/components/LimitedModeBanner';
// T-082: Lucide SVG nav icons  |  T-087: Mobile hamburger icons
import { LayoutDashboard, Package, FileSpreadsheet, ShoppingCart, ClipboardList, DollarSign, Receipt, Menu, X, Bell, MessageSquare, CreditCard, User, HelpCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// T-082: Lucide SVG icons replace emoji strings
const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/upload', label: 'CSV Upload', icon: FileSpreadsheet },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/kyc', label: 'KYC Documents', icon: ClipboardList },
  { href: '/earnings', label: 'Earnings', icon: DollarSign },
  { href: '/invoices', label: 'Invoices', icon: Receipt },  // T-073
  { href: '/notifications', label: 'Notifications', icon: Bell },  // Phase 8
  { href: '/chat', label: 'Chat', icon: MessageSquare },  // T-295
  { href: '/bnpl-orders', label: 'BNPL Orders', icon: CreditCard },  // T-280
  { href: '/profile', label: 'Profile', icon: User },  // UIUX-SUP-001: Profile page is fully implemented
  { href: '/help', label: 'Help & Support', icon: HelpCircle },  // HELP-001
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supplier, isLoading, isAuthenticated, logout, refreshProfile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // T-087: Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // GL-WF-061: Logout confirmation state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  // SUP-POS-007: New orders badge count
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  // GL-WF-034: Email verification state
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ISSUE-MICRO-089: Lock body scroll when any modal/sidebar is open
  // T-092: Removed showLogoutConfirm — Modal component handles its own scroll lock
  useEffect(() => {
    if (showVerificationModal || sidebarOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [showVerificationModal, sidebarOpen]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // SUP-POS-007: Fetch new orders count for badge
  useEffect(() => {
    if (!isAuthenticated) return;
    getDashboardStats()
      .then((stats) => setNewOrdersCount(stats.newOrdersCount || 0))
      .catch(() => {});
  }, [isAuthenticated]);

  // SUP-POS-007: Mark orders read when visiting /orders + clear badge
  useEffect(() => {
    if (pathname === '/orders' && newOrdersCount > 0) {
      markOrdersRead()
        .then(() => setNewOrdersCount(0))
        .catch(() => {});
    }
  }, [pathname, newOrdersCount]);

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
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* T-222: Skip to content for keyboard navigation */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-[10000] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-br">Skip to content</a>
      {/* T-087: Mobile hamburger button */}
      <button
        className="md:hidden fixed top-4 left-4 z-40 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 text-slate-700" />
      </button>

      {/* Theme toggle — top-right corner */}
      <div className="fixed top-3 right-3 z-40">
        <ThemeToggle />
      </div>

      {/* T-087: Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — T-087: hidden on mobile by default, shown as overlay when sidebarOpen */}
      <aside
        className={`${
          sidebarOpen
            ? 'fixed inset-y-0 left-0 z-50 flex w-64'
            : 'hidden md:flex w-64'
        } bg-gradient-to-b from-slate-900 to-slate-800 text-white flex-col`}
      >
        {/* T-085: Brand with logo */}
        <div className="p-6 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/supplier/brand/logo-white.svg" alt="" width={24} height={24} />
            <span className="text-white font-semibold text-xl">SuperMandi</span>
          </div>
          {/* T-087: Close button inside mobile sidebar */}
          <button
            className="md:hidden p-1 rounded hover:bg-slate-700 transition-colors"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <p className="text-slate-400 text-sm px-6 pt-2 pb-1">Supplier Portal</p>

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

        {/* Navigation — T-082: Lucide icon components */}
        <nav className="flex-1 p-4 space-y-1" aria-label="Main navigation">
          {navItems.map((item) => {
            // SUP-006: Use startsWith for sub-route active state (e.g. /orders/123 highlights /orders)
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const IconComponent = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-primary-600/20 text-white border border-primary-500/30'
                    : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                }`}
              >
                <IconComponent className="w-5 h-5" />
                <span className="flex-1">{item.label}</span>
                {/* SUP-POS-007: New orders badge */}
                {item.href === '/orders' && newOrdersCount > 0 && (
                  <span className="min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1.5">
                    {newOrdersCount > 99 ? '99+' : newOrdersCount}
                  </span>
                )}
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

      {/* GL-WF-061: Logout Confirmation Modal — T-092: Uses shared Modal component */}
      <Modal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Confirm Logout"
        footer={
          <>
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
          </>
        }
      >
        <p className="text-slate-600">
          Are you sure you want to logout? Any unsaved changes will be lost.
        </p>
      </Modal>

      {/* Main Content */}
      <main id="main-content" className="flex-1 overflow-auto">
        {/* AUDIT-SUP-023: Removed duplicate inline banners — LimitedModeBanner handles all non-verified states */}

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
        {/* SUP-006: Only show email verification banner when LimitedModeBanner is NOT showing (no duplicate banners) */}
        {supplier && !supplier.emailVerified && supplier.verificationStatus === 'verified' && (
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
              <p className="text-slate-600 mb-2">
                Enter the 6-digit verification code sent to your email address.
              </p>
              {/* ISSUE-MICRO-099: Note about email delivery */}
              <p className="text-slate-500 text-xs mb-4">
                If you don&apos;t see the email, please check your spam or junk folder.
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

        {/* T-097: Unified footer — standard text + BuildStamp */}
        <footer className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 px-6 py-3 text-xs text-slate-400 flex justify-between items-center">
          <span>&copy; 2026 SuperMandi Tech Pvt Ltd &middot; Made in India</span>
          <BuildStamp />
        </footer>
      </main>
    </div>
  );
}
