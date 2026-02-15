// Unit tests for backend/src/config/onboardingConfig.ts
import { loadOnboardingConfig, getOnboardingConfig } from "../src/config/onboardingConfig";

describe("loadOnboardingConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test" };
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("loads config with all env vars set", () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.EMAIL_PROVIDER = "sendgrid";
    process.env.PORTAL_BASE_URL = "https://portal.supermandi.com";
    process.env.POS_APP_DOWNLOAD_URL = "https://play.google.com/store/apps/details?id=com.supermandi.pos";

    const config = loadOnboardingConfig();
    expect(config.smsEnabled).toBe(true);
    expect(config.smsProvider).toBe("twilio");
    expect(config.emailEnabled).toBe(true);
    expect(config.emailProvider).toBe("sendgrid");
    expect(config.portalBaseUrl).toBe("https://portal.supermandi.com");
    expect(config.posAppDownloadUrl).toBe(
      "https://play.google.com/store/apps/details?id=com.supermandi.pos"
    );
  });

  it("disables SMS when SMS_DISABLED=true", () => {
    process.env.SMS_DISABLED = "true";
    process.env.EMAIL_PROVIDER = "sendgrid";
    process.env.PORTAL_BASE_URL = "https://portal.supermandi.com";
    process.env.POS_APP_DOWNLOAD_URL = "https://app.supermandi.com";

    const config = loadOnboardingConfig();
    expect(config.smsEnabled).toBe(false);
    expect(config.smsProvider).toBeNull();
  });

  it("disables Email when EMAIL_DISABLED=true", () => {
    process.env.SMS_PROVIDER = "twilio";
    process.env.EMAIL_DISABLED = "true";
    process.env.PORTAL_BASE_URL = "https://portal.supermandi.com";
    process.env.POS_APP_DOWNLOAD_URL = "https://app.supermandi.com";

    const config = loadOnboardingConfig();
    expect(config.emailEnabled).toBe(false);
    expect(config.emailProvider).toBeNull();
  });

  it("throws in production when required vars are missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.SMS_PROVIDER;
    delete process.env.SMS_DISABLED;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_DISABLED;
    delete process.env.PORTAL_BASE_URL;
    delete process.env.POS_APP_DOWNLOAD_URL;

    expect(() => loadOnboardingConfig()).toThrow("Missing onboarding env vars");
  });

  it("warns but does not throw in development when vars missing", () => {
    process.env.NODE_ENV = "development";
    delete process.env.SMS_PROVIDER;
    delete process.env.SMS_DISABLED;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_DISABLED;
    delete process.env.PORTAL_BASE_URL;
    delete process.env.POS_APP_DOWNLOAD_URL;

    expect(() => loadOnboardingConfig()).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns null values for missing optional URLs in dev", () => {
    process.env.NODE_ENV = "development";
    process.env.SMS_DISABLED = "true";
    process.env.EMAIL_DISABLED = "true";
    delete process.env.PORTAL_BASE_URL;
    delete process.env.POS_APP_DOWNLOAD_URL;

    const config = loadOnboardingConfig();
    expect(config.portalBaseUrl).toBeNull();
    expect(config.posAppDownloadUrl).toBeNull();
  });
});

describe("getOnboardingConfig", () => {
  it("returns defaults when not loaded", () => {
    // Since loadOnboardingConfig might have been called in previous tests,
    // we test the default structure
    const config = getOnboardingConfig();
    expect(config).toHaveProperty("smsEnabled");
    expect(config).toHaveProperty("emailEnabled");
    expect(config).toHaveProperty("portalBaseUrl");
    expect(config).toHaveProperty("posAppDownloadUrl");
    expect(config).toHaveProperty("smsProvider");
    expect(config).toHaveProperty("emailProvider");
  });

  it("returns object with boolean smsEnabled and emailEnabled", () => {
    const config = getOnboardingConfig();
    expect(typeof config.smsEnabled).toBe("boolean");
    expect(typeof config.emailEnabled).toBe("boolean");
  });
});
