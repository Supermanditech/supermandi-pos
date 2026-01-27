export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
            SuperMandi
          </h1>
          <p className="text-slate-600 mt-1">Supplier Portal</p>
        </div>

        {/* Auth Card */}
        <div className="card">{children}</div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-6">
          &copy; 2024 SuperMandi. All rights reserved.
        </p>
      </div>
    </div>
  );
}
