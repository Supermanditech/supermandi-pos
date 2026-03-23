/**
 * GCP-STG-0490: Lock CORS origins for production
 * Verifies wildcard CORS is blocked in production and warned in staging
 */
import fs from 'fs';
import path from 'path';

describe('GCP-STG-0490: CORS origin validation', () => {
  const filePath = path.resolve(__dirname, '../src/app.ts');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(filePath, 'utf-8');
  });

  it('should read CORS_ALLOWED_ORIGINS env var', () => {
    expect(source).toContain('process.env.CORS_ALLOWED_ORIGINS');
  });

  it('should also accept ALLOWED_ORIGINS as legacy fallback', () => {
    expect(source).toContain('process.env.ALLOWED_ORIGINS');
  });

  it('should block wildcard "*" in production with process.exit(1)', () => {
    // Must check for originsEnv.trim() === '*' AND NODE_ENV === 'production' → exit
    expect(source).toContain("originsEnv.trim() === '*'");
    expect(source).toMatch(/NODE_ENV\s*===\s*'production'/);
    // The production branch must call process.exit(1)
    const prodBlock = source.slice(
      source.indexOf("originsEnv.trim() === '*'"),
      source.indexOf("return originsEnv.split")
    );
    expect(prodBlock).toContain("process.exit(1)");
  });

  it('should warn about wildcard in non-production (staging)', () => {
    expect(source).toContain('GCP-STG-0490');
    expect(source).toContain('MUST be restricted for production');
  });

  it('should exit(1) when CORS not set in non-development', () => {
    expect(source).toContain('CORS_ALLOWED_ORIGINS or ALLOWED_ORIGINS is required');
  });

  it('should document required production CORS values in error message', () => {
    expect(source).toContain('https://app.supermandi.tech');
    expect(source).toContain('https://supplier.supermandi.tech');
    expect(source).toContain('https://admin.supermandi.tech');
  });
});
