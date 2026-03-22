/**
 * GCP-STG-0290: Publish button in CatalogTab — behavioral test
 *
 * Verifies: Publish button appears for approved products, calls publishProduct API,
 * shows success toast with store count, and does NOT appear for pending/rejected.
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

// Mock suppliers API (publishProduct)
const mockPublishProduct = vi.fn();
vi.mock("../../api/suppliers", () => ({
  publishProduct: (...args: unknown[]) => mockPublishProduct(...args),
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

const approvedProduct = {
  id: "p1",
  name: "Tata Salt",
  displayName: "Tata Salt 1kg",
  originalCategory: "Grocery",
  editedCategory: null,
  currentCategory: "Grocery",
  brand: "Tata",
  barcode: "890103",
  supplierSku: "TS-001",
  purchasePrice: 2300,
  mrp: 2700,
  approvalStatus: "approved",
  supplierId: "s1",
  supplierName: "Tata Distributors",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
};

const pendingProduct = {
  ...approvedProduct,
  id: "p2",
  name: "Pending Product",
  displayName: "Pending Product",
  approvalStatus: "pending",
};

describe("GCP-STG-0290: CatalogTab Publish button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCategories.mockResolvedValue([]);
  });

  it("shows Publish button for approved products", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [approvedProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByLabelText("Publish Tata Salt 1kg to stores")).toBeTruthy();
    });
  });

  it("does NOT show Publish button for pending products", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [pendingProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText("Approve")).toBeTruthy();
    });

    expect(screen.queryByText("Publish")).toBeNull();
  });

  it("calls publishProduct API when Publish clicked", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [approvedProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    mockPublishProduct.mockResolvedValue({ publishedToStores: 3 });

    render(<CatalogTab />);

    await waitFor(() => {
      fireEvent.click(screen.getByLabelText("Publish Tata Salt 1kg to stores"));
    });

    await waitFor(() => {
      expect(mockPublishProduct).toHaveBeenCalledWith("p1");
    });
  });

  it("shows success toast with store count after publish", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [approvedProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    mockPublishProduct.mockResolvedValue({ publishedToStores: 5 });

    render(<CatalogTab />);

    await waitFor(() => {
      fireEvent.click(screen.getByLabelText("Publish Tata Salt 1kg to stores"));
    });

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        expect.stringContaining("5 store(s)")
      );
    });
  });

  it("shows error toast on publish failure", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [approvedProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });
    mockPublishProduct.mockRejectedValue(new Error("No linked stores"));

    render(<CatalogTab />);

    await waitFor(() => {
      fireEvent.click(screen.getByLabelText("Publish Tata Salt 1kg to stores"));
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("No linked stores");
    });
  });

  it("has correct aria-label for accessibility", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [approvedProduct],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      const btn = screen.getByLabelText("Publish Tata Salt 1kg to stores");
      expect(btn).toBeTruthy();
      expect(btn.textContent).toBe("Publish");
    });
  });
});
