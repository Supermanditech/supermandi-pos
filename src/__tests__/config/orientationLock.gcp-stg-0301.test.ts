/**
 * GCP-STG-0301: Orientation lock portrait in app.json
 */
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0301: Orientation lock", () => {
  const appJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../app.json"), "utf8")
  );

  test("expo.orientation is set to portrait", () => {
    expect(appJson.expo.orientation).toBe("portrait");
  });

  test("orientation is not default (allows rotation)", () => {
    expect(appJson.expo.orientation).not.toBe("default");
  });
});
