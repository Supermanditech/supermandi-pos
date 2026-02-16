// T-303→T-316: AI Intelligence API Routes
// Endpoints for alerts, forecasts, recommendations, insights, and scheduled jobs

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";

// Services
import { getStoreAlerts, markAlertRead, dismissAlert, getUnreadAlertCount, runAllStoreAlerts, runStoreAlerts } from "../../services/ai/alertsEngine";
import { getStoreForecasts, computeAllForecasts, computeStoreForecast } from "../../services/ai/demandForecastService";
import { generateAllSmartReorders } from "../../services/ai/smartReorderService";
import { getAutoClosingConfig, updateAutoClosingConfig, processAutoClosing } from "../../services/ai/autoClosingService";
import { getStorePriceComparisons } from "../../services/ai/priceComparisonService";
import { getStoreCustomerInsights, computeAllInsights } from "../../services/ai/customerInsightsService";
import { detectSlowMovers } from "../../services/ai/slowMoverService";
import { getExpiringProducts, updateProductExpiry } from "../../services/ai/expiryTrackingService";
import { getStoreAnomalies, markAnomalyReviewed, detectAllAnomalies } from "../../services/ai/anomalyDetectionService";
import { getProductRecommendations, getTrendingProducts, computeAllRecommendations } from "../../services/ai/recommendationService";

export const aiIntelligenceRouter = Router();

interface PosRequest extends Request { posDevice: PosDeviceContext; }

// =============================================================================
// POS ENDPOINTS (device token auth)
// =============================================================================

// T-307: Get alerts for store
aiIntelligenceRouter.get("/pos/ai/alerts", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const unreadOnly = req.query.unreadOnly === 'true';
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const result = await getStoreAlerts(storeId, { unreadOnly, limit, offset });
  res.json(result);
});

// T-307: Get unread alert count (for badge)
aiIntelligenceRouter.get("/pos/ai/alerts/count", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const count = await getUnreadAlertCount(storeId);
  res.json({ count });
});

// T-307: Mark alert as read
aiIntelligenceRouter.patch("/pos/ai/alerts/:alertId/read", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const ok = await markAlertRead(req.params.alertId, storeId);
  res.json({ success: ok });
});

// T-307: Dismiss alert
aiIntelligenceRouter.patch("/pos/ai/alerts/:alertId/dismiss", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const ok = await dismissAlert(req.params.alertId, storeId);
  res.json({ success: ok });
});

// T-308: Get demand forecasts
aiIntelligenceRouter.get("/pos/ai/forecasts", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const productId = req.query.productId as string | undefined;
  const days = Math.min(30, parseInt(req.query.days as string) || 7);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const forecasts = await getStoreForecasts(storeId, { productId, days, limit });
  res.json({ forecasts });
});

// T-303: Get recommendations for a product
aiIntelligenceRouter.get("/pos/ai/recommendations/:productId", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const type = req.query.type as string | undefined;
  const limit = Math.min(20, parseInt(req.query.limit as string) || 10);
  const recs = await getProductRecommendations(storeId, req.params.productId, { type, limit });
  res.json({ recommendations: recs });
});

// T-303: Get trending products
aiIntelligenceRouter.get("/pos/ai/trending", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const limit = Math.min(20, parseInt(req.query.limit as string) || 10);
  const trending = await getTrendingProducts(storeId, limit);
  res.json({ trending });
});

// T-310: Get auto-closing config
aiIntelligenceRouter.get("/pos/ai/auto-closing/config", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const config = await getAutoClosingConfig(storeId);
  res.json(config);
});

// T-310: Update auto-closing config
aiIntelligenceRouter.patch("/pos/ai/auto-closing/config", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const { enabled, closeTime } = req.body;
  await updateAutoClosingConfig(storeId, { enabled, closeTime });
  res.json({ success: true });
});

// T-311: Price comparisons
aiIntelligenceRouter.get("/pos/ai/price-comparisons", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const productId = req.query.productId as string | undefined;
  const onlyWithSavings = req.query.onlyWithSavings === 'true';
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const result = await getStorePriceComparisons(storeId, { productId, onlyWithSavings, limit, offset });
  res.json(result);
});

