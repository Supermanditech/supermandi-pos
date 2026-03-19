/**
 * V3-FIX-187: Supplier allocations page — runtime wiring tests
 * Uses Jest (supplier-portal canonical runner).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const pageSrc = readFileSync(join(__dirname, '../app/(dashboard)/allocations/page.tsx'), 'utf-8');
const layoutSrc = readFileSync(join(__dirname, '../app/(dashboard)/layout.tsx'), 'utf-8');
const apiSrc = readFileSync(join(__dirname, '../lib/demandAllocations.ts'), 'utf-8');

describe('supplier allocations page wiring', () => {
  it('page imports listAllocations, getAllocation, updateAllocationStatus', () => {
    expect(pageSrc).toContain('listAllocations');
    expect(pageSrc).toContain('getAllocation');
    expect(pageSrc).toContain('updateAllocationStatus');
  });

  it('page has status filter dropdown', () => {
    expect(pageSrc).toContain('setStatusFilter');
    expect(pageSrc).toContain('<select');
  });

  it('page renders allocation rows with status transitions', () => {
    expect(pageSrc).toContain('STATUS_ACTIONS');
    expect(pageSrc).toContain('handleTransition');
    expect(pageSrc).toContain("nextStatus: 'accepted'");
    expect(pageSrc).toContain("nextStatus: 'partial_accepted'");
    expect(pageSrc).toContain("nextStatus: 'rejected'");
    expect(pageSrc).toContain("nextStatus: 'dispatched'");
    expect(pageSrc).toContain("nextStatus: 'delivered'");
  });

  it('page shows detail panel on click', () => {
    expect(pageSrc).toContain('handleViewDetail');
    expect(pageSrc).toContain('Allocation Detail');
    expect(pageSrc).toContain('detail.triggeredAt');
    expect(pageSrc).toContain('detail.dispatchedAt');
  });

  it('page handles loading/error/empty states', () => {
    expect(pageSrc).toContain('Loading allocations...');
    expect(pageSrc).toContain('No allocations found');
    expect(pageSrc).toContain('text-red-500');
  });

  it('page disables buttons during transition', () => {
    expect(pageSrc).toContain('disabled={transitioning === a.id}');
  });
});

describe('supplier nav includes allocations', () => {
  it('layout.tsx navItems has allocations link', () => {
    expect(layoutSrc).toContain("href: '/allocations'");
    expect(layoutSrc).toContain("label: 'Allocations'");
    expect(layoutSrc).toContain('GitBranch');
  });
});

describe('supplier API client contract', () => {
  it('demandAllocations.ts exports required functions', () => {
    expect(apiSrc).toContain('export async function listAllocations');
    expect(apiSrc).toContain('export async function getAllocation');
    expect(apiSrc).toContain('export async function updateAllocationStatus');
  });

  it('API client uses correct endpoints', () => {
    expect(apiSrc).toContain('/api/v1/supplier/allocations');
  });

  it('API client sends PATCH for status updates', () => {
    expect(apiSrc).toContain('method: "PATCH"');
  });
});
