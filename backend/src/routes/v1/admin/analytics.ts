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
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
  }
});

adminAnalyticsRouter.get("/analytics/devices", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const limit = asNumber(req.query.limit);
    const offset = asNumber(req.query.offset);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchDevicesAnalytics({ storeId, from, to, limit, offset });
    res.json({ devices: data.devices, total: data.total, range: data.range, storeId: data.storeId });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
  }
});

adminAnalyticsRouter.get("/analytics/products", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const groupBy = asString(req.query.groupBy);
    const limit = asNumber(req.query.limit);
    const offset = asNumber(req.query.offset);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchProductsAnalytics({ storeId, from, to, groupBy, limit, offset });
    res.json({ products: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
  }
});

adminAnalyticsRouter.get("/analytics/purchases", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const limit = asNumber(req.query.limit);
    const offset = asNumber(req.query.offset);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchPurchasesAnalytics({ storeId, from, to, limit, offset });
    res.json({ purchases: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
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
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
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
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
  }
});

// MED-012: DEPRECATED - No frontend callers as of 2026-01-25
// Retained for potential future admin dashboard use
adminAnalyticsRouter.get("/analytics/dues", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const limit = asNumber(req.query.limit);
    const offset = asNumber(req.query.offset);

    // GO-LIVE-007: Validate date range
    const dateValidation = validateDateRange(from, to);
    if (dateValidation.error) {
      return res.status(400).json({ error: dateValidation.error });
    }

    const data = await fetchDuesAnalytics({ storeId, from, to, limit, offset });
    res.json({ dues: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
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
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
  }
});
