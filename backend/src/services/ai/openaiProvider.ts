/**
 * OpenAI Provider - GO-LIVE Production-Grade Implementation
 *
 * Security Controls:
 * - SECRET-CLEANUP-001: API key from env var only (Cloud Run compatible)
 * - Startup validation (503 if missing)
 * - Log redaction (no headers, keys, or PII)
 * - Rate limiting per device/store and IP
 * - Budget guardrails (token caps, max concurrency)
 * - Retry with exponential backoff
 * - Timeout handling
 */

import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";

// =============================================================================
// CONFIGURATION
// =============================================================================

// SECRET-CLEANUP-001: OPENAI_API_KEY from env var only (Cloud Run compatible)
// File-based secrets removed — Cloud Run uses Secret Manager → env vars
function loadOpenAIApiKey(): string {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) {
    console.log('[OpenAI] API key loaded from environment variable');
    return envKey;
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('[OpenAI] FATAL: OPENAI_API_KEY is required in production but not set');
    process.exit(1);
  }
  return '';
}

// Cache the loaded key (loaded once at startup)
let cachedApiKey: string | null = null;

function getApiKey(): string {
  if (cachedApiKey === null) {
    cachedApiKey = loadOpenAIApiKey();
  }
  return cachedApiKey;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  sttModel: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  maxConcurrency: number;
  maxRetries: number;
}

function getConfig(): OpenAIConfig {
  return {
    apiKey: getApiKey(),
    model: process.env.OPENAI_MODEL_CHAT?.trim() || "gpt-4o-mini",
    sttModel: process.env.OPENAI_MODEL_STT?.trim() || "whisper-1",
    maxTokens: Math.min(2048, Math.max(100, Number(process.env.OPENAI_MAX_TOKENS ?? 512))),
    temperature: Math.min(1, Math.max(0, Number(process.env.OPENAI_TEMPERATURE ?? 0.3))),
    timeoutMs: Math.min(60000, Math.max(5000, Number(process.env.OPENAI_TIMEOUT_MS ?? 30000))),
    maxConcurrency: Math.min(10, Math.max(1, Number(process.env.OPENAI_MAX_CONCURRENCY ?? 5))),
    maxRetries: Math.min(5, Math.max(1, Number(process.env.OPENAI_MAX_RETRIES ?? 3))),
  };
}

// =============================================================================
// SINGLETON CLIENT
// =============================================================================

let openaiClient: OpenAI | null = null;
let configuredAt: Date | null = null;

/**
 * Check if OpenAI is configured (API key present)
 * GO-LIVE-107: Checks both Docker secret and env var
 */
export function isOpenAIConfigured(): boolean {
  return Boolean(getApiKey());
}

/**
 * Get or create OpenAI client.
 * Throws if API key is not configured.
 */
function getClient(): OpenAI {
  const config = getConfig();

  if (!config.apiKey) {
    throw new OpenAINotConfiguredError();
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
    configuredAt = new Date();
    // LOG-SAFE: Only log that client was created, never the key
    console.log("[OpenAI] Client initialized", { model: config.model, maxTokens: config.maxTokens });
  }

  return openaiClient;
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

export class OpenAINotConfiguredError extends Error {
  constructor() {
    super("AI service not configured");
    this.name = "OpenAINotConfiguredError";
  }
}

export class OpenAIRateLimitError extends Error {
  constructor(message: string = "Rate limit exceeded") {
    super(message);
    this.name = "OpenAIRateLimitError";
  }
}

export class OpenAIBudgetExceededError extends Error {
  constructor(message: string = "Token budget exceeded") {
    super(message);
    this.name = "OpenAIBudgetExceededError";
  }
}

// =============================================================================
// RATE LIMITING (per device/store and per IP)
// =============================================================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
  tokens: number;
}

const rateLimitByDevice = new Map<string, RateLimitEntry>();
const rateLimitByIP = new Map<string, RateLimitEntry>();

