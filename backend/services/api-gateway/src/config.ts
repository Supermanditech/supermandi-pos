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
      url: getEnvOrDefault('AUTH_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/pos',
      stripPrefix: false,
    },
    {
      name: 'admin-analytics',
      url: getEnvOrDefault('AUTH_SERVICE_URL', 'http://localhost:3001'),
      pathPrefix: '/api/v1/admin/analytics',
      stripPrefix: false,
    },
    // All other admin routes (stores, pending-suppliers, etc.) -> platform-service
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
    {
      name: 'pos',
      url: getEnvOrDefault('POS_SERVICE_URL', 'http://supermandi-enroll-service:3009'),
      pathPrefix: '/api/v1/pos',
    },
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
    // Portal API routes go to platform-service
    {
      name: 'retailer-portal',
      url: getEnvOrDefault('PLATFORM_SERVICE_URL', 'http://localhost:3002'),
      pathPrefix: '/api/v1/retailer-admin',
    },
  ],
};

export default config;
