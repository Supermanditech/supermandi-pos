'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
// FIX-023: Use cookie check instead of in-memory token (survives page reload)
import { hasAuthCookie } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (hasAuthCookie()) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );
}
