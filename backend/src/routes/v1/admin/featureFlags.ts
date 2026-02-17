// SA-P0-005 + SA-P1-007: Feature Kill Switch + Per-Store Feature Flag Overrides
import { Router } from "express";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";

export const adminFeatureFlagsRouter = Router();

adminFeatureFlagsRouter.use(requireAdminToken);

// Canonical feature keys (must match ui-status features object)
const VALID_FEATURE_KEYS = [
  "buyEnabled", "reorderEnabled", "voiceEnabled", "bnplEnabled",
  "creditEnabled", "categoryBrowsingEnabled", "scanLookupV2",
  "minAppVersion" // SA-P2-003: Minimum app version enforcement
] as const;

function isValidFeatureKey(key: string): boolean {
  return (VALID_FEATURE_KEYS as readonly string[]).includes(key);
}

// GET /admin/feature-flags — list all global flags
adminFeatureFlagsRouter.get(
  "/feature-flags",
  requirePermission("stores", "read"),
  async (_req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database_unavailable" });

    try {
      const result = await pool.query(
        `SELECT flag_key, enabled, payload_json, description, updated_at
         FROM platform.feature_flags
         WHERE scope_type = 'global'
         ORDER BY flag_key`
      );
      return res.json({ flags: result.rows });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      log.error("[admin/feature-flags] GET failed:", msg);
      return res.status(500).json({ error: "fetch_feature_flags_failed" });
    }
  }
);

// PATCH /admin/feature-flags/:key — toggle global flag
adminFeatureFlagsRouter.patch(
  "/feature-flags/:key",
  requirePermission("stores", "update"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database_unavailable" });

    const { key } = req.params;
    if (!isValidFeatureKey(key)) {
      return res.status(400).json({ error: "invalid_feature_key", valid_keys: VALID_FEATURE_KEYS });
    }

    const { enabled, payloadJson } = req.body as { enabled?: boolean; payloadJson?: Record<string, unknown> };
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled_must_be_boolean" });
    }

    try {
      // SA-P2-003: Support optional payload_json update (e.g. minAppVersion version value)
      const result = await pool.query(
        `UPDATE platform.feature_flags
         SET enabled = $1, payload_json = COALESCE($3::jsonb, payload_json), updated_at = NOW()
         WHERE flag_key = $2 AND scope_type = 'global'
         RETURNING flag_key, enabled, payload_json, description, updated_at`,
        [enabled, key, payloadJson ? JSON.stringify(payloadJson) : null]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "feature_key_not_found" });
      }
      log.info("[SA-P0-005] Global flag toggled: %s → %s", key, enabled);
      return res.json({ flag: result.rows[0] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      log.error("[admin/feature-flags] PATCH global failed:", msg);
      return res.status(500).json({ error: "update_feature_flag_failed" });
    }
  }
);

