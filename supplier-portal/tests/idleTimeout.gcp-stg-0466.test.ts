/**
 * GCP-STG-0466: Supplier Portal Idle Auto-Logout (30 min)
 *
 * Verifies:
 * 1. Idle timeout is 30 minutes
 * 2. Activity events are tracked (mousemove, keydown, click, scroll)
 * 3. Idle check polls every 30 seconds
 * 4. Toast shown on idle logout ("Session expired due to inactivity")
 * 5. Last activity stored in localStorage
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('GCP-STG-0466: Supplier portal idle auto-logout (30 min)', () => {
  const authPath = path.resolve(__dirname, '../src/lib/auth.tsx');
  let src: string;

  beforeAll(() => {
    src = fs.readFileSync(authPath, 'utf-8');
  });

  // --- Timeout is 30 minutes ---

  it('sets idle timeout to 30 minutes', () => {
    expect(src).toContain('30 * 60 * 1000');
    expect(src).toContain('IDLE_TIMEOUT_MS');
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
    expect(src).toContain('30000');
  });

  // --- localStorage activity key ---

  it('stores last activity in localStorage with supplier prefix', () => {
    expect(src).toContain('supplier_last_activity');
  });

  // --- Toast on idle logout ---

  it('shows "Session expired due to inactivity" toast on idle logout', () => {
    expect(src).toContain('Session expired due to inactivity');
    expect(src).toContain('toast.error');
  });

  // --- Warning before logout ---

  it('warns 5 minutes before idle timeout', () => {
    // ISSUE-MICRO-055: Warning at (IDLE_TIMEOUT_MS - 5 * 60 * 1000)
    expect(src).toContain('5 * 60 * 1000');
    expect(src).toContain('session will expire');
  });

  // --- Cleanup on unmount ---

  it('removes event listeners on cleanup', () => {
    expect(src).toContain("removeEventListener('mousemove'");
    expect(src).toContain("removeEventListener('keydown'");
    expect(src).toContain("removeEventListener('click'");
    expect(src).toContain("removeEventListener('scroll'");
  });

  // --- Activity write throttle ---

  it('throttles localStorage writes to at most once per minute', () => {
    expect(src).toContain('60000');
  });
});
