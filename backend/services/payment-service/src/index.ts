// Payment Service Entry Point
// SM-004: Payment Service Scaffold with Razorpay Integration

import express from 'express';
import helmet from 'helmet';
import { initDb, closeDb } from '@supermandi/common';
import { config } from './config.js';
import healthRoutes from './routes/health.js';

const app = express();

// Security middleware
app.use(helmet());

// Parse JSON bodies
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/', healthRoutes);

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await closeDb();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Initialize database connection
    await initDb();
    console.log('Database connection established');

    app.listen(config.port, () => {
      console.log(`Payment service running on port ${config.port}`);
      console.log(`Environment: ${config.env}`);
      console.log(`Razorpay configured: ${config.razorpay.keyId ? 'yes' : 'no'}`);
    });
  } catch (error) {
    console.error('Failed to start payment service:', error);
    process.exit(1);
  }
};

startServer();
