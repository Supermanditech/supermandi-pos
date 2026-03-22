/**
 * GCP-STG-0318: WhatsApp incoming message handling
 */
import * as fs from "fs";
import * as path from "path";

const WEBHOOK_SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/webhooks/whatsappWebhook.ts"), "utf8"
);

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../migrations/220_gcp_stg_0318_whatsapp_incoming.sql"), "utf8"
);

describe("GCP-STG-0318: WhatsApp incoming message handling", () => {
  test("migration creates whatsapp.incoming_messages table", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS whatsapp.incoming_messages");
    expect(MIGRATION).toContain("wamid VARCHAR(200) UNIQUE NOT NULL");
    expect(MIGRATION).toContain("from_phone VARCHAR(20) NOT NULL");
    expect(MIGRATION).toContain("text_body TEXT");
  });

  test("webhook processes value.messages array", () => {
    expect(WEBHOOK_SRC).toContain("const messages = value.messages");
    expect(WEBHOOK_SRC).toContain("processIncomingMessage(pool, msg");
  });

  test("processIncomingMessage inserts into whatsapp.incoming_messages", () => {
    expect(WEBHOOK_SRC).toContain("INSERT INTO whatsapp.incoming_messages");
    expect(WEBHOOK_SRC).toContain("ON CONFLICT (wamid) DO NOTHING");
  });

  test("processIncomingMessage handles text, image, and document types", () => {
    expect(WEBHOOK_SRC).toContain("msg.text?.body");
    expect(WEBHOOK_SRC).toContain("msg.image?.id");
    expect(WEBHOOK_SRC).toContain("msg.document?.id");
  });

  test("processIncomingMessage extracts profile name from contacts", () => {
    expect(WEBHOOK_SRC).toContain("contacts?.[0]?.profile?.name");
  });

  test("processIncomingMessage stores raw_payload as JSON", () => {
    expect(WEBHOOK_SRC).toContain("JSON.stringify(msg)");
  });
});
