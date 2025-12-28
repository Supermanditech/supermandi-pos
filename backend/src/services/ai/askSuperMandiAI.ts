import OpenAI from "openai";
import { fetchLatestPosEvents } from "../posEventLogger";

type PosEvent = Awaited<ReturnType<typeof fetchLatestPosEvents>>[number];

type AiContext = {
  now: string;
  summary: { totalEvents: number; byEventType: Record<string, number> };
  events: Array<{ createdAt: string; deviceId: string; storeId: string; eventType: string; payload: Record<string, unknown> }>;
};

function sanitizePayload(payload: unknown): Record<string, unknown> {
  const allow = new Set([
    "transactionId",
    "billId",
    "paymentMode",
    "amountMinor",
    "currency",
    "timeoutMs",
    "reason",
    "error",
    "barcode",
    "retailerUpiId",
    "eventId",
    "appVersion",
    "createdAt"
  ]);
  const out: Record<string, unknown> = {};
  if (!payload || typeof payload !== "object") return out;
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (allow.has(k)) out[k] = v;
  }
  return out;
}

function buildContext(events: PosEvent[]): AiContext {
  const byEventType: Record<string, number> = {};
  const sanitized = events.map((e) => {
    byEventType[e.eventType] = (byEventType[e.eventType] ?? 0) + 1;
    return {
      createdAt: e.createdAt,
      deviceId: e.deviceId,
      storeId: e.storeId,
      eventType: e.eventType,
      payload: sanitizePayload(e.payload)
    };
  });

  return { now: new Date().toISOString(), summary: { totalEvents: events.length, byEventType }, events: sanitized };
}

export async function askSuperMandiAI(question: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const model = process.env.SUPERMANDI_AI_MODEL?.trim() || "gpt-5-mini";
  const take = Math.min(200, Math.max(50, Number(process.env.SUPERMANDI_AI_EVENT_WINDOW ?? 150)));
  const max_output_tokens = Math.min(800, Math.max(100, Number(process.env.SUPERMANDI_AI_MAX_OUTPUT_TOKENS ?? 380)));

  const recent = await fetchLatestPosEvents({ limit: take });
  const context = buildContext(recent);

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
          "You are SuperMandi AI, an ops copilot. Use ONLY the provided JSON context. " +
          "Be concise and give practical diagnostics and next steps. " +
          "If info is missing, say what is missing.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Question: ${question}\n\nContext (JSON):\n${JSON.stringify(context)}`
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
