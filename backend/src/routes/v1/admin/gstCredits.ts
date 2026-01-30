// GO-LIVE-097: GST Input Credit Tracking API
// Endpoints for managing GST input tax credits from purchase invoices

import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";

export const adminGstCreditsRouter = Router();

adminGstCreditsRouter.use(requireAdminToken);

// Validation patterns
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILING_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/; // YYYY-MM format

type GstCreditStatus = 'pending' | 'verified' | 'claimed' | 'rejected' | 'expired';

interface GstInputCreditInput {
  store_id: string;
  invoice_number: string;
  invoice_date: string;
  supplier_gstin?: string;
  supplier_name?: string;
  taxable_amount_paise: number;
  cgst_paise?: number;
  sgst_paise?: number;
  igst_paise?: number;
  cess_paise?: number;
  cgst_rate_bps?: number;
  sgst_rate_bps?: number;
  igst_rate_bps?: number;
  filing_period?: string;
  purchase_id?: string;
  purchase_order_id?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// GET /api/v1/admin/gst-credits - List GST input credits
adminGstCreditsRouter.get("/gst-credits", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = asString(req.query.store_id);
  const status = asString(req.query.status) as GstCreditStatus | undefined;
  const filingPeriod = asString(req.query.filing_period);
  const fromDate = asString(req.query.from_date);
  const toDate = asString(req.query.to_date);
  const limit = Math.min(asNumber(req.query.limit) || 100, 500);
  const offset = asNumber(req.query.offset) || 0;

  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (storeId) {
      if (!UUID_PATTERN.test(storeId)) {
        return res.status(400).json({ error: "store_id_invalid_uuid" });
      }
      conditions.push(`store_id = $${paramIndex++}::uuid`);
      values.push(storeId);
    }

    if (status) {
      const validStatuses: GstCreditStatus[] = ['pending', 'verified', 'claimed', 'rejected', 'expired'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "status_invalid" });
      }
      conditions.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (filingPeriod) {
      if (!FILING_PERIOD_PATTERN.test(filingPeriod)) {
        return res.status(400).json({ error: "filing_period_invalid_format" });
      }
      conditions.push(`filing_period = $${paramIndex++}`);
      values.push(filingPeriod);
    }

    if (fromDate) {
      conditions.push(`invoice_date >= $${paramIndex++}::date`);
      values.push(fromDate);
    }