// Configurable limits
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS_PER_DEVICE = 20;
const RATE_LIMIT_MAX_REQUESTS_PER_IP = 30;
const RATE_LIMIT_MAX_TOKENS_PER_MINUTE = 50_000;

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS * 2;

  for (const [key, entry] of rateLimitByDevice.entries()) {
    if (entry.windowStart < cutoff) rateLimitByDevice.delete(key);
  }
  for (const [key, entry] of rateLimitByIP.entries()) {
    if (entry.windowStart < cutoff) rateLimitByIP.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Check and update rate limits.
 * Throws OpenAIRateLimitError if limit exceeded.
 */
export function checkRateLimit(opts: {
  deviceId?: string;
  storeId?: string;
  ip?: string;
  estimatedTokens?: number;
}): void {
  const now = Date.now();
  const { deviceId, storeId, ip, estimatedTokens = 500 } = opts;

  // Check device rate limit
  if (deviceId || storeId) {
    const key = `${storeId || ""}:${deviceId || ""}`;
    const entry = rateLimitByDevice.get(key) || { count: 0, windowStart: now, tokens: 0 };

    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      entry.count = 0;
      entry.tokens = 0;
      entry.windowStart = now;
    }

    if (entry.count >= RATE_LIMIT_MAX_REQUESTS_PER_DEVICE) {
      throw new OpenAIRateLimitError("Device rate limit exceeded. Please wait a moment.");
    }

    if (entry.tokens + estimatedTokens > RATE_LIMIT_MAX_TOKENS_PER_MINUTE) {
      throw new OpenAIBudgetExceededError("Token budget exceeded for this device. Please wait.");
    }

    entry.count++;
    entry.tokens += estimatedTokens;
    rateLimitByDevice.set(key, entry);
  }

  // Check IP rate limit
  if (ip) {
    const entry = rateLimitByIP.get(ip) || { count: 0, windowStart: now, tokens: 0 };

    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      entry.count = 0;
      entry.tokens = 0;
      entry.windowStart = now;
    }

    if (entry.count >= RATE_LIMIT_MAX_REQUESTS_PER_IP) {
      throw new OpenAIRateLimitError("IP rate limit exceeded. Please wait a moment.");
    }

    entry.count++;
    rateLimitByIP.set(ip, entry);
  }
}

// =============================================================================
// CONCURRENCY CONTROL
// =============================================================================

let activeConcurrency = 0;

async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  const config = getConfig();

  if (activeConcurrency >= config.maxConcurrency) {
    throw new OpenAIRateLimitError("Too many concurrent AI requests. Please try again.");
  }

  activeConcurrency++;
  try {
    return await fn();
  } finally {
    activeConcurrency--;
  }
}

// =============================================================================
// AUDIT LOGGING (with redaction)
// =============================================================================

export interface AuditLogEntry {
  requestId: string;
  timestamp: string;
  operation: "chat" | "stt" | "parse";
  storeId?: string;
  deviceId?: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  success: boolean;
  errorCode?: string;
}

const auditLogs: AuditLogEntry[] = [];
const MAX_AUDIT_LOGS = 1000;

/**
 * Log an AI operation (never logs keys, headers, or PII).
 */
export function logAudit(entry: AuditLogEntry): void {
  auditLogs.push(entry);

  // Trim old logs
  if (auditLogs.length > MAX_AUDIT_LOGS) {
    auditLogs.splice(0, auditLogs.length - MAX_AUDIT_LOGS);
  }

  // LOG-SAFE: Only structured data, no PII
  console.log("[OpenAI:Audit]", JSON.stringify({
    requestId: entry.requestId,
    operation: entry.operation,
    storeId: entry.storeId,
    durationMs: entry.durationMs,
    success: entry.success,
    errorCode: entry.errorCode,
  }));
}

/**
 * Get recent audit logs (for admin diagnostics).
 */
export function getRecentAuditLogs(limit: number = 50): AuditLogEntry[] {
  return auditLogs.slice(-limit);
}

// =============================================================================
// CHAT COMPLETION
// =============================================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  storeId?: string;
  deviceId?: string;
  ip?: string;
  maxTokens?: number;
  temperature?: number;
  requestId?: string;
}

export interface ChatResult {
  requestId: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Send a chat completion request to OpenAI.
 */
export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  const requestId = opts.requestId || uuidv4();
  const config = getConfig();
  const startTime = Date.now();

  // Check rate limits
  checkRateLimit({
    deviceId: opts.deviceId,
    storeId: opts.storeId,
    ip: opts.ip,
    estimatedTokens: (opts.maxTokens || config.maxTokens) + 500, // estimate input + output
  });

  try {
    const result = await withConcurrencyLimit(async () => {
      const client = getClient();

      const response = await client.chat.completions.create({
        model: config.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens || config.maxTokens,
        temperature: opts.temperature ?? config.temperature,
      });

      const choice = response.choices[0];
      const content = choice?.message?.content?.trim() || "";

      return {
        requestId,
        content,
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      };
    });

    logAudit({
      requestId,
      timestamp: new Date().toISOString(),
      operation: "chat",
      storeId: opts.storeId,
      deviceId: opts.deviceId,
      durationMs: Date.now() - startTime,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      success: true,
    });

    return result;
  } catch (error) {
    const errorCode = error instanceof Error ? error.name : "UNKNOWN";

    logAudit({
      requestId,
      timestamp: new Date().toISOString(),
      operation: "chat",
      storeId: opts.storeId,
      deviceId: opts.deviceId,
      durationMs: Date.now() - startTime,
      success: false,
      errorCode,
    });

    throw error;
  }
}

