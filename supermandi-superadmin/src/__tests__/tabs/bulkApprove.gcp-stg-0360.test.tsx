/**
 * GCP-STG-0360: Bulk Approve/Reject UI in CatalogTab — behavioral test
 *
 * Verifies:
 * 1. Checkbox column renders in header (Select All) and each row
 * 2. Selecting products shows bulk actions toolbar with correct count
 * 3. "Approve Selected (N)" calls batchProductAction with action='approve'
 * 4. "Reject Selected (N)" calls batchProductAction with action='reject'
 * 5. After bulk action, selection is cleared and product list refreshes
 * 6. Select All toggles all products on/off
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

// Mock suppliers API (publishProduct, unpublishProduct, batchProductAction)
const mockPublishProduct = vi.fn();
const mockUnpublishProduct = vi.fn();
const mockBatchProductAction = vi.fn();
vi.mock("../../api/suppliers", () => ({
  publishProduct: (...args: unknown[]) => mockPublishProduct(...args),
  unpublishProduct: (...args: unknown[]) => mockUnpublishProduct(...args),
  batchProductAction: (...args: unknown[]) => mockBatchProductAction(...args),
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

const pendingProduct1 = {
  id: "p1",
  name: "Product A",
  displayName: "Product A",
  originalCategory: "Grocery",
  editedCategory: null,
  currentCategory: "Grocery",
  brand: "Brand A",
  barcode: "111111",
  supplierSku: "A-001",
  purchasePrice: 1000,
  mrp: 1200,
  approvalStatus: "pending",
  supplierId: "s1",
  supplierName: "Supplier One",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
};

const pendingProduct2 = {
  ...pendingProduct1,
  id: "p2",
  name: "Product B",
  displayName: "Product B",
  barcode: "222222",
  supplierSku: "B-001",
};

const pendingProduct3 = {
  ...pendingProduct1,
  id: "p3",
  name: "Product C",
  displayName: "Product C",
  barcode: "333333",
  supplierSku: "C-001",
};

const defaultProductsResponse = {
  data: [pendingProduct1, pendingProduct2, pendingProduct3],
  pagination: { page: 1, limit: 50, total: 3, hasMore: false },
  filters: { search: null, category: null },
};

describe("GCP-STG-0360: CatalogTab Bulk Approve/Reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCategories.mockResolvedValue([]);
    mockFetchProducts.mockResolvedValue(defaultProductsResponse);
    // Reset prompt mock
    vi.spyOn(window, "prompt").mockReturnValue("Bulk rejection reason");
  });

  it("renders Select All checkbox in table header", async () => {
    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-all-checkbox")).toBeTruthy();
    });
  });

  it("renders per-row checkbox for each product", async () => {
    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-product-p1")).toBeTruthy();
      expect(screen.getByTestId("select-product-p2")).toBeTruthy();
      expect(screen.getByTestId("select-product-p3")).toBeTruthy();
    });
  });

  it("shows bulk actions toolbar when products are selected", async () => {
    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-product-p1")).toBeTruthy();
    });

    // No toolbar initially
    expect(screen.queryByTestId("bulk-actions-toolbar")).toBeNull();

    // Select one product
    fireEvent.click(screen.getByTestId("select-product-p1"));
    expect(screen.getByTestId("bulk-actions-toolbar")).toBeTruthy();
    expect(screen.getByText("1 product selected")).toBeTruthy();
    expect(screen.getByText("Approve Selected (1)")).toBeTruthy();
    expect(screen.getByText("Reject Selected (1)")).toBeTruthy();
  });

  it("Select All toggles all products on and off", async () => {
    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-all-checkbox")).toBeTruthy();
    });

    // Select all
    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    expect(screen.getByText("3 products selected")).toBeTruthy();

    // Deselect all
    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    expect(screen.queryByTestId("bulk-actions-toolbar")).toBeNull();
  });

  it("Approve Selected calls batchProductAction with action='approve'", async () => {
    mockBatchProductAction.mockResolvedValue({
      processed: 2,
      succeeded: 2,
      failed: 0,
      errors: [],
    });

    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-product-p1")).toBeTruthy();
    });

    // Select two products
    fireEvent.click(screen.getByTestId("select-product-p1"));
    fireEvent.click(screen.getByTestId("select-product-p2"));
    expect(screen.getByText("Approve Selected (2)")).toBeTruthy();

    // Click Approve
    fireEvent.click(screen.getByTestId("bulk-approve-btn"));

    await waitFor(() => {
      expect(mockBatchProductAction).toHaveBeenCalledWith(
        expect.arrayContaining(["p1", "p2"]),
        "approve"
      );
    });

    // Success toast
    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Bulk approved: 2 product(s)");
    });
  });

  it("Reject Selected calls batchProductAction with action='reject' and reason", async () => {
    mockBatchProductAction.mockResolvedValue({
      processed: 1,
      succeeded: 1,
      failed: 0,
      errors: [],
    });

    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-product-p3")).toBeTruthy();
    });

    // Select one product
    fireEvent.click(screen.getByTestId("select-product-p3"));

    // Click Reject
    fireEvent.click(screen.getByTestId("bulk-reject-btn"));

    await waitFor(() => {
      expect(mockBatchProductAction).toHaveBeenCalledWith(
        ["p3"],
        "reject",
        "Bulk rejection reason"
      );
    });

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Bulk rejected: 1 product(s)");
    });
  });

  it("shows failure count in toast when some products fail", async () => {
    mockBatchProductAction.mockResolvedValue({
      processed: 3,
      succeeded: 2,
      failed: 1,
      errors: [{ productId: "p3", error: "Already rejected" }],
    });

    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-all-checkbox")).toBeTruthy();
    });

    // Select all
    fireEvent.click(screen.getByTestId("select-all-checkbox"));
    fireEvent.click(screen.getByTestId("bulk-approve-btn"));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("Bulk approved: 2 product(s), 1 failed");
    });
  });

  it("shows error toast when batchProductAction fails", async () => {
    mockBatchProductAction.mockRejectedValue(new Error("Network error"));

    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-product-p1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("select-product-p1"));
    fireEvent.click(screen.getByTestId("bulk-approve-btn"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Network error");
    });
  });

  it("clears selection after successful bulk action", async () => {
    mockBatchProductAction.mockResolvedValue({
      processed: 1,
      succeeded: 1,
      failed: 0,
      errors: [],
    });

    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-product-p1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("select-product-p1"));
    expect(screen.getByTestId("bulk-actions-toolbar")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bulk-approve-btn"));

    await waitFor(() => {
      expect(screen.queryByTestId("bulk-actions-toolbar")).toBeNull();
    });
  });

  it("does not call batchProductAction if reject reason is cancelled", async () => {
    vi.spyOn(window, "prompt").mockReturnValue(null);

    render(<CatalogTab />);
    await waitFor(() => {
      expect(screen.getByTestId("select-product-p1")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("select-product-p1"));
    fireEvent.click(screen.getByTestId("bulk-reject-btn"));

    // Should NOT call the API since prompt returned null
    expect(mockBatchProductAction).not.toHaveBeenCalled();
  });
});
