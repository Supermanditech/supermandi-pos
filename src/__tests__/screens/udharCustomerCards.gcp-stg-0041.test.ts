// GCP-STG-0041: Udhar screen customer avatar circles + due balance display
// Tests that Udhar screen renders per prototype spec

import * as fs from "fs";
import * as path from "path";

const udharPath = path.resolve(__dirname, "../../screens/v3/UdharScreenV3.tsx");
const udharCode = fs.readFileSync(udharPath, "utf-8");

describe("GCP-STG-0041: Udhar screen customer cards", () => {
  test("Customer type includes dueBalanceMinor field", () => {
    expect(udharCode).toContain("dueBalanceMinor?: number");
  });

  test("section title is 'OR SELECT EXISTING' (not RECENT CUSTOMERS)", () => {
    expect(udharCode).toContain("OR SELECT EXISTING");
    expect(udharCode).not.toContain("RECENT CUSTOMERS");
  });

  test("renders circular avatar with customer initial", () => {
    expect(udharCode).toContain("const initial = (item.name");
    expect(udharCode).toContain(".charAt(0).toUpperCase()");
  });

  test("avatar style is 44x44px circle", () => {
    expect(udharCode).toContain("width: 44, height: 44, borderRadius: 22");
  });

  test("customer name uses 14px font weight 700", () => {
    expect(udharCode).toContain("fontSize: 14, fontWeight: \"700\"");
  });

  test("displays due balance when > 0", () => {
    expect(udharCode).toContain("existing");
    expect(udharCode).toContain("dueBalanceMinor");
  });

  test("fetches khata balances for due balance display", () => {
    expect(udharCode).toContain("/api/v1/pos/khata/customers");
  });

  test("merges due balances into customer list via phone map", () => {
    expect(udharCode).toContain("balanceMap");
    expect(udharCode).toContain("balanceMap.get(c.phone)");
  });

  test("avatar has active state when customer is selected", () => {
    expect(udharCode).toContain("styles.avatarActive");
    expect(udharCode).toContain("styles.avatarTextActive");
  });
});
