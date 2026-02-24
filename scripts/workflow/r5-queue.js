#!/usr/bin/env node
const fs = require('fs');
const dir = 'workflow/tickets';
const r5 = fs.readdirSync(dir).filter(f => f.startsWith('R5.'));
const tickets = r5.map(f => {
  const t = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
  return { id: t.ticketId, risk: t.riskClass, surface: t.surface, title: t.title, status: t.statusHistory[t.statusHistory.length - 1].to };
});
const riskOrder = { critical: 1, high: 2, medium: 3 };
const surfaceOrder = { backend: 1, pos: 2, retailer_web: 3, supplier_web: 4, superadmin_web: 5 };
tickets.sort((a, b) => {
  const rd = (riskOrder[a.risk] || 99) - (riskOrder[b.risk] || 99);
  if (rd !== 0) return rd;
  const sd = (surfaceOrder[a.surface] || 99) - (surfaceOrder[b.surface] || 99);
  if (sd !== 0) return sd;
  return a.id.localeCompare(b.id);
});
console.log('=== R5 Implementation Queue (priority order) ===');
console.log('Total:', tickets.length);
console.log('');
console.log('--- CRITICAL (18) ---');
tickets.filter(t => t.risk === 'critical').forEach((t, i) => console.log((i + 1) + '.', t.id, '|', t.surface, '|', t.title.substring(0, 80)));
console.log('');
console.log('--- HIGH (first 15 of ' + tickets.filter(t => t.risk === 'high').length + ') ---');
tickets.filter(t => t.risk === 'high').slice(0, 15).forEach((t, i) => console.log((i + 1) + '.', t.id, '|', t.surface, '|', t.title.substring(0, 80)));
console.log('');
console.log('Queue head:', tickets[0].id, '|', tickets[0].risk, '|', tickets[0].surface);
