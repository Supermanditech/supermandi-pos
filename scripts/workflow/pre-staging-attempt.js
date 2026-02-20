#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const WORKFLOW_STATE_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'workflow_state.json');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function run(command) {
  try {
    const output = execSync(command, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output: (output || '').trim() };
  } catch (error) {
    return {
      ok: false,
      output: ((error.stdout || '') + (error.stderr || '')).trim(),
    };
  }
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

function normalizeRepoPath(filePath) {
  if (typeof filePath !== 'string') {
    return '';
  }
  return filePath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^"+|"+$/g, '');
}

function extractPathsFromPorcelainLine(line) {
  if (typeof line !== 'string' || line.length < 2) {
    return [];
  }
  const normalizedLine = line.replace(/^\s+/, '');
  let raw = '';
  const twoStatusMatch = normalizedLine.match(/^[A-Z?!][A-Z?!]\s+(.*)$/);
  if (twoStatusMatch) {
    raw = twoStatusMatch[1].trim();
  } else {
    const oneStatusMatch = normalizedLine.match(/^[A-Z?!]\s+(.*)$/);
    if (oneStatusMatch) {
      raw = oneStatusMatch[1].trim();
    } else {
      raw = normalizedLine.trim();
    }
  }
  if (!raw) {
    return [];
  }
  const normalizedRaw = normalizeRepoPath(raw);
  if (normalizedRaw.includes(' -> ')) {
    return normalizedRaw
      .split(' -> ')
      .map((part) => normalizeRepoPath(part))
      .filter(Boolean);
  }
  return [normalizedRaw];
}

function getStatusLines() {
  const status = run('git status --porcelain');
  if (!status.ok) {
    fail(`failed to read git status: ${status.output}`);
  }
  if (!status.output) {
    return [];
  }
  return status.output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function getAllowedDirtyPaths(workflowState) {
  const rules = workflowState?.rules?.gitDiscipline || {};
  const allowed = new Set();

  const configured = Array.isArray(rules.allowedDirtyFilesBeforeStagingDeploy)
    ? rules.allowedDirtyFilesBeforeStagingDeploy
    : [];
  for (const entry of configured) {
    const normalized = normalizeRepoPath(entry);
    if (normalized) {
      allowed.add(normalized);
    }
  }

  const allowBatchManifest = rules.allowDirtyStagingBatchManifest !== false;
  if (allowBatchManifest) {
    const batchPath = workflowState?.paths?.stagingBatchFile || 'workflow/state/staging_batch.json';
    const normalized = normalizeRepoPath(batchPath);
    if (normalized) {
      allowed.add(normalized);
    }
  }
  return allowed;
}

function collectBlockingStatusLines(statusLines, allowedDirtyPaths) {
  const blocking = [];
  for (const line of statusLines) {
    const paths = extractPathsFromPorcelainLine(line);
    if (paths.length === 0) {
      blocking.push(line);
      continue;
    }
    const allAllowed = paths.every((entry) => allowedDirtyPaths.has(entry));
    if (!allAllowed) {
      blocking.push(line);
    }
  }
  return blocking;
}

function getAttemptNumber() {
  const gitDirInfo = run('git rev-parse --git-dir');
  if (!gitDirInfo.ok || !gitDirInfo.output) {
    return 1;
  }
  const gitDir = path.isAbsolute(gitDirInfo.output)
    ? gitDirInfo.output
    : path.join(ROOT_DIR, gitDirInfo.output);
  const counterFile = path.join(gitDir, 'workflow_pre_staging_attempt_counter');

  let current = 0;
  if (fs.existsSync(counterFile)) {
    const raw = fs.readFileSync(counterFile, 'utf8').trim();
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      current = parsed;
    }
  }
  const next = current + 1;
  fs.writeFileSync(counterFile, `${next}\n`, 'utf8');
  return next;
}

function printCheckpoint(payload) {
  console.log('CHECKPOINT');
  console.log(`Attempt #: ${payload.attempt}`);
  console.log(`HEAD SHA: ${payload.headSha}`);
  console.log(`staging_batch.commitSha: ${payload.batchSha}`);
  console.log(`git status --short: ${payload.statusSummary || '(clean)'}`);
  console.log(`pnpm workflow:pre-staging: ${payload.preStagingResult}`);
  if (payload.nextBlockingItem) {
    console.log(`next blocking item: ${payload.nextBlockingItem}`);
  }
}

function main() {
  const attempt = getAttemptNumber();
  const workflowState = readJson(WORKFLOW_STATE_FILE);
  const stagingBatchPath = path.join(
    ROOT_DIR,
    normalizeRepoPath(workflowState?.paths?.stagingBatchFile || 'workflow/state/staging_batch.json')
  );
  const allowedDirtyPaths = getAllowedDirtyPaths(workflowState);

  const head = run('git rev-parse --short HEAD');
  if (!head.ok || !head.output) {
    fail(`failed to resolve HEAD SHA: ${head.output}`);
  }
  const headSha = head.output;

  const statusBefore = getStatusLines();
  const blockingBefore = collectBlockingStatusLines(statusBefore, allowedDirtyPaths);
  if (blockingBefore.length > 0) {
    printCheckpoint({
      attempt,
      headSha,
      batchSha: '(unchanged)',
      statusSummary: statusBefore.join(' | '),
      preStagingResult: 'FAIL',
      nextBlockingItem: `non-batch dirty files: ${blockingBefore.join(' ; ')}`,
    });
    process.exit(1);
  }

  const batch = readJson(stagingBatchPath);
  batch.commitSha = headSha;
  writeJson(stagingBatchPath, batch);

  const statusAfter = getStatusLines();
  const blockingAfter = collectBlockingStatusLines(statusAfter, allowedDirtyPaths);
  if (blockingAfter.length > 0) {
    printCheckpoint({
      attempt,
      headSha,
      batchSha: batch.commitSha,
      statusSummary: statusAfter.join(' | '),
      preStagingResult: 'FAIL',
      nextBlockingItem: `non-batch dirty files after stamp: ${blockingAfter.join(' ; ')}`,
    });
    process.exit(1);
  }

  const pre = spawnSync('pnpm', ['workflow:pre-staging'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const preOutput = `${pre.stdout || ''}${pre.stderr || ''}`.trim();
  const statusSummary = statusAfter.join(' | ');
  if (pre.status !== 0) {
    const blocker = preOutput ? preOutput.split('\n').slice(-1)[0] : 'pre-staging failed';
    printCheckpoint({
      attempt,
      headSha,
      batchSha: batch.commitSha,
      statusSummary,
      preStagingResult: 'FAIL',
      nextBlockingItem: blocker,
    });
    if (preOutput) {
      console.error(preOutput);
    }
    process.exit(pre.status || 1);
  }

  printCheckpoint({
    attempt,
    headSha,
    batchSha: batch.commitSha,
    statusSummary,
    preStagingResult: 'PASS',
    nextBlockingItem: '',
  });
}

main();
