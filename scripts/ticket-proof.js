#!/usr/bin/env node
/**
 * Ticket Completion Proof Script
 *
 * Verifies each ticket in docs/TICKETS_DONE.json has evidence in the repo:
 * - Required files exist
 * - Required endpoints exist (via code pattern matching)
 * - Key code markers exist
 *
 * Usage: node scripts/ticket-proof.js [--verbose] [--ticket ID]
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

const TICKETS_FILE = path.join(__dirname, '..', 'docs', 'TICKETS_DONE.json');
const ROOT_DIR = path.join(__dirname, '..');

// Colors for console output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// =============================================================================
// HELPERS
// =============================================================================

function colorize(text, color) {
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

function fileExists(filePath) {
  const fullPath = path.join(ROOT_DIR, filePath);
  return fs.existsSync(fullPath);
}

function fileContains(filePath, pattern) {
  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) return false;

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    if (pattern instanceof RegExp) {
      return pattern.test(content);
    }
    return content.includes(pattern);
  } catch (err) {
    return false;
  }
}

function checkEndpoint(method, routePath) {
  // Search for endpoint pattern in route files
  const routeFiles = [
    'backend/src/routes/v1/pos/translations.ts',
    'backend/src/routes/v1/pos/index.ts',
    'backend/src/routes/index.ts',
    'backend/services/catalog-service/src/routes/catalog.ts',
    'backend/src/app.ts',
  ];

  const methodPattern = method.toLowerCase();
  // Match patterns like: router.get('/path, router.post('/path', app.get('/path'
  const pathPattern = routePath.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/');
  const regex = new RegExp(`\\.(${methodPattern})\\s*\\([^)]*['"\`].*${pathPattern}`, 'i');

  for (const file of routeFiles) {
    if (fileContains(file, regex)) {
      return { found: true, file };
    }
  }

  // Also check for the path pattern in any file
  for (const file of routeFiles) {
    if (fileContains(file, routePath.replace(/:[^/]+/g, ''))) {
      return { found: true, file };
    }
  }

  return { found: false };
}

// =============================================================================
// TICKET VERIFICATION
// =============================================================================

function verifyTicket(ticket, verbose = false) {
  const results = {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    pass: true,
    evidence: {
      files: [],
      codeMarkers: [],
      endpoints: [],
    },
    missing: [],
  };

  // Skip non-done tickets
  if (ticket.status !== 'done') {
    results.pass = true;
    results.skipped = true;
    return results;
  }

  const evidence = ticket.evidence || {};

  // Check required files
  if (evidence.files && evidence.files.length > 0) {
    for (const file of evidence.files) {
      const exists = fileExists(file);
      results.evidence.files.push({ file, exists });
      if (!exists) {
        results.pass = false;
        results.missing.push(`File: ${file}`);
      }
    }
  }

  // Check code markers
  if (evidence.codeMarkers && evidence.codeMarkers.length > 0) {
    for (const marker of evidence.codeMarkers) {
      const contains = fileContains(marker.file, marker.pattern);
      results.evidence.codeMarkers.push({
        file: marker.file,
        pattern: marker.pattern,
        found: contains,
      });
      if (!contains) {
        results.pass = false;
        results.missing.push(`Code marker: "${marker.pattern}" in ${marker.file}`);
      }
    }
  }

  // Check endpoints
  if (evidence.endpoints && evidence.endpoints.length > 0) {
    for (const endpoint of evidence.endpoints) {
      const check = checkEndpoint(endpoint.method, endpoint.path);
      results.evidence.endpoints.push({
        method: endpoint.method,
        path: endpoint.path,
        found: check.found,
        file: check.file,
      });
      if (!check.found) {
        results.pass = false;
        results.missing.push(`Endpoint: ${endpoint.method} ${endpoint.path}`);
      }
    }
  }

  return results;
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const ticketIdArg = args.find(a => a.startsWith('--ticket='));
  const specificTicket = ticketIdArg ? ticketIdArg.split('=')[1] : null;

  console.log(colorize('\n╔══════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(colorize('║            TICKET COMPLETION PROOF SYSTEM                     ║', 'cyan'));
  console.log(colorize('╚══════════════════════════════════════════════════════════════╝\n', 'cyan'));

  // Load tickets
  if (!fs.existsSync(TICKETS_FILE)) {
    console.log(colorize('ERROR: docs/TICKETS_DONE.json not found!', 'red'));
    process.exit(1);
  }

  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf-8'));
  } catch (err) {
    console.log(colorize(`ERROR: Failed to parse TICKETS_DONE.json: ${err.message}`, 'red'));
    process.exit(1);
  }

  const tickets = ticketsData.tickets || [];
  console.log(`Version: ${ticketsData.version}`);
  console.log(`Last Updated: ${ticketsData.lastUpdated}`);
  console.log(`Total Tickets: ${tickets.length}\n`);

  // Filter to specific ticket if requested
  const ticketsToCheck = specificTicket
    ? tickets.filter(t => t.id === specificTicket)
    : tickets;

  if (specificTicket && ticketsToCheck.length === 0) {
    console.log(colorize(`ERROR: Ticket ${specificTicket} not found!`, 'red'));
    process.exit(1);
  }

  // Verify each ticket
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const failedTickets = [];

  console.log(colorize('Ticket Proof Results:', 'bold'));
  console.log('─'.repeat(60));

  for (const ticket of ticketsToCheck) {
    const result = verifyTicket(ticket, verbose);

    if (result.skipped) {
      skipCount++;
      console.log(`${colorize('SKIP', 'yellow')} ${ticket.id}: ${ticket.title} (status: ${ticket.status})`);
      continue;
    }

    if (result.pass) {
      passCount++;
      console.log(`${colorize('PASS', 'green')} ${ticket.id}: ${ticket.title}`);

      if (verbose) {
        for (const f of result.evidence.files) {
          console.log(`     ${colorize('✓', 'green')} File: ${f.file}`);
        }
        for (const m of result.evidence.codeMarkers) {
          console.log(`     ${colorize('✓', 'green')} Marker: "${m.pattern}" in ${m.file}`);
        }
        for (const e of result.evidence.endpoints) {
          console.log(`     ${colorize('✓', 'green')} Endpoint: ${e.method} ${e.path}`);
        }
      }
    } else {
      failCount++;
      failedTickets.push(result);
      console.log(`${colorize('FAIL', 'red')} ${ticket.id}: ${ticket.title}`);

      for (const missing of result.missing) {
        console.log(`     ${colorize('✗', 'red')} Missing: ${missing}`);
      }
    }
  }

  console.log('─'.repeat(60));

  // Summary
  console.log(colorize('\nSummary:', 'bold'));
  console.log(`  ${colorize('PASS:', 'green')} ${passCount}`);
  console.log(`  ${colorize('FAIL:', 'red')} ${failCount}`);
  console.log(`  ${colorize('SKIP:', 'yellow')} ${skipCount}`);
  console.log(`  Total: ${ticketsToCheck.length}`);

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    version: ticketsData.version,
    summary: {
      total: ticketsToCheck.length,
      pass: passCount,
      fail: failCount,
      skip: skipCount,
    },
    failedTickets: failedTickets.map(t => ({
      id: t.id,
      title: t.title,
      missing: t.missing,
    })),
  };

  // Write report
  const reportDir = path.join(ROOT_DIR, 'logs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportFile = path.join(reportDir, `ticket-proof-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${reportFile}`);

  // Exit with error if any failed
  if (failCount > 0) {
    console.log(colorize('\n❌ TICKET PROOF FAILED - Release blocked!', 'red'));
    process.exit(1);
  }

  console.log(colorize('\n✓ All tickets verified!', 'green'));
  process.exit(0);
}

main();
