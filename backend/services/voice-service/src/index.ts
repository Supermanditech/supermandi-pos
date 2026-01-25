// Voice Service - VOICE-003
// Speech-to-text and voice command processing

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';

import { config } from './config.js';
import voiceRoutes from './routes/voice.js';

const app = express();

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================

// Security headers
app.use(helmet());

// CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

app.get('/health', async (_req: Request, res: Response) => {
  // AUD-076-D: Check Anthropic API key instead of OpenAI
  const hasAnthropicKey = Boolean(config.anthropic.apiKey);

  res.status(200).json({
    status: 'ok',
    service: 'voice-service',
    version: '1.1.0', // AUD-076-D: Version bump for Claude migration
    anthropic: hasAnthropicKey ? 'configured' : 'not_configured (using mock)',
  });
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'voice-service',
    timestamp: new Date().toISOString(),
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
  console.error(`[ERROR] ${err.message}`, err.stack);

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
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(config.port, () => {
  console.log(`
====================================================
  SuperMandi Voice Service v1.1.0
  Running on port ${config.port}
  Environment: ${config.env}
  Anthropic Claude: ${config.anthropic.apiKey ? 'Configured' : 'Not configured (mock mode)'}
====================================================
  `);
});
