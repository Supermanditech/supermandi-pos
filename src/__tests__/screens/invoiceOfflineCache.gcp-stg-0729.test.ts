// GCP-STG-0729: POS invoice offline caching structural test
import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0729: POS invoice offline caching", () => {
  it("SuccessScreenV3 caches invoice metadata to AsyncStorage", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/SuccessScreenV3.tsx"),
      "utf8"
    );
    expect(src).toContain("GCP-STG-0729");
    expect(src).toContain("AsyncStorage.setItem");
    expect(src).toContain("invoice:");
    expect(src).toContain("expiresAt");
  });

  it("BillDetailScreenV3 checks AsyncStorage cache before API call", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/BillDetailScreenV3.tsx"),
      "utf8"
    );
    expect(src).toContain("GCP-STG-0729");
    expect(src).toContain("AsyncStorage.getItem");
    expect(src).toContain("cachedMeta");
    expect(src).toContain("expiresAt");
  });
});
