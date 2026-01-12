// Timestamp utilities - V3.0.9 compliant
// All timestamps use TIMESTAMPTZ (timestamp with time zone)

/**
 * Get current timestamp in ISO format
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * Parse a date string or Date object to ISO format
 */
export function toISO(date: Date | string): string {
  if (typeof date === 'string') {
    return new Date(date).toISOString();
  }
  return date.toISOString();
}

/**
 * Format a date for display (India timezone)
 */
export function formatIndiaTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/**
 * Format a date for display (date only)
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

/**
 * Get start of day in UTC
 */
export function startOfDay(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day in UTC
 */
export function endOfDay(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Add days to a date
 */
export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Check if a date is within a range
 */
export function isWithinRange(
  date: Date | string,
  start: Date | string,
  end: Date | string
): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  return d >= s && d <= e;
}

/**
 * SQL fragment for created_at column
 */
export const CREATED_AT = 'TIMESTAMPTZ NOT NULL DEFAULT NOW()';

/**
 * SQL fragment for updated_at column
 */
export const UPDATED_AT = 'TIMESTAMPTZ NOT NULL DEFAULT NOW()';

/**
 * SQL fragment for optional timestamp column
 */
export const TIMESTAMP_NULLABLE = 'TIMESTAMPTZ';

/**
 * SQL trigger function for auto-updating updated_at
 */
export const UPDATE_TIMESTAMP_TRIGGER = `
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
`;

/**
 * Generate SQL to add updated_at trigger to a table
 */
export function createUpdatedAtTrigger(tableName: string): string {
  return `
CREATE TRIGGER update_${tableName.replace('.', '_')}_updated_at
  BEFORE UPDATE ON ${tableName}
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
`;
}
