// POS-CUST-001: Customer Profiles API
// Endpoints: list, get detail with purchases, create, update

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const posCustomersRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

/** Column list for SELECT queries — returns camelCase aliases */
const CUSTOMER_COLUMNS = `
  id,
  store_id AS "storeId",
  name,
  phone,
  email,
  address,
  credit_limit_minor AS "creditLimitMinor",
  total_purchases_minor AS "totalPurchasesMinor",
  visit_count AS "visitCount",
  last_visit_at AS "lastVisitAt",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

/** Coerce BIGINT monetary columns from strings to numbers for JSON serialization */
function coerceCustomerBigints(row: any): any {
  return {
    ...row,
    creditLimitMinor: Number(row.creditLimitMinor ?? 0),
    totalPurchasesMinor: Number(row.totalPurchasesMinor ?? 0),
  };
}

/**
 * GET /api/v1/pos/customers
 * List customer profiles for this store.
 * Query params: ?q=search (search by name or phone)
 */
posCustomersRouter.get("/customers", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const q = req.query.q as string | undefined;
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 200);

  try {
    const params: any[] = [storeId, limit];
    let searchClause = "";

    if (q) {
      searchClause = "AND (name ILIKE $3 OR phone ILIKE $3)";
      params.push(`%${q}%`);
    }

    const result = await pool.query(
      `SELECT ${CUSTOMER_COLUMNS}
      FROM platform.customer_profiles
      WHERE store_id = $1
        ${searchClause}
      ORDER BY last_visit_at DESC NULLS LAST
      LIMIT $2`,
      params
    );

    return res.json({ customers: result.rows.map(coerceCustomerBigints) });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CustomersAPI] List error:", error.message);
    return res.status(500).json({ error: "Failed to list customers" });
  }
});

/**
 * GET /api/v1/pos/customers/:customerId
 * Get customer detail with recent purchase history.
 */
posCustomersRouter.get("/customers/:customerId", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { customerId } = req.params;

  try {
    // Get customer profile
    const customerResult = await pool.query(
      `SELECT ${CUSTOMER_COLUMNS}
      FROM platform.customer_profiles
      WHERE id = $1 AND store_id = $2`,
      [customerId, storeId]
    );

    if (customerResult.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = coerceCustomerBigints(customerResult.rows[0]);

    // Get recent purchases by customer phone
    const purchasesResult = await pool.query(
      `SELECT
        id AS "saleId",
        bill_ref AS "billRef",
        total_minor AS "totalMinor",
        payment_mode AS "paymentMode",
        status,
        created_at AS "createdAt"
      FROM public.sales
      WHERE store_id = $1 AND customer_phone = $2
      ORDER BY created_at DESC
      LIMIT 20`,
      [storeId, customer.phone]
    );

    // For each sale, get item count
    const saleIds = purchasesResult.rows.map((r: any) => r.saleId);
    let itemCounts: Record<string, number> = {};
    if (saleIds.length > 0) {
      const countsResult = await pool.query(
        `SELECT sale_id, COUNT(*)::int AS item_count
         FROM public.sale_items
         WHERE sale_id = ANY($1)
         GROUP BY sale_id`,
        [saleIds]
      );
      itemCounts = countsResult.rows.reduce((acc: Record<string, number>, row: any) => {
        acc[row.sale_id] = row.item_count;
        return acc;
      }, {});
    }

    const purchases = purchasesResult.rows.map((row: any) => ({
      ...row,
      totalMinor: Number(row.totalMinor ?? 0),
      itemCount: itemCounts[row.saleId] || 0,
    }));

    return res.json({
      ...customer,
      purchases,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CustomersAPI] Get detail error:", error.message);
    return res.status(500).json({ error: "Failed to get customer details" });
  }
});

/**
 * POST /api/v1/pos/customers
 * Create a new customer profile.
 * Body: { name, phone, email?, address? }
 */
posCustomersRouter.post("/customers", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { name, phone, email, address } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!phone || typeof phone !== "string" || phone.trim().length === 0) {
    return res.status(400).json({ error: "phone is required" });
  }

  try {
    // Check for duplicate
    const existing = await pool.query(
      `SELECT id FROM platform.customer_profiles
       WHERE store_id = $1 AND phone = $2`,
      [storeId, phone.trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Customer with this phone already exists",
        existingCustomerId: existing.rows[0].id,
      });
    }

    const result = await pool.query(
      `INSERT INTO platform.customer_profiles
        (store_id, name, phone, email, address)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING ${CUSTOMER_COLUMNS}`,
      [storeId, name.trim(), phone.trim(), email || null, address || null]
    );

    return res.status(201).json({ customer: coerceCustomerBigints(result.rows[0]) });
  } catch (_error: unknown) {
    const error = asError(_error);
    // Handle unique constraint violation
    if (error.code === "23505") {
      return res.status(409).json({ error: "Customer with this phone already exists" });
    }
    log.error("[CustomersAPI] Create error:", error.message);
    return res.status(500).json({ error: "Failed to create customer" });
  }
});

// =============================================================================
// GCP-STG-0732: Customer Udhar (Credit) Ledger endpoints
// =============================================================================

/**
 * GET /api/v1/pos/customers/:customerId/balance
 * Returns outstanding credit balance for a customer.
 */
posCustomersRouter.get("/customers/:customerId/balance", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { customerId } = req.params;

  try {
    // Sum CREDIT entries (positive) and PAYMENT/ADJUSTMENT entries (negative towards balance)
    const balanceResult = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount_minor ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN type IN ('PAYMENT', 'ADJUSTMENT') THEN amount_minor ELSE 0 END), 0)
          AS outstanding_minor,
        MAX(CASE WHEN type = 'PAYMENT' THEN created_at ELSE NULL END) AS last_payment_date,
        MIN(CASE WHEN type = 'CREDIT' AND amount_minor > 0 THEN created_at ELSE NULL END) AS oldest_unpaid_date
      FROM orders.customer_ledger
      WHERE store_id = $1 AND customer_id = $2`,
      [storeId, customerId]
    );

    const row = balanceResult.rows[0] || {};
    return res.json({
      outstandingMinor: Number(row.outstanding_minor ?? 0),
      lastPaymentDate: row.last_payment_date || null,
      oldestUnpaidDate: row.oldest_unpaid_date || null,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CustomersAPI] Balance error:", error.message);
    return res.status(500).json({ error: "Failed to get customer balance" });
  }
});

