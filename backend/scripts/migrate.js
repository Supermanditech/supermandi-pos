#!/usr/bin/env node
// Migration runner - V3.0.9 compliant

const path = require('path');
const {
  runMigrations,
  rollbackMigration,
  getMigrationStatus,
  createMigration,
} = require('../packages/common/dist/db/migrate');

const migrationsDir = path.resolve(__dirname, '..', 'migrations');

function printUsage() {
  console.log('Usage: node scripts/migrate.js <up|down|status|create>');
  console.log('  up           Apply pending migrations');
  console.log('  down         Rollback the last migration (requires .down.sql)');
  console.log('  status       Show applied and pending migrations');
  console.log('  create <name>  Create a new migration file');
}

async function main() {
  const command = process.argv[2];

  if (!command || command === 'help' || command === '--help') {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case 'up': {
      await runMigrations(migrationsDir);
      break;
    }
    case 'down': {
      await rollbackMigration(migrationsDir);
      break;
    }
    case 'status': {
      const status = await getMigrationStatus(migrationsDir);
      console.log('Applied migrations:');
      status.applied.forEach((m) => {
        console.log(`- ${m.name} (${m.applied_at.toISOString()})`);
      });
      console.log('Pending migrations:');
      status.pending.forEach((m) => {
        console.log(`- ${m.name}`);
      });
      break;
    }
    case 'create': {
      const name = process.argv[3];
      if (!name) {
        console.error('Migration name is required for create');
        printUsage();
        process.exit(1);
      }
      createMigration(migrationsDir, name);
      break;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration command failed:', error);
    process.exit(1);
  });
