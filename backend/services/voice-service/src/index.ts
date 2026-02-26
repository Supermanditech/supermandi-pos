// Voice Service - VOICE-003
// Speech-to-text and voice command processing

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createLogger } from '@supermandi/common';

import { config } from './config';

const logger = createLogger({ service: 'voice-service', level: process.env.LOG_LEVEL || 'info' });
import voiceRoutes from './routes/voice';

const app = express();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

// Security headers
app.use(helmet());

// SEC-006: Restrict CORS to allowed origins (was: default cors() allowing all)
const voiceCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: voiceCorsOrigins.length > 0
    ? voiceCorsOrigins
    : config.env === 'development'
      ? true
      : false,
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

app.get('/health', async (_req: Request, res: Response) => {
  const hasOpenaiKey = Boolean(config.openai.apiKey);

  res.status(200).json({
    status: 'ok',
    service: 'voice-service',
    version: '1.2.0',
    openai: hasOpenaiKey ? 'configured' : 'not_configured (using mock)',
  });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'voice-service',
    timestamp: new Date().toISOString(),
  });
});

// CR-VERSION-001: Version endpoint for Cloud Run deploy verification
app.get('/version', (_req: Request, res: Response) => {
  res.json({
    sha: process.env.GIT_SHA || 'unknown',
    service: 'voice-service',
    built: process.env.BUILD_TIME || new Date().toISOString(),
  });
});

// =============================================================================
// VOICE ROUTES
// =============================================================================

app.use('/', voiceRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`[ERROR] ${err.message}`, err instanceof Error ? err : undefined);

  // Multer file size error
  if (err.message.includes('File too large')) {
    res.status(413).json({
      success: false,
      error: `File too large. Maximum size is ${config.audio.maxFileSizeMb}MB`,
    });
    return;
  }

  // Multer file type error
  if (err.message.includes('Invalid file type')) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred',
  });
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(config.port, () => {
  logger.info('SuperMandi Voice Service v1.2.0 started', { port: config.port, env: config.env, openai: config.openai.apiKey ? 'configured' : 'mock mode' });
});
