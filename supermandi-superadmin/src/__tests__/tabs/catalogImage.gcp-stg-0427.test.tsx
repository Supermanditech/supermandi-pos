/**
 * GCP-STG-0427: CatalogProduct image thumbnail in table + preview in edit modal
 *
 * Verifies:
 * 1. Product with imageUrl shows <img> thumbnail (32x32) beside name in table
 * 2. Product without imageUrl shows fallback initials placeholder
 * 3. Edit modal shows larger image (72x72) when imageUrl present
 * 4. Edit modal shows fallback initials when imageUrl absent
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
  batchProductAction: vi.fn(),
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
  name: "Toor Dal",
  displayName: "Toor Dal 1kg",
  originalCategory: "Pulses",
  editedCategory: null,
  currentCategory: "Pulses",
  brand: "Tata",
  barcode: "890301",
  supplierSku: "TD-001",
  purchasePrice: 15000,
  mrp: 18000,
  approvalStatus: "approved",
  supplierId: "sup-1",
  supplierName: "Tata Consumer",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
};

const productWithImage = {
  ...baseProduct,
  imageUrl: "https://cdn.example.com/toor-dal.jpg",
};

const productWithoutImage = {
  ...baseProduct,
  id: "p2",
  name: "Basmati Rice",
  displayName: "Basmati Rice 5kg",
  imageUrl: null,
};

const makeFetchProductsResponse = (products: (typeof baseProduct)[]) => ({
  data: products,
  pagination: { page: 1, limit: 50, total: products.length, hasMore: false },
  filters: { search: null, category: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchCategories.mockResolvedValue([]);
});

describe("GCP-STG-0427: Product image thumbnail and preview", () => {
  it("renders a 32x32 thumbnail beside product name when imageUrl is present", async () => {
    mockFetchProducts.mockResolvedValue(makeFetchProductsResponse([productWithImage]));
    render(<CatalogTab />);

    await waitFor(() => expect(screen.getByText("Toor Dal 1kg")).toBeInTheDocument());

    const thumb = screen.getByTestId("product-thumb-p1");
    expect(thumb).toBeInTheDocument();
    expect(thumb.tagName).toBe("IMG");
    expect(thumb).toHaveAttribute("src", "https://cdn.example.com/toor-dal.jpg");
    expect(thumb.style.width).toBe("32px");
    expect(thumb.style.height).toBe("32px");
  });

  it("renders fallback initials when imageUrl is absent", async () => {
    mockFetchProducts.mockResolvedValue(makeFetchProductsResponse([productWithoutImage]));
    render(<CatalogTab />);

    await waitFor(() => expect(screen.getByText("Basmati Rice 5kg")).toBeInTheDocument());

    const fallback = screen.getByTestId("product-thumb-fallback-p2");
    expect(fallback).toBeInTheDocument();
    // Initials should be first 2 chars of displayName
    expect(fallback.textContent).toBe("Ba");
    expect(fallback.style.display).toBe("flex");
  });

  it("hides fallback initials when imageUrl is present (only shows img)", async () => {
    mockFetchProducts.mockResolvedValue(makeFetchProductsResponse([productWithImage]));
    render(<CatalogTab />);

    await waitFor(() => expect(screen.getByText("Toor Dal 1kg")).toBeInTheDocument());

    const fallback = screen.getByTestId("product-thumb-fallback-p1");
    // Fallback should be hidden (display: none)
    expect(fallback.style.display).toBe("none");
  });

  it("shows 72x72 image preview in edit modal when imageUrl is present", async () => {
    mockFetchProducts.mockResolvedValue(makeFetchProductsResponse([productWithImage]));
    render(<CatalogTab />);

    await waitFor(() => expect(screen.getByText("Toor Dal 1kg")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Edit Toor Dal 1kg"));

    const modalImg = screen.getByTestId("edit-modal-product-image");
    expect(modalImg).toBeInTheDocument();
    expect(modalImg.tagName).toBe("IMG");
    expect(modalImg).toHaveAttribute("src", "https://cdn.example.com/toor-dal.jpg");
    expect(modalImg.style.width).toBe("72px");
    expect(modalImg.style.height).toBe("72px");
  });

  it("shows fallback initials in edit modal when imageUrl is absent", async () => {
    mockFetchProducts.mockResolvedValue(makeFetchProductsResponse([productWithoutImage]));
    render(<CatalogTab />);

    await waitFor(() => expect(screen.getByText("Basmati Rice 5kg")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Edit Basmati Rice 5kg"));

    const modalFallback = screen.getByTestId("edit-modal-product-image-fallback");
    expect(modalFallback).toBeInTheDocument();
    expect(modalFallback.textContent).toBe("Ba");
    expect(modalFallback.style.width).toBe("72px");
    expect(modalFallback.style.height).toBe("72px");

    // Should NOT have an img element
    expect(screen.queryByTestId("edit-modal-product-image")).not.toBeInTheDocument();
  });
});
