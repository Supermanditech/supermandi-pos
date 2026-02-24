#!/usr/bin/env node
/**
 * Build strict R7 dedupe scope against:
 *   - canonical 203 LIVE tickets
 *   - all R5 tickets (172)
 *   - all R6 tickets (116)
 *
 * Output:
 *   workflow/state/subagent_checkpoints/R7_dedupe_scope_203_172_116.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TICKETS_DIR = path.join(ROOT, 'workflow', 'tickets');
const CANONICAL_FILE = path.join(
  ROOT,
  'RELEASES',
  'AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json'
);
const OUT_FILE = path.join(
  ROOT,
  'workflow',
  'state',
  'subagent_checkpoints',
  'R7_dedupe_scope_203_172_116.json'
);

const EXPECTED = {
  canonical203: 203,
  r5: 172,
  r6: 116,
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortDescription(desc, max = 220) {
  const text = String(desc || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function readTickets() {
  const files = fs.readdirSync(TICKETS_DIR).filter((f) => f.endsWith('.json'));
  const byId = new Map();

  for (const file of files) {
    const fullPath = path.join(TICKETS_DIR, file);
    const ticket = readJson(fullPath);
    if (!ticket.ticketId) {
      throw new Error(`Missing ticketId in ${file}`);
    }
    byId.set(ticket.ticketId, {
      fileName: file,
      ticket,
    });
  }

  return byId;
}

function ensureExpectedCounts(canonicalIds, allTicketIds) {
  const r5 = allTicketIds.filter((id) => id.startsWith('R5.'));
  const r6 = allTicketIds.filter((id) => id.startsWith('R6.'));

  if (canonicalIds.length !== EXPECTED.canonical203) {
    throw new Error(
      `Canonical list count mismatch: expected ${EXPECTED.canonical203}, got ${canonicalIds.length}`
    );
  }
  if (r5.length !== EXPECTED.r5) {
    throw new Error(`R5 count mismatch: expected ${EXPECTED.r5}, got ${r5.length}`);
  }
  if (r6.length !== EXPECTED.r6) {
    throw new Error(`R6 count mismatch: expected ${EXPECTED.r6}, got ${r6.length}`);
  }

  return { r5, r6 };
}

function buildScopeEntries(scopeIds, ticketById) {
  const entries = [];
  for (const ticketId of scopeIds) {
    const row = ticketById.get(ticketId);
    if (!row) {
      throw new Error(`Scope ticket not found on disk: ${ticketId}`);
    }

    const t = row.ticket;
    const titleNorm = normalizeText(t.title);
    const surfaceNorm = normalizeText(t.surface);
    const descNorm = normalizeText(shortDescription(t.description, 300));

    entries.push({
      ticketId,
      fileName: row.fileName,
      surface: t.surface || null,
      severity: t.severity || null,
      status: t.status || null,
      title: t.title || null,
      titleNormalized: titleNorm,
      descriptionSnippet: shortDescription(t.description),
      dedupeKeys: {
        id: normalizeText(ticketId),
        title: titleNorm,
        surfaceTitle: normalizeText(`${surfaceNorm} ${titleNorm}`),
        titlePlusDesc: normalizeText(`${titleNorm} ${descNorm}`),
      },
    });
  }
  return entries;
}

function buildCollisionSummary(entries) {
  const map = new Map();
  for (const e of entries) {
    const k = e.dedupeKeys.surfaceTitle;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e.ticketId);
  }

  const collisions = [];
  for (const [key, ids] of map.entries()) {
    if (ids.length > 1) {
      collisions.push({ key, ticketIds: ids });
    }
  }

  collisions.sort((a, b) => b.ticketIds.length - a.ticketIds.length);
  return collisions;
}

function currentHeadShort() {
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --short HEAD', { cwd: ROOT })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function main() {
  const canonical = readJson(CANONICAL_FILE);
  const canonicalIds = [...canonical.canonicalTickets.allFinal];
  const ticketById = readTickets();
  const allTicketIds = [...ticketById.keys()];
  const { r5, r6 } = ensureExpectedCounts(canonicalIds, allTicketIds);

  const scopeIds = [...canonicalIds, ...r5.sort(), ...r6.sort()];
  const uniqueScopeIds = [...new Set(scopeIds)];
  if (uniqueScopeIds.length !== EXPECTED.canonical203 + EXPECTED.r5 + EXPECTED.r6) {
    throw new Error(
      `Unique scope count mismatch: expected ${EXPECTED.canonical203 + EXPECTED.r5 + EXPECTED.r6}, got ${uniqueScopeIds.length}`
    );
  }

  const entries = buildScopeEntries(uniqueScopeIds, ticketById);
  const collisions = buildCollisionSummary(entries);

  const out = {
    generatedAt: new Date().toISOString(),
    headSha: currentHeadShort(),
    policy: {
      name: 'R7 Dedupe Scope',
      statement:
        'Deduplicate R7 findings only against canonical 203 + R5(172) + R6(116).',
      strictScopeOnly: true,
      sources: [
        'RELEASES/AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json',
        'workflow/tickets/R5.*.json',
        'workflow/tickets/R6.*.json',
      ],
    },
    expectedCounts: EXPECTED,
    actualCounts: {
      canonical203: canonicalIds.length,
      r5: r5.length,
      r6: r6.length,
      totalScope: uniqueScopeIds.length,
    },
    scopeTicketIds: uniqueScopeIds,
    byPrefix: {
      LIVE: canonicalIds.length,
      R5: r5.length,
      R6: r6.length,
    },
    collisionsBySurfaceTitle: collisions,
    entries,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  console.log(`Wrote: ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`Scope counts -> LIVE(canonical): ${canonicalIds.length}, R5: ${r5.length}, R6: ${r6.length}`);
  console.log(`Total dedupe scope: ${uniqueScopeIds.length}`);
  console.log(`Collision groups (surface+title): ${collisions.length}`);
}

main();