// GET /admin/stores/:storeId/feature-flags — list per-store flags (global + overrides + effective)
adminFeatureFlagsRouter.get(
  "/stores/:storeId/feature-flags",
  requirePermission("stores", "read"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database_unavailable" });

    const { storeId } = req.params;

    try {
      const result = await pool.query(
        `SELECT
           g.flag_key,
           g.enabled AS global_enabled,
           s.enabled AS store_override,
           COALESCE(s.enabled, g.enabled) AS effective
         FROM platform.feature_flags g
         LEFT JOIN platform.feature_flags s
           ON s.flag_key = g.flag_key AND s.scope_type = 'store' AND s.scope_id = $1::uuid
         WHERE g.scope_type = 'global'
         ORDER BY g.flag_key`,
        [storeId]
      );
      return res.json({ flags: result.rows, storeId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      log.error("[admin/feature-flags] GET store flags failed:", msg);
      return res.status(500).json({ error: "fetch_store_feature_flags_failed" });
    }
  }
);

// PATCH /admin/stores/:storeId/feature-flags/:key — set per-store override
adminFeatureFlagsRouter.patch(
  "/stores/:storeId/feature-flags/:key",
  requirePermission("stores", "update"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database_unavailable" });

    const { storeId, key } = req.params;
    if (!isValidFeatureKey(key)) {
      return res.status(400).json({ error: "invalid_feature_key", valid_keys: VALID_FEATURE_KEYS });
    }

    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled_must_be_boolean" });
    }

    try {
      // Verify store exists
      const storeCheck = await pool.query(
        `SELECT id FROM platform.stores WHERE id = $1::uuid`,
        [storeId]
      );
      if (storeCheck.rowCount === 0) {
        return res.status(404).json({ error: "store_not_found" });
      }

      const result = await pool.query(
        `INSERT INTO platform.feature_flags (flag_key, scope_type, scope_id, enabled)
         VALUES ($1, 'store', $2::uuid, $3)
         ON CONFLICT (flag_key, scope_type, scope_id) WHERE scope_type != 'global'
         DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
         RETURNING flag_key, scope_id, enabled, updated_at`,
        [key, storeId, enabled]
      );

      log.info("[SA-P1-007] Store override set: store=%s flag=%s → %s", storeId, key, enabled);
      return res.json({ override: result.rows[0] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      log.error("[admin/feature-flags] PATCH store override failed:", msg);
      return res.status(500).json({ error: "update_store_feature_override_failed" });
    }
  }
);

// DELETE /admin/stores/:storeId/feature-flags/:key — remove per-store override (revert to global)
adminFeatureFlagsRouter.delete(
  "/stores/:storeId/feature-flags/:key",
  requirePermission("stores", "update"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database_unavailable" });

    const { storeId, key } = req.params;
    if (!isValidFeatureKey(key)) {
      return res.status(400).json({ error: "invalid_feature_key", valid_keys: VALID_FEATURE_KEYS });
    }

    try {
      const result = await pool.query(
        `DELETE FROM platform.feature_flags
         WHERE flag_key = $1 AND scope_type = 'store' AND scope_id = $2::uuid
         RETURNING flag_key`,
        [key, storeId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "override_not_found" });
      }

      log.info("[SA-P1-007] Store override removed: store=%s flag=%s", storeId, key);
      return res.json({ removed: true, storeId, flagKey: key });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      log.error("[admin/feature-flags] DELETE store override failed:", msg);
      return res.status(500).json({ error: "remove_store_feature_override_failed" });
    }
  }
);

// POST /admin/feature-flags/bulk — bulk set override for multiple stores
adminFeatureFlagsRouter.post(
  "/feature-flags/bulk",
  requirePermission("stores", "update"),
  async (req, res) => {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database_unavailable" });

    const { storeIds, flagKey, enabled } = req.body as {
      storeIds?: string[];
      flagKey?: string;
      enabled?: boolean;
    };

    if (!Array.isArray(storeIds) || storeIds.length === 0) {
      return res.status(400).json({ error: "storeIds must be a non-empty array" });
    }
    if (storeIds.length > 100) {
      return res.status(400).json({ error: "storeIds max 100 per request" });
    }
    if (!flagKey || !isValidFeatureKey(flagKey)) {
      return res.status(400).json({ error: "invalid_feature_key", valid_keys: VALID_FEATURE_KEYS });
    }
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled_must_be_boolean" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      let updated = 0;
      for (const storeId of storeIds) {
        const result = await client.query(
          `INSERT INTO platform.feature_flags (flag_key, scope_type, scope_id, enabled)
           VALUES ($1, 'store', $2::uuid, $3)
           ON CONFLICT (flag_key, scope_type, scope_id) WHERE scope_type != 'global'
           DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
          [flagKey, storeId, enabled]
        );
        updated += result.rowCount ?? 0;
      }

      await client.query("COMMIT");
      log.info("[SA-P1-007] Bulk override: flag=%s enabled=%s stores=%d", flagKey, enabled, updated);
      return res.json({ updated });
    } catch (err: unknown) {
      await client.query("ROLLBACK").catch(() => {});
      const msg = err instanceof Error ? err.message : "unknown";
      log.error("[admin/feature-flags] Bulk update failed:", msg);
      return res.status(500).json({ error: "bulk_update_failed" });
    } finally {
      client.release();
    }
  }
);
