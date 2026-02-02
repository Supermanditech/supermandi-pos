import { Toaster } from 'react-hot-toast';

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
              SuperMandi
            </h1>
            <span className="text-slate-400">|</span>
            <span className="text-slate-600 text-sm font-medium">Supplier Portal</span>
          </div>
          <a
            href="/login"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            Already registered? Sign In
          </a>
        </div>
      </header>

      {/* Main Content - Wide Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-sm text-slate-500">
          &copy; 2024 SuperMandi. All rights reserved.
        </div>
      </footer>

      <Toaster position="top-center" />
    </div>
  );
}
