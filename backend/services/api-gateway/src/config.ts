// API Gateway Configuration - V3.0.9 compliant

export interface ServiceConfig {
  name: string;
  url: string;
  pathPrefix: string;
  /** If false, the pathPrefix is NOT stripped when forwarding to backend (default: true) */
  stripPrefix?: boolean;
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
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/pos',
      stripPrefix: false,
    },
    {
      name: 'admin-analytics',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/analytics',
      stripPrefix: false,
    },
    {
      name: 'admin-devices',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/devices',
      stripPrefix: false,
    },
    {
      name: 'admin-ai',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/ai',
      stripPrefix: false,
    },
    {
      name: 'admin-barcode-sheets',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/barcode-sheets',
      stripPrefix: false,
    },
    {
      name: 'admin-global-products',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/global-products',
      stripPrefix: false,
    },
    {
      name: 'admin-stores',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/stores',
      stripPrefix: false,
    },
    {
      name: 'admin-device-enrollments',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/device-enrollments',
      stripPrefix: false,
    },
    // All other admin routes (pending-suppliers, etc.) -> platform-service
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
    // POS ROUTES - GW-ROUTES-001: Fix routing for POS endpoints
    // Most POS endpoints are in the main backend (3001)
    // Only /pos/enroll goes to enroll-service (3009)
    // More specific routes MUST come before less specific ones
    // ==========================================================================
    {
      name: 'pos-enroll',
      url: getEnvOrDefault('ENROLL_SERVICE_URL', 'http://supermandi-enroll-service:3009'),
      pathPrefix: '/api/v1/pos/enroll',
    },
    {
      name: 'pos',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/pos',
    },
    // ==========================================================================
    {
      name: 'voice',
      url: getEnvOrDefault('VOICE_SERVICE_URL', 'http://localhost:3008'),
      pathPrefix: '/api/v1/voice',
    },
    // Retailer Admin Portal routes
    // Auth routes go to auth-service (Firebase token exchange)
    {
      name: 'retailer-auth',
      url: getEnvOrDefault('AUTH_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/retailer-admin/auth',
    },
    // FE-RETAILER-INVENTORY-001: Inventory routes go to main backend
    {
      name: 'retailer-inventory',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/retailer-admin/inventory',
      stripPrefix: false,
    },
    // FE-RETAILER-CAT-001: Categories routes go to main backend
    {
      name: 'retailer-categories',
      url: getEnvOrDefault('BACKEND_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/retailer-admin/categories',
      stripPrefix: false,
    },
    // Portal API routes go to platform-service
    {
      name: 'retailer-portal',
      url: getEnvOrDefault('PLATFORM_SERVICE_URL', 'http://localhost:3002'),
      pathPrefix: '/api/v1/retailer-admin',
    },
  ],
};

export default config;
