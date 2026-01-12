// API Gateway Configuration - V3.0.9 compliant

export interface ServiceConfig {
  name: string;
  url: string;
  pathPrefix: string;
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
  ],
};

export default config;
