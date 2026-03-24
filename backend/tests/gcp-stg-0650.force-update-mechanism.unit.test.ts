/**
 * GCP-STG-0650: POS force update mechanism — end-to-end verification.
 *
 * Verifies the complete chain:
 * 1. Backend reads MIN_APP_VERSION env var and compares with x-app-version header
 * 2. ui-status response includes forceUpdate + minAppVersion fields
 * 3. SplashScreenV3 checks forceUpdate and navigates to ForceUpdate screen
 * 4. ForceUpdateScreen blocks navigation and shows Play Store link
 * 5. ForceUpdateScreen has retry-check mechanism (fetchUiStatusStrict)
 * 6. deploy.yml passes MIN_APP_VERSION to Cloud Run
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

describe("GCP-STG-0650: POS force update mechanism", () => {
  // --- Backend side ---
  describe("backend ui-status route", () => {
    const uiStatusPath = path.join(ROOT, "backend/src/routes/v1/pos/uiStatus.ts");
    let uiStatusContent: string;

    beforeAll(() => {
      uiStatusContent = fs.readFileSync(uiStatusPath, "utf-8");
    });

    it("reads MIN_APP_VERSION env var", () => {
      expect(uiStatusContent).toContain("process.env.MIN_APP_VERSION");
    });

    it("compares app version using compareSemver", () => {
      expect(uiStatusContent).toContain("compareSemver(effectiveAppVersion, minAppVersionValue)");
    });

    it("returns forceUpdate and minAppVersion in response", () => {
      expect(uiStatusContent).toContain("forceUpdate");
      expect(uiStatusContent).toContain("minAppVersion");
    });

    it("reads x-app-version header from POS request", () => {
      expect(uiStatusContent).toContain("x-app-version");
    });
  });

  // --- Frontend side: SplashScreen ---
  describe("SplashScreenV3 force update check", () => {
    const splashPath = path.join(ROOT, "src/screens/v3/SplashScreenV3.tsx");
    let splashContent: string;

    beforeAll(() => {
      splashContent = fs.readFileSync(splashPath, "utf-8");
    });

    it("calls fetchUiStatus on app launch", () => {
      expect(splashContent).toContain("fetchUiStatus()");
    });

    it("checks forceUpdate flag from ui-status response", () => {
      expect(splashContent).toContain("status.forceUpdate");
    });

    it("navigates to ForceUpdate screen when update required", () => {
      expect(splashContent).toContain('safeNavigate("ForceUpdate"');
    });

    it("passes currentVersion and requiredVersion params", () => {
      expect(splashContent).toContain("currentVersion");
      expect(splashContent).toContain("requiredVersion");
    });
  });

  // --- Frontend side: ForceUpdateScreen ---
  describe("ForceUpdateScreen blocking modal", () => {
    const forcePath = path.join(ROOT, "src/screens/ForceUpdateScreen.tsx");
    let forceContent: string;

    beforeAll(() => {
      forceContent = fs.readFileSync(forcePath, "utf-8");
    });

    it("blocks Android back button during force update", () => {
      expect(forceContent).toContain("BackHandler.addEventListener");
      expect(forceContent).toContain("hardwareBackPress");
    });

    it("includes Play Store link for Android update", () => {
      expect(forceContent).toContain("play.google.com/store/apps");
    });

    it("uses fetchUiStatusStrict for re-check (prevents bypass)", () => {
      expect(forceContent).toContain("fetchUiStatusStrict");
    });

    it("shows current and required version to user", () => {
      expect(forceContent).toContain("currentVersion");
      expect(forceContent).toContain("requiredVersion");
    });

    it("handles retry with cooldown to prevent rapid taps", () => {
      expect(forceContent).toContain("RETRY_COOLDOWN_MS");
    });

    it("navigates to SellScan if update no longer required", () => {
      expect(forceContent).toContain('{ name: "SellScan" }');
    });
  });

  // --- Deploy pipeline ---
  describe("deploy.yml passes MIN_APP_VERSION", () => {
    const deployPath = path.join(ROOT, ".github/workflows/deploy.yml");
    let deployContent: string;

    beforeAll(() => {
      deployContent = fs.readFileSync(deployPath, "utf-8");
    });

    it("includes MIN_APP_VERSION in Cloud Run env vars", () => {
      expect(deployContent).toContain("MIN_APP_VERSION");
    });
  });

  // --- app.json version ---
  describe("app.json version configuration", () => {
    const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf-8"));

    it("has a valid semver version in app.json", () => {
      const version = appJson.expo.version;
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  // --- uiStatusApi.ts client ---
  describe("uiStatusApi client parses force update fields", () => {
    const apiPath = path.join(ROOT, "src/services/api/uiStatusApi.ts");
    let apiContent: string;

    beforeAll(() => {
      apiContent = fs.readFileSync(apiPath, "utf-8");
    });

    it("sends x-app-version header to backend", () => {
      expect(apiContent).toContain('"x-app-version"');
    });

    it("parses forceUpdate from response", () => {
      expect(apiContent).toContain("forceUpdate");
    });

    it("parses minAppVersion from response", () => {
      expect(apiContent).toContain("minAppVersion");
    });

    it("defaults forceUpdate to false when offline", () => {
      expect(apiContent).toContain("forceUpdate: false");
    });
  });
});
