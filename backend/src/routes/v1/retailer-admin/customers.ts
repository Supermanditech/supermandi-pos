// T-218: Customer CRM for retailer-admin portal
// GCP-STG-0740: Enhanced with credit_balance, search alias, total_spent, visits
// Provides customer list + detail endpoints using retailer JWT auth (x-actor-id = storeId)

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const retailerAdminCustomersRouter = Router();

function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

const CUSTOMER_COLUMNS = `
  cp.id, cp.store_id AS "storeId", cp.name, cp.phone, cp.email, cp.address,
  cp.credit_limit_minor AS "creditLimitMinor",
  cp.total_purchases_minor AS "totalPurchasesMinor",
  cp.total_purchases_minor AS "totalSpent",
  cp.visit_count AS "visitCount",
  cp.visit_count AS "visits",
  cp.last_visit_at AS "lastVisitAt",
  cp.last_visit_at AS "lastVisit",
  COALESCE(kb.balance_minor, 0) AS "creditBalance",
  cp.created_at AS "createdAt",
  cp.updated_at AS "updatedAt"
`;

/** GCP-STG-0740: Join to get latest khata balance as credit_balance */
const KHATA_BALANCE_JOIN = `
  LEFT JOIN LATERAL (
    SELECT balance_minor FROM orders.khata_entries ke
    WHERE ke.store_id = cp.store_id AND ke.customer_phone = cp.phone
    ORDER BY ke.created_at DESC LIMIT 1
  ) kb ON true
`;

/**
 * GET /retailer-admin/customers
 * GCP-STG-0740: List customers for this store with optional search.
 * Supports both ?q= and ?search= query parameters.
 * Returns: name, phone, total_spent, visits, credit_balance, last_visit.
 */
retailerAdminCustomersRouter.get("/customers", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "missing store context" });

  // GCP-STG-0740: Accept both ?q= and ?search= for flexibility
  const q = (req.query.q as string | undefined) || (req.query.search as string | undefined);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 200);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  try {
    const params: any[] = [storeId, limit, offset];
    let searchClause = "";
    // STG-066: Build separate search clause for count query (uses $2 instead of $4)
    let countSearchClause = "";

    if (q && q.trim()) {
      searchClause = "AND (cp.name ILIKE $4 OR cp.phone ILIKE $4)";
      countSearchClause = "AND (name ILIKE $2 OR phone ILIKE $2)";
      params.push(`%${q.trim()}%`);
    }

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT ${CUSTOMER_COLUMNS}
         FROM platform.customer_profiles cp
         ${KHATA_BALANCE_JOIN}
         WHERE cp.store_id = $1 ${searchClause}
         ORDER BY cp.last_visit_at DESC NULLS LAST
         LIMIT $2 OFFSET $3`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM platform.customer_profiles
         WHERE store_id = $1 ${countSearchClause}`,
        q && q.trim() ? [storeId, `%${q.trim()}%`] : [storeId]
      ),
    ]);

    return res.json({
      customers: dataResult.rows,
      total: countResult.rows[0]?.total || 0,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[GCP-STG-0740] Customer list error:", error.message);
    return res.status(500).json({ error: "Failed to list customers" });
  }
});

/**
 * GET /retailer-admin/customers/:customerId
 * Customer detail with recent purchase history.
 */
retailerAdminCustomersRouter.get("/customers/:customerId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) return res.status(401).json({ error: "missing store context" });

  const { customerId } = req.params;

  try {
    const customerResult = await pool.query(
      `SELECT ${CUSTOMER_COLUMNS}
       FROM platform.customer_profiles
       WHERE id = $1 AND store_id = $2`,
      [customerId, storeId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customerResult.rows[0];

    // Recent purchases by customer phone
    const purchasesResult = await pool.query(
      `SELECT
         id AS "saleId", bill_ref AS "billRef",
         total_minor AS "totalMinor", payment_mode AS "paymentMode",
         status, created_at AS "createdAt"
       FROM public.sales
       WHERE store_id = $1 AND customer_phone = $2
       ORDER BY created_at DESC
       LIMIT 20`,
      [storeId, customer.phone]
    );

    return res.json({ customer, purchases: purchasesResult.rows });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[T-218] Customer detail error:", error.message);
    return res.status(500).json({ error: "Failed to get customer details" });
  }
});
