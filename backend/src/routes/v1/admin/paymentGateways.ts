// GCP-STG-0088: Admin Payment Gateway Configuration Routes

import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import {
  getGatewayStatuses,
  getStoreGatewayConfig,
  updateStoreGatewayConfig,
} from "../../../services/paymentGatewayService";
import { log } from "../../../lib/logger";

export const adminPaymentGatewaysRouter = Router();

/**
 * GET /api/v1/admin/payment-gateways/status
 * Get status of all configured payment gateways
 */
adminPaymentGatewaysRouter.get("/payment-gateways/status", requireAdminToken, requirePermission("products", "read"), async (_req, res) => {
  try {
    const statuses = getGatewayStatuses();
    return res.json({ success: true, data: statuses });
  } catch (err: any) {
    log.error("[admin/payment-gateways/status] Error:", err);
    return res.status(500).json({ error: "Failed to get gateway status" });
  }
});

/**
 * GET /api/v1/admin/payment-gateways/stores/:storeId/config
 * Get gateway config for a specific store
 */
adminPaymentGatewaysRouter.get("/payment-gateways/stores/:storeId/config", requireAdminToken, requirePermission("products", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const config = await getStoreGatewayConfig(pool, req.params.storeId);
    return res.json({ success: true, data: config });
  } catch (err: any) {
    log.error("[admin/payment-gateways/store-config] Error:", err);
    return res.status(500).json({ error: "Failed to get store gateway config" });
  }
});

/**
 * PUT /api/v1/admin/payment-gateways/stores/:storeId/config
 * Update gateway config for a store
 */
adminPaymentGatewaysRouter.put("/payment-gateways/stores/:storeId/config", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { defaultGateway, enabledGateways } = req.body || {};

  try {
    await updateStoreGatewayConfig(pool, req.params.storeId, {
      defaultGateway,
      enabledGateways,
    });
    const updated = await getStoreGatewayConfig(pool, req.params.storeId);
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    log.error("[admin/payment-gateways/update-config] Error:", err);
    return res.status(400).json({ error: err.message || "Failed to update config" });
  }
});

/**
 * GET /api/v1/admin/payment-gateways/webhook-logs
 * Recent webhook logs for debugging
 */
adminPaymentGatewaysRouter.get("/payment-gateways/webhook-logs", requireAdminToken, requirePermission("products", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const provider = req.query.provider as string;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  try {
    let where = "";
    const params: any[] = [];
    if (provider) {
      where = "WHERE provider = $1";
      params.push(provider.toUpperCase());
    }

    const result = await pool.query(
      `SELECT id, provider, event_type, payment_intent_id, provider_transaction_id,
              status, error_message, processed_at, created_at
       FROM procurement.payment_webhook_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err: any) {
    log.error("[admin/payment-gateways/webhook-logs] Error:", err);
    if (err.code === "42P01") {
      return res.json({ success: true, data: [] });
    }
    return res.status(500).json({ error: "Failed to get webhook logs" });
  }
});
