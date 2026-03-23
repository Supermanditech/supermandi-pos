// REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001
// Public config endpoints — no authentication required.
// Used by the landing page to fetch live-governed config without requiring a deploy.

import { Router } from "express";
import { getPool } from "../../db/client";
import { log } from "../../lib/logger";
import { redisRateLimit } from "../../middleware/rateLimit";

export const publicConfigRouter = Router();

// GCP-STG-0494: Rate limit public CTA config — 30 req/min/IP
const ctaRateLimiter = redisRateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: "public-cta",
});

// =============================================================================
// GET /public/whatsapp-cta-config
// Returns the WhatsApp CTA config for the landing page.
// No auth required — returns only safe, non-secret display config.
// GCP-STG-0494: Rate limited + Cache-Control header
// GCP-STG-0501: X-Content-Type-Options: nosniff
// =============================================================================
// =============================================================================
// POST /public/analytics/event
// Non-blocking analytics ingestion for landing-page CTA clicks.
// GCP-STG-0492: Never returns an error — always 204.
// =============================================================================
publicConfigRouter.post("/analytics/event", async (req, res) => {
  try {
    const { event, target, ts } = req.body;
    if (!event || typeof event !== "string") return res.status(400).json({ error: "event required" });
    const pool = getPool();
    if (pool) {
      await pool.query(
        `INSERT INTO platform.analytics_events (event_type, metadata, ip_address, user_agent, created_at) VALUES ($1, $2, $3, $4, NOW())`,
        [event, JSON.stringify({ target, ts }), req.ip, req.headers["user-agent"]]
      );
    }
    res.status(204).end();
  } catch {
    res.status(204).end(); // Non-blocking, never fail
  }
});

publicConfigRouter.get("/whatsapp-cta-config", ctaRateLimiter, async (_req, res) => {
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

    // GCP-STG-0494: Cache-Control for CDN / browser caching
    res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    // GCP-STG-0501: Prevent MIME-type sniffing
    res.set("X-Content-Type-Options", "nosniff");

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
