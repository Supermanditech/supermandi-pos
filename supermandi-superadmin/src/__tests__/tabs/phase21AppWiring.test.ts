/**
 * V3-HARDEN-185 + V3-FIX-187: Prove demand/allocation tabs are wired in App.tsx
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const appSrc = readFileSync(join(__dirname, '../../App.tsx'), 'utf-8');
const typesSrc = readFileSync(join(__dirname, '../../types.ts'), 'utf-8');

describe('SuperAdmin Phase 21 app wiring proof', () => {
  it('TabKey type includes demand-pressure and allocations', () => {
    expect(typesSrc).toContain('"demand-pressure"');
    expect(typesSrc).toContain('"allocations"');
  });

  it('TAB_LABELS has entries for both tabs', () => {
    expect(appSrc).toContain('"demand-pressure": "Demand Pressure"');
    expect(appSrc).toContain('"allocations": "Allocations"');
  });

  it('DemandPressureTab imported and rendered', () => {
    expect(appSrc).toContain('import { DemandPressureTab }');
    expect(appSrc).toContain('tab === "demand-pressure" && <DemandPressureTab');
  });

  it('AllocationsDashboardTab imported and rendered', () => {
    expect(appSrc).toContain('import { AllocationsDashboardTab }');
    expect(appSrc).toContain('tab === "allocations" && <AllocationsDashboardTab');
  });

  it('sidebar buttons exist for both tabs', () => {
    expect(appSrc).toContain('setTab("demand-pressure")');
    expect(appSrc).toContain('setTab("allocations")');
  });

  it('mobile tabs exist for both', () => {
    expect(appSrc).toContain('aria-selected={tab === "demand-pressure"}');
    expect(appSrc).toContain('aria-selected={tab === "allocations"}');
  });
});
