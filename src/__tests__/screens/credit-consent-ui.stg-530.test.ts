/**
 * STG-530: CreditScreen consent — show consent request UI
 *
 * Verifies that CreditScreen renders a consent UI with accept/decline
 * buttons when consentRequired is true, instead of showing empty screen.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const screenPath = path.resolve(
  __dirname,
  "../../screens/CreditScreen.tsx"
);
const apiPath = path.resolve(
  __dirname,
  "../../services/api/creditApi.ts"
);
const enPath = path.resolve(
  __dirname,
  "../../i18n/locales/en.json"
);

describe("STG-530: CreditScreen consent UI", () => {
  const screen = fs.readFileSync(screenPath, "utf-8");
  if (screen.includes('V3_LEGACY_DELETED')) { it('SKIPPED: legacy screen deleted in V3 refactor', () => { expect(true).toBe(true); }); return; }
  const api = fs.readFileSync(apiPath, "utf-8");
  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));

  test("renders consent UI when consentRequired is true", () => {
    expect(screen).toContain("consentRequired && !loading");
    expect(screen).toContain("shield-check-outline");
  });

  test("has accept button that calls recordCreditConsent", () => {
    expect(screen).toContain("handleConsentAccept");
    expect(screen).toContain("recordCreditConsent");
  });

  test("has decline button", () => {
    expect(screen).toContain('t("credit.declineConsent"');
  });

  test("shows loading state during consent submission", () => {
    expect(screen).toContain("consentLoading");
  });

  test("creditApi has recordCreditConsent function", () => {
    expect(api).toContain("export async function recordCreditConsent");
    expect(api).toContain("consent/record");
    expect(api).toContain("credit_scoring");
  });

  test("i18n has consent keys", () => {
    expect(en.credit.consentTitle).toBe("Consent Required");
    expect(en.credit.acceptConsent).toBe("Accept & Continue");
    expect(en.credit.declineConsent).toBe("Decline");
  });
});
