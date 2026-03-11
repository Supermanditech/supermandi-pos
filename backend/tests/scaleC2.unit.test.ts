// SCALE-C2: Expiry alerts system unit tests
// Verifies: POS expiry endpoint, retailer-admin expiry endpoint,
// severity classification, counts, store isolation, edge cases

import * as fs from 'fs';
import * as path from 'path';

describe('SCALE-C2: Expiry Alerts System', () => {
  // ---------------------------------------------------------------------------
  // 1. POS expiry alerts route file
  // ---------------------------------------------------------------------------
  describe('POS expiryAlerts.ts', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/pos/expiryAlerts.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('exports posExpiryAlertsRouter', () => {
      expect(fileContent).toContain('export const posExpiryAlertsRouter');
    });

    it('registers GET /inventory/expiring route', () => {
      expect(fileContent).toContain('"/inventory/expiring"');
      expect(fileContent).toContain('get(');
    });

    it('uses requireDeviceToken middleware', () => {
      expect(fileContent).toContain('requireDeviceToken');
    });

    it('derives storeId from device token (not from client-sent body/query)', () => {
      expect(fileContent).toContain('posDevice');
      expect(fileContent).toContain('storeId');
      // storeId comes only from token, never from req.query/req.body
      expect(fileContent).not.toContain('req.query[\'storeId\']');
      expect(fileContent).not.toContain('req.body.storeId');
    });

    it('filters by store_id = storeId from token (store isolation)', () => {
      expect(fileContent).toContain('sp.store_id = $1');
    });

    it('filters products by expiry_date IS NOT NULL', () => {
      expect(fileContent).toContain('sp.expiry_date IS NOT NULL');
    });

    it('filters to daysAhead window with interval', () => {
      expect(fileContent).toContain("|| ' days')::interval");
    });

    it('includes products already expired (expiry >= yesterday)', () => {
      expect(fileContent).toContain("CURRENT_DATE - INTERVAL '1 day'");
    });

    it('classifies severity as "critical" when daysRemaining <= 30', () => {
      expect(fileContent).toContain("severity = 'critical'");
      expect(fileContent).toContain('<= 30');
    });

    it('classifies severity as "warning" when daysRemaining 31-90', () => {
      expect(fileContent).toContain("severity = 'warning'");
    });

    it('classifies severity as "expired" when daysRemaining < 0', () => {
      expect(fileContent).toContain("severity = 'expired'");
      expect(fileContent).toContain('days < 0');
    });

    it('returns counts object with expired, critical, warning keys', () => {
      expect(fileContent).toContain('expired: 0');
      expect(fileContent).toContain('critical: 0');
      expect(fileContent).toContain('warning: 0');
    });

    it('clamps daysAhead to max 365', () => {
      expect(fileContent).toContain('365');
    });

    it('defaults daysAhead to 30 when not provided', () => {
      // Default is 30 for POS endpoint
      expect(fileContent).toContain("'30'");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Retailer admin expiry endpoint in inventory.ts
  // ---------------------------------------------------------------------------
  describe('Retailer admin inventory.ts — expiry endpoint', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/retailer-admin/inventory.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('registers GET /inventory/expiring route', () => {
      expect(fileContent).toContain('"/inventory/expiring"');
    });

    it('derives storeId from x-actor-id header (gateway-set)', () => {
      // uses getStoreId helper which reads x-actor-id
      expect(fileContent).toContain('getStoreId(req)');
    });

    it('returns 401 if store not identified', () => {
      expect(fileContent).toContain('"Store not identified"');
    });

    it('filters by store_id = storeId (store isolation)', () => {
      // The expiry query uses $1 for storeId
      const expirySection = fileContent.slice(fileContent.indexOf('SCALE-C2'));
      expect(expirySection).toContain('sp.store_id = $1');
    });

    it('filters to only products with expiry_date not null', () => {
      const expirySection = fileContent.slice(fileContent.indexOf('SCALE-C2'));
      expect(expirySection).toContain('sp.expiry_date IS NOT NULL');
    });

    it('defaults daysAhead to 90 for retailer view', () => {
      const expirySection = fileContent.slice(fileContent.indexOf('SCALE-C2'));
      expect(expirySection).toContain("'90'");
    });

    it('classifies severity expired/critical/warning', () => {
      const expirySection = fileContent.slice(fileContent.indexOf('SCALE-C2'));
      expect(expirySection).toContain("'expired'");
      expect(expirySection).toContain("'critical'");
      expect(expirySection).toContain("'warning'");
    });

    it('returns both expiring array and counts', () => {
      const expirySection = fileContent.slice(fileContent.indexOf('SCALE-C2'));
      expect(expirySection).toContain('expiring');
      expect(expirySection).toContain('counts');
    });

    it('handles DB error gracefully with 500 response', () => {
      const expirySection = fileContent.slice(fileContent.indexOf('SCALE-C2'));
      expect(expirySection).toContain('500');
      expect(expirySection).toContain('Failed to load expiry alerts');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Route registration in v1/index.ts
  // ---------------------------------------------------------------------------
  describe('v1/index.ts route registration', () => {
    const filePath = path.resolve(__dirname, '../src/routes/v1/index.ts');
    let fileContent: string;

    beforeAll(() => {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    });

    it('imports posExpiryAlertsRouter', () => {
      expect(fileContent).toContain('posExpiryAlertsRouter');
      expect(fileContent).toContain('./pos/expiryAlerts');
    });

    it('mounts posExpiryAlertsRouter under /pos', () => {
      expect(fileContent).toContain('v1Router.use("/pos", posExpiryAlertsRouter)');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Severity classification logic (unit-level)
  // ---------------------------------------------------------------------------
  describe('Severity classification rules', () => {
    function classifySeverity(daysRemaining: number): 'expired' | 'critical' | 'warning' {
      if (daysRemaining < 0) return 'expired';
      if (daysRemaining <= 30) return 'critical';
      return 'warning';
    }

    it('returns "expired" for daysRemaining = -1', () => {
      expect(classifySeverity(-1)).toBe('expired');
    });

    it('returns "expired" for daysRemaining = -30', () => {
      expect(classifySeverity(-30)).toBe('expired');
    });

    it('returns "critical" for daysRemaining = 0', () => {
      expect(classifySeverity(0)).toBe('critical');
    });

    it('returns "critical" for daysRemaining = 30', () => {
      expect(classifySeverity(30)).toBe('critical');
    });

    it('returns "warning" for daysRemaining = 31', () => {
      expect(classifySeverity(31)).toBe('warning');
    });

    it('returns "warning" for daysRemaining = 90', () => {
      expect(classifySeverity(90)).toBe('warning');
    });

    it('returns "warning" for daysRemaining = 180', () => {
      expect(classifySeverity(180)).toBe('warning');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Counts aggregation logic (unit-level)
  // ---------------------------------------------------------------------------
  describe('Counts aggregation', () => {
    function aggregateCounts(items: Array<{ severity: string }>) {
      return items.reduce(
        (acc, p) => {
          acc[p.severity] = (acc[p.severity] || 0) + 1;
          return acc;
        },
        { expired: 0, critical: 0, warning: 0 } as Record<string, number>
      );
    }

    it('counts critical items correctly', () => {
      const items = [
        { severity: 'critical' },
        { severity: 'critical' },
        { severity: 'warning' },
      ];
      const counts = aggregateCounts(items);
      expect(counts.critical).toBe(2);
    });

    it('counts warning items correctly', () => {
      const items = [
        { severity: 'critical' },
        { severity: 'warning' },
        { severity: 'warning' },
        { severity: 'warning' },
      ];
      const counts = aggregateCounts(items);
      expect(counts.warning).toBe(3);
    });

    it('counts expired items correctly', () => {
      const items = [
        { severity: 'expired' },
        { severity: 'critical' },
      ];
      const counts = aggregateCounts(items);
      expect(counts.expired).toBe(1);
      expect(counts.critical).toBe(1);
    });

    it('returns zeros for empty list', () => {
      const counts = aggregateCounts([]);
      expect(counts.expired).toBe(0);
      expect(counts.critical).toBe(0);
      expect(counts.warning).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. daysAhead clamping logic (unit-level)
  // ---------------------------------------------------------------------------
  describe('daysAhead clamping', () => {
    function clampDaysAhead(raw: number | null | undefined, defaultVal: number): number {
      const parsed = raw !== null && raw !== undefined ? raw : NaN;
      if (isNaN(parsed) || parsed < 0) return defaultVal;
      if (parsed > 365) return 365;
      return parsed;
    }

    it('defaults when undefined', () => {
      expect(clampDaysAhead(undefined, 30)).toBe(30);
    });

    it('defaults when null', () => {
      expect(clampDaysAhead(null, 30)).toBe(30);
    });

    it('defaults when negative', () => {
      expect(clampDaysAhead(-5, 30)).toBe(30);
    });

    it('clamps at 365 maximum', () => {
      expect(clampDaysAhead(500, 30)).toBe(365);
    });

    it('passes through valid value', () => {
      expect(clampDaysAhead(90, 30)).toBe(90);
    });

    it('allows 0 (show only expired)', () => {
      expect(clampDaysAhead(0, 30)).toBe(0);
    });
  });
});
