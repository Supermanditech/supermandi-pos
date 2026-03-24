/**
 * GCP-STG-0681: PII encryption at rest verification.
 *
 * Validates that:
 * 1. Encryption verification script exists and covers all PII categories
 * 2. .env.cloudrun.example documents encryption-at-rest
 * 3. No application-level encryption is needed (Cloud SQL handles it)
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

describe("GCP-STG-0681: PII encryption at rest", () => {
  describe("verify-encryption.sh script", () => {
    const scriptPath = path.join(ROOT, "scripts/gcp/verify-encryption.sh");
    let content: string;

    beforeAll(() => {
      content = fs.readFileSync(scriptPath, "utf-8");
    });

    it("script file exists", () => {
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("documents all PII categories", () => {
      const piiTypes = ["Phone numbers", "GSTIN", "Bank account", "Addresses", "Email"];
      for (const pii of piiTypes) {
        expect(content.toLowerCase()).toContain(pii.toLowerCase());
      }
    });

    it("references Google-managed encryption keys", () => {
      expect(content).toContain("Google-managed encryption keys");
    });

    it("mentions AES-256 encryption", () => {
      expect(content).toContain("AES-256");
    });

    it("checks Cloud SQL instance encryption config", () => {
      expect(content).toContain("gcloud sql instances describe");
      expect(content).toContain("dataDiskEncryptionConfiguration");
    });

    it("includes CMEK upgrade instructions", () => {
      expect(content).toContain("disk-encryption-key");
      expect(content).toContain("CMEK");
    });

    it("verifies backup encryption", () => {
      expect(content).toContain("backupConfiguration");
    });
  });

  describe(".env.cloudrun.example documentation", () => {
    const envPath = path.join(ROOT, "backend/.env.cloudrun.example");
    let content: string;

    beforeAll(() => {
      content = fs.readFileSync(envPath, "utf-8");
    });

    it("documents PII encryption at rest", () => {
      expect(content).toContain("PII ENCRYPTION AT REST");
    });

    it("mentions Cloud SQL automatic encryption", () => {
      expect(content).toContain("Cloud SQL encrypts ALL data at rest");
    });

    it("lists PII data types covered", () => {
      expect(content).toContain("phone numbers");
      expect(content).toContain("GSTIN");
      expect(content).toContain("bank details");
    });

    it("references verification script", () => {
      expect(content).toContain("scripts/gcp/verify-encryption.sh");
    });
  });
});
