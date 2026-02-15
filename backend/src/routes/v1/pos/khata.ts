// POS-KHATA-001: Khata (Credit Ledger) API
// Endpoints: list customers, list entries, create entry

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";

export const posKhataRouter = Router();

interface PosRequest extends Request {
  posDevice: PosDeviceContext;
}

/**
 * GET /api/v1/pos/khata/customers
 * List customers with khata balances for this store.
 * Query params: ?q=search (search by phone or name)
 */
posKhataRouter.get("/khata/customers", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const q = req.query.q as string | undefined;

  try {
    const params: any[] = [storeId];
    let searchClause = "";

    if (q) {
      searchClause = "AND (customer_phone ILIKE $2 OR customer_name ILIKE $2)";
      params.push(`%${q}%`);
    }

    const result = await pool.query(
      `SELECT
        customer_phone AS phone,
        MAX(customer_name) AS name,
        COALESCE(SUM(
          CASE
            WHEN entry_type = 'credit' THEN amount_minor
            WHEN entry_type = 'payment' THEN -amount_minor
            ELSE 0
          END
        ), 0)::bigint AS balance_minor,
        MAX(created_at) AS last_entry_at,
        COUNT(*)::int AS entry_count
      FROM orders.khata_entries
      WHERE store_id = $1
        ${searchClause}
      GROUP BY customer_phone
      ORDER BY MAX(created_at) DESC`,
      params
    );

    const customers = result.rows.map((row: any) => ({
      id: row.phone,
      name: row.name,
      phone: row.phone,
      balanceMinor: row.balance_minor.toString(),
      lastEntryAt: row.last_entry_at,
      entryCount: row.entry_count,
    }));

    return res.json({ customers });
  } catch (error: any) {
    console.error("[KhataAPI] Customers error:", error.message);
    return res.status(500).json({ error: "Failed to list khata customers" });
  }
});

/**
 * GET /api/v1/pos/khata/entries
 * List khata entries for a specific customer.
 * Query params: ?phone= (required)
 */
posKhataRouter.get("/khata/entries", requireDeviceToken, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const phone = req.query.phone as string;

  if (!phone) {
    return res.status(400).json({ error: "phone query parameter is required" });
  }

  try {
    // Get entries
    const entriesResult = await pool.query(
      `SELECT
        id,
        store_id AS "storeId",
        customer_name AS "customerName",
        customer_phone AS "customerPhone",
        entry_type AS "entryType",
        amount_minor AS "amountMinor",
        description,
        sale_id AS "saleId",
        balance_minor AS "balanceMinor",
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM orders.khata_entries
      WHERE store_id = $1 AND customer_phone = $2
      ORDER BY created_at DESC`,
      [storeId, phone]
    );

    // Compute current balance
    const balanceResult = await pool.query(
      `SELECT
        customer_phone AS phone,
        MAX(customer_name) AS name,
        COALESCE(SUM(
          CASE
            WHEN entry_type = 'credit' THEN amount_minor
            WHEN entry_type = 'payment' THEN -amount_minor
            ELSE 0
          END
        ), 0)::bigint AS balance_minor,
        COUNT(*)::int AS entry_count
      FROM orders.khata_entries
      WHERE store_id = $1 AND customer_phone = $2
      GROUP BY customer_phone`,
      [storeId, phone]
    );

    const customer = balanceResult.rows.length > 0
      ? {
          id: balanceResult.rows[0].phone,
          name: balanceResult.rows[0].name,
          phone: balanceResult.rows[0].phone,
          balanceMinor: balanceResult.rows[0].balance_minor.toString(),
          entryCount: balanceResult.rows[0].entry_count,
        }
      : {
          id: phone,
          name: null,
          phone,
          balanceMinor: "0",
          entryCount: 0,
        };

    return res.json({
      entries: entriesResult.rows,
      customer,
    });
  } catch (error: any) {
    console.error("[KhataAPI] Entries error:", error.message);
    return res.status(500).json({ error: "Failed to list khata entries" });
  }
});

/**
 * POST /api/v1/pos/khata/entries
 * Create a new khata entry (credit, debit, or payment).
 * Body: { customerPhone, customerName?, entryType, amountMinor, description?, saleId? }
 */
posKhataRouter.post("/khata/entries", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { customerPhone, customerName, entryType, amountMinor, description, saleId } = req.body;

  // Validation
  if (!customerPhone || typeof customerPhone !== "string") {
    return res.status(400).json({ error: "customerPhone is required" });
  }
  if (!entryType || !["credit", "debit", "payment"].includes(entryType)) {
    return res.status(400).json({ error: "entryType must be 'credit', 'debit', or 'payment'" });
  }
  if (!amountMinor || typeof amountMinor !== "number" || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor must be a positive number" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get current balance for this customer
    const balanceResult = await client.query(
      `SELECT
        COALESCE(SUM(
          CASE
            WHEN entry_type = 'credit' THEN amount_minor
            WHEN entry_type = 'payment' THEN -amount_minor
            ELSE 0
          END
        ), 0)::bigint AS current_balance
      FROM orders.khata_entries
      WHERE store_id = $1 AND customer_phone = $2`,
      [storeId, customerPhone]
    );

    const currentBalance = BigInt(balanceResult.rows[0].current_balance);
    let newBalance: bigint;
    if (entryType === "credit") {
      newBalance = currentBalance + BigInt(amountMinor);
    } else if (entryType === "payment") {
      newBalance = currentBalance - BigInt(amountMinor);
    } else {
      // debit: decreases balance (store owes customer less, or customer gets refund)
      newBalance = currentBalance - BigInt(amountMinor);
    }

    // Resolve customer name: use provided or fetch from latest entry
    let resolvedName = customerName;
    if (!resolvedName) {
      const nameResult = await client.query(
        `SELECT customer_name FROM orders.khata_entries
         WHERE store_id = $1 AND customer_phone = $2
         ORDER BY created_at DESC LIMIT 1`,
        [storeId, customerPhone]
      );
      resolvedName = nameResult.rows[0]?.customer_name || customerPhone;
    }

    // Insert entry
    const insertResult = await client.query(
      `INSERT INTO orders.khata_entries
        (store_id, customer_name, customer_phone, entry_type, amount_minor,
         description, sale_id, balance_minor, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        store_id AS "storeId",
        customer_name AS "customerName",
        customer_phone AS "customerPhone",
        entry_type AS "entryType",
        amount_minor AS "amountMinor",
        description,
        sale_id AS "saleId",
        balance_minor AS "balanceMinor",
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"`,
      [
        storeId,
        resolvedName,
        customerPhone,
        entryType,
        amountMinor,
        description || null,
        saleId || null,
        newBalance.toString(),
        (req as PosRequest).posDevice.deviceId,
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      entry: insertResult.rows[0],
      customer: {
        id: customerPhone,
        name: resolvedName,
        phone: customerPhone,
        balanceMinor: newBalance.toString(),
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[KhataAPI] Create entry error:", error.message);
    return res.status(500).json({ error: "Failed to create khata entry" });
  } finally {
    client.release();
  }
});
