/**
 * GCP-STG-0686: CDN config for product images — gate script exists
 */
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0686: CDN image setup script", () => {
  const scriptPath = path.resolve(__dirname, "..", "setup-cdn-images.sh");

  it("script file exists", () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it("contains Cloud CDN backend bucket command", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("backend-buckets create");
    expect(content).toContain("supermandi-images-cdn");
  });

  it("contains CORS configuration", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("gsutil cors set");
  });

  it("mentions signed URLs as alternative", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("Signed URLs");
    expect(content).toContain("imageService.ts");
  });
});
