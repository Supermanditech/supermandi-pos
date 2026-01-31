import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { execSync } from "child_process";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { noCacheHeaders } from "./middleware/noCache";
import { perEndpointBodyLimit } from "./middleware/bodySizeLimit";
import { getTranslationHealth } from "./services/translationService";
import { initializeFirebase } from "@supermandi/common";

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
    console.log('[App] Firebase Admin SDK initialized for server-side token verification');
  } catch (error) {
    console.warn('[App] Firebase initialization failed (retailer portal will use fallback mode):', error);
  }
} else {
  console.warn('[App] Firebase not configured - retailer portal login will use client-side verification only');
}

// DEV-071: Capture build info at startup for /health endpoint
let GIT_SHA = "unknown";
let BUILD_TIME = new Date().toISOString();
try {
  GIT_SHA = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
} catch {
  GIT_SHA = process.env.GIT_SHA || "unknown";
}

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
if (process.env.NODE_ENV === "production" || process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", trustProxyHops);
  console.log(`[App] Trust proxy enabled (hops: ${trustProxyHops})`);
}

// ITER3-P0-001: Configure CORS with explicit allowed origins
// In production, ALLOWED_ORIGINS should be set to comma-separated list of domains
const corsOptions: cors.CorsOptions = {
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : (process.env.NODE_ENV === 'production'
      ? ['https://supermandi.in', 'https://www.supermandi.in', 'https://admin.supermandi.in', 'https://supplier.supermandi.in']
      : true), // Allow all in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Token', 'X-Admin-Token', 'X-Request-ID'],
};
app.use(cors(corsOptions));
// GO-LIVE-194: Per-endpoint body size limits (replaces global 1MB limit)
// ITER4-P1-012: Now using perEndpointBodyLimit which applies different limits per endpoint
app.use("/api", perEndpointBodyLimit());
// Keep 1MB fallback for non-API routes (webhooks, etc.)
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  // Cloud health-check contract: must be JSON { status: "ok" }
  // DEV-071: Include version info for deployment verification
  res.json({
    status: "ok",
    service: "api-gateway",
    gitSha: GIT_SHA,
    startTime: BUILD_TIME,
    env: process.env.NODE_ENV || "development"
  });
});

// TR-PEND-003: Translation service health check
app.get("/health/translation", (_req, res) => {
  const health = getTranslationHealth();
  res.json(health);
});

// CACHE-000: Enforce no-cache headers on all dynamic API responses
app.use("/api", noCacheHeaders, apiRouter);

// FINDING-004: Standardize 404 response format (must be before errorHandler)
app.use(notFoundHandler);

app.use(errorHandler);

export default app;