/**
 * GET /api/v1/pos/customers/:customerId/ledger
 * Returns paginated ledger entries for a customer.
 * Query params: ?limit=20&offset=0
 */
posCustomersRouter.get("/customers/:customerId/ledger", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { customerId } = req.params;
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 100);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  try {
    const result = await pool.query(
      `SELECT
        id,
        store_id AS "storeId",
        customer_id AS "customerId",
        sale_id AS "saleId",
        type,
        amount_minor AS "amountMinor",
        balance_after_minor AS "balanceAfterMinor",
        note,
        payment_method AS "paymentMethod",
        created_at AS "createdAt",
        created_by AS "createdBy"
      FROM orders.customer_ledger
      WHERE store_id = $1 AND customer_id = $2
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
      [storeId, customerId, limit, offset]
    );

    // Coerce bigint columns
    const entries = result.rows.map((row: any) => ({
      ...row,
      amountMinor: Number(row.amountMinor ?? 0),
      balanceAfterMinor: Number(row.balanceAfterMinor ?? 0),
    }));

    return res.json({ entries, limit, offset });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CustomersAPI] Ledger error:", error.message);
    return res.status(500).json({ error: "Failed to get customer ledger" });
  }
});

/**
 * POST /api/v1/pos/customers/:customerId/payments
 * Record a payment against customer credit (Udhar).
 * Body: { amountMinor, paymentMethod?, note? }
 */
posCustomersRouter.post("/customers/:customerId/payments", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { customerId } = req.params;
  const { amountMinor, paymentMethod, note } = req.body;

  if (!amountMinor || typeof amountMinor !== "number" || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor must be a positive number" });
  }

  try {
    // Calculate current outstanding balance
    const balanceResult = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'CREDIT' THEN amount_minor ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN type IN ('PAYMENT', 'ADJUSTMENT') THEN amount_minor ELSE 0 END), 0)
          AS outstanding_minor
      FROM orders.customer_ledger
      WHERE store_id = $1 AND customer_id = $2`,
      [storeId, customerId]
    );

    const currentOutstanding = Number(balanceResult.rows[0]?.outstanding_minor ?? 0);
    const newBalance = currentOutstanding - amountMinor;

    // Insert PAYMENT entry
    const insertResult = await pool.query(
      `INSERT INTO orders.customer_ledger
        (store_id, customer_id, type, amount_minor, balance_after_minor, payment_method, note, created_by)
      VALUES ($1, $2, 'PAYMENT', $3, $4, $5, $6, $7)
      RETURNING
        id,
        store_id AS "storeId",
        customer_id AS "customerId",
        type,
        amount_minor AS "amountMinor",
        balance_after_minor AS "balanceAfterMinor",
        payment_method AS "paymentMethod",
        note,
        created_at AS "createdAt"`,
      [storeId, customerId, amountMinor, newBalance, paymentMethod || null, note || null, (req as PosRequest).posDevice.deviceId || null]
    );

    const entry = insertResult.rows[0];
    return res.status(200).json({
      entry: {
        ...entry,
        amountMinor: Number(entry.amountMinor ?? 0),
        balanceAfterMinor: Number(entry.balanceAfterMinor ?? 0),
      },
      outstandingMinor: newBalance,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CustomersAPI] Payment error:", error.message);
    return res.status(500).json({ error: "Failed to record payment" });
  }
});

/**
 * PATCH /api/v1/pos/customers/:customerId
 * Update customer profile fields.
 * Body: { name?, email?, address? }
 */
posCustomersRouter.patch("/customers/:customerId", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { customerId } = req.params;
  const { name, email, address } = req.body;

  // Build SET clause dynamically
  const setClauses: string[] = [];
  const params: any[] = [customerId, storeId];
  let paramIndex = 3;

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ error: "name cannot be empty" });
    }
    setClauses.push(`name = $${paramIndex}`);
    params.push(name.trim());
    paramIndex++;
  }
  if (email !== undefined) {
    setClauses.push(`email = $${paramIndex}`);
    params.push(email || null);
    paramIndex++;
  }
  if (address !== undefined) {
    setClauses.push(`address = $${paramIndex}`);
    params.push(address || null);
    paramIndex++;
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    const result = await pool.query(
      `UPDATE platform.customer_profiles
       SET ${setClauses.join(", ")}
       WHERE id = $1 AND store_id = $2
       RETURNING ${CUSTOMER_COLUMNS}`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    return res.json({ customer: coerceCustomerBigints(result.rows[0]) });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[CustomersAPI] Update error:", error.message);
    return res.status(500).json({ error: "Failed to update customer" });
  }
});
