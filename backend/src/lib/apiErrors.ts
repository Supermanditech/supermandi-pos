/**
 * ISSUE-MICRO-088: Centralized error response format
 *
 * Standard format: { error: { code: string, message: string } }
 *
 * Usage:
 *   import { errorJson } from '../lib/apiErrors';
 *   return res.status(400).json(errorJson("VALIDATION_ERROR", "Name is required"));
 */

export function errorJson(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}
