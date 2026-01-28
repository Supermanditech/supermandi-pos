/** @type {import('next').NextConfig} */
const nextConfig = {
  // SM-023: Supplier Portal config
  // GL-WF-009: Removed localhost fallback - API URL must be explicitly configured
  env: {
    API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || '',
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
