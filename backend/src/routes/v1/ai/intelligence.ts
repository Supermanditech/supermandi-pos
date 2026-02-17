// T-303→T-316: AI Intelligence API Routes
// Endpoints for alerts, forecasts, recommendations, insights, and scheduled jobs

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken, type PosDeviceContext } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { requireAdminToken } from "../../../middleware/adminToken";

// Services — path is ../../../services (3 levels up from routes/v1/ai/ to src/)
import { getStoreAlerts, markAlertRead, dismissAlert, getUnreadAlertCount, runAllStoreAlerts, runStoreAlerts } from "../../../services/ai/alertsEngine";
import { getStoreForecasts, computeAllForecasts, computeStoreForecast } from "../../../services/ai/demandForecastService";
import { generateAllSmartReorders } from "../../../services/ai/smartReorderService";
import { getAutoClosingConfig, updateAutoClosingConfig, processAutoClosing } from "../../../services/ai/autoClosingService";
import { getStorePriceComparisons } from "../../../services/ai/priceComparisonService";
import { getStoreCustomerInsights, computeAllInsights } from "../../../services/ai/customerInsightsService";
import { detectSlowMovers } from "../../../services/ai/slowMoverService";
import { getExpiringProducts, updateProductExpiry } from "../../../services/ai/expiryTrackingService";
import { getStoreAnomalies, markAnomalyReviewed, detectAllAnomalies } from "../../../services/ai/anomalyDetectionService";
import { getProductRecommendations, getTrendingProducts, computeAllRecommendations } from "../../../services/ai/recommendationService";
import { log } from "../../../lib/logger";

export const aiIntelligenceRouter = Router();

interface PosRequest extends Request { posDevice: PosDeviceContext; }

// =============================================================================
// POS ENDPOINTS (device token auth)
// =============================================================================

// T-307: Get alerts for store
aiIntelligenceRouter.get("/pos/ai/alerts", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getStoreAlerts(storeId, { unreadOnly, limit, offset });
    res.json(result);
  } catch (err) {
    log.error('[AI] alerts error:', err);
    res.status(500).json({ error: { message: 'Failed to load alerts' } });
  }
});

// T-307: Get unread alert count (for badge)
aiIntelligenceRouter.get("/pos/ai/alerts/count", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const count = await getUnreadAlertCount(storeId);
    res.json({ count });
  } catch (err) {
    log.error('[AI] alert count error:', err);
    res.status(500).json({ error: { message: 'Failed to get alert count' } });
  }
});

// T-307: Mark alert as read
aiIntelligenceRouter.patch("/pos/ai/alerts/:alertId/read", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const ok = await markAlertRead(req.params.alertId, storeId);
    res.json({ success: ok });
  } catch (err) {
    log.error('[AI] mark alert read error:', err);
    res.status(500).json({ error: { message: 'Failed to mark alert' } });
  }
});

// T-307: Dismiss alert
aiIntelligenceRouter.patch("/pos/ai/alerts/:alertId/dismiss", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const ok = await dismissAlert(req.params.alertId, storeId);
    res.json({ success: ok });
  } catch (err) {
    log.error('[AI] dismiss alert error:', err);
    res.status(500).json({ error: { message: 'Failed to dismiss alert' } });
  }
});

// T-308: Get demand forecasts
aiIntelligenceRouter.get("/pos/ai/forecasts", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const productId = req.query.productId as string | undefined;
    const days = Math.min(30, parseInt(req.query.days as string) || 7);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const forecasts = await getStoreForecasts(storeId, { productId, days, limit });
    res.json({ forecasts });
  } catch (err) {
    log.error('[AI] forecasts error:', err);
    res.status(500).json({ error: { message: 'Failed to load forecasts' } });
  }
});

// T-303: Get recommendations for a product
aiIntelligenceRouter.get("/pos/ai/recommendations/:productId", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const type = req.query.type as string | undefined;
    const limit = Math.min(20, parseInt(req.query.limit as string) || 10);
    const recs = await getProductRecommendations(storeId, req.params.productId, { type, limit });
    res.json({ recommendations: recs });
  } catch (err) {
    log.error('[AI] recommendations error:', err);
    res.status(500).json({ error: { message: 'Failed to load recommendations' } });
  }
});

