"use strict";
// API Gateway Configuration - V3.0.9 compliant
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
function getEnvOrDefault(key, defaultValue) {
    return process.env[key] || defaultValue;
}
function getEnvIntOrDefault(key, defaultValue) {
    const value = process.env[key];
    return value ? parseInt(value, 10) : defaultValue;
}
exports.config = {
    port: getEnvIntOrDefault('API_GATEWAY_PORT', 3000),
    env: getEnvOrDefault('NODE_ENV', 'development'),
    rateLimitWindowMs: getEnvIntOrDefault('RATE_LIMIT_WINDOW_MS', 60000),
    rateLimitMax: getEnvIntOrDefault('RATE_LIMIT_MAX', 100),
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
        {
            name: 'v2',
            url: 'http://supermandi-enroll-service:3009',
            pathPrefix: '/api/v2',
        },
        {
            name: 'pos',
            url: 'http://supermandi-enroll-service:3009',
            pathPrefix: '/api/v1/pos',
        },
        {
            name: 'voice',
            url: 'http://supermandi-enroll-service:3009',
            pathPrefix: '/api/v1/voice',
        },
    ],
};
exports.default = exports.config;
