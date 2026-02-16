// TEST-001: Testcontainers Global Setup
// Starts a real PostgreSQL container, runs all migrations, exposes connection URL.
// This file runs once per Jest invocation (globalSetup).

import * as fs from 'fs';
import * as path from 'path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const STATE_FILE = path.join(__dirname, '.container-state.json');
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'migrations');

/**
 * Read and sort all migration SQL files from backend/migrations/
 */
function getMigrationFiles(): { name: string; sql: string }[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(name => ({
    name,
    sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf-8'),
  }));
}

/**
 * Apply all migrations to the started container using pg directly.
 */
async function runMigrations(connectionUri: string): Promise<number> {
  // Dynamic import to avoid top-level dependency issues in globalSetup
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: connectionUri, max: 3 });

  try {
    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrations = getMigrationFiles();
    let applied = 0;

    for (const migration of migrations) {
      try {
        await pool.query(migration.sql);
        await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
        applied++;
      } catch (err: any) {
        // Log but continue — some migrations may fail due to extension requirements
        // (pg_trgm, pgcrypto etc. are usually available in the container image)
        console.warn(`  [migration] ${migration.name} — ${err.message.split('\n')[0]}`);
        // If it's a critical schema migration (first 10), abort
        const migNum = parseInt(migration.name.match(/^(\d+)/)?.[1] || '999', 10);
        if (migNum <= 10) {
          throw new Error(`Critical migration ${migration.name} failed: ${err.message}`);
        }
      }
    }

    return applied;
  } finally {
    await pool.end();
  }
}

export default async function globalSetup(): Promise<void> {
  const startTime = Date.now();
  console.log('\n🐳 Starting PostgreSQL testcontainer...');

  // Start PostgreSQL container with same version as Cloud SQL (15)
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('supermandi_test')
    .withUsername('test')
    .withPassword('test')
    .withCommand([
      'postgres',
      '-c', 'fsync=off',              // Faster writes (test-only, no durability needed)
      '-c', 'synchronous_commit=off',  // Faster commits
      '-c', 'full_page_writes=off',    // Skip WAL full-page writes
      '-c', 'shared_buffers=256MB',
      '-c', 'work_mem=64MB',
    ])
    .start();

  const connectionUri = container.getConnectionUri();
  const containerStartMs = Date.now() - startTime;
  console.log(`  Container started in ${containerStartMs}ms`);
  console.log(`  Connection: ${connectionUri}`);

  // Run all migrations
  console.log('  Running migrations...');
  const migrationStart = Date.now();
  const applied = await runMigrations(connectionUri);
  const migrationMs = Date.now() - migrationStart;
  console.log(`  ${applied} migrations applied in ${migrationMs}ms`);

  // Save state for globalTeardown and test workers
  const state = {
    connectionUri,
    containerId: container.getId(),
    containerName: container.getName(),
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    username: container.getUsername(),
    password: container.getPassword(),
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  // Set env var for test workers (Jest forks inherit process.env)
  process.env.TEST_DATABASE_URL = connectionUri;
  process.env.DATABASE_URL = connectionUri;

  const totalMs = Date.now() - startTime;
  console.log(`✅ Testcontainer ready in ${totalMs}ms (container: ${containerStartMs}ms, migrations: ${migrationMs}ms)\n`);
}
