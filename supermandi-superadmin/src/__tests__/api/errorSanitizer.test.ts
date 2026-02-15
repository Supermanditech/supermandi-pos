// SuperAdmin — Test errorSanitizer module
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeErrorMessage, parseError } from '../../api/errorSanitizer';

describe('errorSanitizer', () => {
  // =========================================================================
  // sanitizeErrorMessage
  // =========================================================================

  describe('sanitizeErrorMessage', () => {
    const fallback = 'Something went wrong';

    it('returns fallback for null input', () => {
      expect(sanitizeErrorMessage(null, fallback)).toBe(fallback);
    });

    it('returns fallback for undefined input', () => {
      expect(sanitizeErrorMessage(undefined, fallback)).toBe(fallback);
    });

    it('returns fallback for empty string', () => {
      expect(sanitizeErrorMessage('', fallback)).toBe(fallback);
    });

    it('returns fallback for very short strings (< 3 chars)', () => {
      expect(sanitizeErrorMessage('ab', fallback)).toBe(fallback);
      expect(sanitizeErrorMessage('x', fallback)).toBe(fallback);
    });

    // Sensitive patterns should be filtered
    it('filters SQL-related errors', () => {
      expect(sanitizeErrorMessage('SQL syntax error near SELECT', fallback)).toBe(fallback);
    });

    it('filters postgres errors', () => {
      expect(sanitizeErrorMessage('connection to postgres failed', fallback)).toBe(fallback);
    });

    it('filters redis errors', () => {
      expect(sanitizeErrorMessage('Redis connection timeout', fallback)).toBe(fallback);
    });

    it('filters column references', () => {
      expect(sanitizeErrorMessage('column "user_id" does not exist', fallback)).toBe(fallback);
    });

    it('filters table references', () => {
      expect(sanitizeErrorMessage('relation "table" already exists', fallback)).toBe(fallback);
    });

    it('filters constraint errors', () => {
      expect(sanitizeErrorMessage('unique constraint violation on users', fallback)).toBe(fallback);
    });

    it('filters stack traces', () => {
      expect(sanitizeErrorMessage('Error at /app/src/handler.ts:42', fallback)).toBe(fallback);
    });

    it('filters file paths', () => {
      expect(sanitizeErrorMessage('Error in /usr/src/app/server.js', fallback)).toBe(fallback);
    });

    it('filters node_modules references', () => {
      expect(sanitizeErrorMessage('error from node_modules/express', fallback)).toBe(fallback);
    });

    it('filters ECONNREFUSED errors', () => {
      expect(sanitizeErrorMessage('ECONNREFUSED 127.0.0.1:5432', fallback)).toBe(fallback);
    });

    it('filters ETIMEDOUT errors', () => {
      expect(sanitizeErrorMessage('ETIMEDOUT connecting to service', fallback)).toBe(fallback);
    });

    it('filters connection refused errors', () => {
      expect(sanitizeErrorMessage('connection refused to database', fallback)).toBe(fallback);
    });

    it('filters password-related errors', () => {
      expect(sanitizeErrorMessage('password authentication failed', fallback)).toBe(fallback);
    });

    it('filters secret-related errors', () => {
      expect(sanitizeErrorMessage('jwt secret is not configured', fallback)).toBe(fallback);
    });

    it('filters internal server errors', () => {
      expect(sanitizeErrorMessage('internal server error occurred', fallback)).toBe(fallback);
    });

    // Safe error patterns should pass through
    it('passes through "admin disabled" errors', () => {
      expect(sanitizeErrorMessage('Admin disabled by operator', fallback)).toBe('Admin disabled by operator');
    });

    it('passes through "unauthorized" errors', () => {
      expect(sanitizeErrorMessage('Unauthorized access', fallback)).toBe('Unauthorized access');
    });

    it('passes through "not found" errors', () => {
      expect(sanitizeErrorMessage('Not found', fallback)).toBe('Not found');
    });

    it('passes through "store not found" errors', () => {
      expect(sanitizeErrorMessage('Store not found', fallback)).toBe('Store not found');
    });

    it('passes through "validation failed" errors', () => {
      expect(sanitizeErrorMessage('Validation failed for input', fallback)).toBe('Validation failed for input');
    });

    it('passes through "rate limit" errors', () => {
      expect(sanitizeErrorMessage('Rate limit exceeded', fallback)).toBe('Rate limit exceeded');
    });

    it('passes through "permission denied" errors', () => {
      expect(sanitizeErrorMessage('Permission denied for this action', fallback)).toBe('Permission denied for this action');
    });

    it('passes through "already exists" errors', () => {
      expect(sanitizeErrorMessage('Already exists in the system', fallback)).toBe('Already exists in the system');
    });

    it('passes through "duplicate" errors', () => {
      expect(sanitizeErrorMessage('Duplicate entry detected', fallback)).toBe('Duplicate entry detected');
    });

    // HTTP status code pattern
    it('allows "Request failed (404)" pattern', () => {
      expect(sanitizeErrorMessage('Request failed (404)', fallback)).toBe('Request failed (404)');
    });

    it('allows "Operation failed (500)" pattern', () => {
      expect(sanitizeErrorMessage('Operation failed (500)', fallback)).toBe('Operation failed (500)');
    });

    // Long errors
    it('filters errors longer than 200 chars', () => {
      const longError = 'A'.repeat(201);
      expect(sanitizeErrorMessage(longError, fallback)).toBe(fallback);
    });

    // User-friendly messages
    it('passes through well-formatted user messages', () => {
      expect(sanitizeErrorMessage('Store has been suspended due to policy violation', fallback))
        .toBe('Store has been suspended due to policy violation');
    });

    // Cleaned output
    it('cleans newlines and tabs from errors', () => {
      const result = sanitizeErrorMessage('error\n\twith\ttabs\nand\nnewlines', fallback);
      expect(result).not.toContain('\n');
      expect(result).not.toContain('\t');
    });

    it('truncates long cleaned errors to 100 chars', () => {
      // An error that doesn't match safe patterns but is < 200 chars
      const error = 'x'.repeat(150);
      const result = sanitizeErrorMessage(error, fallback);
      expect(result.length).toBeLessThanOrEqual(100);
    });
  });

  // =========================================================================
  // parseError
  // =========================================================================

  describe('parseError', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns "Admin service unavailable" for 503 with admin_disabled', async () => {
      const res = {
        status: 503,
        json: async () => ({ error: 'admin_disabled' }),
      } as unknown as Response;

      const result = await parseError(res);
      expect(result).toBe('Admin service unavailable');
    });

    it('returns session expired message for 401', async () => {
      const res = {
        status: 401,
        json: async () => ({ error: 'Token expired' }),
      } as unknown as Response;

      const result = await parseError(res);
      expect(result).toContain('Session expired');
      expect(result).toContain('log in again');
    });

    it('parses error string from response', async () => {
      const res = {
        status: 400,
        json: async () => ({ error: 'Validation failed for store name' }),
      } as unknown as Response;

      const result = await parseError(res);
      expect(result).toBe('Validation failed for store name');
    });

    it('parses error.message from response object error', async () => {
      const res = {
        status: 400,
        json: async () => ({ error: { message: 'Invalid format for email' } }),
      } as unknown as Response;

      const result = await parseError(res);
      expect(result).toContain('Invalid format');
    });

    it('parses message field from response', async () => {
      const res = {
        status: 422,
        json: async () => ({ message: 'Required field missing' }),
      } as unknown as Response;

      const result = await parseError(res);
      expect(result).toBe('Required field missing');
    });

    it('returns fallback when no error or message', async () => {
      const res = {
        status: 500,
        json: async () => ({}),
      } as unknown as Response;

      const result = await parseError(res);
      expect(result).toBe('Request failed (500)');
    });

    it('handles json parse failure', async () => {
      const res = {
        status: 500,
        json: async () => { throw new Error('Invalid JSON'); },
      } as unknown as Response;

      const result = await parseError(res);
      expect(result).toBe('Request failed (500)');
    });

    it('sanitizes sensitive error messages', async () => {
      const res = {
        status: 500,
        json: async () => ({ error: 'connection to postgres refused at port 5432' }),
      } as unknown as Response;

      const result = await parseError(res);
      expect(result).toBe('Request failed (500)');
    });
  });
});
