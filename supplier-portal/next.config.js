/** @type {import('next').NextConfig} */

// GO-LIVE-SOP: Get build info for cache-proof deployment verification
function getBuildInfo() {
  try {
    const { execSync } = require('child_process');
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const time = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(',', '');
    return { sha, time };
  } catch {
    return { sha: 'unknown', time: new Date().toISOString() };
  }
}

const buildInfo = getBuildInfo();

const nextConfig = {
  // CONSOLE-STRIP-001: Strip console.log/debug from production builds (keep error+warn)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
  // SM-023: Supplier Portal config
  // Production deployment with /supplier base path
  // GO-LIVE-B9: Server mode for nginx reverse proxy (basePath handles asset prefix)
  basePath: '/supplier',
  // GO-LIVE-B9: Match nginx trailing slash behavior to avoid redirect loops
  trailingSlash: true,
  // SUP-ROOT-001: Redirect bare root to /supplier/ so http://host:port/ doesn't 404
  async redirects() {
    return [
      {
        source: '/',
        destination: '/supplier/',
        basePath: false,
        permanent: false,
      },
    ];
  },
  // SUP-LOGIN-001: Empty string fallback allows relative paths through nginx proxy
  env: {
    API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '',
    // GO-LIVE-SOP: Inject build info at compile time
    NEXT_PUBLIC_BUILD_SHA: buildInfo.sha,
    NEXT_PUBLIC_BUILD_TIME: buildInfo.time,
  },
  // Allow images from any domain for product images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
