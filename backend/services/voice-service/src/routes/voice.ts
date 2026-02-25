// Voice Routes - VOICE-003
// Handles voice command interpretation and execution

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { authenticate, requireActorType, getAuthUser } from '@supermandi/auth-service/exports';

import { config } from '../config';
import { transcribeAudio } from '../services/sttService';
import { parseIntent, type ParsedIntent } from '../services/intentParser';

const router: ReturnType<typeof Router> = Router();
router.use(authenticate);
router.use(requireActorType('store'));

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
    fileSize: config.audio.maxFileSizeMb * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    // Accept common audio types
    if (config.audio.allowedMimeTypes.includes(file.mimetype) ||
        file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  },
});

// =============================================================================
// IN-MEMORY REQUEST STORE (for execute step)
// =============================================================================

interface VoiceRequest {
  requestId: string;
  storeId: string;
  transcript: string;
  intent: ParsedIntent;
  createdAt: Date;
  executed: boolean;
}

interface ExecuteRequestBody {
  requestId: string;
}

function parseExecuteRequestBody(value: unknown): ExecuteRequestBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be a JSON object');
  }
  const body = value as Record<string, unknown>;
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  if (!requestId) {
    throw new Error('requestId is required');
  }
  return { requestId };
}

// Simple in-memory store (use Redis in production)
const requestStore = new Map<string, VoiceRequest>();
// R6.BE.017: Cap store size to prevent unbounded memory growth
const MAX_REQUEST_STORE_SIZE = 10_000;

// Cleanup old requests every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const [id, request] of requestStore.entries()) {
    if (request.createdAt < fiveMinutesAgo) {
      requestStore.delete(id);
    }
  }
}, 5 * 60 * 1000);

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /interpret
 * Upload audio and get transcription + parsed intent.
 *
 * Request: multipart/form-data
 * - audio: Audio file (m4a, mp4, wav, webm)
 * - storeId: Store ID for context
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     requestId: string,
 *     transcript: string,
 *     intent: ParsedIntent,
 *     confidence: number
 *   }
 * }
 */
router.post(
  '/interpret',
  upload.single('audio'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const audioFile = req.file;

    try {
      // Validate request
      if (!audioFile) {
        res.status(400).json({
          success: false,
          error: 'No audio file provided',
        });
        return;
      }

      // R7.BE.017: Derive store identity from authenticated JWT claims.
      const storeId = getAuthUser(req).actorId;
      if (!storeId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required (missing authenticated store context)',
        });
        return;
      }

      console.log(`[VOICE] Processing audio for store: ${storeId.substring(0, 8)}...`);

      // Step 1: Transcribe audio
      const transcription = await transcribeAudio(audioFile.path);
      console.log(`[VOICE] Transcript: ${transcription.text}`);

      // Step 2: Parse intent
      const intent = parseIntent(transcription.text);
      console.log(`[VOICE] Intent:`, JSON.stringify(intent));

      // Step 3: Store request for execute step
      const requestId = uuidv4();
      const voiceRequest: VoiceRequest = {
        requestId,
        storeId,
        transcript: transcription.text,
        intent,
        createdAt: new Date(),
        executed: false,
      };
      // R6.BE.017: Evict oldest entry if store is at capacity
      if (requestStore.size >= MAX_REQUEST_STORE_SIZE) {
        const oldestKey = requestStore.keys().next().value;
        if (oldestKey) requestStore.delete(oldestKey);
      }
      requestStore.set(requestId, voiceRequest);

      // Return interpretation result
      res.json({
        success: true,
        data: {
          requestId,
          transcript: transcription.text,
          intent,
          confidence: intent.confidence,
        },
      });
    } catch (error) {
      console.error('[VOICE] Interpret error:', error);
      next(error);
    } finally {
      // Clean up temp file
      if (audioFile?.path) {
        fs.unlink(audioFile.path, (err) => {
          if (err) console.warn('[VOICE] Failed to delete temp file:', err);
        });
      }
    }
  }
);

/**
 * POST /execute
 * Execute a previously interpreted voice command.
 *
 * Request body:
 * {
 *   requestId: string,
 *   storeId: string,
 *   confirmed: boolean
 * }
 *
 * Response:
 * {
 *   success: true,
 *   message: string,
 *   data?: { productId?, productName?, quantity?, price? }
 * }
 */
router.post(
  '/execute',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let requestId: string;
      try {
        requestId = parseExecuteRequestBody(req.body).requestId;
      } catch (parseError) {
        res.status(400).json({
          success: false,
          error: parseError instanceof Error ? parseError.message : 'Invalid request body',
        });
        return;
      }
      // R7.BE.017: Derive store identity from authenticated JWT claims.
      const storeId = getAuthUser(req).actorId;
      if (!storeId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required (missing authenticated store context)',
        });
        return;
      }

      // Get stored request
      const voiceRequest = requestStore.get(requestId);
      if (!voiceRequest) {
        res.status(404).json({
          success: false,
          error: 'Request not found or expired',
        });
        return;
      }

      // Validate store matches (JWT store must match the store from interpret step)
      if (voiceRequest.storeId !== storeId) {
        res.status(403).json({
          success: false,
          error: 'Store mismatch',
        });
        return;
      }

      // Check if already executed
      if (voiceRequest.executed) {
        res.status(409).json({
          success: false,
          error: 'Request already executed',
        });
        return;
      }

      // Mark as executed
      voiceRequest.executed = true;

      const { intent } = voiceRequest;

      // Generate response message based on intent
      let message: string;
      let data: Record<string, unknown> | undefined;

      switch (intent.action) {
        case 'add_to_cart':
          message = `Added ${intent.quantity || 1} ${intent.unit || 'pcs'} ${intent.productName || 'item'} to cart`;
          data = {
            productName: intent.productName,
            quantity: intent.quantity || 1,
            unit: intent.unit,
          };
          break;

        case 'search':
          message = `Searching for "${intent.productName || intent.rawQuery}"`;
          data = {
            searchQuery: intent.productName || intent.rawQuery,
          };
          break;

        case 'check_stock':
          message = `Checking stock for "${intent.productName || intent.rawQuery}"`;
          data = {
            productName: intent.productName,
          };
          break;

        case 'info':
          message = `Getting info for "${intent.productName || intent.rawQuery}"`;
          data = {
            productName: intent.productName,
          };
          break;

        default:
          message = "I didn't understand that command. Try saying 'Add 2 kg rice' or 'Search for dal'.";
          break;
      }

      res.json({
        success: intent.action !== 'unknown',
        message,
        data,
      });
    } catch (error) {
      console.error('[VOICE] Execute error:', error);
      next(error);
    }
  }
);

/**
 * GET /status
 * Get status of a voice request.
 */
router.get(
  '/status/:requestId',
  async (req: Request, res: Response): Promise<void> => {
    const { requestId } = req.params;
    const storeId = getAuthUser(req).actorId;

    if (!storeId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required (missing authenticated store context)',
      });
      return;
    }

    const voiceRequest = requestStore.get(requestId as string);
    if (!voiceRequest) {
      res.status(404).json({
        success: false,
        error: 'Request not found or expired',
      });
      return;
    }

    if (voiceRequest.storeId !== storeId) {
      res.status(403).json({
        success: false,
        error: 'Store mismatch',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        requestId: voiceRequest.requestId,
        transcript: voiceRequest.transcript,
        intent: voiceRequest.intent,
        executed: voiceRequest.executed,
        createdAt: voiceRequest.createdAt,
      },
    });
  }
);

export default router;
