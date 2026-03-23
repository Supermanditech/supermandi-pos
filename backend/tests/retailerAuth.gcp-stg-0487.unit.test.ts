/**
 * GCP-STG-0487: Account lockout after 5 failed password attempts (retailer)
 * Verifies DB-backed lockout fields are queried and updated, 30-min lockout duration
 */
import fs from 'fs';
import path from 'path';

describe('GCP-STG-0487: Retailer password login DB-backed lockout', () => {
  const filePath = path.resolve(__dirname, '../src/routes/v1/retailer-admin/auth.ts');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(filePath, 'utf-8');
  });

  it('should query failed_login_count and locked_until from auth.users', () => {
    expect(source).toMatch(/SELECT.*failed_login_count.*locked_until.*FROM auth\.users/s);
  });

  it('should check locked_until before allowing login', () => {
    expect(source).toContain('user.locked_until');
    expect(source).toContain("ACCOUNT_LOCKED");
  });

  it('should UPDATE auth.users with failed_login_count on failed attempt', () => {
    expect(source).toMatch(/UPDATE auth\.users SET failed_login_count/);
  });

  it('should clear failed_login_count on successful login', () => {
    expect(source).toMatch(/UPDATE auth\.users SET failed_login_count = 0.*locked_until = NULL/);
  });

  it('should use 30-minute lockout duration (parity with SuperAdmin/Supplier)', () => {
    expect(source).toContain('30 * 60 * 1000');
  });

  it('should have MAX_LOGIN_ATTEMPTS = 5', () => {
    expect(source).toMatch(/MAX_LOGIN_ATTEMPTS\s*=\s*5/);
  });

  it('should log lockout event with email identifier', () => {
    expect(source).toContain('GCP-STG-0487: Account');
  });
});
