/**
 * STG-473: Khata consent gate + phone encryption import
 * Tests: consent check before entry creation, 403 on missing consent, encrypt import present
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-473: Khata consent gate', () => {
  const source = readFileSync(
    join(__dirname, '..', 'src', 'routes', 'v1', 'pos', 'khata.ts'),
    'utf-8'
  );

  it('should import encrypt from encryption utility', () => {
    expect(source).toContain("import { encrypt } from \"../../../utils/encryption\"");
  });

  it('should check consent_records for khata_phone before creating entry', () => {
    expect(source).toContain("consent_type = 'khata_phone'");
    expect(source).toContain('platform.consent_records');
  });

  it('should return 403 with consentRequired when no consent exists', () => {
    expect(source).toContain('res.status(403)');
    expect(source).toContain('consentRequired: true');
    expect(source).toContain("consentType: 'khata_phone'");
  });

  it('should check consent only on POST entries (not GET)', () => {
    // The consent check should be inside the POST handler, not the GET handlers
    const postHandler = source.substring(source.indexOf('posKhataRouter.post'));
    expect(postHandler).toContain('consent_records');

    // GET handlers should NOT have consent checks
    const getCustomers = source.substring(
      source.indexOf('posKhataRouter.get("/khata/customers"'),
      source.indexOf('posKhataRouter.get("/khata/entries"')
    );
    expect(getCustomers).not.toContain('consent_records');
  });

  it('should check consent before transaction BEGIN', () => {
    const postHandler = source.substring(source.indexOf('posKhataRouter.post'));
    const consentIdx = postHandler.indexOf('consent_records');
    const beginIdx = postHandler.indexOf('"BEGIN"');
    expect(consentIdx).toBeLessThan(beginIdx);
  });

  it('should use store_id and customer_phone in consent check', () => {
    expect(source).toContain('store_id = $1 AND customer_phone = $2');
    expect(source).toContain("consent_type = 'khata_phone'");
    expect(source).toContain('revoked_at IS NULL');
  });
});
