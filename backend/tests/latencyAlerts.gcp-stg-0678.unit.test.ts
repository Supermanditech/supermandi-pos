/**
 * GCP-STG-0678: Latency alerting script validation
 *
 * Verifies the create-latency-alerts.sh script exists, is valid bash,
 * and covers the required P95/P99 latency alert configurations.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

describe("GCP-STG-0678: Latency alerting script", () => {
  const scriptPath = path.resolve(__dirname, "../../scripts/gcp/create-latency-alerts.sh");

  it("script file exists", () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it("starts with bash shebang", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content.startsWith("#!/bin/bash")).toBe(true);
  });

  it("references GCP-STG-0678 ticket", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("GCP-STG-0678");
  });

  it("covers P95 latency metric", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toMatch(/95th percentile|p95/i);
  });

  it("covers P99 latency metric", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toMatch(/99th percentile|p99/i);
  });

  it("references Cloud Run request_latencies metric", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).toContain("request_latencies");
  });

  it("defines threshold values for alerting", () => {
    const content = fs.readFileSync(scriptPath, "utf8");
    // P95 threshold: 2000ms, P99 threshold: 5000ms
    expect(content).toMatch(/2000/);
    expect(content).toMatch(/5000/);
  });

  it("script executes without syntax errors (bash -n)", () => {
    // bash -n does a syntax check without running the script
    try {
      execSync(`bash -n "${scriptPath}"`, { encoding: "utf8", timeout: 5000 });
    } catch (err: any) {
      fail(`Script has bash syntax errors: ${err.message}`);
    }
  });
});
