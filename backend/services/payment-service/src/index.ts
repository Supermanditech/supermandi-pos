// Payment Service Entry Point
// SM-004: Payment Service Scaffold with Razorpay Integration

import express from 'express';
import helmet from 'helmet';
import { getPool, closePool, createLogger } from '@supermandi/common';
import { config } from './config';
import healthRoutes from './routes/health';

const logger = createLogger({ service: 'payment-service', level: process.env.LOG_LEVEL || 'info' });

const app = express();

// Security middleware
app.use(helmet());

// Parse JSON bodies
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/', healthRoutes);

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  await closePool();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Initialize database connection pool
    getPool();
    logger.info('Database connection pool initialized');

    app.listen(config.port, () => {
      logger.info(`Payment service running on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Razorpay configured: ${config.razorpay.configured ? 'yes' : 'no'}`);
    });
  } catch (error) {
    logger.error('Failed to start payment service:', error instanceof Error ? error : undefined);
    process.exit(1);
  }
};

startServer();
