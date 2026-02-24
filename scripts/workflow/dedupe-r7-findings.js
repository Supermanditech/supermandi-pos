#!/usr/bin/env node
/**
 * Deduplicate R7 findings against strict scope:
 *   canonical 203 + R5(172) + R6(116) = 491 tickets.
 *
 * Usage:
 *   node scripts/workflow/dedupe-r7-findings.js --in <findings.json> [--out <output.json>]
 *
 * Input formats supported:
 *   - Array of findings
 *   - Object with `findings` array
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCOPE_FILE = path.join(
  ROOT,
  'workflow',
  'state',
  'subagent_checkpoints',
  'R7_dedupe_scope_203_172_116.json'
);
const DEFAULT_OUT = path.join(
  ROOT,
  'workflow',
  'state',
  'subagent_checkpoints',
  'R7_dedupe_result.json'
);

function parseArgs(argv) {
  const args = { in: null, out: DEFAULT_OUT };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') args.in = argv[++i];
    else if (a === '--out') args.out = argv[++i];
  }
  if (!args.in) {
    throw new Error('Missing required argument: --in <findings.json>');
  }
  return args;
}

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

function tokens(text) {
  return new Set(normalizeText(text).split(' ').filter(Boolean));
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function headShort() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return null;
  }
}

function getFindings(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.findings)) return input.findings;
  throw new Error('Input must be an array or object containing `findings` array.');
}

function extractShape(finding) {
  return {
    id: finding.id || finding.findingId || null,
    title: finding.title || finding.issue || finding.summary || null,
    description:
      finding.description ||
      finding.impact ||
      finding.recommendation ||
      finding.details ||
      null,
    surface:
      finding.surface ||
      finding.screen ||
      finding.page ||
      finding.service ||
      finding.tab ||
      finding.flow ||
      null,
    severity: finding.severity || null,
  };
}

function buildIndexes(scope) {
  const byTicketId = new Map();
  const bySurfaceTitle = new Map();
  const byTitle = new Map();
  const titleTokenRows = [];

  for (const e of scope.entries) {
    const idKey = normalizeText(e.ticketId);
    byTicketId.set(idKey, e);

    const stKey = normalizeText(`${e.surface || ''} ${e.title || ''}`);
    if (!bySurfaceTitle.has(stKey)) bySurfaceTitle.set(stKey, []);
    bySurfaceTitle.get(stKey).push(e);

    const tKey = normalizeText(e.title || '');
    if (!byTitle.has(tKey)) byTitle.set(tKey, []);
    byTitle.get(tKey).push(e);

    titleTokenRows.push({
      entry: e,
      tokenSet: tokens(e.title || ''),
    });
  }

  return { byTicketId, bySurfaceTitle, byTitle, titleTokenRows };
}

function dedupeFinding(shape, idx) {
  const idKey = normalizeText(shape.id || '');
  if (idKey && idx.byTicketId.has(idKey)) {
    return {
      status: 'DUPLICATE',
      reason: 'ticket_id_match',
      matches: [idx.byTicketId.get(idKey).ticketId],
      score: 1,
    };
  }

  const stKey = normalizeText(`${shape.surface || ''} ${shape.title || ''}`);
  if (stKey && idx.bySurfaceTitle.has(stKey)) {
    return {
      status: 'DUPLICATE',
      reason: 'surface_title_exact',
      matches: idx.bySurfaceTitle.get(stKey).map((x) => x.ticketId),
      score: 1,
    };
  }

  const titleKey = normalizeText(shape.title || '');
  if (titleKey && idx.byTitle.has(titleKey)) {
    return {
      status: 'DUPLICATE',
      reason: 'title_exact',
      matches: idx.byTitle.get(titleKey).map((x) => x.ticketId),
      score: 1,
    };
  }

  const findingTokens = tokens(shape.title || '');
  let best = { score: 0, entry: null };
  for (const row of idx.titleTokenRows) {
    const score = jaccard(findingTokens, row.tokenSet);
    if (score > best.score) best = { score, entry: row.entry };
  }

  if (best.entry && best.score >= 0.92) {
    return {
      status: 'DUPLICATE',
      reason: 'title_fuzzy',
      matches: [best.entry.ticketId],
      score: Number(best.score.toFixed(4)),
    };
  }

  return {
    status: 'NET_NEW',
    reason: 'no_match',
    matches: [],
    score: Number(best.score.toFixed(4)),
  };
}

function main() {
  const args = parseArgs(process.argv);
  const scope = readJson(SCOPE_FILE);
  const inputObj = readJson(path.resolve(ROOT, args.in));
  const findings = getFindings(inputObj);
  const idx = buildIndexes(scope);

  const annotated = findings.map((f) => {
    const shape = extractShape(f);
    const result = dedupeFinding(shape, idx);
    return {
      ...f,
      dedupe: {
        scope: '203+172+116',
        status: result.status,
        reason: result.reason,
        matchedTicketIds: result.matches,
        confidence: result.score,
      },
    };
  });

  const counts = annotated.reduce(
    (acc, f) => {
      const st = f.dedupe.status;
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    },
    { DUPLICATE: 0, NET_NEW: 0 }
  );

  const out = {
    generatedAt: new Date().toISOString(),
    headSha: headShort(),
    inputFile: path.relative(ROOT, path.resolve(ROOT, args.in)),
    scopeFile: path.relative(ROOT, SCOPE_FILE),
    scopeTotal: scope.actualCounts.totalScope,
    totalFindings: findings.length,
    summary: counts,
    findings: annotated,
  };

  const outPath = path.resolve(ROOT, args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  console.log(`Wrote: ${path.relative(ROOT, outPath)}`);
  console.log(`Scope total: ${scope.actualCounts.totalScope}`);
  console.log(`Findings: ${findings.length}`);
  console.log(`NET_NEW: ${counts.NET_NEW}`);
  console.log(`DUPLICATE: ${counts.DUPLICATE}`);
}

main();

