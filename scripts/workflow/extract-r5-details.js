#!/usr/bin/env node
// Extract R5 finding details: ID, severity, screen, dimension, title/summary
const fs = require('fs');

const transcriptPath = 'C:/Users/jisal/.claude/projects/c--supermandi-pos/63f3e90c-5ffe-49f5-a21e-687b8d2bb844.jsonl';
const data = fs.readFileSync(transcriptPath, 'utf8');

// Build a comprehensive text from all lines containing R5 findings
const lines = data.split('\n');
const findingDetails = {};

for (const line of lines) {
  if (line.indexOf('R5-') === -1) continue;

  // Try to parse finding blocks from the text
  // Pattern 1: "### FINDING: R5-XXX-NNN" blocks
  // Pattern 2: "| R5-XXX-NNN | Screen | Dimension | Severity | summary |"
  // Pattern 3: "R5-XXX-NNN: summary" or "**R5-XXX-NNN**"

  const idPattern = /R5-(POS|RET|SUP|SA|BE)-(\d{3})/g;
  let match;
  while ((match = idPattern.exec(line)) !== null) {
    const id = match[0];
    const idx = match.index;

    // Get surrounding context (500 chars after the ID)
    const after = line.substring(idx, Math.min(idx + 600, line.length));

    // Try to extract severity
    const sevMatch = after.match(/\*\*?(P[0-3])\*\*?/);
    const sevMatch2 = after.match(/Severity["\s:]*\*?\*?(P[0-3])/i);

    // Try to extract summary
    const sumMatch = after.match(/Summary["\s:]*\*?\*?([^"\\*|]{10,200})/i);
    const titleMatch = after.match(/(?:title|One-Line|Issue)["\s:|]*([^"\\|]{10,200})/i);

    if (findingDetails[id] === undefined) {
      findingDetails[id] = {
        severity: null,
        summary: null,
        raw: []
      };
    }

    const sev = sevMatch ? sevMatch[1] : (sevMatch2 ? sevMatch2[1] : null);
    const sum = sumMatch ? sumMatch[1].trim() : (titleMatch ? titleMatch[1].trim() : null);

    if (sev && findingDetails[id].severity === null) findingDetails[id].severity = sev;
    if (sum && findingDetails[id].summary === null) findingDetails[id].summary = sum;

    // Store raw context for manual inspection
    if (findingDetails[id].raw.length < 3) {
      findingDetails[id].raw.push(after.replace(/\\n/g, ' ').substring(0, 200));
    }
  }
}

// Output as JSON for the generator script
const output = {};
const sorted = Object.keys(findingDetails).sort();

for (const id of sorted) {
  const d = findingDetails[id];
  output[id] = {
    severity: d.severity,
    summary: d.summary,
    raw: d.raw[0] || ''
  };
}

fs.writeFileSync('workflow/state/r5_finding_details.json', JSON.stringify(output, null, 2));
console.log('Extracted details for', sorted.length, 'findings');
console.log('Written to workflow/state/r5_finding_details.json');

// Print summary
let withSev = 0, withSum = 0;
for (const id of sorted) {
  if (output[id].severity) withSev++;
  if (output[id].summary) withSum++;
}
console.log('With severity:', withSev, '/ With summary:', withSum);
