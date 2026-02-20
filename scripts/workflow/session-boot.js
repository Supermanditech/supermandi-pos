#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const STATE_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'workflow_state.json');
const GUARD_SCRIPT = path.join(ROOT_DIR, 'scripts', 'workflow', 'guard.js');
const REQUIRED_FILES = [
  'workflow/state/workflow_state.json',
  'workflow/schemas/ticket.schema.json',
  'workflow/schemas/screen_state.schema.json',
  'workflow/state/staging_batch.json',
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function getArg(flag) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) {
    return '';
  }
  return args[idx + 1];
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`cannot read JSON ${filePath}: ${error.message}`);
  }
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function toRepoRelative(filePath) {
  return path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
}

function main() {
  const fileArg = getArg('--file');
  if (!fileArg) {
    fail('usage: node scripts/workflow/session-boot.js --file workflow/tickets/<ticket>.json');
  }
  const ticketPath = path.isAbsolute(fileArg) ? fileArg : path.join(ROOT_DIR, fileArg);
  if (!fs.existsSync(ticketPath)) {
    fail(`ticket file not found: ${ticketPath}`);
  }

  const ticket = readJson(ticketPath);
  const state = readJson(STATE_FILE);
  const runbookVersion = `workflow-v${state.schemaVersion || '1.0.0'}`;

  ticket.sessionBoot = {
    bootstrappedBy: 'claude',
    bootstrappedAt: new Date().toISOString(),
    runbookVersion,
    memoryStateRef: 'workflow/state/workflow_state.json',
    requiredFilesRead: [...REQUIRED_FILES],
  };
  if (!ticket.timestamps || typeof ticket.timestamps !== 'object') {
    ticket.timestamps = {};
  }
  ticket.timestamps.updatedAt = new Date().toISOString();

  writeJson(ticketPath, ticket);

  const rel = toRepoRelative(ticketPath);
  const guard = spawnSync(process.execPath, [GUARD_SCRIPT, 'validate-ticket', '--file', rel], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  const output = `${guard.stdout || ''}${guard.stderr || ''}`.trim();
  if (output) {
    console.log(output);
  }
  if (guard.status !== 0) {
    fail(`session boot written but ticket validation failed: ${rel}`);
  }

  console.log(`Session boot completed: ${rel}`);
}

main();
