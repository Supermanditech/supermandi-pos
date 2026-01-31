'use client';

// GO-LIVE-SUP-AUTH: Forgot Password not needed in OTP-only model
// Redirect to login page

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect to login after 3 seconds
    const timer = setTimeout(() => {
      router.push('/login');
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <>
      <h2 className="text-xl font-semibold text-slate-800 mb-2">
        Password Not Required
      </h2>

      <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg mb-4 text-sm">
        <p className="font-medium">OTP-Only Authentication</p>
        <p className="mt-1">
          The Supplier Portal uses phone OTP verification for login. No password is required.
        </p>
      </div>

      <p className="text-slate-600 mb-6">
        Simply go to the login page and enter your phone number to receive an OTP.
        You will be redirected automatically...
      </p>

      <Link
        href="/login"
        className="btn btn-primary w-full py-3 text-center block"
      >
        Go to Login
      </Link>
    </>
  );
}
