#!/usr/bin/env node
const fs = require('fs');

const transcriptPath = 'C:/Users/jisal/.claude/projects/c--supermandi-pos/63f3e90c-5ffe-49f5-a21e-687b8d2bb844.jsonl';
const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
const allIds = new Set();
const findingContexts = {};

for (const line of lines) {
  if (line.indexOf('R5-') === -1) continue;
  const matches = line.match(/R5-(POS|RET|SUP|SA|BE)-\d{3}/g);
  if (matches) {
    for (const m of matches) {
      allIds.add(m);
      if (findingContexts[m] === undefined) {
        // Extract some context around the finding ID
        const idx = line.indexOf(m);
        const snippet = line.substring(idx, Math.min(idx + 400, line.length));
        findingContexts[m] = snippet.replace(/\\n/g, ' ').substring(0, 250);
      }
    }
  }
}

const sorted = [...allIds].sort();
console.log('Unique R5 finding IDs:', sorted.length);
console.log('---');
for (const id of sorted) {
  console.log(id);
}
