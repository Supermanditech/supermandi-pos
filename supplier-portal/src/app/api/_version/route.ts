import { NextResponse } from 'next/server';

/**
 * GO-LIVE VERSION ENDPOINT
 * Returns build commit and timestamp for deployment verification
 * Accessible at: /supplier/api/_version
 */
export async function GET() {
  return NextResponse.json({
    commit: process.env.NEXT_PUBLIC_BUILD_SHA || 'unknown',
    buildTime: process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString(),
    portal: 'supplier',
  });
}
