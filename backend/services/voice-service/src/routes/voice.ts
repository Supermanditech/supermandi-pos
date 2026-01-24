// Voice Routes - VOICE-003
// Handles voice command interpretation and execution

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';

import { config } from '../config.js';
import { transcribeAudio } from '../services/sttService.js';
import { parseIntent, type ParsedIntent } from '../services/intentParser.js';

const router: ReturnType<typeof Router> = Router();

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

// Simple in-memory store (use Redis in production)
const requestStore = new Map<string, VoiceRequest>();

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
  async (req: Request, res: Response, next: NextFunction) => {
    const audioFile = req.file;

    try {
      // Validate request
      if (!audioFile) {
        return res.status(400).json({
          success: false,
          error: 'No audio file provided',
        });
      }

      const storeId = req.body.storeId as string;
      if (!storeId) {
        return res.status(400).json({
          success: false,
          error: 'storeId is required',
        });
      }

      console.log(`[VOICE] Processing audio: ${audioFile.path}, size: ${audioFile.size}`);

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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { requestId, storeId, confirmed } = req.body;

      // Validate request
      if (!requestId || !storeId) {
        return res.status(400).json({
          success: false,
          error: 'requestId and storeId are required',
        });
      }

      // Get stored request
      const voiceRequest = requestStore.get(requestId);
      if (!voiceRequest) {
        return res.status(404).json({
          success: false,
          error: 'Request not found or expired',
        });
      }

      // Validate store matches
      if (voiceRequest.storeId !== storeId) {
        return res.status(403).json({
          success: false,
          error: 'Store mismatch',
        });
      }

      // Check if already executed
      if (voiceRequest.executed) {
        return res.status(409).json({
          success: false,
          error: 'Request already executed',
        });
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
  async (req: Request, res: Response) => {
    const { requestId } = req.params;

    const voiceRequest = requestStore.get(requestId);
    if (!voiceRequest) {
      return res.status(404).json({
        success: false,
        error: 'Request not found or expired',
      });
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
