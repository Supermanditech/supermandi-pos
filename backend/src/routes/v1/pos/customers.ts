// POS-CUST-001: Customer Profiles API
// Endpoints: list, get detail with purchases, create, update

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";

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

    return res.json({ customers: result.rows });
  } catch (error: any) {
    console.error("[CustomersAPI] List error:", error.message);
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

    const customer = customerResult.rows[0];

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
      itemCount: itemCounts[row.saleId] || 0,
    }));

    return res.json({
      ...customer,
      purchases,
    });
  } catch (error: any) {
    console.error("[CustomersAPI] Get detail error:", error.message);
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

    return res.status(201).json({ customer: result.rows[0] });
  } catch (error: any) {
    // Handle unique constraint violation
    if (error.code === "23505") {
      return res.status(409).json({ error: "Customer with this phone already exists" });
    }
    console.error("[CustomersAPI] Create error:", error.message);
    return res.status(500).json({ error: "Failed to create customer" });
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

    return res.json({ customer: result.rows[0] });
  } catch (error: any) {
    console.error("[CustomersAPI] Update error:", error.message);
    return res.status(500).json({ error: "Failed to update customer" });
  }
});
