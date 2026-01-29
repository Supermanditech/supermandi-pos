/**
 * Voice Order Service - GO-LIVE Production Implementation
 *
 * Uses OpenAI for:
 * 1. Speech-to-Text (Whisper)
 * 2. Intent parsing with structured JSON output
 *
 * Features:
 * - Idempotent request handling
 * - Product search integration
 * - Ambiguity resolution (top 3 candidates)
 * - SELL/BUY mode boundary enforcement
 * - Hindi/Hinglish support
 */

import { v4 as uuidv4 } from "uuid";
import {
  speechToText,
  chatCompletion,
  parseJSONResponse,
  isOpenAIConfigured,
  OpenAINotConfiguredError,
  checkRateLimit,
} from "./openaiProvider";

// =============================================================================
// TYPES
// =============================================================================

export type CartActionType =
  | "ADD_ITEM"
  | "REMOVE_ITEM"
  | "UPDATE_QUANTITY"
  | "SET_PRICE"
  | "SET_DISCOUNT"
  | "SWITCH_MODE"
  | "SEARCH"
  | "CHECK_STOCK"
  | "NEEDS_CLARIFICATION"
  | "UNKNOWN";

export interface CartAction {
  type: CartActionType;
  productName?: string;
  productId?: string;
  barcode?: string;
  quantity?: number;
  unit?: "pcs" | "kg" | "g" | "l" | "ml" | "dozen";
  price?: number;
  discount?: number;
  discountType?: "percent" | "amount";
  mode?: "SELL" | "BUY";
  searchQuery?: string;
  candidates?: ProductCandidate[];
  reason?: string;
}

export interface ProductCandidate {
  productId: string;
  name: string;
  barcode?: string;
  price?: number;
  stock?: number;
  matchScore: number;
}

export interface VoiceOrderResult {
  requestId: string;
  success: boolean;
  transcript: string;
  language: string;
  actions: CartAction[];
  confidence: number;
  requiresConfirmation: boolean;
  message?: string;
}

export interface VoiceOrderRequest {
  requestId?: string;
  audioBuffer: Buffer;
  filename: string;
  storeId: string;
  deviceId?: string;
  currentMode: "SELL" | "BUY";
  userRole?: "cashier" | "manager" | "owner";
  ip?: string;
}

// =============================================================================
// IDEMPOTENCY TRACKING
// =============================================================================

interface ProcessedRequest {
  requestId: string;
  transcript: string;
  result: VoiceOrderResult;
  processedAt: Date;
}

const processedRequests = new Map<string, ProcessedRequest>();

// Cleanup old entries every 10 minutes
setInterval(() => {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  for (const [id, req] of processedRequests.entries()) {
    if (req.processedAt < tenMinutesAgo) {
      processedRequests.delete(id);
    }
  }
}, 10 * 60 * 1000);

// =============================================================================
// PRODUCT SEARCH INTEGRATION
// =============================================================================

// Type for product search function (injected for flexibility)
type ProductSearchFn = (query: string, storeId: string) => Promise<ProductCandidate[]>;

let productSearchFn: ProductSearchFn | null = null;

/**
 * Register product search function for resolving SKUs
 */
export function registerProductSearch(fn: ProductSearchFn): void {
  productSearchFn = fn;
}

/**
 * Search for products matching a query
 */
async function searchProducts(query: string, storeId: string): Promise<ProductCandidate[]> {
  if (!productSearchFn) {
    console.warn("[VoiceOrder] No product search function registered");
    return [];
  }

  try {
    return await productSearchFn(query, storeId);
  } catch (error) {
    console.error("[VoiceOrder] Product search failed:", error);
    return [];
  }
}

// =============================================================================
// LLM PARSING
// =============================================================================

