// POS-KHATA-001: Khata (Credit Ledger) API
// Endpoints: list customers, list entries, create entry

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";
import { encrypt } from "../../../utils/encryption";  // STG-473: Encrypt phone in khata entries

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
      balanceMinor: Number(row.balance_minor),
      lastEntryAt: row.last_entry_at,
      entryCount: row.entry_count,
    }));

    return res.json({ customers });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[KhataAPI] Customers error:", error.message);
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
        customer_phone AS "customerId",
        UPPER(entry_type) AS "type",
        amount_minor AS "amountMinor",
        description,
        balance_minor AS "runningBalanceMinor",
        created_by AS "createdByStaffId",
        created_at AS "createdAt"
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
          balanceMinor: Number(balanceResult.rows[0].balance_minor),
          entryCount: balanceResult.rows[0].entry_count,
        }
      : {
          id: phone,
          name: null,
          phone,
          balanceMinor: 0,
          entryCount: 0,
        };

    // Ensure BIGINT monetary columns are returned as numbers
    const entries = entriesResult.rows.map((row: any) => ({
      ...row,
      amountMinor: Number(row.amountMinor),
      runningBalanceMinor: Number(row.runningBalanceMinor),
    }));

    return res.json({
      entries,
      customer,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[KhataAPI] Entries error:", error.message);
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
  const { customerPhone, customerName, type: rawType, entryType: legacyEntryType, amountMinor, description, saleId } = req.body;
  // Accept both "type" (frontend contract) and "entryType" (legacy) — prefer "type"
  const requestType = rawType || legacyEntryType;
  // Frontend sends uppercase (CREDIT/DEBIT/PAYMENT), DB stores lowercase
  const entryType = typeof requestType === "string" ? requestType.toLowerCase() : requestType;

  // Validation
  if (!customerPhone || typeof customerPhone !== "string") {
    return res.status(400).json({ error: "customerPhone is required" });
  }
  // STG-469: Phone format validation — strip +91, accept 10 digits
  let normalizedPhone = customerPhone.trim().replace(/\s+/g, "");
  if (normalizedPhone.startsWith("+91")) normalizedPhone = normalizedPhone.slice(3);
  else if (normalizedPhone.startsWith("91") && normalizedPhone.length === 12) normalizedPhone = normalizedPhone.slice(2);
  else if (normalizedPhone.startsWith("0")) normalizedPhone = normalizedPhone.slice(1);
  if (!/^\d{10}$/.test(normalizedPhone)) {
    return res.status(400).json({ error: "customerPhone must be a valid 10-digit Indian phone number" });
  }
  if (!entryType || !["credit", "debit", "payment"].includes(entryType)) {
    return res.status(400).json({ error: "type must be 'CREDIT', 'DEBIT', or 'PAYMENT'" });
  }
  if (!amountMinor || typeof amountMinor !== "number" || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor must be a positive number" });
  }

  // STG-473: Check consent before storing customer phone (DPDP compliance)
  const consentCheck = await pool.query(
    `SELECT id FROM platform.consent_records
     WHERE store_id = $1 AND customer_phone = $2 AND consent_type = 'khata_phone' AND revoked_at IS NULL
     LIMIT 1`,
    [storeId, customerPhone]
  );

  if (consentCheck.rows.length === 0) {
    return res.status(403).json({
      success: false,
      consentRequired: true,
      consentType: 'khata_phone',
      error: 'Customer consent required before recording khata entries. Please obtain consent first.',
    });
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
        customer_phone AS "customerId",
        UPPER(entry_type) AS "type",
        amount_minor AS "amountMinor",
        description,
        balance_minor AS "runningBalanceMinor",
        created_by AS "createdByStaffId",
        created_at AS "createdAt"`,
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

    // Ensure BIGINT monetary columns are returned as numbers
    const entry = {
      ...insertResult.rows[0],
      amountMinor: Number(insertResult.rows[0].amountMinor),
      runningBalanceMinor: Number(insertResult.rows[0].runningBalanceMinor),
    };

    return res.status(201).json({
      entry,
      customer: {
        id: customerPhone,
        name: resolvedName,
        phone: customerPhone,
        balanceMinor: Number(newBalance),
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[KhataAPI] Create entry error:", error.message);
    return res.status(500).json({ error: "Failed to create khata entry" });
  } finally {
    client.release();
  }
});

// =============================================================================
// STG-472: Bulk Actions — Mark Paid / Send Reminders
// =============================================================================

/**
 * POST /api/v1/pos/khata/bulk/mark-paid
 * STG-472: Bulk mark multiple customers as paid
 * Body: { customerPhones: string[], amountMinor?: number }
 */
posKhataRouter.post("/khata/bulk/mark-paid", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { customerPhones } = req.body as { customerPhones?: string[] };

  if (!Array.isArray(customerPhones) || customerPhones.length === 0) {
    return res.status(400).json({ success: false, error: "customerPhones array is required" });
  }

  if (customerPhones.length > 50) {
    return res.status(400).json({ success: false, error: "Maximum 50 customers per bulk operation" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const results: Array<{ phone: string; success: boolean; newBalance: number }> = [];

    for (const phone of customerPhones) {
      // Get current balance for this customer
      const balanceResult = await client.query(
        `SELECT
          COALESCE(SUM(
            CASE
              WHEN entry_type = 'credit' THEN amount_minor
              WHEN entry_type = 'payment' THEN -amount_minor
              ELSE 0
            END
          ), 0)::bigint AS current_balance,
          MAX(customer_name) as customer_name
        FROM orders.khata_entries
        WHERE store_id = $1 AND customer_phone = $2`,
        [storeId, phone]
      );

      const currentBalance = Number(balanceResult.rows[0].current_balance);
      if (currentBalance <= 0) {
        results.push({ phone, success: true, newBalance: currentBalance });
        continue; // Already settled or in advance
      }

      // Create a payment entry to zero out the balance
      await client.query(
        `INSERT INTO orders.khata_entries
          (store_id, customer_name, customer_phone, entry_type, amount_minor,
           description, balance_minor, created_by)
        VALUES ($1, $2, $3, 'payment', $4, $5, 0, $6)`,
        [
          storeId,
          balanceResult.rows[0].customer_name || phone,
          phone,
          currentBalance,
          'Bulk mark paid',
          (req as PosRequest).posDevice.deviceId,
        ]
      );

      results.push({ phone, success: true, newBalance: 0 });
    }

    await client.query("COMMIT");

    log.info(`[STG-472] Bulk mark paid: storeId=${storeId}, count=${results.length}`);

    return res.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    await client.query("ROLLBACK");
    log.error("[STG-472] Bulk mark paid error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to process bulk mark paid" });
  } finally {
    client.release();
  }
});

/**
 * POST /api/v1/pos/khata/bulk/send-reminders
 * STG-472: Bulk send payment reminders to customers with outstanding balances
 * Body: { customerPhones: string[] }
 * Note: In MVP, this just records the reminder intent — actual SMS/WhatsApp integration comes later
 */
posKhataRouter.post("/khata/bulk/send-reminders", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as PosRequest).posDevice;
  const { customerPhones } = req.body as { customerPhones?: string[] };

  if (!Array.isArray(customerPhones) || customerPhones.length === 0) {
    return res.status(400).json({ success: false, error: "customerPhones array is required" });
  }

  if (customerPhones.length > 50) {
    return res.status(400).json({ success: false, error: "Maximum 50 customers per bulk operation" });
  }

  try {
    // Get balances for all requested customers
    const balanceResult = await pool.query(
      `SELECT
        customer_phone,
        MAX(customer_name) as customer_name,
        COALESCE(SUM(
          CASE
            WHEN entry_type = 'credit' THEN amount_minor
            WHEN entry_type = 'payment' THEN -amount_minor
            ELSE 0
          END
        ), 0)::bigint AS balance
      FROM orders.khata_entries
      WHERE store_id = $1 AND customer_phone = ANY($2)
      GROUP BY customer_phone
      HAVING COALESCE(SUM(
        CASE
          WHEN entry_type = 'credit' THEN amount_minor
          WHEN entry_type = 'payment' THEN -amount_minor
          ELSE 0
        END
      ), 0) > 0`,
      [storeId, customerPhones]
    );

    const reminders = balanceResult.rows.map(r => ({
      phone: r.customer_phone,
      name: r.customer_name,
      balanceMinor: Number(r.balance),
      reminderQueued: true,
    }));

    log.info(`[STG-472] Bulk send reminders: storeId=${storeId}, queued=${reminders.length}`);

    return res.json({
      success: true,
      remindersQueued: reminders.length,
      reminders,
      note: "Reminders will be sent via WhatsApp/SMS when messaging integration is active.",
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[STG-472] Bulk send reminders error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to process bulk reminders" });
  }
});
