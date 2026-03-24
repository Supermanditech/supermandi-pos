// SA-P0-007: System Maintenance Mode
// Allows superadmin to toggle a global maintenance flag.
// When enabled, a middleware returns 503 to non-admin routes.

import { Router } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";
import { archiveOldAuthEvents } from "../../../services/authAudit";

export const adminMaintenanceRouter = Router();

// All maintenance routes require admin token
adminMaintenanceRouter.use(requireAdminToken);

// ---------------------------------------------------------------------------
// In-memory cache (shared with middleware via getMaintenanceStatus export)
// ---------------------------------------------------------------------------
let cachedStatus: { enabled: boolean; message: string | null; updated_at: string | null } | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Read maintenance status from DB (with in-memory cache).
 * Exported so the maintenance middleware can call it without a DB hit on every request.
 */
export async function getMaintenanceStatus(): Promise<{ enabled: boolean; message: string | null; updated_at: string | null }> {
  const now = Date.now();
  if (cachedStatus && now < cacheExpiry) {
    return cachedStatus;
  }

  const pool = getPool();
  if (!pool) {
    // No DB — assume not in maintenance
    return { enabled: false, message: null, updated_at: null };
  }

  try {
    // Try reading from platform.system_config (key-value table we create on first write)
    const result = await pool.query(
      `SELECT value FROM platform.system_config WHERE key = 'maintenance_mode' LIMIT 1`
    );

    if (result.rowCount && result.rowCount > 0) {
      const parsed = JSON.parse(result.rows[0].value);
      cachedStatus = {
        enabled: parsed.enabled === true,
        message: parsed.message ?? null,
        updated_at: parsed.updated_at ?? null,
      };
    } else {
      cachedStatus = { enabled: false, message: null, updated_at: null };
    }
  } catch (err: unknown) {
    const e = asError(err);
    // Table doesn't exist yet — treat as not in maintenance
    if (e?.code === "42P01") {
      cachedStatus = { enabled: false, message: null, updated_at: null };
    } else {
      log.error("[maintenance] Failed to read maintenance status:", e?.message);
      cachedStatus = { enabled: false, message: null, updated_at: null };
    }
  }

  cacheExpiry = now + CACHE_TTL_MS;
  return cachedStatus;
}

/** Force-clear the in-memory cache (called after writes). */
function invalidateCache() {
  cachedStatus = null;
  cacheExpiry = 0;
}

// ---------------------------------------------------------------------------
// GET /api/v1/admin/system/maintenance — read current status
// ---------------------------------------------------------------------------
adminMaintenanceRouter.get(
  "/system/maintenance",
  requirePermission("system", "read"),
  async (_req, res) => {
    try {
      const status = await getMaintenanceStatus();
      return res.json({ maintenance: status });
    } catch (err: unknown) {
      const e = asError(err);
      log.error("[maintenance] GET failed:", e?.message);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch maintenance status" });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/v1/admin/system/maintenance — toggle maintenance on/off
// ---------------------------------------------------------------------------
adminMaintenanceRouter.post(
  "/system/maintenance",
  requirePermission("system", "write"),
  async (req, res) => {
    const { enabled, message } = req.body as { enabled?: boolean; message?: string };

    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled (boolean) is required" });
    }

    const sanitizedMessage = typeof message === "string" ? message.trim().slice(0, 500) : null;

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ error: "database unavailable" });
    }

    const now = new Date().toISOString();
    const value = JSON.stringify({ enabled, message: sanitizedMessage, updated_at: now });

    try {
      // Ensure the table exists (idempotent)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS platform.system_config (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Upsert the maintenance_mode key
      await pool.query(
        `INSERT INTO platform.system_config (key, value, updated_at)
         VALUES ('maintenance_mode', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [value]
      );

      invalidateCache();

      const adminId = (req as any).adminInfo?.id ?? (req as any).adminId ?? "unknown";
      log.info(`[maintenance] Maintenance mode ${enabled ? "ENABLED" : "DISABLED"} by admin ${adminId}. message=${sanitizedMessage ?? "(none)"}`);

      return res.json({
        maintenance: { enabled, message: sanitizedMessage, updated_at: now },
      });
    } catch (err: unknown) {
      const e = asError(err);
      log.error("[maintenance] POST failed:", e?.message);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update maintenance status" });
    }
  }
);

// ---------------------------------------------------------------------------
// GCP-STG-0682: POST /api/v1/admin/maintenance/archive-auth-events
// Deletes auth_events older than 90 days (configurable via AUTH_EVENT_RETENTION_DAYS).
// Intended to be called by Cloud Scheduler weekly (Sunday 3 AM IST).
// ---------------------------------------------------------------------------
adminMaintenanceRouter.post(
  "/maintenance/archive-auth-events",
  requirePermission("system", "write"),
  async (_req, res) => {
    try {
      const archived = await archiveOldAuthEvents();
      return res.json({ archived, message: `Deleted ${archived} auth events beyond retention period` });
    } catch (err: unknown) {
      const e = asError(err);
      log.error("[maintenance] archive-auth-events failed:", e?.message);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to archive auth events" });
    }
  }
);
