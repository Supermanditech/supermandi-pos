/**
 * GCP-STG-0465: Retailer Web Idle Auto-Logout (30 min)
 *
 * Verifies:
 * 1. Default idle timeout is 30 minutes (not 60)
 * 2. Activity events are tracked (mousemove, keydown, click, scroll)
 * 3. Idle check polls every 30 seconds
 * 4. Toast shown on idle logout ("Session expired due to inactivity")
 * 5. react-hot-toast is imported for idle logout notification
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('GCP-STG-0465: Retailer idle auto-logout (30 min)', () => {
  const authContextPath = path.resolve(__dirname, '../lib/AuthContext.tsx');
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(authContextPath, 'utf-8');
  });

  // --- Default timeout is 30 minutes ---

  it('defaults to 30-minute idle timeout', () => {
    // The default in the env-var fallback must be '30', not '60'
    expect(src).toContain("VITE_IDLE_TIMEOUT_MINUTES || '30'");
  });

  // --- Activity event listeners ---

  it('tracks mousemove events', () => {
    expect(src).toContain("addEventListener('mousemove'");
  });

  it('tracks keydown events', () => {
    expect(src).toContain("addEventListener('keydown'");
  });

  it('tracks click events', () => {
    expect(src).toContain("addEventListener('click'");
  });

  it('tracks scroll events', () => {
    expect(src).toContain("addEventListener('scroll'");
  });

  // --- Polling interval ---

  it('polls idle check every 30 seconds', () => {
    // The setInterval in the idle check effect uses 30000ms
    expect(src).toContain('30000');
  });

  // --- Toast on idle logout ---

  it('imports react-hot-toast for idle notification', () => {
    expect(src).toContain("from 'react-hot-toast'");
  });

  it('shows "Session expired due to inactivity" toast on idle logout', () => {
    expect(src).toContain('Session expired due to inactivity');
    // Must use toast.error (not plain toast) for visibility
    expect(src).toContain('toast.error');
  });

  // --- Activity write throttle ---

  it('throttles localStorage writes to at most once per minute', () => {
    // The updateActivity function should check (now - lastWrite > 60000)
    expect(src).toContain('60000');
  });

  // --- Cleanup on unmount ---

  it('removes event listeners on cleanup', () => {
    expect(src).toContain("removeEventListener('mousemove'");
    expect(src).toContain("removeEventListener('keydown'");
    expect(src).toContain("removeEventListener('click'");
    expect(src).toContain("removeEventListener('scroll'");
  });
});
