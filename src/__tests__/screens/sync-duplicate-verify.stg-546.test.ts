/**
 * STG-546: Sync duplicate_ignored — verify mapping before clearing
 *
 * Verifies that duplicate_ignored events are checked for mappings
 * before being cleared from the outbox.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../services/offline/sync.ts"
);

describe("STG-546: Sync duplicate_ignored mapping verification", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("separates duplicate_ignored from applied events", () => {
    expect(content).toContain("duplicateIds");
    expect(content).toContain('r.status === "duplicate_ignored"');
  });

  test("processes mappings BEFORE clearing outbox", () => {
    const mappingIdx = content.indexOf("await markMappings(");
    const clearIdx = content.indexOf("await markEventsSynced([...appliedIds");
    expect(mappingIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(-1);
    expect(mappingIdx).toBeLessThan(clearIdx);
  });

  test("verifies mappings exist for sale-type duplicates", () => {
    expect(content).toContain("mappedLocalIds");
    expect(content).toContain("safeToClearDuplicates");
  });

  test("warns when duplicate has no mapping", () => {
    expect(content).toContain("[STG-546] duplicate_ignored event");
    expect(content).toContain("has no mapping");
  });
});
