/**
 * GO-LIVE-181: Database Schema Error Handling
 *
 * Provides utilities for handling database schema errors consistently
 * across the application. Instead of silently returning empty arrays,
 * these utilities log detailed diagnostics and track missing schemas.
 */

// Track schema errors for health checks
const schemaErrorRegistry = new Map<string, { count: number; lastError: Date; message: string }>();

export interface DbError {
  code?: string;
  message?: string;
  table?: string;
  schema?: string;
  detail?: string;
}

// PostgreSQL error codes for schema issues
export const SCHEMA_ERROR_CODES = {
  UNDEFINED_TABLE: '42P01', // relation does not exist
  UNDEFINED_COLUMN: '42703', // column does not exist
  UNDEFINED_SCHEMA: '3F000', // schema does not exist
  PERMISSION_DENIED: '42501', // permission denied for schema/table
  INSUFFICIENT_PRIVILEGE: '42501', // insufficient privilege
};

/**
 * Check if error is a "missing relation" error (table doesn't exist)
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as DbError;
  if (dbError.code === SCHEMA_ERROR_CODES.UNDEFINED_TABLE) return true;

  const message = dbError.message || '';
  return message.includes('relation') && message.includes('does not exist');
}

/**
 * Check if error is a "missing column" error
 */
export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as DbError;
  if (dbError.code === SCHEMA_ERROR_CODES.UNDEFINED_COLUMN) return true;

  const message = dbError.message || '';
  return message.includes('column') && message.includes('does not exist');
}

/**
 * Check if error is a permission/privilege error
 */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as DbError;
  if (dbError.code === SCHEMA_ERROR_CODES.PERMISSION_DENIED) return true;

  const message = dbError.message || '';
  return message.toLowerCase().includes('permission denied');
}

/**
 * Check if error is any kind of schema error
 */
export function isSchemaError(error: unknown): boolean {
  return isMissingTableError(error) || isMissingColumnError(error) || isPermissionError(error);
}

export interface SchemaErrorInfo {
  errorType: 'MISSING_TABLE' | 'MISSING_COLUMN' | 'PERMISSION_DENIED' | 'UNKNOWN_SCHEMA_ERROR';
  code?: string;
  message: string;
  tableName?: string;
  columnName?: string;
  schemaName?: string;
}

/**
 * Parse a database error into structured schema error info
 */
export function parseSchemaError(error: unknown): SchemaErrorInfo | null {
  if (!error || typeof error !== 'object') return null;

  const dbError = error as DbError;
  const message = dbError.message || '';

  if (isMissingTableError(error)) {
    // Extract table name from message like 'relation "schema.table" does not exist'
    const tableMatch = message.match(/relation ["']?([^"']+)["']? does not exist/i);
    const tableName = tableMatch?.[1];
    const [schemaName, actualTable] = tableName?.includes('.')
      ? tableName.split('.')
      : [undefined, tableName];

    return {
      errorType: 'MISSING_TABLE',
      code: dbError.code,
      message,
      tableName: actualTable,
      schemaName,
    };
  }

  if (isMissingColumnError(error)) {
    // Extract column name from message like 'column "foo" does not exist'
    const columnMatch = message.match(/column ["']?([^"']+)["']? does not exist/i);
    return {
      errorType: 'MISSING_COLUMN',
      code: dbError.code,
      message,
      columnName: columnMatch?.[1],
    };
  }

  if (isPermissionError(error)) {
    return {
      errorType: 'PERMISSION_DENIED',
      code: dbError.code,
      message,
    };
  }

  return null;
}

/**
 * Handle a schema error with proper logging and tracking
 * Returns true if the error was handled as a schema error
 */
export function handleSchemaError(
  error: unknown,
  context: {
    operation: string;
    table?: string;
    fallbackValue?: unknown;
  }
): { handled: boolean; info?: SchemaErrorInfo } {
  const info = parseSchemaError(error);
  if (!info) {
    return { handled: false };
  }

  const registryKey = `${info.errorType}:${info.tableName || info.columnName || 'unknown'}`;

  // Track in registry
  const existing = schemaErrorRegistry.get(registryKey);
  schemaErrorRegistry.set(registryKey, {
    count: (existing?.count ?? 0) + 1,
    lastError: new Date(),
    message: info.message,
  });

  // Log with context
  const logContext = {
    errorType: info.errorType,
    operation: context.operation,
    table: info.tableName || context.table,
    column: info.columnName,
    schema: info.schemaName,
    code: info.code,
    occurrenceCount: schemaErrorRegistry.get(registryKey)?.count,
  };

  switch (info.errorType) {
    case 'MISSING_TABLE':
      console.warn(
        `[GO-LIVE-181] Missing table during "${context.operation}":`,
        logContext,
        `\nThis may indicate migrations have not been run. Run "npm run migrate" to apply pending migrations.`
      );
      break;

    case 'MISSING_COLUMN':
      console.error(
        `[GO-LIVE-181] Missing column during "${context.operation}":`,
        logContext,
        `\nThis may indicate a schema version mismatch. Check migration status.`
      );
      break;

    case 'PERMISSION_DENIED':
      console.error(
        `[GO-LIVE-181] Permission denied during "${context.operation}":`,
        logContext,
        `\nCheck database user permissions.`
      );
      break;
  }

  return { handled: true, info };
}

/**
 * Get summary of schema errors for health check
 */
export function getSchemaErrorSummary(): Array<{
  errorKey: string;
  count: number;
  lastError: Date;
  message: string;
}> {
  return Array.from(schemaErrorRegistry.entries()).map(([key, value]) => ({
    errorKey: key,
    count: value.count,
    lastError: value.lastError,
    message: value.message,
  }));
}

/**
 * Check if there are any schema errors recorded
 */
export function hasSchemaErrors(): boolean {
  return schemaErrorRegistry.size > 0;
}

/**
 * Clear schema error registry (for testing)
 */
export function clearSchemaErrors(): void {
  schemaErrorRegistry.clear();
}

/**
 * Wrapper function that handles schema errors gracefully while logging
 *
 * @param fn - Async function that may fail due to schema errors
 * @param context - Context for error logging
 * @param fallback - Value to return if schema error occurs (defaults to empty array)
 */
export async function withSchemaErrorHandling<T>(
  fn: () => Promise<T>,
  context: {
    operation: string;
    table?: string;
  },
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const { handled } = handleSchemaError(error, context);
    if (handled) {
      return fallback;
    }
    // Re-throw non-schema errors
    throw error;
  }
}
