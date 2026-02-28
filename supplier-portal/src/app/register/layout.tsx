import { BuildStamp } from '@/components/BuildStamp';

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
        <div className="max-w-[720px] w-full mx-auto px-6 flex items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white bg-[#2563EB] rounded-full px-3 py-1 leading-none">
              SuperMandi
            </h1>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600 text-sm font-medium">Supplier Portal</span>
          </div>
        </div>
      </header>

      {/* Main Content - Retailer parity width */}
      <main className="max-w-[720px] mx-auto px-4 py-8">
        {children}
      </main>

      {/* Footer - minimal, muted per spec */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-[720px] mx-auto px-4 py-4 text-[13px] text-slate-500 flex items-center justify-between">
          <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
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