// T-303: Get trending products
aiIntelligenceRouter.get("/pos/ai/trending", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const limit = Math.min(20, parseInt(req.query.limit as string) || 10);
    const trending = await getTrendingProducts(storeId, limit);
    res.json({ trending });
  } catch (err) {
    log.error('[AI] trending error:', err);
    res.status(500).json({ error: { message: 'Failed to load trending' } });
  }
});

// T-310: Get auto-closing config
aiIntelligenceRouter.get("/pos/ai/auto-closing/config", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const config = await getAutoClosingConfig(storeId);
    res.json(config);
  } catch (err) {
    log.error('[AI] auto-closing config error:', err);
    res.status(500).json({ error: { message: 'Failed to load config' } });
  }
});

// T-310: Update auto-closing config
aiIntelligenceRouter.patch("/pos/ai/auto-closing/config", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const { enabled, closeTime } = req.body;
    await updateAutoClosingConfig(storeId, { enabled, closeTime });
    res.json({ success: true });
  } catch (err) {
    log.error('[AI] update config error:', err);
    res.status(500).json({ error: { message: 'Failed to update config' } });
  }
});

// T-311: Price comparisons
aiIntelligenceRouter.get("/pos/ai/price-comparisons", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const productId = req.query.productId as string | undefined;
    const onlyWithSavings = req.query.onlyWithSavings === 'true';
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getStorePriceComparisons(storeId, { productId, onlyWithSavings, limit, offset });
    res.json(result);
  } catch (err) {
    log.error('[AI] price comparisons error:', err);
    res.status(500).json({ error: { message: 'Failed to load comparisons' } });
  }
});

// T-312: Customer insights
aiIntelligenceRouter.get("/pos/ai/customer-insights", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const segment = req.query.segment as string | undefined;
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getStoreCustomerInsights(storeId, { segment: segment as any, limit, offset });
    res.json(result);
  } catch (err) {
    log.error('[AI] customer insights error:', err);
    res.status(500).json({ error: { message: 'Failed to load insights' } });
  }
});

// T-313: Slow movers
aiIntelligenceRouter.get("/pos/ai/slow-movers", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await detectSlowMovers(storeId, { limit, offset });
    res.json(result);
  } catch (err) {
    log.error('[AI] slow movers error:', err);
    res.status(500).json({ error: { message: 'Failed to load slow movers' } });
  }
});

// T-314: Expiring products
aiIntelligenceRouter.get("/pos/ai/expiring", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const daysAhead = Math.min(90, parseInt(req.query.daysAhead as string) || 30);
    const includeExpired = req.query.includeExpired !== 'false';
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getExpiringProducts(storeId, { daysAhead, includeExpired, limit, offset });
    res.json(result);
  } catch (err) {
    log.error('[AI] expiring products error:', err);
    res.status(500).json({ error: { message: 'Failed to load expiring products' } });
  }
});

// T-314: Update product expiry
aiIntelligenceRouter.patch("/pos/ai/expiry/:productId", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const { expiryDate } = req.body;
    const ok = await updateProductExpiry(storeId, req.params.productId, expiryDate || null);
    res.json({ success: ok });
  } catch (err) {
    log.error('[AI] update expiry error:', err);
    res.status(500).json({ error: { message: 'Failed to update expiry' } });
  }
});

// T-316: Anomalies
aiIntelligenceRouter.get("/pos/ai/anomalies", requireDeviceToken, requireActiveStore, async (req: Request, res: Response) => {
  try {
    const { storeId } = (req as PosRequest).posDevice;
    const unreviewed = req.query.unreviewed === 'true';
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getStoreAnomalies(storeId, { unreviewed, limit, offset });
    res.json(result);
  } catch (err) {
    log.error('[AI] anomalies error:', err);
    res.status(500).json({ error: { message: 'Failed to load anomalies' } });
  }
});

// =============================================================================
// ADMIN SCHEDULED JOB ENDPOINTS (require admin auth)
// =============================================================================

