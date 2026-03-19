/**
 * V3-HARDEN-189: Phase 21 startup validation
 *
 * Validates that all Phase 21 runtime dependencies are available at startup.
 * Called during server boot — logs warnings for missing dependencies but
 * does not block startup (graceful degradation).
 */

import { getPool } from "../db/client";
import { log } from "../lib/logger";
import { isWhatsAppConfigured } from "./whatsappService";
import { getSseStats } from "./sseService";

export interface StartupValidationResult {
  phase: "phase21";
  timestamp: string;
  checks: Array<{
    name: string;
    status: "ok" | "warn" | "fail";
    message: string;
  }>;
  readyForGoLive: boolean;
}

/**
 * Run all Phase 21 startup validations.
 * Returns a structured report of what's ready and what's not.
 */
export async function validatePhase21Startup(): Promise<StartupValidationResult> {
  const checks: StartupValidationResult["checks"] = [];

  // 1. Database connectivity
  const pool = getPool();
  if (pool) {
    try {
      await pool.query("SELECT 1");
      checks.push({ name: "database", status: "ok", message: "Connected" });
    } catch (err) {
      checks.push({ name: "database", status: "fail", message: `Connection failed: ${err}` });
    }
  } else {
    checks.push({ name: "database", status: "fail", message: "Pool not initialized" });
  }

  // 2. Migration 198 (demand/allocation schema)
  if (pool) {
    try {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'supplier_demand_allocations'
        ) AS exists`
      );
      if (result.rows[0]?.exists) {
        checks.push({ name: "migration_198_allocations", status: "ok", message: "Table exists" });
      } else {
        checks.push({ name: "migration_198_allocations", status: "fail", message: "Table missing" });
      }
    } catch {
      checks.push({ name: "migration_198_allocations", status: "warn", message: "Could not verify" });
    }

    try {
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'lifecycle_event_log'
        ) AS exists`
      );
      if (result.rows[0]?.exists) {
        checks.push({ name: "migration_198_lifecycle", status: "ok", message: "Table exists" });
      } else {
        checks.push({ name: "migration_198_lifecycle", status: "fail", message: "Table missing" });
      }
    } catch {
      checks.push({ name: "migration_198_lifecycle", status: "warn", message: "Could not verify" });
    }
  }

  // 3. WhatsApp readiness
  if (isWhatsAppConfigured()) {
    checks.push({ name: "whatsapp", status: "ok", message: "Configured" });
  } else {
    checks.push({
      name: "whatsapp",
      status: "warn",
      message: "Not configured — lifecycle WhatsApp fan-out disabled",
    });
  }

  // 4. SSE service
  try {
    const sseStats = getSseStats();
    checks.push({
      name: "sse_service",
      status: "ok",
      message: `Active: ${sseStats.totalStores} stores, ${sseStats.totalConnections} connections`,
    });
  } catch {
    checks.push({ name: "sse_service", status: "warn", message: "Could not get stats" });
  }

  // 5. Required env vars
  const requiredEnvVars = ["JWT_SECRET", "DATABASE_URL"];
  const optionalEnvVars = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"];

  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      checks.push({ name: `env_${envVar}`, status: "ok", message: "Set" });
    } else {
      checks.push({ name: `env_${envVar}`, status: "fail", message: "Missing" });
    }
  }

  for (const envVar of optionalEnvVars) {
    if (process.env[envVar]) {
      checks.push({ name: `env_${envVar}`, status: "ok", message: "Set" });
    } else {
      checks.push({ name: `env_${envVar}`, status: "warn", message: "Not set (optional)" });
    }
  }

  const readyForGoLive = checks.every((c) => c.status !== "fail");

  const result: StartupValidationResult = {
    phase: "phase21",
    timestamp: new Date().toISOString(),
    checks,
    readyForGoLive,
  };

  // Log summary
  const okCount = checks.filter((c) => c.status === "ok").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  log.info(
    `[Phase21] Startup validation: ${okCount} OK, ${warnCount} WARN, ${failCount} FAIL — ` +
    `${readyForGoLive ? "READY" : "NOT READY"}`
  );

  return result;
}
