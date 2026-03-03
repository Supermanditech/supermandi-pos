import { BuildStamp } from '@/components/BuildStamp';
import { ThemeToggle } from '@/components/ThemeToggle';

/**
 * HELP-001: Standalone layout for Help & Support page.
 * Matches auth layout style but with wider content area.
 * STG-373: Moved from app/help/ to app/support/ to resolve route conflict with (dashboard)/help/.
 * STG-223: Replaced inline styles with Tailwind classes + dark mode support
 */
export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC] dark:bg-slate-900">
      {/* Header — same as auth layout */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center">
          <img src="/supplier/brand/logo-shortmark.svg" alt="" width={24} height={24} />
          <span className="ml-2.5 font-bold text-lg text-white bg-[#2563EB] dark:text-slate-900 dark:bg-white rounded-full px-3 py-1 leading-none">SuperMandi</span>
          <span className="mx-3 text-slate-300 dark:text-slate-600">|</span>
          <span className="text-slate-500 dark:text-slate-400 text-base">Supplier Portal</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content — wider than auth card for help content */}
      <main className="flex-1 flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-xl">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-3 px-6 text-xs text-slate-500 dark:text-slate-400 flex justify-between items-center">
        <span>&copy; {new Date().getFullYear()} SuperMandi Tech Pvt Ltd</span>
        <div className="flex items-center gap-4">
          <a href="/supplier/login" className="text-slate-500 dark:text-slate-400 text-xs no-underline hover:underline">Sign In</a>
          <BuildStamp />
        </div>
      </footer>
    </div>
  );
}
