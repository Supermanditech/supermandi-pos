/**
 * Contract tests for PR-1: retailer welcome/approval email template fixes.
 *
 * Validates:
 * - No iOS references in any template
 * - No "search Play Store" instructions
 * - Direct download link present
 * - Activation code included when provided
 * - Masked phone number shown
 * - Support email present
 * - Registration page copy accuracy
 */

// We test the exported functions indirectly by importing internal builders.
// Since builders are not exported, we test via the module's behavior.
// For unit testing template output, we extract the functions using require.

import * as path from "path";
import * as fs from "fs";

// Read the source file to validate template content statically
const notifServicePath = path.resolve(
  __dirname,
  "../../src/services/notificationService.ts"
);
const notifSource = fs.readFileSync(notifServicePath, "utf-8");

describe("PR-1: Welcome Email Template Contracts", () => {
  describe("iOS references removed", () => {
    it("should NOT contain APP_STORE_URL constant", () => {
      // APP_STORE_URL was removed — only POS_DOWNLOAD_URL should exist
      expect(notifSource).not.toMatch(/const APP_STORE_URL/);
    });

    it("should NOT contain 'iOS' in template strings", () => {
      // Extract template function bodies (between backtick strings)
      const templateMatches = notifSource.match(/`[^`]*iOS[^`]*`/g);
      expect(templateMatches).toBeNull();
    });

    it("should NOT contain 'App Store' download references", () => {
      expect(notifSource).not.toMatch(/Download for iOS/);
      expect(notifSource).not.toMatch(/appStoreUrl/);
    });
  });

  describe("Play Store search removed", () => {
    it("should NOT tell users to search Play Store", () => {
      expect(notifSource).not.toMatch(/Search for.*SuperMandi.*and install/);
      expect(notifSource).not.toMatch(/open the Google Play Store/i);
    });

    it("should NOT have separate Option A / Option B sections", () => {
      // Old template had "Option A: Physical POS Device" and "Option B: Mobile Phone"
      // New template has single "How to Activate Your POS" section
      expect(notifSource).not.toMatch(/Option A.*Physical POS/);
      expect(notifSource).not.toMatch(/Option B.*Android or iOS/);
    });
  });

  describe("Direct download link", () => {
    it("should use posDownloadUrl in templates", () => {
      expect(notifSource).toMatch(/posDownloadUrl/);
    });

    it("should have POS_DOWNLOAD_URL constant", () => {
      expect(notifSource).toMatch(/const POS_DOWNLOAD_URL/);
    });
  });

  describe("Activation code included", () => {
    it("should accept activationCode in WelcomeNotificationInput", () => {
      expect(notifSource).toMatch(/activationCode\??: string/);
    });

    it("should include activation code in WhatsApp template", () => {
      expect(notifSource).toMatch(/Activation Code.*\$\{input\.activationCode\}/s);
    });

    it("should include activation code in HTML email template", () => {
      expect(notifSource).toMatch(/activationCodeBlock/);
      expect(notifSource).toMatch(/input\.activationCode/);
    });

    it("should include activation code in SMS when provided", () => {
      expect(notifSource).toMatch(/Code: \$\{input\.activationCode\}/);
    });
  });

  describe("Masked phone number", () => {
    it("should have maskPhone helper function", () => {
      expect(notifSource).toMatch(/function maskPhone/);
    });

    it("should use masked phone in templates", () => {
      expect(notifSource).toMatch(/maskedPhone/);
    });
  });

  describe("Support email", () => {
    it("should have SUPPORT_EMAIL constant set to hello@supermandi.tech", () => {
      expect(notifSource).toMatch(/const SUPPORT_EMAIL = "hello@supermandi\.tech"/);
    });

    it("should include support email in welcome email", () => {
      // Check the template references SUPPORT_EMAIL
      const supportRefs = (notifSource.match(/SUPPORT_EMAIL/g) || []).length;
      // At minimum: constant declaration + welcome WhatsApp + welcome HTML + welcome text + registration HTML + registration text
      expect(supportRefs).toBeGreaterThanOrEqual(5);
    });
  });
});

describe("PR-1: Registration Page Copy", () => {
  const registerPagePath = path.resolve(
    __dirname,
    "../../../retailer-admin/src/pages/RegisterPage.tsx"
  );
  const loginPagePath = path.resolve(
    __dirname,
    "../../../retailer-admin/src/pages/LoginPage.tsx"
  );

  it("RegisterPage should say 'SMS and Email' not 'WhatsApp and Email'", () => {
    const src = fs.readFileSync(registerPagePath, "utf-8");
    expect(src).not.toMatch(/via WhatsApp and Email/);
    expect(src).toMatch(/via SMS and Email/);
  });

  it("LoginPage should say 'SMS and email' not 'WhatsApp and email'", () => {
    const src = fs.readFileSync(loginPagePath, "utf-8");
    expect(src).not.toMatch(/via WhatsApp and email/);
    expect(src).toMatch(/via SMS and email/);
  });
});

describe("PR-1: Caller passes activationCode", () => {
  const applicationsPath = path.resolve(
    __dirname,
    "../../src/routes/v1/admin/applications.ts"
  );
  const enrollmentsPath = path.resolve(
    __dirname,
    "../../src/routes/v1/admin/deviceEnrollments.ts"
  );

  it("applications.ts should pass activationCode to sendWelcomeNotification", () => {
    const src = fs.readFileSync(applicationsPath, "utf-8");
    expect(src).toMatch(/activationCode:\s*enrollment\.code/);
  });

  it("deviceEnrollments.ts should pass activationCode to sendWelcomeNotification", () => {
    const src = fs.readFileSync(enrollmentsPath, "utf-8");
    expect(src).toMatch(/activationCode:\s*code/);
  });
});
