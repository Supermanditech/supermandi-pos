/**
 * GCP-STG-0491: Rate limit on password login endpoints
 * Verifies redisRateLimit middleware is applied to retailer and supplier password login routes
 */
import fs from 'fs';
import path from 'path';

describe('GCP-STG-0491: Password login rate limiting', () => {
  describe('Retailer auth', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/retailer-admin/auth.ts');
    let source: string;

    beforeAll(() => {
      source = fs.readFileSync(filePath, 'utf-8');
    });

    it('should import redisRateLimit middleware', () => {
      expect(source).toContain("import { redisRateLimit } from");
    });

    it('should define passwordLoginRateLimiter with 10 max per 60s', () => {
      expect(source).toContain('passwordLoginRateLimiter');
      expect(source).toMatch(/keyPrefix:\s*"rl:retailer:pw-login"/);
      expect(source).toContain('max: 10');
      expect(source).toContain('60_000');
    });

    it('should apply passwordLoginRateLimiter to POST /auth/login', () => {
      // The route handler must include passwordLoginRateLimiter in middleware chain
      expect(source).toMatch(/router\.post\("\/auth\/login".*passwordLoginRateLimiter/);
    });
  });

  describe('Supplier auth', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/supplier/auth.ts');
    let source: string;

    beforeAll(() => {
      source = fs.readFileSync(filePath, 'utf-8');
    });

    it('should define passwordLoginIpRateLimiter with 10 max per 60s', () => {
      expect(source).toContain('passwordLoginIpRateLimiter');
      expect(source).toMatch(/keyPrefix:\s*"rl:supplier:pw-login"/);
      expect(source).toContain('max: 10');
    });

    it('should apply passwordLoginIpRateLimiter to POST /auth/login', () => {
      expect(source).toMatch(/router\.post\("\/auth\/login".*passwordLoginIpRateLimiter/);
    });
  });
});
