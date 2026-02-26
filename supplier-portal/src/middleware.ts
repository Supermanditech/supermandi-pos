// REQ.AUDIT.W4.SUPPLIER.LAYOUT-ONLY-AUTH-GUARD.001
// Next.js edge middleware to enforce auth at the routing layer for all dashboard routes.
// This is fully ADDITIVE — it does not modify any existing file.
// Without this file, auth is only enforced in (dashboard)/layout.tsx (client-side),
// which can be bypassed by direct navigation before hydration completes.
//
// Implementation: checks for the supplier auth cookie. If absent, redirects to /supplier/login/.
// The cookie name must match what the auth service sets (default: "supplier_token").
import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = [
  "/supplier/dashboard",
  "/supplier/products",
  "/supplier/orders",
  "/supplier/earnings",
  "/supplier/invoices",
  "/supplier/kyc",
  "/supplier/profile",
  "/supplier/chat",
  "/supplier/notifications",
  "/supplier/upload",
  "/supplier/bnpl-orders",
];

// Cookie name must match the HttpOnly cookie set by the auth service.
// Adjust AUTH_COOKIE_NAME if the backend uses a different name.
const AUTH_COOKIE_NAME = process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME ?? "supplier_token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get(AUTH_COOKIE_NAME);
  if (!authCookie?.value) {
    const loginUrl = new URL("/supplier/login/", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all supplier dashboard paths
    "/supplier/dashboard/:path*",
    "/supplier/products/:path*",
    "/supplier/orders/:path*",
    "/supplier/earnings/:path*",
    "/supplier/invoices/:path*",
    "/supplier/kyc/:path*",
    "/supplier/profile/:path*",
    "/supplier/chat/:path*",
    "/supplier/notifications/:path*",
    "/supplier/upload/:path*",
    "/supplier/bnpl-orders/:path*",
  ],
};
