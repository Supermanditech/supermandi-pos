#!/usr/bin/env node
/* eslint-disable no-console */
// W5-BACKEND-JWT-001: Remove all hardcoded JWT_SECRET dev/test fallbacks from production code
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const fixes = [
  // auth-service config: remove getEnvRequired dev/test special cases
  {
    file: 'backend/services/auth-service/src/config.ts',
    old: "// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\nfunction getEnvRequired(key: string): string {\n  const value = process.env[key];\n  if (!value) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (key === 'JWT_SECRET' && (env === 'development' || env === 'test')) {\n      return 'dev-secret-change-in-prod';\n    }\n    if (key === 'SERVICE_TOKEN_SECRET' && (env === 'development' || env === 'test')) {\n      return 'dev-service-token-secret-change-in-prod';\n    }\n    throw new Error(`Required environment variable ${key} is not set`);\n  }\n  return value;\n}",
    new: "// W5-BACKEND-JWT-001: No hardcoded fallback — all required env vars must be explicitly set in all environments\nfunction getEnvRequired(key: string): string {\n  const value = process.env[key];\n  if (!value) {\n    throw new Error(`[FATAL] Required environment variable ${key} is not set — service startup aborted`);\n  }\n  return value;\n}",
  },
  // jwtAuth
  {
    file: 'backend/services/api-gateway/src/middleware/jwtAuth.ts',
    old: "// STAGING-FIX-005: Align fallback chain with backend's adminAuth.ts to prevent secret mismatches\n// AUDIT-API-007: Fail-fast in production if secrets missing; consistent dev fallback\n// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\n// LIVE.AUTH.JWT_SECRET_FALLBACK_REMOVAL_STACK.001: Remove ADMIN_TOKEN fallback \u2014 JWT_SECRET only\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET'];\n  if (!secret) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    logger.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');\n    process.exit(1);\n  }\n  return secret;\n})();",
    new: "// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET'];\n  if (!secret) {\n    logger.error('[FATAL] JWT_SECRET environment variable is not set \u2014 service startup aborted');\n    process.exit(1);\n  }\n  return secret;\n})();",
  },
  // adminSessionService
  {
    file: 'backend/services/api-gateway/src/services/adminSessionService.ts',
    old: "// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\n// LIVE.AUTH.JWT_SECRET_FALLBACK_REMOVAL_STACK.001: Remove ADMIN_TOKEN fallback \u2014 JWT_SECRET only\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET'];\n  if (!secret) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    logger.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');\n    process.exit(1);\n  }\n  return secret;\n})();",
    new: "// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET'];\n  if (!secret) {\n    logger.error('[FATAL] JWT_SECRET environment variable is not set \u2014 service startup aborted');\n    process.exit(1);\n  }\n  return secret;\n})();",
  },
  // testAuth
  {
    file: 'backend/services/api-gateway/src/routes/testAuth.ts',
    old: "// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\nconst TEST_JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET'];\n  if (!secret) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    logger.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');\n    process.exit(1);\n  }\n  return secret;\n})();",
    new: "// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\nconst TEST_JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET'];\n  if (!secret) {\n    logger.error('[FATAL] JWT_SECRET environment variable is not set \u2014 service startup aborted');\n    process.exit(1);\n  }\n  return secret;\n})();",
  },
  // supplier-service config
  {
    file: 'backend/services/supplier-service/src/config.ts',
    old: "  // JWT configuration for supplier auth (SM-005)\n  // ENV-FAILFAST-001: JWT_SECRET is CRITICAL \u2014 must not use dev default in production\n  jwtSecret: requireEnv('JWT_SECRET', 'dev-secret-change-in-prod'),",
    new: "  // JWT configuration for supplier auth (SM-005)\n  // W5-BACKEND-JWT-001: JWT_SECRET has no dev fallback \u2014 must be explicitly set in all environments\n  jwtSecret: (() => {\n    const s = process.env['JWT_SECRET'];\n    if (!s) { logger.error('[config] FATAL: JWT_SECRET is required in all environments'); process.exit(1); }\n    return s;\n  })(),",
  },
  // adminToken
  {
    file: 'backend/src/middleware/adminToken.ts',
    old: "// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\n// LIVE.AUTH.JWT_SECRET_FALLBACK_REMOVAL_STACK.001: Remove ADMIN_TOKEN fallback \u2014 JWT_SECRET only\nconst JWT_SECRET = (() => {\n  const secret = process.env.JWT_SECRET;\n  if (!secret) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');\n    process.exit(1);\n  }\n  return secret;\n})();",
    new: "// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\nconst JWT_SECRET = (() => {\n  const secret = process.env.JWT_SECRET;\n  if (!secret) {\n    log.error('[FATAL] JWT_SECRET environment variable is not set \u2014 service startup aborted');\n    process.exit(1);\n  }\n  return secret;\n})();",
  },
  // validateGatewayHeaders
  {
    file: 'backend/src/middleware/validateGatewayHeaders.ts',
    old: "// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET']?.trim();\n  if (!secret) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');\n    process.exit(1);\n  }\n  return secret;\n})();",
    new: "// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET']?.trim();\n  if (!secret) {\n    log.error('[FATAL] JWT_SECRET environment variable is not set \u2014 service startup aborted');\n    process.exit(1);\n  }\n  return secret;\n})();",
  },
  // adminAuth
  {
    file: 'backend/src/routes/v1/admin/adminAuth.ts',
    old: "// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\n// LIVE.AUTH.JWT_SECRET_FALLBACK_REMOVAL_STACK.001: Remove ADMIN_TOKEN fallback \u2014 JWT_SECRET only\nconst JWT_SECRET = (() => {\n  const secret = process.env.JWT_SECRET;\n  if (!secret) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');\n    process.exit(1);\n  }\n  return secret;\n})();",
    new: "// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\nconst JWT_SECRET = (() => {\n  const secret = process.env.JWT_SECRET;\n  if (!secret) {\n    log.error('[FATAL] JWT_SECRET environment variable is not set \u2014 service startup aborted');\n    process.exit(1);\n  }\n  return secret;\n})();",
  },
  // supplier/auth
  {
    file: 'backend/src/routes/v1/supplier/auth.ts',
    old: "// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET']?.trim();\n  if (!secret) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');\n    process.exit(1);\n  }\n  return secret;\n})();",
    new: "// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET']?.trim();\n  if (!secret) {\n    log.error('[FATAL] JWT_SECRET environment variable is not set \u2014 service startup aborted');\n    process.exit(1);\n  }\n  return secret;\n})();",
  },
  // retailer-admin/auth
  {
    file: 'backend/src/routes/v1/retailer-admin/auth.ts',
    old: "// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET']?.trim();\n  if (!secret) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');\n    process.exit(1);\n  }\n  return secret;\n})();",
    new: "// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET']?.trim();\n  if (!secret) {\n    log.error('[FATAL] JWT_SECRET environment variable is not set \u2014 service startup aborted');\n    process.exit(1);\n  }\n  return secret;\n})();",
  },
  // supplier/orders
  {
    file: 'backend/src/routes/v1/supplier/orders.ts',
    old: "// SUP-POS-012: JWT config for SSE token verification (EventSource can't set headers)\n// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\nconst SSE_JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET']?.trim();\n  if (!secret) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    log.error('[FATAL] JWT_SECRET must be set (NODE_ENV is not development/test)');\n    process.exit(1);\n  }\n  return secret;\n})();",
    new: "// SUP-POS-012: JWT config for SSE token verification (EventSource can't set headers)\n// W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\nconst SSE_JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET']?.trim();\n  if (!secret) {\n    log.error('[FATAL] JWT_SECRET environment variable is not set \u2014 service startup aborted');\n    process.exit(1);\n  }\n  return secret;\n})();",
  },
  // demo.ts
  {
    file: 'backend/src/routes/v1/demo.ts',
    old: "// SEC-003: Only allow dev fallback when NODE_ENV is explicitly 'development' or 'test'\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET'];\n  if (!secret || secret.length < 32) {\n    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    throw new Error('JWT_SECRET must be set and at least 32 characters');\n  }\n  return secret;\n})();",
    new: "// W5-BACKEND-JWT-001: JWT_SECRET must always be set and \u226532 chars; no hardcoded fallback in any environment\nconst JWT_SECRET = (() => {\n  const secret = process.env['JWT_SECRET'];\n  if (!secret || secret.length < 32) {\n    throw new Error('[FATAL] JWT_SECRET must be set and at least 32 characters');\n  }\n  return secret;\n})();",
  },
  // retailerPortal: fix inline fallback
  {
    file: 'backend/services/platform-service/src/routes/retailerPortal.ts',
    old: "  const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-prod';",
    new: "  // W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback\n  const jwtSecret = process.env['JWT_SECRET'];\n  if (!jwtSecret) { throw new Error('[FATAL] JWT_SECRET environment variable is not set'); }",
  },
];

let ok = 0;
let fail = 0;
for (const fix of fixes) {
  const filePath = path.join(ROOT, fix.file);
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(fix.old)) {
    console.error('MISMATCH in ' + fix.file);
    fail++;
    continue;
  }
  const newContent = content.replace(fix.old, fix.new);
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log('FIXED:', fix.file);
  ok++;
}
console.log('\nDone:', ok, 'fixed,', fail, 'failed');
