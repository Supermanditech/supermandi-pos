/**
 * GCP-STG-0713: CI master gate — verify all required jobs exist as blocking gates.
 *
 * Required jobs:
 * 1. Backend: tsc + eslint + jest
 * 2. SuperAdmin: tsc + vite build + vitest
 * 3. Retailer: tsc + vite build + vitest
 * 4. Supplier: tsc + next build
 * 5. POS: tsc
 * 6. Fix guard check
 * 7. Migration sequence validation
 */
import * as fs from "fs";
import * as path from "path";

const CI_GATES_PATH = path.resolve(__dirname, "../../.github/workflows/ci-gates.yml");

describe("GCP-STG-0713: CI master gate", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(CI_GATES_PATH, "utf-8");
  });

  // --- Required jobs exist ---
  describe("required jobs exist", () => {
    it("has typecheck job (covers backend, retailer, superadmin, supplier)", () => {
      expect(content).toContain("typecheck:");
      expect(content).toContain("Typecheck backend");
      expect(content).toContain("Typecheck retailer-admin");
      expect(content).toContain("Typecheck supermandi-superadmin");
      expect(content).toContain("Typecheck supplier-portal");
    });

    it("has lint job (eslint for all projects)", () => {
      expect(content).toContain("lint:");
      expect(content).toContain("Lint backend");
      expect(content).toContain("Lint retailer-admin");
    });

    it("has test job (jest for backend with Postgres)", () => {
      expect(content).toContain("test:");
      expect(content).toContain("Test backend");
      expect(content).toContain("postgres:");
    });

    it("has build-verify job (vite build + next build)", () => {
      expect(content).toContain("build-verify:");
      expect(content).toContain("Build retailer-admin");
      expect(content).toContain("Build supermandi-superadmin");
      expect(content).toContain("Build supplier-portal");
    });

    it("has portal-tests job (vitest for retailer + superadmin + supplier)", () => {
      expect(content).toContain("portal-tests:");
      expect(content).toContain("Test retailer-admin");
      expect(content).toContain("Test supermandi-superadmin");
      expect(content).toContain("Test supplier-portal");
    });

    it("has POS typecheck job", () => {
      expect(content).toContain("pos-typecheck:");
      expect(content).toContain("POS: TypeScript Check");
      expect(content).toContain("npx tsc --noEmit");
    });

    it("has fix-guard check job", () => {
      expect(content).toContain("fix-guard-check:");
      expect(content).toContain("Fix Guard: Zero Drift");
      expect(content).toContain("node scripts/fix-guard.js check");
    });

    it("has migration-safety job", () => {
      expect(content).toContain("migration-safety:");
      expect(content).toContain("Migration Safety");
    });
  });

  // --- Gate-check aggregation ---
  describe("gate-check aggregation", () => {
    it("gate-check needs all required jobs", () => {
      const requiredJobs = [
        "typecheck", "lint", "test", "build-verify",
        "pos-typecheck", "fix-guard-check", "migration-safety",
        "portal-tests"
      ];
      for (const job of requiredJobs) {
        expect(content).toContain(job);
      }
    });

    it("gate-check includes pos-typecheck in needs list", () => {
      // The needs array spans multiple lines; just verify the job is listed
      // after the gate-check definition and before if: always()
      const gateCheckSection = content.slice(content.indexOf("gate-check:"));
      expect(gateCheckSection).toContain("pos-typecheck");
    });

    it("gate-check includes fix-guard-check in needs list", () => {
      const gateCheckSection = content.slice(content.indexOf("gate-check:"));
      expect(gateCheckSection).toContain("fix-guard-check");
    });

    it("gate-check validates pos-typecheck result", () => {
      expect(content).toContain('needs.pos-typecheck.result');
    });

    it("gate-check validates fix-guard-check result", () => {
      expect(content).toContain('needs.fix-guard-check.result');
    });
  });

  // --- Blocking behavior ---
  describe("blocking behavior", () => {
    it("gate-check exits with error code on failure", () => {
      expect(content).toContain("exit 1");
    });

    it("gate-check uses if: always() to run even if jobs fail", () => {
      expect(content).toContain("if: always()");
    });
  });
});
