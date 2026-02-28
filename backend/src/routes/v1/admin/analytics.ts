import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdminToken } from "../../../middleware/adminToken";
import { apiCache } from "../../../middleware/apiCache";  // GO-LIVE-098
import {
  fetchConsumerSalesAnalytics,
  fetchDuesAnalytics,
  fetchPaymentsAnalytics,
  fetchDevicesAnalytics,
  fetchOverview,
  fetchProductsAnalytics,
  fetchPurchasesAnalytics,
  fetchActivityAnalytics
} from "../../../services/analytics/analyticsService";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const adminAnalyticsRouter = Router();

// GO-LIVE-053: Rate limiter for analytics endpoints
// Even with admin token, prevent excessive queries that could strain the database
const analyticsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute (1 per second average)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many analytics requests. Please wait before making more requests.'
    }
  }
});

adminAnalyticsRouter.use(requireAdminToken);
adminAnalyticsRouter.use(analyticsRateLimiter);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// PAGINATION-LIMIT-UNCAPPED: cap pagination limit to prevent expensive full-table scans
const MAX_PAGE_LIMIT = 1000;
function asPageLimit(value: unknown, defaultVal = 50): number {
  const n = asNumber(value);
  return Math.min(Math.max(1, n ?? defaultVal), MAX_PAGE_LIMIT);
}
function asPageOffset(value: unknown): number {
  return Math.max(0, asNumber(value) ?? 0);
}

// GO-LIVE-007: Date range validation for analytics endpoints
const MAX_DATE_RANGE_DAYS = 365; // Maximum 1 year range to prevent expensive queries
const DATE_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;

interface DateRangeValidation {
  from?: Date;
  to?: Date;
  error?: string;
}

function validateDateRange(fromStr?: string, toStr?: string): DateRangeValidation {
  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  // Validate 'from' date if provided
  if (fromStr) {
    if (!DATE_ISO_PATTERN.test(fromStr)) {
      return { error: "from_date_invalid_format" };
    }
    fromDate = new Date(fromStr);
    if (!Number.isFinite(fromDate.getTime())) {
      return { error: "from_date_invalid" };
    }
  }

  // Validate 'to' date if provided
  if (toStr) {
    if (!DATE_ISO_PATTERN.test(toStr)) {
      return { error: "to_date_invalid_format" };
    }
    toDate = new Date(toStr);
    if (!Number.isFinite(toDate.getTime())) {
      return { error: "to_date_invalid" };
    }
  }

  // Validate from <= to
  if (fromDate && toDate && fromDate > toDate) {
    return { error: "from_date_after_to_date" };
  }

  // Validate date range not too large
  if (fromDate && toDate) {
    const rangeDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    if (rangeDays > MAX_DATE_RANGE_DAYS) {
      return { error: `date_range_exceeds_${MAX_DATE_RANGE_DAYS}_days` };
    }
  }

  return { from: fromDate, to: toDate };
}

// GO-LIVE-098: Cache analytics overview for 60 seconds
adminAnalyticsRouter.get("/analytics/overview", apiCache('analytics:overview', { ttlSeconds: 60 }), async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchOverview({ storeId, from, to });
    res.json({ overview: data });
  } catch (_e: unknown) {
    const e = asError(_e);
    // XPORT-003: Never leak raw error messages — log server-side only
    log.error("[Analytics] Query failed:", e?.message);
    res.status(500).json({ error: { code: "ANALYTICS_FAILED", message: "Failed to fetch analytics data" } });
  }
});

adminAnalyticsRouter.get("/analytics/devices", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const limit = asPageLimit(req.query.limit);
    const offset = asPageOffset(req.query.offset);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchDevicesAnalytics({ storeId, from, to, limit, offset });
    res.json({ devices: data.devices, total: data.total, range: data.range, storeId: data.storeId });
  } catch (_e: unknown) {
    const e = asError(_e);
    // XPORT-003: Never leak raw error messages — log server-side only
    log.error("[Analytics] Query failed:", e?.message);
    res.status(500).json({ error: { code: "ANALYTICS_FAILED", message: "Failed to fetch analytics data" } });
  }
});

adminAnalyticsRouter.get("/analytics/products", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const groupBy = asString(req.query.groupBy);
    const limit = asPageLimit(req.query.limit);
    const offset = asPageOffset(req.query.offset);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchProductsAnalytics({ storeId, from, to, groupBy, limit, offset });
    res.json({ products: data });
  } catch (_e: unknown) {
    const e = asError(_e);
    // XPORT-003: Never leak raw error messages — log server-side only
    log.error("[Analytics] Query failed:", e?.message);
    res.status(500).json({ error: { code: "ANALYTICS_FAILED", message: "Failed to fetch analytics data" } });
  }
});

adminAnalyticsRouter.get("/analytics/purchases", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const limit = asPageLimit(req.query.limit);
    const offset = asPageOffset(req.query.offset);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchPurchasesAnalytics({ storeId, from, to, limit, offset });
    res.json({ purchases: data });
  } catch (_e: unknown) {
    const e = asError(_e);
    // XPORT-003: Never leak raw error messages — log server-side only
    log.error("[Analytics] Query failed:", e?.message);
    res.status(500).json({ error: { code: "ANALYTICS_FAILED", message: "Failed to fetch analytics data" } });
  }
});

