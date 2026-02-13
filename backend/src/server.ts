import app from "./app";
import { logGcpValidationResults } from "./startup/validateGcp";
import { startSyncCleanupScheduler } from "./services/syncCleanupScheduler";
import { loadOnboardingConfig } from "./config/onboardingConfig";
import { logger } from "./lib/logger";

// STAGE-012: Align PORT fallback with Dockerfile.main (ENV PORT=3010)
const PORT = process.env.PORT || 3010;
const HOST = process.env.HOST || "0.0.0.0";

async function start(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    logger.error("DATABASE_URL is required to start the backend. See backend/.env.example.");
    process.exit(1);
  }

  // GO-LIVE-180: Validate GCP credentials early
  // This catches configuration issues before services start accepting requests
  logGcpValidationResults();

  // RO-009 + STAGE-005: Validate onboarding config (fail-fast in non-development)
  try {
    loadOnboardingConfig();
  } catch (err) {
    logger.error("Onboarding config validation failed", { error: String(err) });
    if (process.env.NODE_ENV !== "development") {
      process.exit(1);
    }
  }

  // STAGE-004: ensureCoreSchema() REMOVED — rely solely on migrate-prod.js
  // The legacy 660-line DDL script conflicted with the migration system
  // (different advisory lock IDs: 839201 vs 839271, concurrent table creation on scale-up).
  // All schema changes MUST go through backend/migrations/*.sql files.

  const server = app.listen(Number(PORT), HOST, () => {
    logger.info(`SuperMandi backend listening on http://${HOST}:${PORT}`, { port: Number(PORT) });

    // GO-LIVE Batch 7: Start sync cleanup scheduler for production scale
    // Cleans stale sync_locks, old processed_events, and old failed_events
    // ISSUE-MICRO-043: Catch scheduler startup errors to prevent unhandled rejection
    try {
      startSyncCleanupScheduler();
    } catch (err) {
      logger.error("Sync cleanup scheduler failed to start", { error: String(err) });
    }
  });

  // SHUTDOWN-001: Graceful shutdown on SIGTERM/SIGINT (Cloud Run sends SIGTERM)
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
    // Force exit after 10s if connections don't drain
    setTimeout(() => {
      logger.warn("Forced shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ISSUE-MICRO-010: Catch uncaught exceptions / unhandled rejections to log before exit
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception — shutting down", { error: String(err), stack: err.stack });
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason: String(reason) });
    // Do NOT exit on unhandled rejection — log and continue (Node 16+ default)
  });
}

void start();
