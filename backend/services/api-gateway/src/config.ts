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
  // GL-CRIT-0027: Stricter rate limit for auth endpoints
  authRateLimitMax: number;
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
 * 1. ADMIN_SERVICE_URL (primary)
 * 2. POS_SERVICE_URL (alias)
 * 3. BACKEND_SERVICE_URL (legacy)
 * 4. Default: http://localhost:3010 (main-backend port, dev only)
 */
function getMainBackendUrl(): string {
  const url = process.env['ADMIN_SERVICE_URL']
    || process.env['POS_SERVICE_URL']
    || process.env['BACKEND_SERVICE_URL'];
  if (url) return url;
  // STAGE-005: Fail-fast in staging AND production (not just production)
  if (process.env['NODE_ENV'] !== 'development') {
    console.error(`[config] FATAL: ADMIN_SERVICE_URL is required in ${process.env['NODE_ENV']} but not set`);
    process.exit(1);
  }
  return 'http://localhost:3010';
}


export const config: GatewayConfig = {
  // CR-HEALTH-001: Cloud Run sets PORT; fall back to service-specific var
  port: parseInt(process.env['PORT'] || '') || getEnvIntOrDefault('API_GATEWAY_PORT', 3000),
  env: getEnvOrDefault('NODE_ENV', 'development'),

  // Rate limiting - GL-CRIT-0027: Reduced from 100 to 30/min for public APIs
  rateLimitWindowMs: getEnvIntOrDefault('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
  rateLimitMax: getEnvIntOrDefault('RATE_LIMIT_MAX', 30), // 30 requests per window
  // Auth endpoints have stricter limit
  authRateLimitMax: getEnvIntOrDefault('AUTH_RATE_LIMIT_MAX', 5), // 5 auth attempts per window

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
    // RET-AUD-019: Registration routes (alias for /retailer-admin/registration)
    // Public endpoint for retailer self-registration
    // ==========================================================================
    {
      name: 'registration',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/registration',
      stripPrefix: false,
    },
    // ==========================================================================
    // DOCS-001: Document storage routes -> main backend
    // ==========================================================================
    {
      name: 'documents',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/documents',
      stripPrefix: false,
    },
    // ==========================================================================
    // GL-AUD-002: Webhook routes -> main backend (handles Razorpay callbacks)
    // ==========================================================================
    {
      name: 'webhooks',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/webhooks',
      stripPrefix: false,
    },
    // ==========================================================================
    // GL-AUD-003: Payment Service Routing Clarification
    // ==========================================================================
    // ARCHITECTURE DECISION (2026-01-27):
    // - SELL payment routes (/api/v1/pos/payments/*) -> main-backend (handled above)
    // - BUY payment routes (/api/v1/orders/*/pay) -> main-backend (handled above)
    // - Payment webhooks (/api/v1/webhooks/razorpay/*) -> main-backend (handled above)
    //
    // The payment-service microservice is scaffolded for future extraction but
    // currently only exposes health endpoints. All payment logic remains in
    // main-backend for Go-Live. This route is kept for:
    // 1. Health checks via /api/v1/payments/health
    // 2. Future microservice migration
    //
    // SM-004 + STAGE-010: Payment routes -> main-backend (future microservice extraction)
    // stripPrefix: false — main-backend expects the full /api/v1/payments/* path.
    // Using getMainBackendUrl() since payment-service is not deployed (scaffolded only).
    // ==========================================================================
    {
      name: 'payments',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/payments',
      stripPrefix: false,
    },
    // ==========================================================================
    // T1-010: Missing gateway routes — added for production completeness
    // ==========================================================================
    {
      name: 'chat',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/chat',
      stripPrefix: false,
    },
    {
      name: 'credit',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/credit',
      stripPrefix: false,
    },
    {
      name: 'uploads',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/uploads',
      stripPrefix: false,
    },
    {
      name: 'retailer',
      url: getMainBackendUrl(),
      pathPrefix: '/api/v1/retailer',
      stripPrefix: false,
    },
  ],
};

export default config;
