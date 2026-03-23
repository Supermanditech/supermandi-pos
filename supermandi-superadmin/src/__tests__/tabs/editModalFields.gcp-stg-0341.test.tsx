/**
 * GCP-STG-0341: Edit modal exposes HSN, GST, BNPL, Delivery Days, Credit Days
 *
 * Verifies:
 * 1. All 5 new fields render in the edit modal
 * 2. Fields initialize from product data
 * 3. GST dropdown has correct options (0, 5, 12, 18, 28)
 * 4. BNPL checkbox toggles
 * 5. Save sends all 5 fields via editProductMetadata PUT
 * 6. HSN and GST are NOT in the read-only info header
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CatalogTab } from "../../tabs/CatalogTab";

// Mock catalog API
const mockFetchCategories = vi.fn();
const mockFetchProducts = vi.fn();
const mockEditProductMetadata = vi.fn();
const mockOverrideProductCategory = vi.fn();

vi.mock("../../api/catalog", () => ({
  fetchCategories: (...args: unknown[]) => mockFetchCategories(...args),
  fetchProducts: (...args: unknown[]) => mockFetchProducts(...args),
  overrideProductCategory: (...args: unknown[]) => mockOverrideProductCategory(...args),
  updateProductConversion: vi.fn().mockResolvedValue(undefined),
  approveProduct: vi.fn(),
  rejectProduct: vi.fn(),
  setProductMargin: vi.fn(),
  editProductMetadata: (...args: unknown[]) => mockEditProductMetadata(...args),
}));

// Mock suppliers API
vi.mock("../../api/suppliers", () => ({
  publishProduct: vi.fn(),
}));

// Mock react-hot-toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("react-hot-toast", () => ({
  default: { success: (...a: unknown[]) => mockToastSuccess(...a), error: (...a: unknown[]) => mockToastError(...a) },
}));

vi.mock("../../lib/formatters", () => ({
  formatDateTime: vi.fn((v: string) => v || "--"),
  formatCurrency: vi.fn((v: number) => `Rs ${v}`),
}));

vi.mock("../../components/TableSkeleton", () => ({
  TableSkeleton: () => <div data-testid="table-skeleton">Loading...</div>,
}));

const testProduct = {
  id: "prod-341",
  name: "Amul Butter",
  displayName: "Amul Butter 500g",
  originalCategory: "Dairy",
  editedCategory: null,
  currentCategory: "Dairy",
  brand: "Amul",
  barcode: "890200",
  supplierSku: "AB-500",
  purchasePrice: 25000,
  mrp: 28000,
  approvalStatus: "approved",
  supplierId: "sup1",
  supplierName: "Amul Dairy",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  hsnCode: "04051010",
  defaultGstRate: 12,
  bnplEligible: true,
  deliverySlaDays: 3,
  creditDays: 30,
};

describe("GCP-STG-0341: Edit modal 5 new fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCategories.mockResolvedValue([]);
    mockFetchProducts.mockResolvedValue({
      data: [testProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    mockOverrideProductCategory.mockResolvedValue({ data: testProduct, change: { from: null, to: null, overrideCleared: false } });
    mockEditProductMetadata.mockResolvedValue(undefined);
  });

  it("renders all 5 editable fields in edit modal", async () => {
    render(<CatalogTab />);
    await waitFor(() => expect(screen.getByText("Amul Butter 500g")).toBeInTheDocument());

    // Open edit modal
    fireEvent.click(screen.getByLabelText("Edit Amul Butter 500g"));

    // Verify HSN input
    const hsnInput = screen.getByLabelText("HSN Code:") as HTMLInputElement;
    expect(hsnInput).toBeInTheDocument();
    expect(hsnInput.value).toBe("04051010");

    // Verify GST dropdown
    const gstSelect = screen.getByLabelText("GST Rate:") as HTMLSelectElement;
    expect(gstSelect).toBeInTheDocument();
    expect(gstSelect.value).toBe("12");

    // Verify Delivery Days input
    const deliveryInput = screen.getByLabelText("Delivery SLA (days):") as HTMLInputElement;
    expect(deliveryInput).toBeInTheDocument();
    expect(deliveryInput.value).toBe("3");

    // Verify Credit Days input
    const creditInput = screen.getByLabelText("Credit Days:") as HTMLInputElement;
    expect(creditInput).toBeInTheDocument();
    expect(creditInput.value).toBe("30");

    // Verify BNPL checkbox
    const bnplCheckbox = screen.getByLabelText("BNPL Eligible (Buy Now Pay Later)") as HTMLInputElement;
    expect(bnplCheckbox).toBeInTheDocument();
    expect(bnplCheckbox.checked).toBe(true);
  });

  it("GST dropdown has all valid rate options", async () => {
    render(<CatalogTab />);
    await waitFor(() => expect(screen.getByText("Amul Butter 500g")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Edit Amul Butter 500g"));

    const gstSelect = screen.getByLabelText("GST Rate:") as HTMLSelectElement;
    const options = Array.from(gstSelect.options).map((o) => o.value);
    expect(options).toEqual(["", "0", "5", "12", "18", "28"]);
  });

  it("HSN and GST are NOT in the read-only info header", async () => {
    render(<CatalogTab />);
    await waitFor(() => expect(screen.getByText("Amul Butter 500g")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Edit Amul Butter 500g"));

    // The info header should show Supplier and Purchase Price but NOT HSN/GST as static text
    const infoHeader = screen.getByText("Supplier:").closest("div")!;
    expect(infoHeader.textContent).not.toContain("HSN:");
    expect(infoHeader.textContent).not.toContain("GST:");
  });

  it("sends changed fields via editProductMetadata on save", async () => {
    render(<CatalogTab />);
    await waitFor(() => expect(screen.getByText("Amul Butter 500g")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Edit Amul Butter 500g"));

    // Change HSN code
    const hsnInput = screen.getByLabelText("HSN Code:") as HTMLInputElement;
    fireEvent.change(hsnInput, { target: { value: "04051099" } });

    // Change GST rate to 18%
    const gstSelect = screen.getByLabelText("GST Rate:");
    fireEvent.change(gstSelect, { target: { value: "18" } });

    // Uncheck BNPL
    const bnplCheckbox = screen.getByLabelText("BNPL Eligible (Buy Now Pay Later)");
    fireEvent.click(bnplCheckbox);

    // Change delivery days
    const deliveryInput = screen.getByLabelText("Delivery SLA (days):");
    fireEvent.change(deliveryInput, { target: { value: "5" } });

    // Change credit days
    const creditInput = screen.getByLabelText("Credit Days:");
    fireEvent.change(creditInput, { target: { value: "45" } });

    // Save
    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockEditProductMetadata).toHaveBeenCalledWith("prod-341", expect.objectContaining({
        hsnCode: "04051099",
        gstRate: 18,
        bnplEligible: false,
        deliverySlaDays: 5,
        creditDays: 45,
      }));
    });
  });

  it("does NOT send unchanged fields", async () => {
    render(<CatalogTab />);
    await waitFor(() => expect(screen.getByText("Amul Butter 500g")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Edit Amul Butter 500g"));

    // Only change HSN — other 4 fields stay the same
    const hsnInput = screen.getByLabelText("HSN Code:") as HTMLInputElement;
    fireEvent.change(hsnInput, { target: { value: "99999999" } });

    fireEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockEditProductMetadata).toHaveBeenCalledTimes(1);
      const payload = mockEditProductMetadata.mock.calls[0][1];
      expect(payload.hsnCode).toBe("99999999");
      // These should not be in payload since they didn't change
      expect(payload).not.toHaveProperty("gstRate");
      expect(payload).not.toHaveProperty("bnplEligible");
      expect(payload).not.toHaveProperty("deliverySlaDays");
      expect(payload).not.toHaveProperty("creditDays");
    });
  });

  it("BNPL checkbox toggles correctly", async () => {
    render(<CatalogTab />);
    await waitFor(() => expect(screen.getByText("Amul Butter 500g")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Edit Amul Butter 500g"));

    const bnplCheckbox = screen.getByLabelText("BNPL Eligible (Buy Now Pay Later)") as HTMLInputElement;
    expect(bnplCheckbox.checked).toBe(true);

    fireEvent.click(bnplCheckbox);
    expect(bnplCheckbox.checked).toBe(false);

    fireEvent.click(bnplCheckbox);
    expect(bnplCheckbox.checked).toBe(true);
  });
});
