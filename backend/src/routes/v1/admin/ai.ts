import { Router } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { rateLimitAi } from "../../../middleware/rateLimit";
import { askSuperMandiAI } from "../../../services/ai/askSuperMandiAI";

export const adminAiRouter = Router();

adminAiRouter.use(requireAdminToken);
adminAiRouter.use(rateLimitAi({ windowMs: 60_000, max: 6 }));

adminAiRouter.post("/ai/ask", async (req, res) => {
  const question = (req.body && typeof req.body.question === "string" ? req.body.question : "").trim();
  if (!question) return res.status(400).json({ error: "question is required" });
  if (question.length > 500) return res.status(400).json({ error: "question too long" });

  console.info("AI ask invoked", { at: new Date().toISOString(), ip: req.ip });

  try {
    const answer = await askSuperMandiAI(question);
    res.json({ answer });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI unavailable";
    res.status(503).json({ error: msg });
  }
});
