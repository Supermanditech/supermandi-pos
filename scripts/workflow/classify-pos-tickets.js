#!/usr/bin/env node
const fs = require('fs');
const files = fs.readdirSync('workflow/tickets').filter(f => f.startsWith('R7.POS.')).sort();
const groups = {};
for (const f of files) {
  const t = JSON.parse(fs.readFileSync('workflow/tickets/' + f, 'utf8'));
  const d = t.description || '';
  const id = t.ticketId;
  const m = id.match(/R7\.POS\.\d+\.(.+)/);
  const pattern = m ? m[1] : 'UNKNOWN';
  let type = 'OTHER';
  if (d.includes('node_modules')) type = 'NODE_MODULES';
  else if (pattern.includes('NATIVE_ALERT')) type = 'NATIVE_ALERT';
  else if (pattern.includes('NETWORK_CALLS_WITHOUT_ABORT')) type = 'ABORT_GUARD';
  else if (pattern.includes('USEEFFECT_EMPTY')) type = 'USEEFFECT_EMPTY_DEP';
  else if (pattern.includes('TYPE_SAFETY')) type = 'TYPE_SAFETY_ANY';
  else if (pattern.includes('HIGH_COMPLEXITY') || pattern.includes('LARGE_COMPONENT') || pattern.includes('MEDIUM_COMPLEXITY') || pattern.includes('HIGH_COMPLEXITY')) type = 'COMPLEXITY';
  else if (pattern.includes('POLLING_TIMER')) type = 'POLLING_TIMER';
  else if (pattern.includes('UI_UX_PARITY_REVIEW')) type = 'UX_PARITY';
  else if (pattern.includes('CONSOLE_LOG') || pattern.includes('CONSOLE_LOGGING')) type = 'CONSOLE_LOG';
  else if (pattern.includes('I18N')) type = 'I18N';
  else if (pattern.includes('SUBMITTINGREF')) type = 'SUBMITTING_REF';
  else if (pattern.includes('APP_STORE')) type = 'APP_STORE';
  else if (pattern.includes('PAN_AADHAAR')) type = 'PAN_AADHAAR';
  else if (pattern.includes('RATE_LIMITING')) type = 'RATE_LIMITING';
  else if (pattern.includes('TAB_SWITCH')) type = 'TAB_SWITCH';
  else if (pattern.includes('SILENT_1000')) type = 'PRODUCT_CAP';
  else if (pattern.includes('HARDCODED_EXTERNAL_URL')) type = 'HARDCODED_URL';
  else if (pattern.includes('TODO_FIXME')) type = 'TODO_FIXME';
  if (!groups[type]) groups[type] = [];
  groups[type].push(t.ticketId);
}
for (const [k, v] of Object.entries(groups)) {
  console.log(k + ' (' + v.length + ')');
  if (v.length <= 5) v.forEach(id => console.log('  ' + id));
}
