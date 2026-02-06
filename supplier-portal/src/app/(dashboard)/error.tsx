'use client';

// ISSUE-MICRO-097: Error boundary for dashboard route segments
// Catches errors within dashboard pages without crashing the full layout

import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[ISSUE-MICRO-097] Dashboard error caught:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-6 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Something went wrong</h2>
        <p className="text-slate-600 mb-4">
          An error occurred while loading this page. Please try again.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
