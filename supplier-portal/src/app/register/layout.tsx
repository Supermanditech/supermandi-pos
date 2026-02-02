import { Toaster } from 'react-hot-toast';
import Link from 'next/link';

// UI-SPEC-005: Stripe-level calm infrastructure design for registration
export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      {/* Top Header Bar - 64px height per spec */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 h-16 flex items-center">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-primary-600">
              SuperMandi
            </h1>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600 text-sm font-medium">Supplier Portal</span>
          </div>
          <Link
            href="/login"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Already registered? Sign In
          </Link>
        </div>
      </header>

      {/* Main Content - Wide Container (960-1120px per spec) */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer - minimal, muted per spec */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-[13px] text-slate-500">
          &copy; 2024 SuperMandi. All rights reserved.
        </div>
      </footer>

      <Toaster position="top-center" />
    </div>
  );
}
