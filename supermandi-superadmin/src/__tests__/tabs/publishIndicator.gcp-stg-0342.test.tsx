/**
 * GCP-STG-0342: Published/Unpublished indicator in CatalogTab
 *
 * Verifies: Approved products show a published/unpublished badge with store count,
 * pending/rejected products do NOT show the badge, and the Publish button still works.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
vi.mock("../../api/suppliers", () => ({
  publishProduct: vi.fn(),
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../lib/formatters", () => ({
  formatDateTime: vi.fn((v: string) => v || "--"),
  formatCurrency: vi.fn((v: number) => `Rs ${v}`),
}));

vi.mock("../../components/TableSkeleton", () => ({
  TableSkeleton: () => <div data-testid="table-skeleton">Loading...</div>,
}));

const baseProduct = {
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
  supplierId: "s1",
  supplierName: "Tata Distributors",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
};

describe("GCP-STG-0342: Published/Unpublished indicator in CatalogTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCategories.mockResolvedValue([]);
  });

  it("shows 'Unpublished' badge for approved product with publishedToStores=0", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [{ ...baseProduct, approvalStatus: "approved", publishedToStores: 0 }],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText("Unpublished")).toBeTruthy();
    });

    // Verify aria-label for accessibility
    const badge = screen.getByLabelText("Unpublished");
    expect(badge).toBeTruthy();
  });

  it("shows store count badge for approved product with publishedToStores>0", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [{ ...baseProduct, approvalStatus: "approved", publishedToStores: 3 }],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText("3 stores")).toBeTruthy();
    });

    const badge = screen.getByLabelText("Published to 3 stores");
    expect(badge).toBeTruthy();
  });

  it("shows singular 'store' for publishedToStores=1", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [{ ...baseProduct, approvalStatus: "approved", publishedToStores: 1 }],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText("1 store")).toBeTruthy();
    });
  });

  it("does NOT show published indicator for pending products", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [{ ...baseProduct, approvalStatus: "pending", publishedToStores: 0 }],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText("pending")).toBeTruthy();
    });

    expect(screen.queryByText("Unpublished")).toBeNull();
    expect(screen.queryByLabelText("Unpublished")).toBeNull();
  });

  it("does NOT show published indicator for rejected products", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [{ ...baseProduct, approvalStatus: "rejected", publishedToStores: 0 }],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      expect(screen.getByText("rejected")).toBeTruthy();
    });

    expect(screen.queryByText("Unpublished")).toBeNull();
  });

  it("shows Publish button alongside unpublished badge for approved products", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [{ ...baseProduct, approvalStatus: "approved", publishedToStores: 0 }],
      pagination: { page: 1, limit: 50, total: 1, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      // Both should be present
      expect(screen.getByText("Unpublished")).toBeTruthy();
      expect(screen.getByText("Publish")).toBeTruthy();
    });
  });

  it("uses success badge class when published, warning class when unpublished", async () => {
    mockFetchProducts.mockResolvedValue({
      data: [
        { ...baseProduct, id: "p1", approvalStatus: "approved", publishedToStores: 2 },
        { ...baseProduct, id: "p2", name: "Sugar", displayName: "Sugar 1kg", approvalStatus: "approved", publishedToStores: 0 },
      ],
      pagination: { page: 1, limit: 50, total: 2, hasMore: false },
      filters: { search: null, category: null },
    });

    render(<CatalogTab />);

    await waitFor(() => {
      const publishedBadge = screen.getByLabelText("Published to 2 stores");
      expect(publishedBadge.className).toContain("sa-badge-success");

      const unpublishedBadge = screen.getByLabelText("Unpublished");
      expect(unpublishedBadge.className).toContain("sa-badge-warning");
    });
  });
});
