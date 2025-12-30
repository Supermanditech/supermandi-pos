import OpenAI from "openai";
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

export async function askSuperMandiAI(question: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const model = process.env.SUPERMANDI_AI_MODEL?.trim() || "gpt-5-mini";
  const max_output_tokens = Math.min(900, Math.max(200, Number(process.env.SUPERMANDI_AI_MAX_OUTPUT_TOKENS ?? 420)));

  const context = await buildAnalyticsContext(question);
  const client = new OpenAI({ apiKey });

  const controller = new AbortController();
  const timeoutMs = Math.min(20_000, Math.max(3_000, Number(process.env.SUPERMANDI_AI_TIMEOUT_MS ?? 12_000)));
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await client.responses.create(
      {
        model,
        max_output_tokens,
        instructions:
          "You are SuperMandi AI, an ops copilot. Use ONLY the provided JSON analytics context. " +
          "Do not query raw SQL or infer data not present. " +
          "Answer with these sections in order: Summary, Key numbers, Data used, Suggested next click. " +
          "Keep it concise and actionable. If data is missing, say what is missing. " +
          "If guard_notes are present, include them verbatim at the start of Summary.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Question: ${question}\n\nAnalytics Context (JSON):\n${JSON.stringify(context)}`
              }
            ]
          }
        ]
      },
      { signal: controller.signal as any }
    );

    return String((resp as any).output_text ?? "").trim() || "No answer returned";
  } finally {
    clearTimeout(t);
  }
}
