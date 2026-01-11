#!/usr/bin/env node
/**
 * WIP Task Manager
 *
 * Manage work-in-progress tasks that block APK builds.
 *
 * Usage:
 *   node scripts/wip.js add "Task name" "Description" [file]
 *   node scripts/wip.js list
 *   node scripts/wip.js done <index>
 *   node scripts/wip.js complete <index> "FIX-XXX" [pattern]  # Move to completed fixes
 *   node scripts/wip.js clear
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const fixesPath = path.join(__dirname, 'mandatory-fixes.json');

function loadConfig() {
  if (!fs.existsSync(fixesPath)) {
    return {
      version: "2.0.0",
      wip: { tasks: [] },
      completedFixes: [],
      changelog: []
    };
  }
  return JSON.parse(fs.readFileSync(fixesPath, 'utf8'));
}

function saveConfig(config) {
  config.lastUpdated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(fixesPath, JSON.stringify(config, null, 2) + '\n');
}

function addTask(name, description, file) {
  const config = loadConfig();
  config.wip.tasks.push({
    name,
    description: description || '',
    file: file || '',
    addedAt: new Date().toISOString()
  });
  saveConfig(config);
  console.log(`${GREEN}Added WIP task:${RESET} ${name}`);
  console.log(`${YELLOW}APK builds are now BLOCKED until this task is completed.${RESET}`);
}

function listTasks() {
  const config = loadConfig();
  const tasks = config.wip?.tasks || [];

  console.log('\n' + '='.repeat(50));
  console.log(`${CYAN}  WIP TASKS${RESET}`);
  console.log('='.repeat(50) + '\n');

  if (tasks.length === 0) {
    console.log(`${GREEN}No WIP tasks - APK build is allowed${RESET}\n`);
    return;
  }

  console.log(`${RED}${tasks.length} task(s) blocking APK build:${RESET}\n`);
  tasks.forEach((task, i) => {
    console.log(`  ${YELLOW}[${i + 1}]${RESET} ${task.name}`);
    if (task.description) console.log(`      ${task.description}`);
    if (task.file) console.log(`      ${CYAN}File:${RESET} ${task.file}`);
    console.log('');
  });

  console.log('Commands:');
  console.log(`  ${CYAN}node scripts/wip.js done <index>${RESET}     - Remove task (discard)`);
  console.log(`  ${CYAN}node scripts/wip.js complete <index> "FIX-XXX"${RESET} - Move to completed fixes\n`);
}

function removeTask(index) {
  const config = loadConfig();
  const tasks = config.wip?.tasks || [];
  const idx = parseInt(index) - 1;

  if (idx < 0 || idx >= tasks.length) {
    console.log(`${RED}Invalid index. Use 'node scripts/wip.js list' to see tasks.${RESET}`);
    return;
  }

  const removed = tasks.splice(idx, 1)[0];
  saveConfig(config);
  console.log(`${GREEN}Removed WIP task:${RESET} ${removed.name}`);

  if (tasks.length === 0) {
    console.log(`${GREEN}No more WIP tasks - APK build is now allowed!${RESET}`);
  }
}

function completeTask(index, fixId, pattern) {
  const config = loadConfig();
  const tasks = config.wip?.tasks || [];
  const idx = parseInt(index) - 1;

  if (idx < 0 || idx >= tasks.length) {
    console.log(`${RED}Invalid index. Use 'node scripts/wip.js list' to see tasks.${RESET}`);
    return;
  }

  const task = tasks.splice(idx, 1)[0];

  // Add to completed fixes
  const fix = {
    id: fixId,
    name: task.name,
    date: new Date().toISOString().split('T')[0],
    file: task.file || '',
    mustContain: pattern ? [pattern] : [],
    mustNotContain: [],
    description: task.description || ''
  };

  config.completedFixes = config.completedFixes || [];
  config.completedFixes.push(fix);

  // Add to changelog
  config.changelog = config.changelog || [];
  const today = new Date().toISOString().split('T')[0];
  let todayEntry = config.changelog.find(c => c.date === today);
  if (!todayEntry) {
    todayEntry = { date: today, changes: [] };
    config.changelog.unshift(todayEntry);
  }
  todayEntry.changes.push(`${fixId}: ${task.name}`);

  saveConfig(config);
  console.log(`${GREEN}Completed and moved to mandatory fixes:${RESET} ${task.name}`);
  console.log(`${CYAN}Fix ID:${RESET} ${fixId}`);

  if (tasks.length === 0) {
    console.log(`${GREEN}No more WIP tasks - APK build is now allowed!${RESET}`);
  }
}

function clearAll() {
  const config = loadConfig();
  const count = config.wip?.tasks?.length || 0;
  config.wip.tasks = [];
  saveConfig(config);
  console.log(`${GREEN}Cleared ${count} WIP task(s)${RESET}`);
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'add':
    if (!args[1]) {
      console.log(`${RED}Usage: node scripts/wip.js add "Task name" "Description" [file]${RESET}`);
      process.exit(1);
    }
    addTask(args[1], args[2], args[3]);
    break;

  case 'list':
    listTasks();
    break;

  case 'done':
  case 'remove':
    if (!args[1]) {
      console.log(`${RED}Usage: node scripts/wip.js done <index>${RESET}`);
      process.exit(1);
    }
    removeTask(args[1]);
    break;

  case 'complete':
    if (!args[1] || !args[2]) {
      console.log(`${RED}Usage: node scripts/wip.js complete <index> "FIX-XXX" [pattern]${RESET}`);
      process.exit(1);
    }
    completeTask(args[1], args[2], args[3]);
    break;

  case 'clear':
    clearAll();
    break;

  default:
    console.log(`
${CYAN}WIP Task Manager${RESET}

Manage work-in-progress tasks that block APK builds.

${YELLOW}Commands:${RESET}
  ${CYAN}add${RESET} "name" "description" [file]  Add a new WIP task
  ${CYAN}list${RESET}                             Show all WIP tasks
  ${CYAN}done${RESET} <index>                     Remove task (discard)
  ${CYAN}complete${RESET} <index> "FIX-XXX"       Move task to completed fixes
  ${CYAN}clear${RESET}                            Remove all WIP tasks

${YELLOW}Examples:${RESET}
  node scripts/wip.js add "Fix login bug" "Users can't login on Android 12"
  node scripts/wip.js add "Add dark mode" "Theme toggle" "src/theme/index.ts"
  node scripts/wip.js list
  node scripts/wip.js done 1
  node scripts/wip.js complete 1 "FIX-011" "darkMode"
`);
}
