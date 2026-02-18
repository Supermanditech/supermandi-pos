/**
 * Admin AI Routes - GO-LIVE: OpenAI Integration
 */

import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { rateLimitAi } from "../../../middleware/rateLimit";
import { askSuperMandiAI, isSuperMandiAIConfigured } from "../../../services/ai/askSuperMandiAI";
import { getHealthStatus, getRecentAuditLogs } from "../../../services/ai/openaiProvider";
import { log } from "../../../lib/logger";

export const adminAiRouter = Router();

adminAiRouter.use(requireAdminToken);
const aiRateLimit = rateLimitAi({ windowMs: 60_000, max: 6 });

/**
 * GET /api/v1/admin/ai/health
 * Check if AI service is configured and available
 */
adminAiRouter.get("/ai/health", async (_req, res) => {
  const health = getHealthStatus();
  res.json(health);
});

/**
 * GET /api/v1/admin/ai/audit
 * Get recent AI audit logs (for debugging/monitoring)
 */
adminAiRouter.get("/ai/audit", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const logs = getRecentAuditLogs(limit);
  res.json({ logs, count: logs.length });
});

/**
 * POST /api/v1/admin/ai
 * Ask SuperMandi AI a question about analytics
 */
async function handleAi(req: any, res: any) {
  const question = (req.body && typeof req.body.question === "string" ? req.body.question : "").trim();
  if (!question) return res.status(400).json({ error: "question is required" });
  if (question.length > 500) return res.status(400).json({ error: "question too long" });

  // Check if AI is configured
  if (!isSuperMandiAIConfigured()) {
    return res.status(503).json({
      error: "AI not configured",
      code: "AI_NOT_CONFIGURED",
      message: "AI service is not available. Please ensure OPENAI_API_KEY is configured."
    });
  }

  // LOG-SAFE: Only log request id and timing, never question content
  const requestId = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.info("[AI] Request started", { requestId, at: new Date().toISOString() });

  try {
    const answer = await askSuperMandiAI(question, { ip: req.ip });
    console.info("[AI] Request completed", { requestId, durationMs: Date.now() - parseInt(requestId.split("-")[1]!) });
    res.json({ answer, requestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI unavailable";
    log.error("[AI] Request failed", { requestId, error: msg });

    // Return appropriate status code based on error type
    if (msg.includes("Rate limit") || msg.includes("Too many")) {
      return res.status(429).json({ error: msg, code: "RATE_LIMITED", requestId });
    }
    if (msg.includes("not configured")) {
      return res.status(503).json({ error: msg, code: "AI_NOT_CONFIGURED", requestId });
    }

    res.status(503).json({ error: msg, requestId });
  }
}

adminAiRouter.post("/ai", aiRateLimit, handleAi);
// Backward-compatible endpoint.
adminAiRouter.post("/ai/ask", aiRateLimit, handleAi);
