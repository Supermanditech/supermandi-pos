import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { noCacheHeaders } from "./middleware/noCache";
import { perEndpointBodyLimit } from "./middleware/bodySizeLimit";
import { correlationIdMiddleware } from "./middleware/correlationId";
import { tracingMiddleware } from "./middleware/tracing";
import { metricsMiddleware } from "./services/metricsCollector";
import { errorReportingMiddleware } from "./services/errorReporter";
import { getTranslationHealth } from "./services/translationService";
// GCP-STG-0462: Email config validation at startup
import { validateEmailConfig } from "./services/emailService";
import { initializeFirebase } from "@supermandi/common";
import { logger } from "./lib/logger";
// REQ.AUDIT.W5.BACKEND.HEALTH-ENDPOINT-NO-DEPS-CHECK.001
import { getPool } from "./db/client";
// SCALE-D3: Async CSV import worker via BullMQ
import { initCsvImportWorker } from "./routes/v1/retailer-admin/csvImport";

// Always load backend env from `backend/.env` (not repo root `/.env`).
// This prevents Prisma errors like missing DATABASE_URL when the process is started with a different CWD (e.g. pm2/systemd).
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// GO-LIVE-045: Initialize Firebase Admin SDK for server-side token verification
const firebaseEnabled = process.env.FIREBASE_ENABLED !== 'false';
const firebaseServiceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;

if (firebaseEnabled && (firebaseServiceAccountPath || firebaseProjectId)) {
  try {
    initializeFirebase({
      serviceAccountPath: firebaseServiceAccountPath,
      projectId: firebaseProjectId,
    });
    logger.info('[App] Firebase Admin SDK initialized for server-side token verification');
  } catch (error) {
    logger.warn('[App] Firebase initialization failed (retailer portal will use fallback mode)', { error: String(error) });
  }
} else {
  logger.warn('[App] Firebase not configured - retailer portal login will use client-side verification only');
}

// SCALE-D3: Start BullMQ CSV import worker (no-op when REDIS_ENABLED=false)
initCsvImportWorker();

// V3-HARDEN-189: Phase 21 startup validation — non-blocking, logs structured readiness
import { validatePhase21Startup } from "./services/phase21StartupValidation";
validatePhase21Startup().catch((err) => {
  logger.warn("[App] Phase 21 startup validation failed (non-blocking): " + String(err));
});

// GCP-STG-0462: Validate email service config at startup (warn-only, non-blocking)
validateEmailConfig();

// DEV-071: Capture build info at startup for /health endpoint
// INFRA-003: Use env var baked at Docker build time (execSync fails in containers without .git)
const GIT_SHA = process.env.GIT_SHA || "unknown";
const BUILD_TIME = process.env.BUILD_TIME || new Date().toISOString();

const app = express();

// =============================================================================
// BATCH5-SUGGESTION-2: Trust proxy configuration for correct IP detection
// BATCH5-SUGGESTION-10: In-memory rate limits - document single-instance limitation
// =============================================================================
// IMPORTANT: Rate limits are in-memory per instance. If we scale horizontally,
// move to Redis-based limiter. Set RATE_LIMIT_STORE=redis when ready.
// Current: Single VM deployment - in-memory is sufficient.
// =============================================================================

// Trust proxy when behind nginx/load balancer (reads X-Forwarded-For correctly)
// Set TRUST_PROXY_HOPS to the number of proxies in front (default: 1 for single nginx)
const trustProxyHops = parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);
// STAGE-005: Enable trust proxy in staging too (Cloud Run + LB)
if (process.env.NODE_ENV !== "development" || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", trustProxyHops);
  logger.info(`[App] Trust proxy enabled`, { trustProxyHops });
}

