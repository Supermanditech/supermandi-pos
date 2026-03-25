/**
 * GCP-STG-0749: POS Notification Center UI — behavioral test
 * Verifies: screen file exists, exports default, API module exports, wrapper export, App.tsx registration
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..", "..");

describe("GCP-STG-0749: NotificationsScreenV3", () => {
  it("screen file exists and exports default component", () => {
    const mod = require("../../screens/v3/NotificationsScreenV3");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  it("notificationApi exports getNotifications, markNotificationRead, markAllNotificationsRead", () => {
    const api = require("../../services/api/notificationApi");
    expect(typeof api.getNotifications).toBe("function");
    expect(typeof api.markNotificationRead).toBe("function");
    expect(typeof api.markAllNotificationsRead).toBe("function");
  });

  it("V3ScreenWrappers exports V3NotificationsWrapper", () => {
    const wrappers = require("../../screens/v3/V3ScreenWrappers");
    expect(typeof wrappers.V3NotificationsWrapper).toBe("function");
  });

  it("App.tsx contains V3Notifications screen registration", () => {
    const appSrc = fs.readFileSync(path.join(ROOT, "App.tsx"), "utf8");
    expect(appSrc).toContain("V3Notifications");
    expect(appSrc).toContain("V3NotificationsWrapper");
  });

  it("BrandedHeader accepts onAlertPress prop", () => {
    const headerSrc = fs.readFileSync(
      path.join(ROOT, "src", "components", "v3", "BrandedHeader.tsx"),
      "utf8"
    );
    expect(headerSrc).toContain("onAlertPress");
  });

  it("SellScreenV3 wires onAlertPress to V3Notifications navigation", () => {
    const sellSrc = fs.readFileSync(
      path.join(ROOT, "src", "screens", "v3", "SellScreenV3.tsx"),
      "utf8"
    );
    expect(sellSrc).toContain("onAlertPress");
    expect(sellSrc).toContain("V3Notifications");
  });
});
