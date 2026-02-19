'use client';

// T-030: Polished pending approval page — status, timeline, contact info

import Link from 'next/link';

export default function PendingApprovalPage() {
  return (
    <>
      <div className="text-center py-2">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-amber-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-slate-900 mb-1">
          Application Under Review
        </h2>
        <p className="text-slate-500 text-sm mb-5">
          Your supplier account is being reviewed by our team.
        </p>

        <div className="bg-slate-50 rounded-lg p-4 mb-5 text-left">
          <h4 className="font-medium text-slate-900 mb-2 text-sm">What happens next?</h4>
          <ul className="text-sm text-slate-600 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5 font-medium">1.</span>
              <span>Our team reviews your business details and documentation</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5 font-medium">2.</span>
              <span>You&apos;ll receive an email/SMS notification once approved</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5 font-medium">3.</span>
              <span>Login again to access your supplier dashboard</span>
            </li>
          </ul>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-5 text-left">
          <p className="text-sm text-blue-800">
            <strong>Typical review time:</strong> 1-2 business days.
            For urgent requests, contact us at{' '}
            <a href="mailto:hello@supermandi.tech" className="underline font-medium">
              hello@supermandi.tech
            </a>
          </p>
        </div>

        <Link
          href="/login"
          className="btn btn-secondary w-full py-3 text-center block"
        >
          Back to Login
        </Link>
      </div>
    </>
  );
}
