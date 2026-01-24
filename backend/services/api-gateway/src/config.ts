// API Gateway Configuration - V3.0.10 compliant
// RCAT-DEPLOY-001: Fixed service URL configuration for 10k store deployment

export interface ServiceConfig {
  name: string;
  url: string;
  pathPrefix: string;
  /** If false, the pathPrefix is NOT stripped when forwarding to backend (default: true) */
  stripPrefix?: boolean;
  /** Custom path to rewrite to (e.g., '/enroll' for /api/v1/pos/enroll -> /enroll) */
  rewriteTo?: string;
}

export interface GatewayConfig {
  port: number;
  env: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  services: ServiceConfig[];
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvIntOrDefault(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

/**
 * RCAT-DEPLOY-001: Get main backend URL with proper fallback chain
 * Production uses ADMIN_SERVICE_URL, but we support multiple env vars for compatibility:
 * 1. ADMIN_SERVICE_URL (production - http://supermandi-main-backend:3010)
 * 2. POS_SERVICE_URL (alias)
 * 3. BACKEND_SERVICE_URL (legacy)
 * 4. Default: http://localhost:3001 (local dev)
 */
function getMainBackendUrl(): string {
  return process.env['ADMIN_SERVICE_URL']
    || process.env['POS_SERVICE_URL']
    || process.env['BACKEND_SERVICE_URL']
    || 'http://localhost:3001';
}

export const config: GatewayConfig = {
  port: getEnvIntOrDefault('API_GATEWAY_PORT', 3000),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // Rate limiting
  rateLimitWindowMs: getEnvIntOrDefault('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
  rateLimitMax: getEnvIntOrDefault('RATE_LIMIT_MAX', 100), // 100 requests per window

  // Backend services
  services: [
    // ==========================================================================
    // ADMIN ROUTES - GW-ADMIN-001: Fix gateway routing for /api/v1/admin/*
    // More specific routes MUST come before less specific ones
    // stripPrefix: false because backends expect full /api/v1/admin/... path
    // ==========================================================================
    // Admin pos/events and analytics routes -> main backend (monolith)
    {
      name: 'admin-pos',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/pos',
      stripPrefix: false,
    },
    {
      name: 'admin-analytics',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/analytics',
      stripPrefix: false,
    },
    {
      name: 'admin-devices',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/devices',
      stripPrefix: false,
    },
    {
      name: 'admin-ai',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/ai',
      stripPrefix: false,
    },
    {
      name: 'admin-barcode-sheets',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/barcode-sheets',
      stripPrefix: false,
    },
    {
      name: 'admin-global-products',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/global-products',
      stripPrefix: false,
    },
    {
      name: 'admin-stores',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/stores',
      stripPrefix: false,
    },
    {
      name: 'admin-device-enrollments',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/device-enrollments',
      stripPrefix: false,
    },
    {
      name: 'admin-pending-suppliers',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/pending-suppliers',
      stripPrefix: false,
    },
    {
      name: 'admin-verified-suppliers',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/verified-suppliers',
      stripPrefix: false,
    },
    // All other admin routes -> platform-service
    {
      name: 'admin',
      url: getEnvOrDefault('PLATFORM_SERVICE_URL', 'http://localhost:3002'),
      pathPrefix: '/api/v1/admin',
      stripPrefix: false,
    },
    // ==========================================================================
    {
      name: 'auth',
      url: getEnvOrDefault('AUTH_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/auth',
    },
    {
      name: 'platform',
      url: getEnvOrDefault('PLATFORM_SERVICE_URL', 'http://localhost:3002'),
      pathPrefix: '/api/v1/platform',
    },
    {
      name: 'supplier',
      url: getEnvOrDefault('SUPPLIER_SERVICE_URL', 'http://localhost:3003'),
      pathPrefix: '/api/v1/suppliers',
    },
    {
      name: 'catalog',
      url: getEnvOrDefault('CATALOG_SERVICE_URL', 'http://localhost:3004'),
      pathPrefix: '/api/v1/catalog',
    },
    {
      name: 'inventory',
      url: getEnvOrDefault('INVENTORY_SERVICE_URL', 'http://localhost:3005'),
      pathPrefix: '/api/v1/inventory',
    },
    {
      name: 'orders',
      url: getEnvOrDefault('ORDER_SERVICE_URL', 'http://localhost:3006'),
      pathPrefix: '/api/v1/orders',
    },
    {
      name: 'reorder',
      url: getEnvOrDefault('REORDER_SERVICE_URL', 'http://localhost:3007'),
      pathPrefix: '/api/v1/reorder',
    },
    // ==========================================================================
    // POS ROUTES - GW-ROUTES-001: All POS endpoints go to main-backend
    // Includes: enroll, ui-status, suppliers, daily-summary, stock-in, store-products
    // ==========================================================================
    {
      name: 'pos',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/pos',
      stripPrefix: false,
    },
    // ==========================================================================
    {
      name: 'voice',
      url: getEnvOrDefault('VOICE_SERVICE_URL', 'http://localhost:3008'),
      pathPrefix: '/api/v1/voice',
    },
    // Retailer Admin Portal routes
    // RCAT-DEPLOY-001: Health endpoint routes to platform-service via catch-all
    // (platform-service has /health endpoint, gateway strips prefix to /health)
    // Auth routes go to auth-service (Firebase token exchange)
    {
      name: 'retailer-auth',
      url: getEnvOrDefault('AUTH_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/retailer-admin/auth',
    },
    // RCAT-DEPLOY-001: Health endpoint for gateway verification -> main backend
    {
      name: 'retailer-health',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/retailer-admin/health',
      stripPrefix: false,
    },
    // FE-RETAILER-INVENTORY-001: Inventory routes go to main backend
    {
      name: 'retailer-inventory',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/retailer-admin/inventory',
      stripPrefix: false,
    },
    // FE-RETAILER-CAT-001: Categories routes go to main backend
    {
      name: 'retailer-categories',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/retailer-admin/categories',
      stripPrefix: false,
    },
    // RCAT-PROD-001: Products routes go to main backend
    {
      name: 'retailer-products',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/retailer-admin/products',
      stripPrefix: false,
    },
    // RCAT-SUP-001: Suppliers routes go to main backend
    {
      name: 'retailer-suppliers',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/retailer-admin/suppliers',
      stripPrefix: false,
    },
    // RCAT-SEARCH-001: Search routes go to main backend
    {
      name: 'retailer-search',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/retailer-admin/search',
      stripPrefix: false,
    },
    // Portal API catch-all routes go to platform-service
    {
      name: 'retailer-portal',
      url: getEnvOrDefault('PLATFORM_SERVICE_URL', 'http://localhost:3002'),
      pathPrefix: '/api/v1/retailer-admin',
    },
  ],
};

export default config;
