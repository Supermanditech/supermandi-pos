#!/usr/bin/env node
/**
 * Updates 7 frozen canonical tickets with R5 revalidation notes.
 * These findings were re-confirmed by R5 comprehensive audit but already
 * have existing tickets, so we add a revalidation annotation.
 */
const fs = require('fs');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', '..', 'workflow', 'tickets');
const NOW = new Date().toISOString();

const R5_MAP = {
  'LIVE.POS.CAMERA_TIMEOUT_COPY_PARITY.001': {
    r5Id: 'R5-POS-004',
    reason: 'Revalidation: camera idle timeout hint text says 5s but actual timeout is 45s. R5 audit re-confirmed finding.',
  },
  'LIVE.POS.FORCE_UPDATE_IOS_APPSTORE_URL.001': {
    r5Id: 'R5-POS-005',
    reason: 'Revalidation: empty APP_STORE_URL sends iOS users to Play Store. R5 audit re-confirmed as operator dependency.',
  },
  'LIVE.RET.SKU_PDF_AUTH_DOWNLOAD_PATH.001': {
    r5Id: 'R5-RET-013',
    reason: 'Revalidation: SKU label PDF download request missing Authorization header. R5 audit re-confirmed finding.',
  },
  'LIVE.SA.RBAC_TAB_ACTION_ENFORCEMENT.001': {
    r5Id: 'R5-SA-006',
    reason: 'Revalidation: no RBAC enforcement at tab level. R5 audit re-confirmed finding.',
  },
  'LIVE.SA.WHATSAPP_PHONE_VALIDATION.001': {
    r5Id: 'R5-SA-015',
    reason: 'Revalidation: phone number validation minimal. R5 audit re-confirmed finding.',
  },
  'LIVE.SA.STORE_DIRECTORY_PAGINATION.001': {
    r5Id: 'R5-SA-020',
    reason: 'Revalidation: store directory fetches all stores without pagination. R5 audit re-confirmed finding.',
  },
  'LIVE.BE.JWT_ADMIN_ISSUER_ENFORCEMENT.001': {
    r5Id: 'R5-BE-013',
    reason: 'Revalidation: admin session JWT issuer mismatch. R5 audit re-confirmed finding.',
  },
};

let updated = 0;

for (const [ticketId, mapping] of Object.entries(R5_MAP)) {
  const filepath = path.join(TICKETS_DIR, `${ticketId}.json`);
  if (!fs.existsSync(filepath)) {
    console.log(`MISSING: ${ticketId} — file not found`);
    continue;
  }

  const ticket = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  const existing = ticket.dependencyDisclosure?.notes || '';

  if (existing.includes('R5_REVALIDATION')) {
    console.log(`ALREADY: ${ticketId} — R5 note already present`);
    continue;
  }

  const r5Note = ` R5_REVALIDATION(${mapping.r5Id}): ${mapping.reason} Source: AUDIT_R5_COMPREHENSIVE_F05165B8.md. Audit SHA: f05165b8.`;
  ticket.dependencyDisclosure.notes = existing + r5Note;
  ticket.timestamps.updatedAt = NOW;

  fs.writeFileSync(filepath, JSON.stringify(ticket, null, 2) + '\n');
  updated++;
  console.log(`UPDATED: ${ticketId} <- R5 revalidation note for ${mapping.r5Id}`);
}

console.log(`\nTotal updated: ${updated}`);
