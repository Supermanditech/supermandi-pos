#!/usr/bin/env node
const fs = require('fs');
const files = fs.readdirSync('workflow/tickets').filter(f => f.match(/^R7\.(RET|SA|SUP)\./)).sort();
const KNOWN = ['UNAUTHENTICATED','TYPE_SAFETY','BROWSER_STORAGE','NETWORK_CALLS_WITHOUT_ABORT','HIGH_COMPLEXITY','LARGE_COMPONENT','MEDIUM_COMPLEXITY','USEEFFECT_EMPTY','POLLING_TIMER','UI_UX_PARITY_REVIEW','CONSOLE_LOG','RESIDUAL_CONSOLE','I18N','HARDCODED_URL','TODO_FIXME','NATIVE_ALERT'];
for (const f of files) {
  const t = JSON.parse(fs.readFileSync('workflow/tickets/' + f, 'utf8'));
  if (t.status !== 'todo') continue;
  const id = t.ticketId;
  const m = id.match(/R7\.(RET|SA|SUP)\.\d+\.(.+)/);
  const pattern = m ? m[2] : 'UNKNOWN';
  const isKnown = KNOWN.some(k => pattern.includes(k));
  if (!isKnown) {
    console.log(id);
    console.log('  sev:', t.severity, '|', t.title.substring(0, 80));
  }
}