// T-312: Customer insights
aiIntelligenceRouter.get("/pos/ai/customer-insights", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const segment = req.query.segment as string | undefined;
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const result = await getStoreCustomerInsights(storeId, { segment: segment as any, limit, offset });
  res.json(result);
});

// T-313: Slow movers
aiIntelligenceRouter.get("/pos/ai/slow-movers", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const result = await detectSlowMovers(storeId, { limit, offset });
  res.json(result);
});

// T-314: Expiring products
aiIntelligenceRouter.get("/pos/ai/expiring", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const daysAhead = Math.min(90, parseInt(req.query.daysAhead as string) || 30);
  const includeExpired = req.query.includeExpired !== 'false';
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const result = await getExpiringProducts(storeId, { daysAhead, includeExpired, limit, offset });
  res.json(result);
});

// T-314: Update product expiry
aiIntelligenceRouter.patch("/pos/ai/expiry/:productId", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const { expiryDate } = req.body;
  const ok = await updateProductExpiry(storeId, req.params.productId, expiryDate || null);
  res.json({ success: ok });
});

// T-316: Anomalies
aiIntelligenceRouter.get("/pos/ai/anomalies", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  const { storeId } = (req as PosRequest).posDevice;
  const unreviewed = req.query.unreviewed === 'true';
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const result = await getStoreAnomalies(storeId, { unreviewed, limit, offset });
  res.json(result);
});

// =============================================================================
// ADMIN SCHEDULED JOB ENDPOINTS
// =============================================================================

// T-307: Run all store alerts
aiIntelligenceRouter.post("/admin/jobs/ai-alerts", async (_req: Request, res: Response) => {
  const result = await runAllStoreAlerts();
  res.json({ success: true, ...result });
});

// T-308: Run demand forecasting
aiIntelligenceRouter.post("/admin/jobs/ai-forecasts", async (_req: Request, res: Response) => {
  const result = await computeAllForecasts();
  res.json({ success: true, ...result });
});

// T-309: Run smart reorder generation
aiIntelligenceRouter.post("/admin/jobs/ai-smart-reorder", async (_req: Request, res: Response) => {
  const result = await generateAllSmartReorders();
  res.json({ success: true, ...result });
});

// T-310: Run auto daily closing
aiIntelligenceRouter.post("/admin/jobs/ai-auto-closing", async (_req: Request, res: Response) => {
  const result = await processAutoClosing();
  res.json({ success: true, ...result });
});

// T-312: Run customer insights computation
aiIntelligenceRouter.post("/admin/jobs/ai-customer-insights", async (_req: Request, res: Response) => {
  const result = await computeAllInsights();
  res.json({ success: true, ...result });
});

// T-316: Run anomaly detection
aiIntelligenceRouter.post("/admin/jobs/ai-anomaly-detection", async (_req: Request, res: Response) => {
  const result = await detectAllAnomalies();
  res.json({ success: true, ...result });
});

// T-303: Run recommendation computation
aiIntelligenceRouter.post("/admin/jobs/ai-recommendations", async (_req: Request, res: Response) => {
  const result = await computeAllRecommendations();
  res.json({ success: true, ...result });
});

// Admin: Get alerts for any store
aiIntelligenceRouter.get("/admin/ai/alerts", async (req: Request, res: Response) => {
  const storeId = req.query.storeId as string;
  if (!storeId) return res.status(400).json({ error: { message: 'storeId required' } });
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const result = await getStoreAlerts(storeId, { limit, offset });
  res.json(result);
});

// Admin: Get anomalies for any store
aiIntelligenceRouter.get("/admin/ai/anomalies", async (req: Request, res: Response) => {
  const storeId = req.query.storeId as string;
  if (!storeId) return res.status(400).json({ error: { message: 'storeId required' } });
  const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset = parseInt(req.query.offset as string) || 0;
  const result = await getStoreAnomalies(storeId, { limit, offset });
  res.json(result);
});

// Admin: Get customer insights for any store
aiIntelligenceRouter.get("/admin/ai/customer-insights", async (req: Request, res: Response) => {
  const storeId = req.query.storeId as string;
  if (!storeId) return res.status(400).json({ error: { message: 'storeId required' } });
  const result = await getStoreCustomerInsights(storeId);
  res.json(result);
});
