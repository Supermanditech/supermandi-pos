/**
 * GCP-STG-0702: APK version auto-increment gate script
 */
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0702: APK version bump script", () => {
  const scriptPath = path.resolve(__dirname, "..", "apk-version-bump.sh");

  it("script file exists", () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it("contains versionCode bump logic", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("versionCode");
    expect(content).toContain("NEW_CODE=$((CURRENT_CODE + 1))");
  });

  it("contains versionName bump logic", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("versionName");
    expect(content).toContain("NEW_PATCH=$((PATCH + 1))");
  });

  it("updates both build.gradle and app.json", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("android/app/build.gradle");
    expect(content).toContain("app.json");
  });

  it("uses set -e for fail-fast", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("set -e");
  });
});
