'use client';

// GO-LIVE-SUP-AUTH: Pending Approval screen for suppliers awaiting admin approval

import Link from 'next/link';

export default function PendingApprovalPage() {
  return (
    <>
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        Account Pending Approval
      </h2>

      <div className="text-center py-4">
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

        <h3 className="text-lg font-semibold text-amber-600 mb-2">
          Awaiting Admin Approval
        </h3>

        <p className="text-slate-600 mb-6">
          Your supplier account is currently under review. You will receive a notification
          once your account has been approved by an administrator.
        </p>

        <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
          <h4 className="font-medium text-slate-900 mb-2">What happens next?</h4>
          <ul className="text-sm text-slate-600 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">1.</span>
              <span>Our team reviews your business details and documentation</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">2.</span>
              <span>You&apos;ll receive an email/SMS once approved</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">3.</span>
              <span>Login again to access your supplier dashboard</span>
            </li>
          </ul>
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