const VOICE_ORDER_SYSTEM_PROMPT = `You are a voice command parser for an Indian retail POS (Point of Sale) system.

Your task is to parse voice commands (in Hindi, Hinglish, or English) into structured cart actions.

IMPORTANT RULES:
1. Extract product names, quantities, and units accurately
2. Support Hindi numbers: ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10, baara=12, bees=20
3. Support units: kg/kilo, gram/g, litre/liter/l, ml, pcs/piece/packet, dozen/darjan
4. Recognize action keywords:
   - ADD: add, chahiye, dedo, dena, dijiye, lagao, डालो, चाहिए
   - REMOVE: remove, hatao, nikalo, हटाओ
   - QUANTITY: change, badlo, update
   - SEARCH: search, dikhao, khojo, दिखाओ
   - STOCK: stock, kitna, available, स्टॉक
5. Default quantity is 1 if not specified
6. Default unit is "pcs" if not specified
7. If product name is ambiguous or unclear, use NEEDS_CLARIFICATION

You MUST respond with valid JSON in this exact format:
{
  "actions": [
    {
      "type": "ADD_ITEM" | "REMOVE_ITEM" | "UPDATE_QUANTITY" | "SET_PRICE" | "SET_DISCOUNT" | "SWITCH_MODE" | "SEARCH" | "CHECK_STOCK" | "NEEDS_CLARIFICATION" | "UNKNOWN",
      "productName": "string (product name as spoken)",
      "quantity": number,
      "unit": "pcs" | "kg" | "g" | "l" | "ml" | "dozen",
      "reason": "string (only for NEEDS_CLARIFICATION or UNKNOWN)"
    }
  ],
  "confidence": number (0.0 to 1.0)
}

Examples:
- "2 kilo rice chahiye" -> {"actions":[{"type":"ADD_ITEM","productName":"rice","quantity":2,"unit":"kg"}],"confidence":0.9}
- "tata salt hatao" -> {"actions":[{"type":"REMOVE_ITEM","productName":"tata salt"}],"confidence":0.85}
- "maggi kitna hai" -> {"actions":[{"type":"CHECK_STOCK","productName":"maggi"}],"confidence":0.9}
- "milk" (ambiguous) -> {"actions":[{"type":"NEEDS_CLARIFICATION","productName":"milk","reason":"Multiple milk products available"}],"confidence":0.6}`;

interface ParsedActions {
  actions: Array<{
    type: string;
    productName?: string;
    quantity?: number;
    unit?: string;
    price?: number;
    discount?: number;
    discountType?: string;
    mode?: string;
    reason?: string;
  }>;
  confidence: number;
}

function isValidParsedActions(obj: unknown): obj is ParsedActions {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.actions)) return false;
  if (typeof o.confidence !== "number") return false;
  return true;
}

async function parseTranscript(
  transcript: string,
  storeId: string,
  currentMode: "SELL" | "BUY",
  userRole?: string
): Promise<{ actions: CartAction[]; confidence: number }> {
  const userMessage = `Parse this voice command: "${transcript}"

Context:
- Current mode: ${currentMode}
- User role: ${userRole || "cashier"}

Return the structured actions as JSON.`;

  const result = await chatCompletion({
    messages: [
      { role: "system", content: VOICE_ORDER_SYSTEM_PROMPT },
      { role: "user", content: userMessage }
    ],
    storeId,
    maxTokens: 256,
    temperature: 0.1,
  });

  const parsed = parseJSONResponse(result.content, isValidParsedActions);

  if (!parsed.success) {
    const errorMsg = "error" in parsed ? parsed.error : "Unknown error";
    console.error("[VoiceOrder] Failed to parse LLM response:", errorMsg);
    return {
      actions: [{
        type: "UNKNOWN",
        reason: "Could not parse voice command"
      }],
      confidence: 0.3
    };
  }

  // Convert parsed actions to CartAction type
  const actions: CartAction[] = parsed.data.actions.map((a) => ({
    type: a.type as CartActionType,
    productName: a.productName,
    quantity: a.quantity,
    unit: a.unit as CartAction["unit"],
    price: a.price,
    discount: a.discount,
    discountType: a.discountType as CartAction["discountType"],
    mode: a.mode as CartAction["mode"],
    reason: a.reason,
  }));

  return { actions, confidence: parsed.data.confidence };
}

// =============================================================================
// BOUNDARY ENFORCEMENT
// =============================================================================

function enforceBoundaries(
  actions: CartAction[],
  currentMode: "SELL" | "BUY",
  userRole?: string
): CartAction[] {
  return actions.map((action) => {
    // SWITCH_MODE requires manager/owner role
    if (action.type === "SWITCH_MODE") {
      if (userRole !== "manager" && userRole !== "owner") {
        return {
          ...action,
          type: "UNKNOWN" as CartActionType,
          reason: "Only managers can switch between SELL and BUY modes"
        };
      }
    }

    // SET_PRICE and SET_DISCOUNT require manager/owner role
    if (action.type === "SET_PRICE" || action.type === "SET_DISCOUNT") {
      if (userRole !== "manager" && userRole !== "owner") {
        return {
          ...action,
          type: "UNKNOWN" as CartActionType,
          reason: "Only managers can modify prices or discounts"
        };
      }
    }

    return action;
  });
}

// =============================================================================
// PRODUCT RESOLUTION
// =============================================================================

