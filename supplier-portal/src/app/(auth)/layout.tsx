import Image from 'next/image';
import { BuildStamp } from '@/components/BuildStamp';
import { ThemeToggle } from '@/components/ThemeToggle';

// UI-SPEC-004: Stripe-level calm infrastructure design for auth layout
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-slate-900 flex flex-col">
      {/* T-095 parity: Match Retailer auth header metrics and spacing */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 h-16 flex items-center">
        <div className="max-w-[1152px] w-full mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* R6.SUP.017: Use Next.js Image for optimization */}
            <Image src="/supplier/brand/logo-shortmark.svg" alt="" width={20} height={20} className="block dark:hidden" />
            <Image src="/supplier/brand/logo-shortmark-inverse.svg" alt="" width={20} height={20} className="hidden dark:block" />
            <span className="text-2xl font-semibold text-white bg-[#2563EB] dark:text-slate-900 dark:bg-white rounded-full px-3 py-1 leading-none">
              SuperMandi
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Supplier Portal</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content - RET-AUD-057: Standardized card width + spacing */}
      <main className="flex-1 flex items-center justify-center py-8 px-4">
        <div className="w-full max-w-[448px]">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-8">{children}</div>
        </div>
      </main>

      {/* T-097: Unified footer — standard text + Help link + BuildStamp */}
      <footer className="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
        <div className="max-w-[1152px] mx-auto px-6 py-4 text-[13px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>&copy; 2026 SuperMandi Tech Pvt Ltd &middot; Made in India</span>
          <div className="flex items-center gap-4">
            <a href="/supplier/help" className="text-slate-400 text-xs no-underline hover:underline">
              Help
            </a>
            <BuildStamp />
          </div>
        </div>
      </footer>
    </div>
  );
}
