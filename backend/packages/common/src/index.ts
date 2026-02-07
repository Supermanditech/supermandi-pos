// @supermandi/common - Shared utilities for SuperMandi backend services
// V3.0.9 compliant

// Errors (ApiError, error codes)
export * from './errors';

// Types (all domain entity types)
export * from './types';

// DTOs (Zod validation schemas)
export * from './dto';

// Events (domain event types)
export * from './events';

// Database (connection, transaction types)
export * from './db';

// Utils (UUID, timestamp helpers)
export * from './utils';

// Idempotency (middleware for mutation endpoints)
export * from './idempotency';

// Logging (structured logging, request tracking, health checks)
export * from './logging';

// Middleware (timeout, error handling) - GO-LIVE Batch 0
export * from './middleware';

// Auth (JWT types)
export * from './auth';

// Storage (GCS operations) - requires @google-cloud/storage
// Note: Initialize with initializeGcs() before use
export * from './storage';

// Firebase (ID token verification) - requires firebase-admin
// Note: Initialize with initializeFirebase() before use
export * from './firebase';

// Validation (input sanitization, format validation) - GO-LIVE Batch 3
export * from './validation';

// Schemas (Zod validation schemas for registration) - RO-002
export * from './schemas';
