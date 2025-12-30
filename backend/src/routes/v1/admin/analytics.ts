import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
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

adminAnalyticsRouter.use(requireAdminToken);

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

adminAnalyticsRouter.get("/analytics/overview", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
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
    const data = await fetchPaymentsAnalytics({ storeId, from, to });
    res.json({ payments: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
  }
});

adminAnalyticsRouter.get("/analytics/dues", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const limit = asNumber(req.query.limit);
    const offset = asNumber(req.query.offset);
    const data = await fetchDuesAnalytics({ storeId, from, to, limit, offset });
    res.json({ dues: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
  }
});

adminAnalyticsRouter.get("/analytics/activity", async (req, res) => {
  try {
    const storeId = asString(req.query.storeId);
    const from = asString(req.query.from);
    const to = asString(req.query.to);
    const groupBy = asString(req.query.groupBy);
    const data = await fetchActivityAnalytics({ storeId, from, to, groupBy });
    res.json({ activity: data });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "analytics_failed" });
  }
});