async function resolveProducts(
  actions: CartAction[],
  storeId: string
): Promise<CartAction[]> {
  const resolved: CartAction[] = [];

  for (const action of actions) {
    if (!action.productName) {
      resolved.push(action);
      continue;
    }

    // Search for matching products
    const candidates = await searchProducts(action.productName, storeId);

    if (candidates.length === 0) {
      // No matches found - needs clarification
      resolved.push({
        ...action,
        type: "NEEDS_CLARIFICATION",
        reason: `No products found matching "${action.productName}"`
      });
    } else if (candidates.length === 1 && candidates[0]!.matchScore > 0.8) {
      // Single high-confidence match
      resolved.push({
        ...action,
        productId: candidates[0]!.productId,
        productName: candidates[0]!.name,
        barcode: candidates[0]!.barcode,
      });
    } else {
      // Multiple candidates or low confidence - needs clarification
      resolved.push({
        ...action,
        type: "NEEDS_CLARIFICATION",
        candidates: candidates.slice(0, 3),
        reason: `Multiple products match "${action.productName}"`
      });
    }
  }

  return resolved;
}

// =============================================================================
// MAIN PROCESSING FUNCTION
// =============================================================================

/**
 * Process a voice order request.
 *
 * @param request - Voice order request with audio buffer
 * @returns Processed result with cart actions
 */
export async function processVoiceOrder(
  request: VoiceOrderRequest
): Promise<VoiceOrderResult> {
  const requestId = request.requestId || uuidv4();

  // Check if already processed (idempotency)
  const existing = processedRequests.get(requestId);
  if (existing) {
    console.log("[VoiceOrder] Returning cached result for:", requestId);
    return existing.result;
  }

  // Check if OpenAI is configured
  if (!isOpenAIConfigured()) {
    throw new OpenAINotConfiguredError();
  }

  // Check rate limits
  checkRateLimit({
    deviceId: request.deviceId,
    storeId: request.storeId,
    ip: request.ip,
    estimatedTokens: 1500, // STT + parsing
  });

  try {
    // Step 1: Speech-to-Text
    const sttResult = await speechToText({
      audioBuffer: request.audioBuffer,
      filename: request.filename,
      storeId: request.storeId,
      deviceId: request.deviceId,
      ip: request.ip,
      language: "hi", // Hindi/Hinglish
      requestId,
    });

    const transcript = sttResult.text.trim();

    if (!transcript) {
      const result: VoiceOrderResult = {
        requestId,
        success: false,
        transcript: "",
        language: sttResult.language,
        actions: [],
        confidence: 0,
        requiresConfirmation: false,
        message: "Could not hear anything. Please speak clearly and try again."
      };

      processedRequests.set(requestId, {
        requestId,
        transcript: "",
        result,
        processedAt: new Date()
      });

      return result;
    }

    // Step 2: Parse transcript into actions
    const { actions: parsedActions, confidence } = await parseTranscript(
      transcript,
      request.storeId,
      request.currentMode,
      request.userRole
    );

    // Step 3: Enforce boundaries
    const boundedActions = enforceBoundaries(
      parsedActions,
      request.currentMode,
      request.userRole
    );

    // Step 4: Resolve products
    const resolvedActions = await resolveProducts(
      boundedActions,
      request.storeId
    );

    // Determine if confirmation is required
    const requiresConfirmation = resolvedActions.some(
      (a) => a.type === "NEEDS_CLARIFICATION" || a.type === "SWITCH_MODE"
    );

    // Generate user message
    let message: string | undefined;
    if (resolvedActions.length === 0 || resolvedActions[0]?.type === "UNKNOWN") {
      message = "I didn't understand that command. Try saying 'Add 2 kg rice' or 'Remove Tata Salt'.";
    } else if (requiresConfirmation) {
      const clarification = resolvedActions.find((a) => a.type === "NEEDS_CLARIFICATION");
      if (clarification?.candidates) {
        message = `Did you mean: ${clarification.candidates.map((c) => c.name).join(", ")}?`;
      } else if (clarification?.reason) {
        message = clarification.reason;
      }
    }

    const result: VoiceOrderResult = {
      requestId,
      success: !requiresConfirmation && resolvedActions.length > 0,
      transcript,
      language: sttResult.language,
      actions: resolvedActions,
      confidence,
      requiresConfirmation,
      message,
    };

    // Cache result for idempotency
    processedRequests.set(requestId, {
      requestId,
      transcript,
      result,
      processedAt: new Date()
    });

    return result;
  } catch (error) {
    console.error("[VoiceOrder] Processing failed:", error);
    throw error;
  }
}

/**
 * Check if voice order service is available
 */
export function isVoiceOrderAvailable(): boolean {
  return isOpenAIConfigured();
}
