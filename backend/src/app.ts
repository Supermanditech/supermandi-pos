import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { execSync } from "child_process";
import { apiRouter } from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { notFoundHandler } from "./middleware/notFoundHandler";
import { noCacheHeaders } from "./middleware/noCache";
import { getTranslationHealth } from "./services/translationService";

// Always load backend env from `backend/.env` (not repo root `/.env`).
// This prevents Prisma errors like missing DATABASE_URL when the process is started with a different CWD (e.g. pm2/systemd).
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// DEV-071: Capture build info at startup for /health endpoint
let GIT_SHA = "unknown";
let BUILD_TIME = new Date().toISOString();
try {
  GIT_SHA = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
} catch {
  GIT_SHA = process.env.GIT_SHA || "unknown";
}

const app = express();

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
app.use(express.json());

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
