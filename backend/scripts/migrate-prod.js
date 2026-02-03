#!/usr/bin/env node
// Production migration runner - uses compiled dist paths
// Run: node scripts/migrate-prod.js up

const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const migrationsDir = path.resolve(__dirname, '..', 'migrations');

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(pool) {
  const result = await pool.query('SELECT id, name, applied_at FROM _migrations ORDER BY id');
  return result.rows;
}

function parseMigrationFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(name => ({
      name,
      path: path.join(dir, name),
    }));
}

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('[migrate] Connecting to database...');
    await pool.query('SELECT 1');
    console.log('[migrate] Connected successfully');

    await ensureMigrationsTable(pool);

    const applied = await getAppliedMigrations(pool);
    const appliedNames = new Set(applied.map(m => m.name));

    const files = parseMigrationFiles(migrationsDir);
    const pending = files.filter(f => !appliedNames.has(f.name));

    if (pending.length === 0) {
      console.log('[migrate] No pending migrations');
      return;
    }

    console.log(`[migrate] ${pending.length} pending migration(s) to apply`);

    for (const migration of pending) {
      const sql = fs.readFileSync(migration.path, 'utf-8');
      const client = await pool.connect();

      try {
        // Each migration runs in its own transaction context
        // (Many migrations already have BEGIN/COMMIT, so we check for that)
        const hasTransaction = sql.trim().toUpperCase().startsWith('BEGIN');

        if (!hasTransaction) {
          await client.query('BEGIN');
        }

        await client.query(sql);

        // Record the migration (always in a transaction)
        if (!hasTransaction) {
          await client.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
          await client.query('COMMIT');
        } else {
          // The migration already committed; record separately
          await client.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
        }

        console.log(`[migrate] Applied: ${migration.name}`);
      } catch (error) {
        if (!sql.trim().toUpperCase().startsWith('BEGIN')) {
          await client.query('ROLLBACK').catch(() => {});
        }
        console.error(`[migrate] FAILED: ${migration.name}`);
        console.error(`[migrate] Error: ${error.message}`);
        throw error;
      } finally {
        client.release();
      }
    }

    console.log(`[migrate] All ${pending.length} migration(s) applied successfully`);
  } finally {
    await pool.end();
  }
}

async function showStatus() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[migrate] DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await ensureMigrationsTable(pool);

    const applied = await getAppliedMigrations(pool);
    const appliedNames = new Set(applied.map(m => m.name));

    const files = parseMigrationFiles(migrationsDir);
    const pending = files.filter(f => !appliedNames.has(f.name));

    console.log(`Applied (${applied.length}):`);
    applied.forEach(m => console.log(`  ✓ ${m.name} (${m.applied_at})`));

    console.log(`\nPending (${pending.length}):`);
    pending.forEach(m => console.log(`  ○ ${m.name}`));
  } finally {
    await pool.end();
  }
}

const command = process.argv[2] || 'up';

switch (command) {
  case 'up':
    runMigrations().catch(err => {
      console.error('[migrate] Fatal error:', err.message);
      process.exit(1);
    });
    break;
  case 'status':
    showStatus().catch(err => {
      console.error('[migrate] Fatal error:', err.message);
      process.exit(1);
    });
    break;
  default:
    console.log('Usage: node scripts/migrate-prod.js <up|status>');
    process.exit(1);
}
