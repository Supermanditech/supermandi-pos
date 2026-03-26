/**
 * GCP-STG-0771: AsyncStorage keys namespaced with supermandi. prefix
 */
describe("GCP-STG-0771: Namespaced AsyncStorage keys", () => {
  const fs = require("fs");
  const keys = fs.readFileSync("src/constants/storageKeys.ts", "utf8");

  it("should namespace offline scan queue", () => {
    expect(keys).toContain('SK_OFFLINE_SCAN_QUEUE = "supermandi.offline.scanQueue.v1"');
    expect(keys).toContain('SK_OFFLINE_SCAN_QUEUE_LEGACY = "offline_scan_queue"');
  });

  it("should namespace TTS keys", () => {
    expect(keys).toContain('SK_TTS_ENABLED = "supermandi.tts.enabled"');
    expect(keys).toContain('SK_TTS_LANGUAGE = "supermandi.tts.language"');
  });

  it("should namespace event logs key", () => {
    expect(keys).toContain('SK_EVENT_LOGS = "supermandi.diagnostics.eventLogs.v1"');
    expect(keys).toContain('SK_EVENT_LOGS_LEGACY = "@pos_event_logs"');
  });

  it("should have migration function", () => {
    expect(keys).toContain("export async function migrateStorageKeys");
    expect(keys).toContain("LEGACY_KEY_MAP");
  });

  it("should migrate old→new and remove old key", () => {
    expect(keys).toContain("AsyncStorage.setItem(newKey, value)");
    expect(keys).toContain("AsyncStorage.removeItem(oldKey)");
  });

  it("all SK_ exports should use supermandi. prefix (except LEGACY)", () => {
    const exports = keys.match(/export const SK_\w+ = "[^"]+"/g) || [];
    for (const exp of exports) {
      if (exp.includes("LEGACY")) continue;
      const value = exp.match(/"([^"]+)"/)?.[1] || "";
      expect(value.startsWith("supermandi.")).toBe(true);
    }
  });
});
