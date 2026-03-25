/**
 * GCP-STG-0749: POS Notification Center UI — behavioral test
 * Verifies: screen file exists with default export, API module has 3 functions,
 * wrapper exported, App.tsx registration, BrandedHeader + SellScreenV3 wiring
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SRC = path.join(ROOT, "src");

describe("GCP-STG-0749: NotificationsScreenV3", () => {
  it("screen file exists and exports default function component", () => {
    const screenPath = path.join(SRC, "screens", "v3", "NotificationsScreenV3.tsx");
    expect(fs.existsSync(screenPath)).toBe(true);
    const src = fs.readFileSync(screenPath, "utf8");
    expect(src).toContain("export default function");
    expect(src).toContain("NotificationsScreenV3");
  });

  it("notificationApi exports getNotifications, markNotificationRead, markAllNotificationsRead", () => {
    const apiPath = path.join(SRC, "services", "api", "notificationApi.ts");
    expect(fs.existsSync(apiPath)).toBe(true);
    const src = fs.readFileSync(apiPath, "utf8");
    expect(src).toContain("export async function getNotifications");
    expect(src).toContain("export async function markNotificationRead");
    expect(src).toContain("export async function markAllNotificationsRead");
  });

  it("V3ScreenWrappers exports V3NotificationsWrapper", () => {
    const wrappersPath = path.join(SRC, "screens", "v3", "V3ScreenWrappers.tsx");
    const src = fs.readFileSync(wrappersPath, "utf8");
    expect(src).toContain("V3NotificationsWrapper");
    expect(src).toContain("NotificationsScreenV3");
  });

  it("App.tsx contains V3Notifications screen registration", () => {
    const appSrc = fs.readFileSync(path.join(ROOT, "App.tsx"), "utf8");
    expect(appSrc).toContain("V3Notifications");
    expect(appSrc).toContain("V3NotificationsWrapper");
  });

  it("BrandedHeader accepts onAlertPress prop", () => {
    const headerSrc = fs.readFileSync(
      path.join(SRC, "components", "v3", "BrandedHeader.tsx"),
      "utf8"
    );
    expect(headerSrc).toContain("onAlertPress");
  });

  it("SellScreenV3 wires onAlertPress to V3Notifications navigation", () => {
    const sellSrc = fs.readFileSync(
      path.join(SRC, "screens", "v3", "SellScreenV3.tsx"),
      "utf8"
    );
    expect(sellSrc).toContain("onAlertPress");
    expect(sellSrc).toContain("V3Notifications");
  });
});
