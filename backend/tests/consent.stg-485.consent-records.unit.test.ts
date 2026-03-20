/**
 * STG-485: DPDP consent records — migration + API wiring verification
 * Tests: migration creates table, API routes exist, validation rules
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('STG-485: DPDP consent records', () => {
  // =========================================================================
  // Migration verification
  // =========================================================================

  describe('migration 188_consent_records.sql', () => {
    const migrationPath = join(__dirname, '..', 'migrations', '188_consent_records.sql');

    it('should exist', () => {
      expect(existsSync(migrationPath)).toBe(true);
    });

    const migration = readFileSync(migrationPath, 'utf-8');

    it('should create platform.consent_records table', () => {
      expect(migration).toContain('CREATE TABLE IF NOT EXISTS platform.consent_records');
    });

    it('should have required columns', () => {
      expect(migration).toContain('store_id UUID NOT NULL');
      expect(migration).toContain('customer_phone VARCHAR(15)');
      expect(migration).toContain('consent_type VARCHAR(50)');
      expect(migration).toContain('given_at TIMESTAMPTZ');
      expect(migration).toContain('revoked_at TIMESTAMPTZ');
    });

    it('should have foreign key to platform.stores', () => {
      expect(migration).toContain('FOREIGN KEY (store_id) REFERENCES platform.stores(id)');
    });

    it('should have composite index for consent lookups', () => {
      expect(migration).toContain('idx_consent_store_phone_type');
      expect(migration).toContain('store_id, customer_phone, consent_type');
    });

    it('should have partial index filtering active consents only', () => {
      expect(migration).toContain('WHERE revoked_at IS NULL');
    });
  });

  // =========================================================================
  // API route verification
  // =========================================================================

  describe('consent.ts route wiring', () => {
    const routeSource = readFileSync(
      join(__dirname, '..', 'src', 'routes', 'v1', 'consent.ts'),
      'utf-8'
    );

    it('should have POST /consent/record endpoint', () => {
      expect(routeSource).toContain("'/consent/record'");
      expect(routeSource).toContain('consentRouter.post');
    });

    it('should have GET /consent/check endpoint', () => {
      expect(routeSource).toContain("'/consent/check'");
      expect(routeSource).toContain('consentRouter.get');
    });

    it('should have POST /consent/revoke endpoint', () => {
      expect(routeSource).toContain("'/consent/revoke'");
    });

    it('should validate phone number format', () => {
      expect(routeSource).toContain('validatePhone');
    });

    it('should validate consent types', () => {
      expect(routeSource).toContain('VALID_CONSENT_TYPES');
      expect(routeSource).toContain('credit_scoring');
      expect(routeSource).toContain('khata_phone');
      expect(routeSource).toContain('pan_collection');
    });

    it('should require store context from JWT', () => {
      expect(routeSource).toContain('storeId');
      // Store context enforced via posDevice.storeId from device token middleware
      expect(routeSource).toContain('posDevice');
    });

    it('should insert with store_id scoping', () => {
      expect(routeSource).toContain('store_id = $1');
    });
  });

  // =========================================================================
  // Route registration in index.ts
  // =========================================================================

  describe('index.ts registration', () => {
    const indexSource = readFileSync(
      join(__dirname, '..', 'src', 'routes', 'v1', 'index.ts'),
      'utf-8'
    );

    it('should import consentRouter', () => {
      expect(indexSource).toContain("import { consentRouter }");
    });

    it('should mount consentRouter', () => {
      expect(indexSource).toContain('consentRouter');
    });
  });
});
