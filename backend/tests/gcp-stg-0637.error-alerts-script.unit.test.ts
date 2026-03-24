/**
 * GCP-STG-0637: Verify 5xx error rate alerting script exists and is well-formed.
 *
 * Since gcloud commands cannot run in CI, this test validates the script
 * structure, ensuring it covers all 6 Cloud Run services and has the
 * correct alert threshold configuration.
 */
import * as fs from "fs";
import * as path from "path";

const SCRIPT_PATH = path.resolve(__dirname, "../../scripts/gcp/create-error-alerts.sh");

describe("GCP-STG-0637: 5xx error alert script", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(SCRIPT_PATH, "utf-8");
  });

  it("script file exists", () => {
    expect(fs.existsSync(SCRIPT_PATH)).toBe(true);
  });

  it("covers all 6 Cloud Run services", () => {
    const services = ["api-gateway", "main-backend", "retailer-admin", "supplier-portal", "superadmin", "landing"];
    for (const svc of services) {
      expect(content).toContain(svc);
    }
  });

  it("uses 5% threshold for 5xx errors", () => {
    expect(content).toContain("0.05");
    expect(content).toContain("5xx");
  });

  it("uses 5-minute alignment period (300s)", () => {
    expect(content).toContain("300s");
  });

  it("targets cloud_run_revision resource type", () => {
    expect(content).toContain("cloud_run_revision");
  });

  it("includes rollback runbook in documentation", () => {
    expect(content).toContain("Runbook");
    expect(content).toContain("roll back");
  });

  it("references GCP_PROJECT_ID env var for portability", () => {
    expect(content).toContain("GCP_PROJECT_ID");
  });

  it("supports notification channel configuration", () => {
    expect(content).toContain("ALERT_NOTIFICATION_CHANNEL");
    expect(content).toContain("notificationChannels");
  });
});
