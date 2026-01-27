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

/**
 * SM-004: Get payment service URL
 * Production: http://supermandi-payment-service:3011
 * Local dev: http://localhost:3011
 */
function getPaymentServiceUrl(): string {
  return process.env['PAYMENT_SERVICE_URL'] || 'http://localhost:3011';
}

/**
 * SM-005: Get supplier service URL
 * Production: http://supermandi-supplier-service:3003
 * Local dev: http://localhost:3002
 */
function getSupplierServiceUrl(): string {
  return process.env['SUPPLIER_SERVICE_URL'] || 'http://localhost:3002';
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
    // P1-002: Explicit admin health route -> main backend
    {
      name: 'admin-health',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/health',
      stripPrefix: false,
    },
    // ADM-SCR-002: Admin users route -> main backend
    {
      name: 'admin-users',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/users',
      stripPrefix: false,
    },
    // ADM-SCR-003: Admin settings route -> main backend
    {
      name: 'admin-settings',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin/settings',
      stripPrefix: false,
    },
    // AUD-042-A: All other admin routes -> main backend (monolith deployment)
    {
      name: 'admin',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/admin',
      stripPrefix: false,
    },
    // ==========================================================================
    // AUD-042-A: Auth routes -> main backend (monolith deployment)
    {
      name: 'auth',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/auth',
      stripPrefix: false,
    },
    // AUD-042-A: Platform routes -> main backend (monolith deployment)
    {
      name: 'platform',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/platform',
      stripPrefix: false,
    },
    // ==========================================================================
    // SM-005/SM-006/SM-007: Supplier Portal routes -> main-backend (monolith)
    // Handles supplier auth, products, profile, orders, dashboard
    // ==========================================================================
    {
      name: 'supplier-portal',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/supplier',
      stripPrefix: false,
    },
    // AUD-042-A: Supplier routes -> main backend (monolith deployment)
    {
      name: 'supplier',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/suppliers',
      stripPrefix: false,
    },
    // AUD-042-A: Catalog routes -> main backend (monolith deployment)
    {
      name: 'catalog',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/catalog',
      stripPrefix: false,
    },
    // AUD-042-A: Inventory routes -> main backend (monolith deployment)
    {
      name: 'inventory',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/inventory',
      stripPrefix: false,
    },
    // AUD-042-A: Orders routes -> main backend (monolith deployment)
    {
      name: 'orders',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/orders',
      stripPrefix: false,
    },
    // AUD-042-A: Reorder routes -> main backend (monolith deployment)
    {
      name: 'reorder',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/reorder',
      stripPrefix: false,
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
    // AUD-042-A: Voice routes -> main backend (monolith deployment)
    {
      name: 'voice',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/voice',
      stripPrefix: false,
    },
    // Retailer Admin Portal routes
    // AUD-042-A: Auth routes -> main backend (monolith deployment)
    {
      name: 'retailer-auth',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/retailer-admin/auth',
      stripPrefix: false,
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
    // AUD-042-A: Portal API catch-all routes -> main backend (monolith deployment)
    {
      name: 'retailer-portal',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/retailer-admin',
      stripPrefix: false,
    },
    // MED-004: Demo routes -> main backend
    {
      name: 'demo',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/demo',
      stripPrefix: false,
    },
    // ==========================================================================
    // SM-004: Payment service routes -> payment-service microservice
    // ==========================================================================
    {
      name: 'payments',
      url: getPaymentServiceUrl(),
      pathPrefix: '/api/v1/payments',
      stripPrefix: true,
    },
  ],
};

export default config;
