// GCP-STG-0209+0210: Supplier backend routes — missing endpoints + auth
import * as fs from "fs";
import * as path from "path";

const indexPath = path.resolve(__dirname, "../src/routes/v1/supplier/index.ts");
const indexCode = fs.readFileSync(indexPath, "utf-8");

const bnplPath = path.resolve(__dirname, "../src/routes/v1/supplier/bnplVisibility.ts");
const bnplCode = fs.readFileSync(bnplPath, "utf-8");

const dashPath = path.resolve(__dirname, "../src/routes/v1/supplier/dashboard.ts");
const dashCode = fs.readFileSync(dashPath, "utf-8");

describe("GCP-STG-0209+0210: Supplier route mounting", () => {
  test("bnplVisibility router is imported in index", () => {
    expect(indexCode).toContain('import { supplierBnplRouter } from "./bnplVisibility"');
  });

  test("bnpl router is mounted at /bnpl", () => {
    expect(indexCode).toContain('supplierRouter.use("/bnpl", supplierBnplRouter)');
  });

  test("bnpl backed-orders endpoint uses requireSupplierAuth", () => {
    expect(bnplCode).toContain("requireSupplierAuth");
    expect(bnplCode).toContain("/backed-orders");
  });

  test("dashboard stats endpoint exists", () => {
    expect(dashCode).toContain('"/dashboard/stats"');
    expect(dashCode).toContain("requireSupplierAuth");
  });

  test("all core supplier routers are mounted", () => {
    expect(indexCode).toContain("supplierAuthRouter");
    expect(indexCode).toContain("supplierProfileRouter");
    expect(indexCode).toContain("supplierProductsRouter");
    expect(indexCode).toContain("supplierOrdersRouter");
    expect(indexCode).toContain("supplierDashboardRouter");
    expect(indexCode).toContain("supplierKycRouter");
    expect(indexCode).toContain("supplierPayoutsRouter");
    expect(indexCode).toContain("supplierInvoicesRouter");
    expect(indexCode).toContain("supplierNotificationsRouter");
    expect(indexCode).toContain("supplierBnplRouter");
  });
});
