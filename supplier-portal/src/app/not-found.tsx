import Link from 'next/link';

// T-116: Branded 404 page for supplier portal (Next.js convention)
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="text-7xl font-extrabold text-slate-200">404</div>
      <h1 className="text-2xl font-semibold text-slate-900 mt-4 mb-2">Page Not Found</h1>
      <p className="text-sm text-slate-500 max-w-md mb-6">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link href="/dashboard" className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
        Back to Dashboard
      </Link>
    </div>
  );
}
