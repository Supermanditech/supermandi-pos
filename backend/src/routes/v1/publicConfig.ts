// REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001
// Public config endpoints — no authentication required.
// Used by the landing page to fetch live-governed config without requiring a deploy.

import { Router } from "express";
import { getPool } from "../../db/client";
import { log } from "../../lib/logger";

export const publicConfigRouter = Router();

// =============================================================================
// GET /public/whatsapp-cta-config
// Returns the WhatsApp CTA config for the landing page.
// No auth required — returns only safe, non-secret display config.
// =============================================================================
publicConfigRouter.get("/whatsapp-cta-config", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      // DB unavailable — return a disabled config so landing page hides widget
      return res.json({ enabled: false });
    }

    const result = await pool.query(
      `SELECT enabled,
              superadmin_number   AS "superadminNumber",
              superadmin_message  AS "superadminMessage",
              company_number      AS "companyNumber",
              company_message     AS "companyMessage"
       FROM platform.whatsapp_cta_config
       ORDER BY id ASC LIMIT 1`
    );

    if (result.rows.length === 0) {
      // Table seeded but empty (should not happen after migration) — disable widget
      return res.json({ enabled: false });
    }

    return res.json(result.rows[0]);
  } catch (err: unknown) {
    log.warn("[public/whatsapp-cta-config] read error, returning disabled:", err);
    // Fail-safe: if DB errors, hide widget rather than crash
    return res.json({ enabled: false });
  }
});
