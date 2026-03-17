/**
 * V3-REG-027: Retailer-admin StaffPage contract tests
 * Uses fs.readFileSync with require() for Jest CJS compatibility.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require("fs");
const path = require("path");

const staffPage = fs.readFileSync(path.join(__dirname, "../pages/StaffPage.tsx"), "utf8");
const appRouter = fs.readFileSync(path.join(__dirname, "../App.tsx"), "utf8");
const layout = fs.readFileSync(path.join(__dirname, "../components/ProtectedLayout.tsx"), "utf8");

describe("StaffPage route and navigation", () => {
  it("should be registered at /staff route", () => {
    expect(appRouter).toContain('path="staff"');
    expect(appRouter).toContain("StaffPage");
  });

  it("should have a nav item in ProtectedLayout", () => {
    expect(layout).toContain("path: 'staff'");
    expect(layout).toContain("label: 'Staff'");
  });
});

describe("StaffPage CRUD capabilities", () => {
  it("should have fetchStaff for listing", () => {
    expect(staffPage).toContain("fetchStaff");
    expect(staffPage).toContain("/api/v1/retailer-admin/staff");
  });

  it("should have handleCreate for creating staff", () => {
    expect(staffPage).toContain("handleCreate");
  });

  it("should have handleEdit for editing name/role", () => {
    expect(staffPage).toContain("handleEdit");
    expect(staffPage).toContain("editName");
    expect(staffPage).toContain("editRole");
  });

  it("should have handleToggleActive for activate/deactivate", () => {
    expect(staffPage).toContain("handleToggleActive");
    expect(staffPage).toContain("is_active");
  });

  it("should have handleResetPin for PIN reset", () => {
    expect(staffPage).toContain("handleResetPin");
    expect(staffPage).toContain("reset-pin");
  });

  it("should have Edit button in staff card", () => {
    expect(staffPage).toContain(">Edit<");
  });

  it("should show empty state when no staff", () => {
    expect(staffPage).toContain("No staff yet");
  });
});
