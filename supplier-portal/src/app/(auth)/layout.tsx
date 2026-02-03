import { BuildStamp } from '@/components/BuildStamp';

// UI-SPEC-004: Stripe-level calm infrastructure design for auth layout
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC]">
      {/* Header Bar - 64px height per spec */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-primary-600">
              SuperManditech
            </h1>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600 text-sm font-medium">Supplier Portal</span>
          </div>
        </div>
      </header>

      {/* Main Content - RET-AUD-057: Standardized padding (2rem 1rem = py-8 px-4) */}
      <main className="flex-1 flex items-center justify-center py-8 px-4">
        <div className="w-full max-w-[448px]">
          {/* Auth Card - white with subtle shadow per spec */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">{children}</div>
        </div>
      </main>

      {/* Footer - minimal, muted per spec */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-[13px] text-slate-500">
          &copy; 2026 SuperManditech. All rights reserved.
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}
