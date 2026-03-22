/**
 * GCP-STG-0294: BUY catalog includes sp.image_url + netContent via COALESCE
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/catalog.ts"), "utf8"
);

describe("GCP-STG-0294: BUY tiles imageUrl + netContent", () => {
  test("CTE selects sp.image_url AS sp_image_url", () => {
    expect(SRC).toContain("sp.image_url AS sp_image_url");
  });

  test("imageUrl aggregation uses COALESCE(mp_image_url, sp_image_url)", () => {
    expect(SRC).toContain("COALESCE(mp_image_url, sp_image_url)");
  });

  test("netContentValue aggregation uses COALESCE(mp, sp)", () => {
    expect(SRC).toContain("COALESCE(mp_net_content_value, sp_net_content_value)");
  });

  test("netContentUnit aggregation uses COALESCE(mp, sp)", () => {
    expect(SRC).toContain("COALESCE(mp_net_content_unit, sp_net_content_unit)");
  });

  test("sp.image_url is selected in BOTH buy-catalog CTEs", () => {
    const matches = SRC.match(/sp\.image_url AS sp_image_url/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