// T-307: Run all store alerts
aiIntelligenceRouter.post("/admin/jobs/ai-alerts", requireAdminToken, async (_req: Request, res: Response) => {
  try {
    const result = await runAllStoreAlerts();
    res.json({ success: true, ...result });
  } catch (err) {
    log.error('[AI Job] alerts error:', err);
    res.status(500).json({ error: { message: 'Job failed' } });
  }
});

// T-308: Run demand forecasting
aiIntelligenceRouter.post("/admin/jobs/ai-forecasts", requireAdminToken, async (_req: Request, res: Response) => {
  try {
    const result = await computeAllForecasts();
    res.json({ success: true, ...result });
  } catch (err) {
    log.error('[AI Job] forecasts error:', err);
    res.status(500).json({ error: { message: 'Job failed' } });
  }
});

// T-309: Run smart reorder generation
aiIntelligenceRouter.post("/admin/jobs/ai-smart-reorder", requireAdminToken, async (_req: Request, res: Response) => {
  try {
    const result = await generateAllSmartReorders();
    res.json({ success: true, ...result });
  } catch (err) {
    log.error('[AI Job] smart reorder error:', err);
    res.status(500).json({ error: { message: 'Job failed' } });
  }
});

// T-310: Run auto daily closing
aiIntelligenceRouter.post("/admin/jobs/ai-auto-closing", requireAdminToken, async (_req: Request, res: Response) => {
  try {
    const result = await processAutoClosing();
    res.json({ success: true, ...result });
  } catch (err) {
    log.error('[AI Job] auto-closing error:', err);
    res.status(500).json({ error: { message: 'Job failed' } });
  }
});

// T-312: Run customer insights computation
aiIntelligenceRouter.post("/admin/jobs/ai-customer-insights", requireAdminToken, async (_req: Request, res: Response) => {
  try {
    const result = await computeAllInsights();
    res.json({ success: true, ...result });
  } catch (err) {
    log.error('[AI Job] customer insights error:', err);
    res.status(500).json({ error: { message: 'Job failed' } });
  }
});

// T-316: Run anomaly detection
aiIntelligenceRouter.post("/admin/jobs/ai-anomaly-detection", requireAdminToken, async (_req: Request, res: Response) => {
  try {
    const result = await detectAllAnomalies();
    res.json({ success: true, ...result });
  } catch (err) {
    log.error('[AI Job] anomaly detection error:', err);
    res.status(500).json({ error: { message: 'Job failed' } });
  }
});

// T-303: Run recommendation computation
aiIntelligenceRouter.post("/admin/jobs/ai-recommendations", requireAdminToken, async (_req: Request, res: Response) => {
  try {
    const result = await computeAllRecommendations();
    res.json({ success: true, ...result });
  } catch (err) {
    log.error('[AI Job] recommendations error:', err);
    res.status(500).json({ error: { message: 'Job failed' } });
  }
});

// Admin: Get alerts for any store
aiIntelligenceRouter.get("/admin/ai/alerts", requireAdminToken, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    if (!storeId) return res.status(400).json({ error: { message: 'storeId required' } });
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getStoreAlerts(storeId, { limit, offset });
    res.json(result);
  } catch (err) {
    log.error('[AI Admin] alerts error:', err);
    res.status(500).json({ error: { message: 'Failed to load alerts' } });
  }
});

// Admin: Get anomalies for any store
aiIntelligenceRouter.get("/admin/ai/anomalies", requireAdminToken, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    if (!storeId) return res.status(400).json({ error: { message: 'storeId required' } });
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const result = await getStoreAnomalies(storeId, { limit, offset });
    res.json(result);
  } catch (err) {
    log.error('[AI Admin] anomalies error:', err);
    res.status(500).json({ error: { message: 'Failed to load anomalies' } });
  }
});

// Admin: Get customer insights for any store
aiIntelligenceRouter.get("/admin/ai/customer-insights", requireAdminToken, async (req: Request, res: Response) => {
  try {
    const storeId = req.query.storeId as string;
    if (!storeId) return res.status(400).json({ error: { message: 'storeId required' } });
    const result = await getStoreCustomerInsights(storeId);
    res.json(result);
  } catch (err) {
    log.error('[AI Admin] insights error:', err);
    res.status(500).json({ error: { message: 'Failed to load insights' } });
  }
});
