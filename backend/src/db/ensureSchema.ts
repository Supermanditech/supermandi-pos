import { getPool } from "./client";

let ensured = false;

export async function ensurePosEventsTable(): Promise<void> {
  if (ensured) return;

  const pool = getPool();
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pos_events (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS pos_events_created_at_idx ON pos_events (created_at DESC);
    CREATE INDEX IF NOT EXISTS pos_events_store_id_idx ON pos_events (store_id);
    CREATE INDEX IF NOT EXISTS pos_events_device_id_idx ON pos_events (device_id);
  `);

  ensured = true;
}
