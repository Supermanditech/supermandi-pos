import { BuildStamp } from '@/components/BuildStamp';
import { ThemeToggle } from '@/components/ThemeToggle';

// UI-SPEC-005: Stripe-level calm infrastructure design for registration
// STG-222: Added dark mode support + ThemeToggle (mirrors auth layout pattern)
export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-slate-900">
      {/* Top Header Bar - 64px height per spec */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 h-16 flex items-center">
        <div className="max-w-[720px] w-full mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white bg-[#2563EB] dark:text-slate-900 dark:bg-white rounded-full px-3 py-1 leading-none">
              SuperMandi
            </h1>
            <span className="text-slate-400 dark:text-slate-600">|</span>
            <span className="text-slate-600 dark:text-slate-400 text-sm font-medium">Supplier Portal</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content - Retailer parity width */}
      <main className="max-w-[720px] mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer - minimal, muted per spec */}
      <footer className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 mt-auto">
        <div className="max-w-[720px] mx-auto px-4 py-4 text-[13px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
          <div className="flex items-center gap-4">
            <a href="/supplier/support" className="text-slate-500 dark:text-slate-400 text-xs no-underline hover:underline">
              Help
            </a>
            <BuildStamp />
          </div>
        </div>
      </footer>

    </div>
  );
}