adminAnalyticsRouter.get("/analytics/consumer-sales", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchConsumerSalesAnalytics({ storeId, from, to });
    res.json({ consumer_sales: data });
  } catch (_e: unknown) {
    const e = asError(_e);
    // XPORT-003: Never leak raw error messages — log server-side only
    log.error("[Analytics] Query failed:", e?.message);
    res.status(500).json({ error: { code: "ANALYTICS_FAILED", message: "Failed to fetch analytics data" } });
  }
});

adminAnalyticsRouter.get("/analytics/payments", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchPaymentsAnalytics({ storeId, from, to });
    res.json({ payments: data });
  } catch (_e: unknown) {
    const e = asError(_e);
    // XPORT-003: Never leak raw error messages — log server-side only
    log.error("[Analytics] Query failed:", e?.message);
    res.status(500).json({ error: { code: "ANALYTICS_FAILED", message: "Failed to fetch analytics data" } });
  }
});

// MED-012: DEPRECATED - No frontend callers as of 2026-01-25
// Retained for potential future admin dashboard use
adminAnalyticsRouter.get("/analytics/dues", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const limit = asPageLimit(req.query.limit);
    const offset = asPageOffset(req.query.offset);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchDuesAnalytics({ storeId, from, to, limit, offset });
    res.json({ dues: data });
  } catch (_e: unknown) {
    const e = asError(_e);
    // XPORT-003: Never leak raw error messages — log server-side only
    log.error("[Analytics] Query failed:", e?.message);
    res.status(500).json({ error: { code: "ANALYTICS_FAILED", message: "Failed to fetch analytics data" } });
  }
});

// =============================================================================
// T-189: Margin Analysis Report
// GET /api/v1/admin/analytics/margins
// Returns product margins grouped by category with aggregation
// =============================================================================

adminAnalyticsRouter.get("/analytics/margins", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const groupBy = asString(req.query.groupBy) || 'category'; // category | product
    const limit = asPageLimit(req.query.limit);
    const offset = asPageOffset(req.query.offset);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const pool = (await import("../../../db/client.js")).getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    let query: string;
    const params: any[] = [];
    let paramIdx = 1;

    if (groupBy === 'product') {
      // Per-product margin analysis
      query = `
        SELECT
          p.name as "productName",
          p.brand,
          COALESCE(t.label_en, 'Uncategorized') as "category",
          sp.sell_price as "sellPriceMinor",
          sp.purchase_price as "purchasePriceMinor",
          sp.mrp as "mrpMinor",
          CASE WHEN sp.purchase_price > 0
            THEN ROUND(((sp.sell_price - sp.purchase_price)::numeric / sp.purchase_price) * 100, 2)
            ELSE 0
          END as "marginPercent",
          (sp.sell_price - COALESCE(sp.purchase_price, 0)) as "marginMinor",
          COALESCE(sp.current_stock, 0) as "currentStock",
          sp.store_id as "storeId"
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        LEFT JOIN catalog.fmcg_taxonomy t ON t.id = sp.taxonomy_id
        WHERE sp.is_active = true`;

      if (storeId) {
        query += ` AND sp.store_id = $${paramIdx}`;
        params.push(storeId);
        paramIdx++;
      }

      query += ` ORDER BY "marginPercent" DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      params.push(limit, offset);
    } else {
      // Category-level margin aggregation
      query = `
        SELECT
          COALESCE(t.label_en, 'Uncategorized') as "category",
          COUNT(*) as "productCount",
          ROUND(AVG(
            CASE WHEN sp.purchase_price > 0
              THEN ((sp.sell_price - sp.purchase_price)::numeric / sp.purchase_price) * 100
              ELSE 0
            END
          ), 2) as "avgMarginPercent",
          SUM(sp.sell_price - COALESCE(sp.purchase_price, 0)) as "totalMarginMinor",
          SUM(sp.sell_price) as "totalRevenuePotentialMinor",
          SUM(COALESCE(sp.purchase_price, 0)) as "totalCostMinor",
          SUM(COALESCE(sp.current_stock, 0)) as "totalStock"
        FROM catalog.store_products sp
        JOIN catalog.products p ON p.id = sp.product_id
        LEFT JOIN catalog.fmcg_taxonomy t ON t.id = sp.taxonomy_id
        WHERE sp.is_active = true`;

      if (storeId) {
        query += ` AND sp.store_id = $${paramIdx}`;
        params.push(storeId);
        paramIdx++;
      }

      query += ` GROUP BY t.label_en ORDER BY "avgMarginPercent" DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      params.push(limit, offset);
    }

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      margins: result.rows,
      groupBy,
      pagination: { limit, offset },
    });
  } catch (_e: unknown) {
    const e = asError(_e);
    log.error("[T-189] Margin analysis failed:", e?.message);
    res.status(500).json({ error: { code: "ANALYTICS_FAILED", message: "Failed to fetch margin analysis" } });
  }
});

// MED-012: DEPRECATED - No frontend callers as of 2026-01-25
// Retained for potential future admin dashboard use
adminAnalyticsRouter.get("/analytics/activity", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const groupBy = asString(req.query.groupBy);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchActivityAnalytics({ storeId, from, to, groupBy });
    res.json({ activity: data });
  } catch (_e: unknown) {
    const e = asError(_e);
    // XPORT-003: Never leak raw error messages — log server-side only
    log.error("[Analytics] Query failed:", e?.message);
    res.status(500).json({ error: { code: "ANALYTICS_FAILED", message: "Failed to fetch analytics data" } });
  }
});
