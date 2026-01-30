'use client';

// GO-LIVE-172: Error boundary for Next.js App Router
// This file automatically acts as an error boundary for this route segment

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
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-red-500 text-6xl mb-4">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Something went wrong
        </h1>
        <p className="text-gray-600 mb-6">
          An unexpected error occurred. Please try again.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <details className="text-left mb-6 p-4 bg-gray-100 rounded text-sm">
            <summary className="cursor-pointer font-semibold">
              Error details
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-red-600">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
            {error.digest && (
              <p className="mt-2 text-gray-500">
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
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}
