/**
 * GCP-STG-0348: CatalogTab edit modal displays 5 extra product detail fields
 * (netContentValue+netContentUnit, manufacturerName, countryOfOrigin, shelfLifeDays)
 *
 * Verifies: read-only Product Details section appears when fields are populated,
 * hides when all fields are null, and formats values correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CatalogTab } from "../../tabs/CatalogTab";

// Mock catalog API
const mockFetchCategories = vi.fn();
const mockFetchProducts = vi.fn();

vi.mock("../../api/catalog", () => ({
  fetchCategories: (...args: unknown[]) => mockFetchCategories(...args),
  fetchProducts: (...args: unknown[]) => mockFetchProducts(...args),
  overrideProductCategory: vi.fn(),
  updateProductConversion: vi.fn(),
  approveProduct: vi.fn(),
  rejectProduct: vi.fn(),
  setProductMargin: vi.fn(),
  editProductMetadata: vi.fn(),
}));

// Mock suppliers API
vi.mock("../../api/suppliers", () => ({
  publishProduct: vi.fn(),
  unpublishProduct: vi.fn(),
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../components/TableSkeleton", () => ({
  TableSkeleton: () => <div data-testid="table-skeleton">Loading...</div>,
}));

const baseProduct = {
  id: "p1",
  name: "Atta Gold",
  displayName: "Atta Gold 5kg",
  originalCategory: "Grocery",
  editedCategory: null,
  currentCategory: "Grocery",
  brand: "Fortune",
  barcode: "890201",
  supplierSku: "AG-001",
  purchasePrice: 3500,
  mrp: 4200,
  approvalStatus: "approved",
  supplierId: "sup-1",
  supplierName: "Fortune Foods",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
};

const productWithDetails = {
  ...baseProduct,
  netContentValue: 500,
  netContentUnit: "g",
  manufacturerName: "Adani Wilmar Ltd",
  countryOfOrigin: "India",
  shelfLifeDays: 180,
};

const productWithoutDetails = {
  ...baseProduct,
  netContentValue: null,
  netContentUnit: null,
  manufacturerName: null,
  countryOfOrigin: null,
  shelfLifeDays: null,
};

const makeFetchProductsResponse = (products: typeof baseProduct[]) => ({
  data: products,
  pagination: { page: 1, limit: 50, total: products.length, hasMore: false },
  filters: { search: null, category: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchCategories.mockResolvedValue([]);
});

describe("GCP-STG-0348: Product Details in edit modal", () => {
  it("shows Product Details section with all 5 fields when populated", async () => {
    mockFetchProducts.mockResolvedValue(makeFetchProductsResponse([productWithDetails]));
    render(<CatalogTab />);

    // Wait for product to render
    await waitFor(() => expect(screen.getByText("Atta Gold 5kg")).toBeInTheDocument());

    // Click Edit
    fireEvent.click(screen.getByLabelText("Edit Atta Gold 5kg"));

    // Product Details section should appear
    const section = screen.getByTestId("product-details-section");
    expect(section).toBeInTheDocument();

    // Net Content: "500 g"
    const netContent = screen.getByTestId("net-content");
    expect(netContent.textContent).toContain("500");
    expect(netContent.textContent).toContain("g");

    // Manufacturer
    const manufacturer = screen.getByTestId("manufacturer");
    expect(manufacturer.textContent).toContain("Adani Wilmar Ltd");

    // Country of Origin
    const country = screen.getByTestId("country-of-origin");
    expect(country.textContent).toContain("India");

    // Shelf Life
    const shelfLife = screen.getByTestId("shelf-life");
    expect(shelfLife.textContent).toContain("180");
    expect(shelfLife.textContent).toContain("days");
  });

  it("hides Product Details section when all 5 fields are null", async () => {
    mockFetchProducts.mockResolvedValue(makeFetchProductsResponse([productWithoutDetails]));
    render(<CatalogTab />);

    await waitFor(() => expect(screen.getByText("Atta Gold 5kg")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Edit Atta Gold 5kg"));

    // Section should NOT appear
    expect(screen.queryByTestId("product-details-section")).not.toBeInTheDocument();
  });

  it("shows only populated fields (partial data)", async () => {
    const partialProduct = {
      ...baseProduct,
      netContentValue: null,
      netContentUnit: null,
      manufacturerName: "Nestle India",
      countryOfOrigin: null,
      shelfLifeDays: 365,
    };
    mockFetchProducts.mockResolvedValue(makeFetchProductsResponse([partialProduct]));
    render(<CatalogTab />);

    await waitFor(() => expect(screen.getByText("Atta Gold 5kg")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Edit Atta Gold 5kg"));

    // Section should appear (manufacturerName is truthy)
    expect(screen.getByTestId("product-details-section")).toBeInTheDocument();

    // Net content should NOT appear (both null)
    expect(screen.queryByTestId("net-content")).not.toBeInTheDocument();

    // Manufacturer should appear
    expect(screen.getByTestId("manufacturer").textContent).toContain("Nestle India");

    // Country should NOT appear
    expect(screen.queryByTestId("country-of-origin")).not.toBeInTheDocument();

    // Shelf life should appear
    expect(screen.getByTestId("shelf-life").textContent).toContain("365 days");
  });

  it("fields are read-only (no input elements inside Product Details section)", async () => {
    mockFetchProducts.mockResolvedValue(makeFetchProductsResponse([productWithDetails]));
    render(<CatalogTab />);

    await waitFor(() => expect(screen.getByText("Atta Gold 5kg")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Edit Atta Gold 5kg"));

    const section = screen.getByTestId("product-details-section");
    const inputs = section.querySelectorAll("input, select, textarea");
    expect(inputs.length).toBe(0);
  });
});
