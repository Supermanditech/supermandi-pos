const fs = require('fs');
const path = require('path');
const dir = 'workflow/tickets';
const files = fs.readdirSync(dir).filter(f => f.startsWith('R6.'));
const tickets = files.map(f => {
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return { id: t.ticketId, severity: t.severity, riskClass: t.riskClass, surface: t.surface, status: t.status };
});
const sevOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
const surfOrder = { backend: 0, cross_function: 1, mobile: 2, retailer_admin: 3, supplier_portal: 4, superadmin: 5 };
tickets.sort((a, b) => {
  const sa = sevOrder[a.severity] ?? 9;
  const sb = sevOrder[b.severity] ?? 9;
  if (sa !== sb) return sa - sb;
  const ua = surfOrder[a.surface] ?? 9;
  const ub = surfOrder[b.surface] ?? 9;
  return ua - ub;
});
console.log('=== R6 EXECUTION QUEUE ===');
console.log('Severity breakdown:');
const counts = {};
tickets.forEach(t => { counts[t.severity] = (counts[t.severity] || 0) + 1; });
Object.entries(counts).sort().forEach(([s, c]) => console.log(`  ${s}: ${c}`));
console.log('');
console.log('Queue (priority order):');
tickets.forEach((t, i) => {
  console.log(`${(i+1).toString().padStart(3)}. [${t.severity}] ${t.id}`);
});
