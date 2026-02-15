/**
 * POS Voice Order Routes - GO-LIVE Production Implementation
 *
 * Endpoints:
 * - POST /api/v1/voice/interpret - Upload audio and get parsed actions
 * - POST /api/v1/voice/parse - Parse text transcript (for on-device STT)
 * - GET /api/v1/voice/health - Health check
 */

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import os from "os";

import { requireDeviceToken } from "../../../middleware/deviceToken";
import { rateLimitAi } from "../../../middleware/rateLimit";
import {
  processVoiceOrder,
  isVoiceOrderAvailable,
  registerProductSearch,
  type ProductCandidate,
  type VoiceOrderResult,
} from "../../../services/ai/voiceOrderService";
import { getHealthStatus } from "../../../services/ai/openaiProvider";

export const voiceRouter = Router();

// =============================================================================
// MULTER SETUP FOR FILE UPLOADS
// =============================================================================

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const uniqueName = `voice-${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "audio/m4a",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
      "audio/webm",
      "audio/ogg",
    ];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  },
});

// Rate limiting for voice endpoints (more generous than admin AI)
const voiceRateLimit = rateLimitAi({ windowMs: 60_000, max: 20 });

// =============================================================================
// PRODUCT SEARCH INTEGRATION
// =============================================================================

// Register a simple product search function
// In production, this would query the actual product catalog
// TODO: Integrate with store-products/search endpoint
registerProductSearch(async (query: string, _storeId: string): Promise<ProductCandidate[]> => {
  // For now, return empty array - product resolution happens client-side
  // The voice service returns productName and the POS app resolves it
  console.log("[Voice] Product search query:", query);
  return [];
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /api/v1/voice/health
 * Health check for voice service
 */
voiceRouter.get("/health", async (_req: Request, res: Response) => {
  const health = getHealthStatus();
  res.json({
    ...health,
    service: "voice",
    available: isVoiceOrderAvailable(),
  });
});

/**
 * POST /api/v1/voice/interpret
 * Upload audio and get parsed cart actions.
 *
 * Request: multipart/form-data
 * - audio: Audio file (m4a, mp4, wav, webm)
 * - storeId: Store ID (optional, from device token if not provided)
 * - mode: Current cart mode (SELL or BUY, default: SELL)
 * - requestId: Optional request ID for idempotency
 *
 * Response:
 * {
 *   success: boolean,
 *   requestId: string,
 *   transcript: string,
 *   actions: CartAction[],
 *   confidence: number,
 *   requiresConfirmation: boolean,
 *   message?: string
 * }
 */
voiceRouter.post(
  "/interpret",
  requireDeviceToken,
  voiceRateLimit,
  upload.single("audio"),
  async (req: Request, res: Response, next: NextFunction) => {
    const audioFile = req.file;

    try {
      // Validate audio file
      if (!audioFile) {
        return res.status(400).json({
          success: false,
          error: "No audio file provided",
          code: "MISSING_AUDIO",
        });
      }

      // Check if voice service is available
      if (!isVoiceOrderAvailable()) {
        return res.status(503).json({
          success: false,
          error: "Voice service not available",
          code: "VOICE_NOT_CONFIGURED",
          message: "Voice requires internet connection. Please try again later.",
        });
      }

      // CL-015: Fix .device → .posDevice (requireDeviceToken sets posDevice, not device)
      const device = (req as any).posDevice;
      const storeId = device?.storeId || device?.store_id;

      if (!storeId) {
        return res.status(400).json({
          success: false,
          error: "storeId is required",
          code: "MISSING_STORE_ID",
        });
      }

      const mode = (req.body.mode?.toUpperCase() === "BUY" ? "BUY" : "SELL") as "SELL" | "BUY";
      const userRole = device?.role || "cashier";
      const requestId = req.body.requestId || uuidv4();

      console.log("[Voice] Processing request:", {
        requestId,
        storeId,
        mode,
        fileSize: audioFile.size,
      });

      // Read audio file into buffer
      const audioBuffer = fs.readFileSync(audioFile.path);

      // Process voice order
      const result = await processVoiceOrder({
        requestId,
        audioBuffer,
        filename: audioFile.originalname,
        storeId,
        deviceId: device?.id || device?.device_id,
        currentMode: mode,
        userRole,
        ip: req.ip,
      });

      // Return result
      res.json({
        success: result.success,
        requestId: result.requestId,
        transcript: result.transcript,
        language: result.language,
        actions: result.actions,
        confidence: result.confidence,
        requiresConfirmation: result.requiresConfirmation,
        message: result.message,
      });
    } catch (error) {
      console.error("[Voice] Interpret error:", error);

      // Handle specific error types
      if (error instanceof Error) {
        if (error.name === "OpenAINotConfiguredError") {
          return res.status(503).json({
            success: false,
            error: "Voice service not configured",
            code: "VOICE_NOT_CONFIGURED",
            message: "Voice requires internet connection. Please try again later.",
          });
        }
        if (error.name === "OpenAIRateLimitError") {
          return res.status(429).json({
            success: false,
            error: error.message,
            code: "RATE_LIMITED",
            message: "Too many requests. Please wait a moment.",
          });
        }
        if (error.name === "OpenAIBudgetExceededError") {
          return res.status(429).json({
            success: false,
            error: error.message,
            code: "BUDGET_EXCEEDED",
            message: "Request limit reached. Please try again later.",
          });
        }
      }

      next(error);
    } finally {
      // Clean up temp file
      if (audioFile?.path) {
        fs.unlink(audioFile.path, (err) => {
          if (err) console.warn("[Voice] Failed to delete temp file:", err);
        });
      }
    }
  }
);

/**
 * POST /api/v1/voice/parse
 * Parse a text transcript (for on-device STT).
 *
 * Request body:
 * {
 *   transcript: string,
 *   storeId?: string,
 *   mode?: "SELL" | "BUY",
 *   requestId?: string
 * }
 *
 * Response: Same as /interpret
 */
voiceRouter.post(
  "/parse",
  requireDeviceToken,
  voiceRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { transcript, mode: modeParam, requestId: reqId } = req.body;

      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({
          success: false,
          error: "transcript is required",
          code: "MISSING_TRANSCRIPT",
        });
      }

      // Check if voice service is available
      if (!isVoiceOrderAvailable()) {
        return res.status(503).json({
          success: false,
          error: "Voice service not available",
          code: "VOICE_NOT_CONFIGURED",
        });
      }

      // CL-015: Fix .device → .posDevice (requireDeviceToken sets posDevice, not device)
      const device = (req as any).posDevice;
      const storeId = device?.storeId || device?.store_id;

      if (!storeId) {
        return res.status(400).json({
          success: false,
          error: "storeId is required",
          code: "MISSING_STORE_ID",
        });
      }

      const mode = (modeParam?.toUpperCase() === "BUY" ? "BUY" : "SELL") as "SELL" | "BUY";
      const userRole = device?.role || "cashier";
      const requestId = reqId || uuidv4();

      // Pass transcript directly - skips STT
      const result = await processVoiceOrder({
        requestId,
        transcript, // Use provided transcript
        storeId,
        deviceId: device?.id || device?.device_id,
        currentMode: mode,
        userRole,
        ip: req.ip,
      });

      res.json({
        success: result.success,
        requestId: result.requestId,
        transcript: result.transcript,
        actions: result.actions,
        confidence: result.confidence,
        requiresConfirmation: result.requiresConfirmation,
        message: result.message,
      });
    } catch (error) {
      console.error("[Voice] Parse error:", error);
      next(error);
    }
  }
);

/**
 * POST /api/v1/voice/execute
 * Execute a previously parsed voice command.
 * (Backward compatibility with voice service)
 */
voiceRouter.post(
  "/execute",
  requireDeviceToken,
  async (req: Request, res: Response) => {
    const { requestId, confirmed } = req.body;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        error: "requestId is required",
      });
    }

    // For now, just acknowledge the execution
    // The actual cart modification is done by the POS app
    res.json({
      success: true,
      message: confirmed ? "Command confirmed" : "Command cancelled",
      requestId,
    });
  }
);

/**
 * GET /api/v1/voice/status/:requestId
 * Get status of a voice request (backward compatibility)
 */
voiceRouter.get(
  "/status/:requestId",
  requireDeviceToken,
  async (req: Request, res: Response) => {
    const { requestId } = req.params;

    // Since we cache results for idempotency, we can retrieve them
    // For now, return a simple status
    res.json({
      success: true,
      requestId,
      status: "completed",
    });
  }
);

export default voiceRouter;
