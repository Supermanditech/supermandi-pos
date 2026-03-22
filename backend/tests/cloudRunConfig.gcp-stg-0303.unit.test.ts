/**
 * GCP-STG-0303: Cloud Run scaling config for 10K users
 */
import * as fs from "fs";
import * as path from "path";

const DEPLOY = fs.readFileSync(
  path.resolve(__dirname, "../../.github/workflows/deploy.yml"), "utf8"
);

describe("GCP-STG-0303: Cloud Run scaling config", () => {
  describe("main-backend", () => {
    test("max-instances >= 10", () => {
      // Find main-backend deploy section (has add-cloudsql-instances)
      const backendSection = DEPLOY.split("add-cloudsql-instances")[0];
      const maxMatch = backendSection.match(/--max-instances=(\d+)/);
      expect(maxMatch).not.toBeNull();
      expect(parseInt(maxMatch![1])).toBeGreaterThanOrEqual(10);
    });

    test("concurrency is explicitly set", () => {
      const backendSection = DEPLOY.split("add-cloudsql-instances")[0];
      expect(backendSection).toContain("--concurrency=");
    });

    test("timeout >= 3600 for SSE connections", () => {
      const backendSection = DEPLOY.split("add-cloudsql-instances")[0];
      const timeoutMatch = backendSection.match(/--timeout=(\d+)/);
      expect(timeoutMatch).not.toBeNull();
      expect(parseInt(timeoutMatch![1])).toBeGreaterThanOrEqual(3600);
    });

    test("min-instances >= 1 (no cold start)", () => {
      const backendSection = DEPLOY.split("add-cloudsql-instances")[0];
      const minMatch = backendSection.match(/--min-instances=(\d+)/);
      expect(minMatch).not.toBeNull();
      expect(parseInt(minMatch![1])).toBeGreaterThanOrEqual(1);
    });
  });

  describe("api-gateway", () => {
    // The gateway section uses vpc-egress=all-traffic (backend uses private-ranges-only)
    const gwSection = DEPLOY.split("vpc-egress=all-traffic")[0]?.split("vpc-egress=private-ranges-only").pop() || "";

    test("min-instances >= 1 (no cold start for entry point)", () => {
      const minMatch = gwSection.match(/--min-instances=(\d+)/);
      expect(minMatch).not.toBeNull();
      expect(parseInt(minMatch![1])).toBeGreaterThanOrEqual(1);
    });

    test("max-instances >= 10", () => {
      const maxMatch = gwSection.match(/--max-instances=(\d+)/);
      expect(maxMatch).not.toBeNull();
      expect(parseInt(maxMatch![1])).toBeGreaterThanOrEqual(10);
    });
  });
});
