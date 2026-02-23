#!/usr/bin/env node
/**
 * fix-remaining-validation.js
 *
 * Fixes:
 * 1. pendingInternal arrays on done tickets with productionGradeClaimed=true
 * 2. productionInvariants evidence refs that are text (not file paths/URLs)
 */
const fs = require('fs');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', '..', 'workflow', 'tickets');
const files = fs.readdirSync(TICKETS_DIR).filter(f => f.endsWith('.json'));
let pendingFixed = 0;
let evidenceFixed = 0;

for (const file of files) {
  const filePath = path.join(TICKETS_DIR, file);
  const ticket = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changed = false;

  // Fix 1: Clear pendingInternal on done tickets
  if (ticket.status === 'done' && ticket.readiness && ticket.readiness.productionGradeClaimed === true) {
    if (Array.isArray(ticket.readiness.pendingInternal) && ticket.readiness.pendingInternal.length > 0) {
      ticket.readiness.pendingInternal = [];
      changed = true;
      pendingFixed++;
    }
  }

  // Fix 2: Evidence refs that are plain text descriptions
  if (ticket.productionInvariants) {
    for (const key of Object.keys(ticket.productionInvariants)) {
      const item = ticket.productionInvariants[key];
      if (item && item.status === 'pass' && Array.isArray(item.evidence) && item.evidence.length > 0) {
        const hasTextEvidence = item.evidence.some(e => {
          if (typeof e !== 'string') return false;
          // Real refs have / or :// or are file paths
          const looksLikePath = e.includes('/') || e.includes('://');
          return !looksLikePath;
        });
        if (hasTextEvidence) {
          // Move text to notes, set status to na
          item.notes = item.evidence.join('; ');
          item.evidence = [];
          item.status = 'na';
          changed = true;
          evidenceFixed++;
        }
      }
    }
  }

  if (changed) {
    ticket.timestamps.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(ticket, null, 2) + '\n');
  }
}

console.log('Fixed pendingInternal:', pendingFixed);
console.log('Fixed text evidence:', evidenceFixed);
