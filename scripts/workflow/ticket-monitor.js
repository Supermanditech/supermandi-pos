#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const WORKFLOW_DIR = path.join(ROOT_DIR, 'workflow');
const STATE_FILE = path.join(WORKFLOW_DIR, 'state', 'workflow_state.json');
const TICKETS_DIR = path.join(WORKFLOW_DIR, 'tickets');
const SCREENS_DIR = path.join(WORKFLOW_DIR, 'screens');
const GUARD_SCRIPT = path.join(ROOT_DIR, 'scripts', 'workflow', 'guard.js');
const DEFAULT_REPORT_FILE = path.join(WORKFLOW_DIR, 'state', 'live_monitor_report.json');
const DEFAULT_INTERVAL_SECONDS = 30;
const DEFAULT_MAX_ERROR_LINES = 8;

function parseArgs(argv) {
  const args = {
    watch: false,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    maxErrorLines: DEFAULT_MAX_ERROR_LINES,
    once: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--watch') {
      args.watch = true;
      args.once = false;
      continue;
    }
    if (arg === '--once') {
      args.once = true;
      args.watch = false;
      continue;
    }
    if (arg === '--interval') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        args.intervalSeconds = value;
      }
      i += 1;
      continue;
    }
    if (arg === '--max-lines') {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        args.maxErrorLines = value;
      }
      i += 1;
    }
  }
  return args;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function getMonitoringRules() {
  const state = readJsonIfExists(STATE_FILE);
  const rules = state?.rules?.monitoringRules || {};
  return {
    enabled: rules.enableTicketMonitor !== false,
    defaultIntervalSeconds: Number(rules.defaultIntervalSeconds || DEFAULT_INTERVAL_SECONDS),
    maxErrorLinesPerTicket: Number(rules.maxErrorLinesPerTicket || DEFAULT_MAX_ERROR_LINES),
    reportOutputFile: typeof rules.reportOutputFile === 'string' && rules.reportOutputFile.trim()
      ? path.join(ROOT_DIR, rules.reportOutputFile)
      : DEFAULT_REPORT_FILE,
  };
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => path.join(dirPath, file))
    .sort();
}

function toRepoRelative(filePath) {
  return path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
}

function runGuard(commandArgs) {
  const result = spawnSync(process.execPath, [GUARD_SCRIPT, ...commandArgs], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    output,
  };
}

function trimOutputLines(output, maxLines) {
  const lines = (output || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= maxLines) {
    return lines;
  }
  const trimmed = lines.slice(0, maxLines);
  trimmed.push(`... (${lines.length - maxLines} more line(s))`);
  return trimmed;
}

function parseTicketId(filePath) {
  try {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (json && typeof json.ticketId === 'string' && json.ticketId.trim()) {
      return json.ticketId.trim();
    }
  } catch (_error) {
    // fallback to filename
  }
  return path.basename(filePath, '.json');
}

function parseScreenId(filePath) {
  try {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (json && typeof json.screenId === 'string' && json.screenId.trim()) {
      return json.screenId.trim();
    }
  } catch (_error) {
    // fallback to filename
  }
  return path.basename(filePath, '.json');
}

