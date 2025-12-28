import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const posEvents = pgTable("pos_events", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull(),
  storeId: text("store_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});
