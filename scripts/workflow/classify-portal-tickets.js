#!/usr/bin/env node
const fs = require('fs');
const files = fs.readdirSync('workflow/tickets').filter(f => f.match(/^R7\.(RET|SA|SUP)\./)).sort();
const groups = {};
for (const f of files) {
  const t = JSON.parse(fs.readFileSync('workflow/tickets/' + f, 'utf8'));
  if (t.status !== 'todo') continue;
  const id = t.ticketId;
  const m = id.match(/R7\.(RET|SA|SUP)\.\d+\.(.+)/);
  const pattern = m ? m[2] : 'UNKNOWN';
  let type = 'OTHER';
  if (id.includes('UNAUTHENTICATED')) type = 'UNAUTH';
  else if (pattern.includes('NATIVE_ALERT')) type = 'NATIVE_ALERT';
  else if (pattern.includes('NETWORK_CALLS_WITHOUT_ABORT')) type = 'ABORT_GUARD';
  else if (pattern.includes('USEEFFECT_EMPTY')) type = 'USEEFFECT_EMPTY';
  else if (pattern.includes('TYPE_SAFETY')) type = 'TYPE_SAFETY';
  else if (pattern.includes('HIGH_COMPLEXITY') || pattern.includes('LARGE_COMPONENT') || pattern.includes('MEDIUM_COMPLEXITY')) type = 'COMPLEXITY';
  else if (pattern.includes('POLLING_TIMER')) type = 'POLLING_TIMER';
  else if (pattern.includes('UI_UX_PARITY_REVIEW')) type = 'UX_PARITY';
  else if (pattern.includes('CONSOLE_LOG') || pattern.includes('CONSOLE_LOGGING')) type = 'CONSOLE_LOG';
  else if (pattern.includes('I18N')) type = 'I18N';
  else if (pattern.includes('BROWSER_STORAGE')) type = 'BROWSER_STORAGE';
  else if (pattern.includes('TODO_FIXME')) type = 'TODO_FIXME';
  else if (pattern.includes('HARDCODED_EXTERNAL_URL') || pattern.includes('HARDCODED_URL')) type = 'HARDCODED_URL';
  else if (pattern.includes('RESIDUAL_CONSOLE')) type = 'CONSOLE_LOG';
  if (!groups[type]) groups[type] = [];
  groups[type].push(id);
}
for (const [k, v] of Object.entries(groups)) {
  console.log(k + ' (' + v.length + ')');
  if (v.length <= 3) v.forEach(id => console.log('  ' + id));
}