    if (toDate) {
      conditions.push(`invoice_date <= $${paramIndex++}::date`);
      values.push(toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(limit, offset);

    const result = await pool.query(
      `SELECT
        id::TEXT,
        store_id::TEXT,
        invoice_number,
        invoice_date,
        supplier_gstin,
        supplier_name,
        taxable_amount_paise,
        cgst_paise,
        sgst_paise,
        igst_paise,
        cess_paise,
        total_gst_paise,
        cgst_rate_bps,
        sgst_rate_bps,
        igst_rate_bps,
        status,
        claimed_in_return,
        claimed_at,
        filing_period,
        due_date,
        purchase_id::TEXT,
        purchase_order_id::TEXT,
        created_at,
        updated_at
      FROM accounting.gst_input_credits
      ${whereClause}
      ORDER BY invoice_date DESC, created_at DESC
      LIMIT $${paramIndex++}
      OFFSET $${paramIndex++}`,
      values
    );

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM accounting.gst_input_credits ${whereClause}`,
      values.slice(0, -2)
    );

    // Calculate summary totals
    const summaryResult = await pool.query(
      `SELECT
        COALESCE(SUM(taxable_amount_paise), 0) as total_taxable_paise,
        COALESCE(SUM(total_gst_paise), 0) as total_gst_paise,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN total_gst_paise ELSE 0 END), 0) as pending_gst_paise,
        COALESCE(SUM(CASE WHEN status = 'claimed' THEN total_gst_paise ELSE 0 END), 0) as claimed_gst_paise
      FROM accounting.gst_input_credits
      ${whereClause}`,
      values.slice(0, -2)
    );

    return res.json({
      credits: result.rows,
      total: parseInt(countResult.rows[0]?.total || "0", 10),
      limit,
      offset,
      summary: {
        total_taxable_paise: parseInt(summaryResult.rows[0]?.total_taxable_paise || "0", 10),
        total_gst_paise: parseInt(summaryResult.rows[0]?.total_gst_paise || "0", 10),
        pending_gst_paise: parseInt(summaryResult.rows[0]?.pending_gst_paise || "0", 10),
        claimed_gst_paise: parseInt(summaryResult.rows[0]?.claimed_gst_paise || "0", 10),
      }
    });
  } catch (error: unknown) {
    console.error("[admin/gst-credits] Failed to fetch credits:", error);
    return res.status(500).json({ error: "fetch_gst_credits_failed" });
  }
});

// POST /api/v1/admin/gst-credits - Create GST input credit record
adminGstCreditsRouter.post("/gst-credits", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const body = req.body as GstInputCreditInput;

  // Validate required fields
  if (!body.store_id || !UUID_PATTERN.test(body.store_id)) {
    return res.status(400).json({ error: "store_id_required" });
  }

  if (!body.invoice_number?.trim()) {
    return res.status(400).json({ error: "invoice_number_required" });
  }

  if (!body.invoice_date) {
    return res.status(400).json({ error: "invoice_date_required" });
  }

  if (typeof body.taxable_amount_paise !== "number" || body.taxable_amount_paise < 0) {
    return res.status(400).json({ error: "taxable_amount_paise_invalid" });
  }

  // Validate GSTIN format if provided
  if (body.supplier_gstin && !GSTIN_PATTERN.test(body.supplier_gstin)) {
    return res.status(400).json({ error: "supplier_gstin_invalid_format" });
  }

  // Validate filing period format if provided
  if (body.filing_period && !FILING_PERIOD_PATTERN.test(body.filing_period)) {
    return res.status(400).json({ error: "filing_period_invalid_format" });
  }

  // Calculate total GST
  const cgstPaise = body.cgst_paise || 0;
  const sgstPaise = body.sgst_paise || 0;
  const igstPaise = body.igst_paise || 0;
  const cessPaise = body.cess_paise || 0;
  const totalGstPaise = cgstPaise + sgstPaise + igstPaise + cessPaise;

  try {
    const result = await pool.query(
      `INSERT INTO accounting.gst_input_credits (
        store_id,
        invoice_number,
        invoice_date,
        supplier_gstin,
        supplier_name,
        taxable_amount_paise,
        cgst_paise,
        sgst_paise,
        igst_paise,
        cess_paise,
        total_gst_paise,
        cgst_rate_bps,
        sgst_rate_bps,
        igst_rate_bps,
        filing_period,
        purchase_id,
        purchase_order_id
      ) VALUES (
        $1::uuid, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::uuid, $17::uuid
      )
      RETURNING id::TEXT, store_id::TEXT, invoice_number, invoice_date, status, total_gst_paise, created_at`,
      [
        body.store_id,
        body.invoice_number.trim(),
        body.invoice_date,
        body.supplier_gstin || null,
        body.supplier_name?.trim() || null,
        body.taxable_amount_paise,
        cgstPaise,
        sgstPaise,
        igstPaise,
        cessPaise,
        totalGstPaise,
        body.cgst_rate_bps || null,
        body.sgst_rate_bps || null,
        body.igst_rate_bps || null,
        body.filing_period || null,
        body.purchase_id || null,
        body.purchase_order_id || null,
      ]
    );

    return res.status(201).json({ credit: result.rows[0] });
  } catch (error: unknown) {
    console.error("[admin/gst-credits] Failed to create credit:", error);
    const pgError = error as { code?: string };
    if (pgError.code === "23503") {
      return res.status(400).json({ error: "store_id_not_found" });
    }
    return res.status(500).json({ error: "create_gst_credit_failed" });
  }
});

// PATCH /api/v1/admin/gst-credits/:id - Update GST credit status
adminGstCreditsRouter.patch("/gst-credits/:id", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const creditId = req.params.id?.trim();
  if (!creditId || !UUID_PATTERN.test(creditId)) {
    return res.status(400).json({ error: "credit_id_invalid" });
  }

  const { status, claimed_in_return } = req.body as { status?: string; claimed_in_return?: string };

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    const validStatuses: GstCreditStatus[] = ['pending', 'verified', 'claimed', 'rejected', 'expired'];
    if (!validStatuses.includes(status as GstCreditStatus)) {
      return res.status(400).json({ error: "status_invalid" });
    }
    updates.push(`status = $${paramIndex++}`);
    values.push(status);

    // Set claimed_at when marking as claimed
    if (status === 'claimed') {
      updates.push(`claimed_at = NOW()`);
    }
  }

  if (claimed_in_return !== undefined) {
    if (claimed_in_return && !FILING_PERIOD_PATTERN.test(claimed_in_return)) {
      return res.status(400).json({ error: "claimed_in_return_invalid_format" });
    }
    updates.push(`claimed_in_return = $${paramIndex++}`);
    values.push(claimed_in_return || null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "no_fields_to_update" });
  }

  updates.push(`updated_at = NOW()`);
  values.push(creditId);

  try {
    const result = await pool.query(
      `UPDATE accounting.gst_input_credits
       SET ${updates.join(", ")}
       WHERE id = $${paramIndex}::uuid
       RETURNING id::TEXT, store_id::TEXT, invoice_number, status, claimed_in_return, claimed_at, updated_at`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "credit_not_found" });
    }

    return res.json({ credit: result.rows[0] });
  } catch (error: unknown) {
    console.error("[admin/gst-credits] Failed to update credit:", error);
    return res.status(500).json({ error: "update_gst_credit_failed" });
  }
});

// GET /api/v1/admin/gst-credits/summary - Get GST credits summary by filing period
adminGstCreditsRouter.get("/gst-credits/summary", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeId = asString(req.query.store_id);

  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (storeId) {
      if (!UUID_PATTERN.test(storeId)) {
        return res.status(400).json({ error: "store_id_invalid_uuid" });
      }
      conditions.push(`store_id = $${paramIndex++}::uuid`);
      values.push(storeId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT
        filing_period,
        status,
        COUNT(*) as count,
        SUM(taxable_amount_paise) as taxable_amount_paise,
        SUM(cgst_paise) as cgst_paise,
        SUM(sgst_paise) as sgst_paise,
        SUM(igst_paise) as igst_paise,
        SUM(total_gst_paise) as total_gst_paise
      FROM accounting.gst_input_credits
      ${whereClause}
      GROUP BY filing_period, status
      ORDER BY filing_period DESC, status`,
      values
    );

    return res.json({ summary: result.rows });
  } catch (error: unknown) {
    console.error("[admin/gst-credits] Failed to fetch summary:", error);
    return res.status(500).json({ error: "fetch_summary_failed" });
  }
});
