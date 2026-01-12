// Migration runner utility - V3.0.9 compliant
import * as fs from 'fs';
import * as path from 'path';
import { getPool, query } from './pool';
import { withTransaction } from './transaction';

export interface Migration {
  id: number;
  name: string;
  applied_at: Date;
}

export interface MigrationFile {
  name: string;
  path: string;
  id: number;
}

/**
 * Ensure the migrations tracking table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Get list of applied migrations
 */
export async function getAppliedMigrations(): Promise<Migration[]> {
  await ensureMigrationsTable();
  return query<Migration>('SELECT id, name, applied_at FROM _migrations ORDER BY id');
}

/**
 * Parse migration files from a directory
 * Expects files named like: 000_extensions.sql, 001_platform_schema.sql
 */
export function parseMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(name => {
    const match = name.match(/^(\d+)_/);
    const id = match?.[1] ? parseInt(match[1], 10) : 0;
    return {
      name,
      path: path.join(migrationsDir, name),
      id,
    };
  });
}

/**
 * Run pending migrations
 */
export async function runMigrations(migrationsDir: string): Promise<string[]> {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const appliedNames = new Set(applied.map(m => m.name));

  const files = parseMigrationFiles(migrationsDir);
  const pending = files.filter(f => !appliedNames.has(f.name));

  const results: string[] = [];

  for (const migration of pending) {
    const sql = fs.readFileSync(migration.path, 'utf-8');

    await withTransaction(async (ctx) => {
      // Execute migration SQL (may contain multiple statements)
      const pool = getPool();
      await pool.query(sql);

      // Record migration
      await ctx.query(
        'INSERT INTO _migrations (name) VALUES ($1)',
        [migration.name]
      );
    });

    results.push(`Applied: ${migration.name}`);
    console.log(`Migration applied: ${migration.name}`);
  }

  if (results.length === 0) {
    console.log('No pending migrations');
  }

  return results;
}

/**
 * Rollback the last migration
 * Note: This requires a corresponding .down.sql file
 */
export async function rollbackMigration(migrationsDir: string): Promise<string | null> {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  if (applied.length === 0) {
    console.log('No migrations to rollback');
    return null;
  }

  const lastMigration = applied[applied.length - 1];
  if (!lastMigration) {
    return null;
  }

  // Look for .down.sql file
  const baseName = lastMigration.name.replace('.sql', '');
  const downFile = path.join(migrationsDir, `${baseName}.down.sql`);

  if (!fs.existsSync(downFile)) {
    throw new Error(`Rollback file not found: ${downFile}`);
  }

  const sql = fs.readFileSync(downFile, 'utf-8');

  await withTransaction(async (ctx) => {
    const pool = getPool();
    await pool.query(sql);

    await ctx.query(
      'DELETE FROM _migrations WHERE name = $1',
      [lastMigration.name]
    );
  });

  console.log(`Migration rolled back: ${lastMigration.name}`);
  return lastMigration.name;
}

/**
 * Get migration status
 */
export async function getMigrationStatus(migrationsDir: string): Promise<{
  applied: Migration[];
  pending: MigrationFile[];
}> {
  await ensureMigrationsTable();

  const applied = await getAppliedMigrations();
  const appliedNames = new Set(applied.map(m => m.name));

  const files = parseMigrationFiles(migrationsDir);
  const pending = files.filter(f => !appliedNames.has(f.name));

  return { applied, pending };
}

/**
 * Create a new migration file
 */
export function createMigration(migrationsDir: string, name: string): string {
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  const files = parseMigrationFiles(migrationsDir);
  const nextId = files.length > 0 ? Math.max(...files.map(f => f.id)) + 1 : 0;
  const paddedId = String(nextId).padStart(3, '0');
  const fileName = `${paddedId}_${name}.sql`;
  const filePath = path.join(migrationsDir, fileName);

  const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Write your migration SQL here
`;

  fs.writeFileSync(filePath, template);
  console.log(`Created migration: ${fileName}`);
  return filePath;
}
