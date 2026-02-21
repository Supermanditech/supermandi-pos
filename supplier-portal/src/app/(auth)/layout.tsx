import { BuildStamp } from '@/components/BuildStamp';

// UI-SPEC-004: Stripe-level calm infrastructure design for auth layout
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F9FC] flex flex-col">
      {/* T-095 parity: Match Retailer auth header metrics and spacing */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center">
        <div className="max-w-[1152px] w-full mx-auto px-6 flex items-center">
          <div className="flex items-center gap-3">
            <img src="/supplier/brand/logo-shortmark.svg" alt="" width={20} height={20} />
            <span className="text-2xl font-semibold text-white bg-[#2563EB] rounded-full px-3 py-1 leading-none">
              SuperMandi
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-sm font-medium text-slate-600">Supplier Portal</span>
          </div>
        </div>
      </header>

      {/* Main Content - RET-AUD-057: Standardized card width + spacing */}
      <main className="flex-1 flex items-center justify-center py-8 px-4">
        <div className="w-full max-w-[448px]">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">{children}</div>
        </div>
      </main>

      {/* T-097: Unified footer — standard text + Help link + BuildStamp */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-[1152px] mx-auto px-6 py-4 text-[13px] text-slate-500 flex items-center justify-between">
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
