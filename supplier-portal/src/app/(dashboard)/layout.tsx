'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/products', label: 'Products', icon: '📦' },
  { href: '/upload', label: 'CSV Upload', icon: '📄' },
  { href: '/orders', label: 'Orders', icon: '🛒' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supplier, isLoading, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

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

        {/* Logout */}
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
          >
            Logout
          </button>
        </div>
      </aside>

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

        {/* Page Content */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
