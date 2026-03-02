import { headers } from 'next/headers';

// STG-421 FIX: Force dynamic rendering for all dashboard routes.
// Without this, Next.js standalone prerender cache serves cached HTML
// without executing edge middleware, bypassing the auth redirect.
// Reading headers() opts out of static prerendering.
export default async function DashboardTemplate({ children }: { children: React.ReactNode }) {
  await headers();
  return <>{children}</>;
}
