/**
 * GCP-STG-0478: Strip OTP from dev console logs in production
 * Verifies that the OTP log guard uses process.env.LOG_OTP_PLAINTEXT instead of __DEV__
 */
import fs from 'fs';
import path from 'path';

describe('GCP-STG-0478: OTP plaintext log guard', () => {
  const filePath = path.resolve(__dirname, '../src/routes/v1/pos/otpAuth.ts');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(filePath, 'utf-8');
  });

  it('should NOT use __DEV__ to gate OTP logging', () => {
    // __DEV__ is a React Native global that is always false in Node.js backend
    // but could be accidentally set to true via bundler config
    expect(source).not.toMatch(/if\s*\(\s*__DEV__\s*\)/);
  });

  it('should use process.env.LOG_OTP_PLAINTEXT to gate OTP logging', () => {
    expect(source).toContain("process.env.LOG_OTP_PLAINTEXT === 'true'");
  });

  it('should have a SECURITY comment warning against enabling in production', () => {
    expect(source).toContain('SECURITY: Never enable LOG_OTP_PLAINTEXT in staging or production');
  });

  it('should NOT declare __DEV__ global', () => {
    expect(source).not.toMatch(/declare\s+(const|var|let)\s+__DEV__/);
  });

  it('should mask phone and OTP in non-dev log path', () => {
    // The else branch should show masked phone and ****** OTP
    expect(source).toContain("phone.slice(0, 3)");
    expect(source).toContain("OTP: ******");
  });
});