// =============================================================================
// SPEECH-TO-TEXT (Whisper)
// =============================================================================

export interface STTOptions {
  audioBuffer: Buffer;
  filename: string;
  storeId?: string;
  deviceId?: string;
  ip?: string;
  language?: string;
  requestId?: string;
}

export interface STTResult {
  requestId: string;
  text: string;
  language: string;
  durationMs: number;
}

/**
 * Transcribe audio using OpenAI Whisper.
 */
export async function speechToText(opts: STTOptions): Promise<STTResult> {
  const requestId = opts.requestId || uuidv4();
  const config = getConfig();
  const startTime = Date.now();

  // Check rate limits (STT is expensive, use higher token estimate)
  checkRateLimit({
    deviceId: opts.deviceId,
    storeId: opts.storeId,
    ip: opts.ip,
    estimatedTokens: 1000,
  });

  try {
    const result = await withConcurrencyLimit(async () => {
      const client = getClient();

      // Create a File-like object from the buffer
      const file = new File([opts.audioBuffer], opts.filename, {
        type: getMimeType(opts.filename),
      });

      const response = await client.audio.transcriptions.create({
        model: config.sttModel,
        file,
        language: opts.language || "hi", // Default to Hindi
      });

      return {
        requestId,
        text: response.text?.trim() || "",
        language: opts.language || "hi",
        durationMs: Date.now() - startTime,
      };
    });

    logAudit({
      requestId,
      timestamp: new Date().toISOString(),
      operation: "stt",
      storeId: opts.storeId,
      deviceId: opts.deviceId,
      durationMs: result.durationMs,
      success: true,
    });

    return result;
  } catch (error) {
    const errorCode = error instanceof Error ? error.name : "UNKNOWN";

    logAudit({
      requestId,
      timestamp: new Date().toISOString(),
      operation: "stt",
      storeId: opts.storeId,
      deviceId: opts.deviceId,
      durationMs: Date.now() - startTime,
      success: false,
      errorCode,
    });

    throw error;
  }
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    mp3: "audio/mpeg",
    mpeg: "audio/mpeg",
    wav: "audio/wav",
    webm: "audio/webm",
    ogg: "audio/ogg",
  };
  return mimeTypes[ext || ""] || "audio/mp4";
}

// =============================================================================
// JSON RESPONSE VALIDATION AND REPAIR
// =============================================================================

/**
 * Try to parse JSON from a response, with one repair attempt if invalid.
 */
export function parseJSONResponse<T>(
  text: string,
  validator: (obj: unknown) => obj is T
): { success: true; data: T } | { success: false; error: string } {
  // Try direct parse first
  try {
    // Extract JSON from markdown code blocks if present
    let jsonStr = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1]!.trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (validator(parsed)) {
      return { success: true, data: parsed };
    }
  } catch {
    // First parse failed, try repair
  }

  // Try to repair common JSON issues
  try {
    let repaired = text
      .replace(/```(?:json)?\s*/g, "")
      .replace(/```/g, "")
      .trim();

    // Try to find JSON object/array boundaries
    const startBracket = repaired.indexOf("{");
    const startArray = repaired.indexOf("[");
    const start = Math.min(
      startBracket >= 0 ? startBracket : Infinity,
      startArray >= 0 ? startArray : Infinity
    );

    if (start < repaired.length) {
      repaired = repaired.slice(start);

      // Find matching end
      let depth = 0;
      let end = 0;
      const isArray = repaired[0] === "[";

      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (char === "{" || char === "[") depth++;
        else if (char === "}" || char === "]") depth--;

        if (depth === 0) {
          end = i + 1;
          break;
        }
      }

      if (end > 0) {
        repaired = repaired.slice(0, end);
      }
    }

    const parsed = JSON.parse(repaired);
    if (validator(parsed)) {
      return { success: true, data: parsed };
    }

    return { success: false, error: "JSON validation failed after repair" };
  } catch (e) {
    return { success: false, error: `Invalid JSON: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

export interface HealthStatus {
  configured: boolean;
  provider: "openai";
  model: string;
  sttModel: string;
  configuredAt: string | null;
  activeConcurrency: number;
  maxConcurrency: number;
}

export function getHealthStatus(): HealthStatus {
  const config = getConfig();
  return {
    configured: isOpenAIConfigured(),
    provider: "openai",
    model: config.model,
    sttModel: config.sttModel,
    configuredAt: configuredAt?.toISOString() || null,
    activeConcurrency,
    maxConcurrency: config.maxConcurrency,
  };
}