// ITER3-P0-001: Configure CORS with explicit allowed origins
// ENV-FAILFAST-001 + STAGE-005: ALLOWED_ORIGINS required in non-development
// STG-519: Accept both CORS_ALLOWED_ORIGINS (gateway convention) and ALLOWED_ORIGINS (legacy)
const corsOptions: cors.CorsOptions = {
  origin: (() => {
    const originsEnv = process.env.CORS_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS;
    if (originsEnv) {
      // GCP-STG-0490: Block wildcard CORS in production, warn in staging
      if (originsEnv.trim() === '*') {
        if (process.env.NODE_ENV === 'production') {
          logger.error('[config] FATAL: CORS_ALLOWED_ORIGINS="*" is forbidden in production. Set explicit origins: https://app.supermandi.tech,https://supplier.supermandi.tech,https://admin.supermandi.tech');
          process.exit(1);
        }
        logger.warn('[config] GCP-STG-0490: CORS_ALLOWED_ORIGINS="*" detected — acceptable for staging but MUST be restricted for production');
      }
      return originsEnv.split(',').map(o => o.trim()).filter(Boolean);
    }
    if (process.env.NODE_ENV !== 'development') {
      logger.error(`[config] FATAL: CORS_ALLOWED_ORIGINS or ALLOWED_ORIGINS is required in ${process.env.NODE_ENV} but not set`);
      process.exit(1);
    }
    return true; // Allow all in development
  })(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Token', 'X-Admin-Token', 'X-Request-ID'],
  // REQ.AUDIT.W5.BACKEND.CORS-CACHE-TOO-LONG.001: reduced from 24h to 1h for faster emergency policy propagation
  maxAge: 3600,
};
app.use(cors(corsOptions));
// T-210: Attach correlation ID to every request (from X-Request-Id or X-Cloud-Trace-Context)
app.use(correlationIdMiddleware);
// T-223: GCP Cloud Trace integration — extract trace context from Cloud Run headers
app.use(tracingMiddleware);
// T-223: Performance metrics collection — track latency and throughput per endpoint
app.use(metricsMiddleware);
// GO-LIVE-194: Per-endpoint body size limits (replaces global 1MB limit)
// ITER4-P1-012: Now using perEndpointBodyLimit which applies different limits per endpoint
app.use("/api", perEndpointBodyLimit());
// Keep 1MB fallback for non-API routes (webhooks, etc.)
// WA-001: Capture raw body buffer for webhook signature verification (X-Hub-Signature-256)
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  },
}));

app.get("/health", async (_req, res) => {
  // Cloud health-check contract: must be JSON { status: "ok" }
  // DEV-071: Include version info for deployment verification
  // REQ.AUDIT.W5.BACKEND.HEALTH-ENDPOINT-NO-DEPS-CHECK.001: verify DB connectivity
  const info: Record<string, unknown> = {
    service: "main-backend",
    gitSha: GIT_SHA,
    startTime: BUILD_TIME,
    env: process.env.NODE_ENV || "development",
  };
  try {
    const pool = getPool();
    if (pool) {
      await pool.query("SELECT 1");
      info.db = "ok";
    } else {
      info.db = "no_pool";
    }
    res.json({ status: "ok", ...info });
  } catch {
    res.status(503).json({ status: "degraded", ...info, db: "unreachable" });
  }
});

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get("/version", (_req, res) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'main-backend',
    built: process.env.BUILD_TIME || new Date().toISOString(),
    // SA-P2-003-AUTO: Min app version for operator verification
    minAppVersion: process.env.MIN_APP_VERSION || 'not-set',
  });
});

// TR-PEND-003: Translation service health check
app.get("/health/translation", (_req, res) => {
  const health = getTranslationHealth();
  res.json(health);
});

// CSRF-PROTECTION-BACKEND-MISSING: CSRF check on state-changing methods
// All legitimate API clients send Content-Type: application/json or X-Requested-With.
// Cross-origin HTML form submissions cannot set these headers (prevents CSRF).
const CSRF_STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_EXEMPT_PREFIXES = ['/api/v1/health', '/api/v1/ready', '/api/v1/webhooks', '/health', '/ready', '/version'];
app.use('/api', (req, res, next) => {
  if (!CSRF_STATE_CHANGING.has(req.method)) return next();
  const p = req.path.toLowerCase();
  if (CSRF_EXEMPT_PREFIXES.some(prefix => p.startsWith(prefix))) return next();
  const requestedWith = req.headers['x-requested-with'];
  const contentType = req.headers['content-type'];
  if (requestedWith || (contentType && contentType.includes('application/json'))) return next();
  logger.warn(`[CSRF] Blocked ${req.method} ${req.path} — missing Content-Type:json or X-Requested-With`);
  res.status(403).json({ error: { code: 'CSRF_VALIDATION_FAILED', message: 'Include Content-Type: application/json or X-Requested-With header.' } });
});

// CACHE-000: Enforce no-cache headers on all dynamic API responses
app.use("/api", noCacheHeaders, apiRouter);

// FINDING-004: Standardize 404 response format (must be before errorHandler)
app.use(notFoundHandler);

// T-223: GCP Error Reporting integration — report errors to Cloud Error Reporting
app.use(errorReportingMiddleware);

app.use(errorHandler);

export default app;