function buildMonitorReport(options, monitoringRules) {
  const report = {
    generatedAt: new Date().toISOString(),
    monitor: {
      enabled: monitoringRules.enabled,
      intervalSeconds: options.intervalSeconds,
      maxErrorLines: options.maxErrorLines,
    },
    summary: {
      workflowStateValid: true,
      totalTickets: 0,
      ticketFailures: 0,
      totalScreens: 0,
      screenFailures: 0,
      totalFailures: 0,
    },
    workflowErrors: [],
    ticketFindings: [],
    screenFindings: [],
  };

  const stateCheck = runGuard(['validate-state']);
  report.summary.workflowStateValid = stateCheck.ok;
  if (!stateCheck.ok) {
    report.workflowErrors = trimOutputLines(stateCheck.output, options.maxErrorLines);
  }

  const ticketFiles = listJsonFiles(TICKETS_DIR);
  report.summary.totalTickets = ticketFiles.length;
  for (const filePath of ticketFiles) {
    const rel = toRepoRelative(filePath);
    const ticketId = parseTicketId(filePath);
    const check = runGuard(['validate-ticket', '--file', rel]);
    if (!check.ok) {
      report.ticketFindings.push({
        ticketId,
        file: rel,
        errors: trimOutputLines(check.output, options.maxErrorLines),
      });
    }
  }

  const screenFiles = listJsonFiles(SCREENS_DIR);
  report.summary.totalScreens = screenFiles.length;
  for (const filePath of screenFiles) {
    const rel = toRepoRelative(filePath);
    const screenId = parseScreenId(filePath);
    const check = runGuard(['validate-screen', '--file', rel]);
    if (!check.ok) {
      report.screenFindings.push({
        screenId,
        file: rel,
        errors: trimOutputLines(check.output, options.maxErrorLines),
      });
    }
  }

  report.summary.ticketFailures = report.ticketFindings.length;
  report.summary.screenFailures = report.screenFindings.length;
  report.summary.totalFailures =
    (report.summary.workflowStateValid ? 0 : 1)
    + report.summary.ticketFailures
    + report.summary.screenFailures;

  return report;
}

function writeReport(report, outputFile) {
  const dir = path.dirname(outputFile);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function printReport(report, outputFile) {
  console.log('=== Workflow Ticket Monitor ===');
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Workflow state: ${report.summary.workflowStateValid ? 'PASS' : 'FAIL'}`);
  console.log(`Tickets: ${report.summary.totalTickets}, Failures: ${report.summary.ticketFailures}`);
  console.log(`Screens: ${report.summary.totalScreens}, Failures: ${report.summary.screenFailures}`);
  console.log(`Total failures: ${report.summary.totalFailures}`);
  console.log(`Report file: ${toRepoRelative(outputFile)}`);

  if (!report.summary.workflowStateValid) {
    console.log('');
    console.log('Workflow errors:');
    for (const line of report.workflowErrors) {
      console.log(`  - ${line}`);
    }
  }

  if (report.ticketFindings.length > 0) {
    console.log('');
    console.log('Ticket findings:');
    for (const finding of report.ticketFindings) {
      console.log(`  - ${finding.ticketId} (${finding.file})`);
      for (const line of finding.errors) {
        console.log(`      ${line}`);
      }
    }
  }

  if (report.screenFindings.length > 0) {
    console.log('');
    console.log('Screen findings:');
    for (const finding of report.screenFindings) {
      console.log(`  - ${finding.screenId} (${finding.file})`);
      for (const line of finding.errors) {
        console.log(`      ${line}`);
      }
    }
  }
}

function runOnce(options, monitoringRules) {
  const report = buildMonitorReport(options, monitoringRules);
  writeReport(report, monitoringRules.reportOutputFile);
  printReport(report, monitoringRules.reportOutputFile);
  return report.summary.totalFailures === 0;
}

function main() {
  const cli = parseArgs(process.argv.slice(2));
  const monitoringRules = getMonitoringRules();

  if (!monitoringRules.enabled) {
    console.log('Ticket monitor disabled by workflow state (rules.monitoringRules.enableTicketMonitor=false).');
    process.exit(0);
  }

  if (!Number.isFinite(cli.intervalSeconds) || cli.intervalSeconds <= 0) {
    cli.intervalSeconds = monitoringRules.defaultIntervalSeconds > 0
      ? monitoringRules.defaultIntervalSeconds
      : DEFAULT_INTERVAL_SECONDS;
  }
  if (!Number.isFinite(cli.maxErrorLines) || cli.maxErrorLines <= 0) {
    cli.maxErrorLines = monitoringRules.maxErrorLinesPerTicket > 0
      ? monitoringRules.maxErrorLinesPerTicket
      : DEFAULT_MAX_ERROR_LINES;
  }

  if (cli.watch) {
    console.log(`Starting watch mode. Interval: ${cli.intervalSeconds}s`);
    runOnce(cli, monitoringRules);
    setInterval(() => {
      console.log('');
      runOnce(cli, monitoringRules);
    }, cli.intervalSeconds * 1000);
    return;
  }

  const ok = runOnce(cli, monitoringRules);
  process.exit(ok ? 0 : 1);
}

main();
