/**
 * SCALE-E2: ProductImage component unit tests
 *
 * Tests the reusable ProductImage component used on sell and buy tiles.
 * Covers: remote image display, null/undefined fallback, error fallback,
 * size prop, borderRadius prop, crash safety.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { ProductImage } from "../../components/ProductImage";

const TEST_URI = "https://storage.googleapis.com/supermandi-images/product/abc123.jpg";

describe("ProductImage", () => {
  // =========================================================================
  // 1. Renders image when valid URI is provided
  // =========================================================================
  it("renders Image component when valid uri is provided", () => {
    render(<ProductImage uri={TEST_URI} />);
    expect(screen.getByTestId("product-image")).toBeTruthy();
  });

  // =========================================================================
  // 2. Does NOT render placeholder when valid URI is provided
  // =========================================================================
  it("does not show placeholder when valid uri is provided", () => {
    render(<ProductImage uri={TEST_URI} />);
    expect(screen.queryByTestId("product-image-placeholder")).toBeNull();
  });

  // =========================================================================
  // 3. Shows placeholder when uri is null
  // =========================================================================
  it("shows placeholder when uri is null", () => {
    render(<ProductImage uri={null} />);
    expect(screen.getByTestId("product-image-placeholder")).toBeTruthy();
  });

  // =========================================================================
  // 4. Shows placeholder when uri is undefined
  // =========================================================================
  it("shows placeholder when uri is undefined", () => {
    render(<ProductImage uri={undefined} />);
    expect(screen.getByTestId("product-image-placeholder")).toBeTruthy();
  });

  // =========================================================================
  // 5. Shows placeholder on image load error (onError fires)
  // =========================================================================
  it("shows placeholder after image load error", () => {
    render(<ProductImage uri={TEST_URI} />);

    // Initially the image should be rendered
    const image = screen.getByTestId("product-image");
    expect(image).toBeTruthy();

    // Simulate onError event
    fireEvent(image, "error");

    // After error, placeholder should appear
    expect(screen.getByTestId("product-image-placeholder")).toBeTruthy();
  });

  // =========================================================================
  // 6. Image is no longer visible after error (replaced by placeholder)
  // =========================================================================
  it("hides image after load error and shows placeholder instead", () => {
    render(<ProductImage uri={TEST_URI} />);
    const image = screen.getByTestId("product-image");

    fireEvent(image, "error");

    expect(screen.queryByTestId("product-image")).toBeNull();
    expect(screen.getByTestId("product-image-placeholder")).toBeTruthy();
  });

  // =========================================================================
  // 7. Default size is 40x40
  // =========================================================================
  it("applies default 40x40 size to image", () => {
    render(<ProductImage uri={TEST_URI} />);
    const image = screen.getByTestId("product-image");
    const style = image.props.style;
    expect(style.width).toBe(40);
    expect(style.height).toBe(40);
  });

  // =========================================================================
  // 8. Custom size prop is applied to image
  // =========================================================================
  it("applies custom size prop to image dimensions", () => {
    render(<ProductImage uri={TEST_URI} size={80} />);
    const image = screen.getByTestId("product-image");
    const style = image.props.style;
    expect(style.width).toBe(80);
    expect(style.height).toBe(80);
  });

  // =========================================================================
  // 9. Custom size is applied to placeholder container
  // =========================================================================
  it("applies custom size to placeholder container", () => {
    render(<ProductImage uri={null} size={64} />);
    const placeholder = screen.getByTestId("product-image-placeholder");
    const style = placeholder.props.style;
    // style may be an array; find the entry with width
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.width).toBe(64);
    expect(flat.height).toBe(64);
  });

  // =========================================================================
  // 10. Default borderRadius is applied (4)
  // =========================================================================
  it("applies default borderRadius of 4 to image", () => {
    render(<ProductImage uri={TEST_URI} />);
    const image = screen.getByTestId("product-image");
    expect(image.props.style.borderRadius).toBe(4);
  });

  // =========================================================================
  // 11. Custom borderRadius is applied
  // =========================================================================
  it("applies custom borderRadius prop", () => {
    render(<ProductImage uri={TEST_URI} borderRadius={12} />);
    const image = screen.getByTestId("product-image");
    expect(image.props.style.borderRadius).toBe(12);
  });

  // =========================================================================
  // 12. Component renders without crash (smoke test)
  // =========================================================================
  it("renders without crash for all prop combinations", () => {
    expect(() => render(<ProductImage uri={null} />)).not.toThrow();
    expect(() => render(<ProductImage uri={undefined} />)).not.toThrow();
    expect(() => render(<ProductImage uri={TEST_URI} />)).not.toThrow();
    expect(() => render(<ProductImage uri={TEST_URI} size={20} borderRadius={2} />)).not.toThrow();
  });

  // =========================================================================
  // 13. Placeholder contains the 📦 icon text
  // =========================================================================
  it("shows 📦 icon in placeholder", () => {
    render(<ProductImage uri={null} />);
    // The emoji text should be present in the tree
    expect(screen.getByText("📦")).toBeTruthy();
  });

  // =========================================================================
  // 14. Image resizeMode is cover (for consistent thumbnail appearance)
  // =========================================================================
  it("sets resizeMode to cover on the image", () => {
    render(<ProductImage uri={TEST_URI} />);
    const image = screen.getByTestId("product-image");
    expect(image.props.resizeMode).toBe("cover");
  });
});
