'use client';

// GO-LIVE-172: Error boundary for Next.js App Router
// This file automatically acts as an error boundary for this route segment
// STG-226: Replaced gray-* with slate-* for dark mode consistency

import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error('[GO-LIVE-172] Application error caught:', error);
  }, [error]);

  const handleGoHome = () => {
    window.location.href = '/supplier/dashboard';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 text-center">
        <div className="text-red-500 text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          Something went wrong
        </h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          An unexpected error occurred. Please try again.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <details className="text-left mb-6 p-4 bg-slate-100 rounded text-sm">
            <summary className="cursor-pointer font-semibold">
              Error details
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-red-600">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
            {error.digest && (
              <p className="mt-2 text-slate-500">
                Error digest: {error.digest}
              </p>
            )}
          </details>
        )}

        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={handleGoHome}
            className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}
