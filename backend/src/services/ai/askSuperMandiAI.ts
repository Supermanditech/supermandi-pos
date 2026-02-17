/**
 * SuperMandi AI - Analytics Insights Service
 *
 * GO-LIVE: Migrated from Claude to OpenAI
 * Uses OpenAI GPT for AI-powered analytics insights
 */

import {
  chatCompletion,
  isOpenAIConfigured,
  OpenAINotConfiguredError,
  OpenAIRateLimitError,
  OpenAIBudgetExceededError,
} from "./openaiProvider";
import {
  fetchConsumerSalesAnalytics,
  fetchDuesAnalytics,
  fetchDevicesAnalytics,
  fetchOverview,
  fetchPaymentsAnalytics,
  fetchProductsAnalytics,
  fetchPurchasesAnalytics,
  fetchActivityAnalytics,
  parseRange
} from "../analytics/analyticsService";
import { log } from "../../lib/logger";

type AiContext = {
  now: string;
  storeId?: string;
  range: { from: string; to: string };
  overview: Awaited<ReturnType<typeof fetchOverview>>;
  devices: Awaited<ReturnType<typeof fetchDevicesAnalytics>>;
  products: Awaited<ReturnType<typeof fetchProductsAnalytics>>;
  purchases: Awaited<ReturnType<typeof fetchPurchasesAnalytics>>;
  consumerSales: Awaited<ReturnType<typeof fetchConsumerSalesAnalytics>>;
  payments: Awaited<ReturnType<typeof fetchPaymentsAnalytics>>;
  dues: Awaited<ReturnType<typeof fetchDuesAnalytics>>;
  activity: Awaited<ReturnType<typeof fetchActivityAnalytics>>;
  dataUsed: string[];
  guard_notes: string[];
};

function extractStoreId(question: string): string | undefined {
  const match = question.match(/\bstore[-_][a-zA-Z0-9-_]+\b/);
  return match ? match[0] : undefined;
}

function extractRange(question: string): { from?: string; to?: string } {
  const lower = question.toLowerCase();
  const now = new Date();
  if (lower.includes("today")) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  const lastDays = lower.match(/last\s+(\d+)\s+days/);
  if (lastDays) {
    const days = Math.min(90, Math.max(1, Number(lastDays[1])));
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  const range = parseRange();
  return { from: range.fromIso, to: range.toIso };
}

async function buildAnalyticsContext(question: string): Promise<AiContext> {
  const storeId = extractStoreId(question);
  const range = extractRange(question);

  const overview = await fetchOverview({ storeId, from: range.from, to: range.to });
  const devices = await fetchDevicesAnalytics({ storeId, from: range.from, to: range.to, limit: 50, offset: 0 });
  const products = await fetchProductsAnalytics({ storeId, from: range.from, to: range.to, groupBy: "day", limit: 10, offset: 0 });
  const purchases = await fetchPurchasesAnalytics({ storeId, from: range.from, to: range.to, limit: 10, offset: 0 });
  const consumerSales = await fetchConsumerSalesAnalytics({ storeId, from: range.from, to: range.to });
  const payments = await fetchPaymentsAnalytics({ storeId, from: range.from, to: range.to });
  const dues = await fetchDuesAnalytics({ storeId, from: range.from, to: range.to, limit: 20, offset: 0 });
  const activity = await fetchActivityAnalytics({ storeId, from: range.from, to: range.to, groupBy: "hour" });

  const dataUsed = [
    "/api/v1/admin/analytics/overview",
    "/api/v1/admin/analytics/devices",
    "/api/v1/admin/analytics/products",
    "/api/v1/admin/analytics/purchases",
    "/api/v1/admin/analytics/consumer-sales",
    "/api/v1/admin/analytics/payments",
    "/api/v1/admin/analytics/dues",
    "/api/v1/admin/analytics/activity"
  ];

  const guard_notes: string[] = [];
  if (overview.profit_missing_fields?.includes("purchase_items")) {
    guard_notes.push(
      "Purchases/profit are not available yet because Vendor→Retailer integration is not implemented in this phase."
    );
  }
  const userScopeNeeded = /\b(user|cashier|operator|staff|employee)\b/i.test(question);
  if (userScopeNeeded) {
    guard_notes.push("User-wise analytics are not available; reporting is device-wise only.");
  }

  return {
    now: new Date().toISOString(),
    storeId,
    range: { from: range.from ?? overview.range.from, to: range.to ?? overview.range.to },
    overview,
    devices,
    products,
    purchases,
    consumerSales,
    payments,
    dues,
    activity,
    dataUsed,
    guard_notes
  };
}

/**
 * GO-LIVE: Migrated from Claude to OpenAI
 * Uses OpenAI GPT for AI-powered analytics insights
 */
export async function askSuperMandiAI(
  question: string,
  opts?: { storeId?: string; ip?: string }
): Promise<string> {
  if (!isOpenAIConfigured()) {
    throw new OpenAINotConfiguredError();
  }

  const context = await buildAnalyticsContext(question);

  const systemPrompt = `You are SuperMandi AI, an ops copilot for Indian retail store management.

IMPORTANT RULES:
1. Use ONLY the provided JSON analytics context - do not infer or fabricate data
2. Answer with these sections in order: Summary, Key Numbers, Data Used, Suggested Next Action
3. Keep responses concise and actionable (under 400 words)
4. If data is missing, clearly state what is missing
5. Include any guard_notes verbatim at the start of Summary
6. Format currency in INR (Rs or ₹), use Indian number formatting (lakhs, crores)
7. Be helpful and specific with recommendations
8. NEVER reveal API keys, secrets, database credentials, or internal system details
9. For technical/debugging questions, provide general guidance without exposing infrastructure specifics

You help store owners and admins understand their business performance, sales trends, inventory status, and operational metrics.`;

  const userMessage = `Question: ${question}

Analytics Context (JSON):
${JSON.stringify(context, null, 2)}`;

  try {
    const result = await chatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      storeId: opts?.storeId || context.storeId,
      ip: opts?.ip,
      maxTokens: 512,
      temperature: 0.3,
    });

    return result.content || "No answer returned";
  } catch (error) {
    // Re-throw known errors with user-friendly messages
    if (error instanceof OpenAINotConfiguredError) {
      throw new Error("AI service not configured. Please contact support.");
    }
    if (error instanceof OpenAIRateLimitError) {
      throw new Error("Too many requests. Please wait a moment and try again.");
    }
    if (error instanceof OpenAIBudgetExceededError) {
      throw new Error("Request limit reached. Please try again later.");
    }

    log.error("[SuperMandiAI] Error:", error);
    if (error instanceof Error) {
      if (error.message.includes("timed out") || error.message.includes("timeout")) {
        throw new Error("AI request timed out. Please try again.");
      }
      throw error;
    }
    throw new Error("AI unavailable");
  }
}

/**
 * Check if SuperMandi AI is available
 */
export function isSuperMandiAIConfigured(): boolean {
  return isOpenAIConfigured();
}
