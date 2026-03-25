-- Migration: 000_extensions
-- ROLLBACK: DROP EXTENSION IF EXISTS pg_trgm; DROP EXTENSION IF EXISTS pgcrypto;
-- V3.0.9 Foundation: Enable required PostgreSQL extensions
-- Safe to run multiple times (idempotent)

-- pgcrypto: Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm: Required for fuzzy text search (product name search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
