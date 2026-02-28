import { BuildStamp } from '@/components/BuildStamp';

/**
 * HELP-001: Standalone layout for Help & Support page.
 * Matches auth layout style but with wider content area.
 * Accessible both pre-login and post-login (top-level route avoids route group collision).
 */
export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC]">
      {/* Header — same as auth layout */}
      <header style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: '1px solid #E2E8F0', background: 'white' }}>
        <img src="/supplier/brand/logo-shortmark.svg" alt="" width={24} height={24} />
        <span style={{ marginLeft: 10, fontWeight: 700, fontSize: 18, color: '#fff', background: '#2563EB', borderRadius: 999, padding: '4px 12px', lineHeight: 1 }}>SuperMandi</span>
        <span style={{ margin: '0 12px', color: '#CBD5E1' }}>|</span>
        <span style={{ color: '#64748B', fontSize: 16 }}>Supplier Portal</span>
      </header>

      {/* Main Content — wider than auth card for help content */}
      <main className="flex-1 flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-xl">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '12px 24px', fontSize: 12, color: '#94A3B8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="/supplier/login" style={{ color: '#94A3B8', fontSize: 12, textDecoration: 'none' }}>Sign In</a>
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}
