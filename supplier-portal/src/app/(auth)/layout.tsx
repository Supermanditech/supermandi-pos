import { BuildStamp } from '@/components/BuildStamp';

// UI-SPEC-004: Stripe-level calm infrastructure design for auth layout
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC]">
      {/* T-095: Unified login header — shortmark + brand text + portal name */}
      <header style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: '1px solid #E2E8F0', background: 'white' }}>
        <img src="/supplier/brand/logo-shortmark.svg" alt="" width={20} height={20} />
        <span style={{ marginLeft: 10, fontWeight: 600, fontSize: 18, color: '#2563EB' }}>SuperMandi</span>
        <span style={{ margin: '0 12px', color: '#CBD5E1' }}>|</span>
        <span style={{ color: '#64748B', fontSize: 16 }}>Supplier Portal</span>
      </header>

      {/* Main Content - RET-AUD-057: Standardized padding (2rem 1rem = py-8 px-4) */}
      <main className="flex-1 flex items-center justify-center py-8 px-4">
        <div className="w-full max-w-[448px]">
          {/* Auth Card - white with subtle shadow per spec */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">{children}</div>
        </div>
      </main>

      {/* T-097: Unified footer — standard text + BuildStamp */}
      <footer style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '12px 24px', fontSize: 12, color: '#94A3B8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>&copy; 2026 SuperMandi Tech Pvt Ltd &middot; Made in India</span>
        <BuildStamp />
      </footer>
    </div>
  );
}
