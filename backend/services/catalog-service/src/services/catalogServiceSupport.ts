// Shared types and mapping helpers for catalog service queries/responses.

export interface CatalogProduct {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  unit?: string;
  packSize?: number;
  primaryBarcode?: string;
  hsnCode?: string;
  defaultGstRate?: number;
  isActive: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  bestPrice: number;
  minMoq: number;
  supplierCount: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
  suppliers: CatalogSupplierInfo[];
}

export interface CatalogSupplierInfo {
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  purchasePrice: number;
  retailerPrice: number;
  margin: number;
  mrp?: number;
  moq: number;
  maxQty?: number;
  stockQuantity: number;
  stockStatus: string;
  isPreferred: boolean;
  bnplEligible: boolean;
  bnplMaxDays?: number;
}

export interface GetCatalogInput {
  storeId: string;
  search?: string;
  category?: string;
  inStockOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface GetCatalogResult {
  products: CatalogProduct[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface CatalogProductRow {
  product_id: string;
  product_name: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  unit: string | null;
  pack_size: number | null;
  primary_barcode: string | null;
  hsn_code: string | null;
  default_gst_rate: string | null;
  is_active: boolean;
  image_url: string | null;
  thumbnail_url: string | null;
  best_price: string;
  min_moq: number;
  supplier_count: string;
  total_stock: string;
}

export interface SupplierDetailRow {
  product_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_product_id: string;
  purchase_price: string;
  mrp: string | null;
  moq: number;
  max_qty: number | null;
  stock_quantity: number;
  stock_status: string;
  is_preferred: boolean;
  supermandi_margin_minor: number | null;
  bnpl_eligible: boolean | null;
  bnpl_max_days: number | null;
}

function resolveStockStatus(totalStock: number): CatalogProduct['stockStatus'] {
  if (totalStock > 100) {
    return 'in_stock';
  }
  if (totalStock > 0) {
    return 'low_stock';
  }
  return 'out_of_stock';
}

function toSupplierInfo(row: SupplierDetailRow): CatalogSupplierInfo {
  const purchasePrice = parseFloat(row.purchase_price);
  const margin = row.supermandi_margin_minor ?? 0;
  return {
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierProductId: row.supplier_product_id,
    purchasePrice,
    retailerPrice: purchasePrice + margin,
    margin,
    mrp: row.mrp ? parseFloat(row.mrp) : undefined,
    moq: row.moq,
    maxQty: row.max_qty ?? undefined,
    stockQuantity: row.stock_quantity,
    stockStatus: row.stock_status,
    isPreferred: row.is_preferred,
    bnplEligible: row.bnpl_eligible ?? false,
    bnplMaxDays: row.bnpl_max_days ?? undefined,
  };
}

export function mapSupplierRowsByProduct(
  rows: SupplierDetailRow[]
): Map<string, CatalogSupplierInfo[]> {
  const suppliersByProduct = new Map<string, CatalogSupplierInfo[]>();
  for (const row of rows) {
    const current = suppliersByProduct.get(row.product_id) || [];
    current.push(toSupplierInfo(row));
    suppliersByProduct.set(row.product_id, current);
  }
  return suppliersByProduct;
}

export function mapSupplierRows(rows: SupplierDetailRow[]): CatalogSupplierInfo[] {
  return rows.map((row) => toSupplierInfo(row));
}

export function mapCatalogProducts(
  rows: CatalogProductRow[],
  suppliersByProduct: Map<string, CatalogSupplierInfo[]>
): CatalogProduct[] {
  return rows.map((row) => {
    const suppliers = suppliersByProduct.get(row.product_id) || [];
    const totalStock = parseInt(row.total_stock || '0', 10);
    return {
      id: row.product_id,
      name: row.product_name,
      description: row.description ?? undefined,
      brand: row.brand ?? undefined,
      category: row.category ?? undefined,
      unit: row.unit ?? undefined,
      packSize: row.pack_size ?? undefined,
      primaryBarcode: row.primary_barcode ?? undefined,
      hsnCode: row.hsn_code ?? undefined,
      defaultGstRate: row.default_gst_rate ? parseFloat(row.default_gst_rate) : undefined,
      isActive: row.is_active,
      imageUrl: row.image_url ?? undefined,
      thumbnailUrl: row.thumbnail_url ?? undefined,
      bestPrice: parseFloat(row.best_price),
      minMoq: row.min_moq,
      supplierCount: parseInt(row.supplier_count, 10),
      stockStatus: resolveStockStatus(totalStock),
      suppliers,
    };
  });
}

export function mapCatalogProduct(
  row: CatalogProductRow,
  suppliers: CatalogSupplierInfo[]
): CatalogProduct {
  const totalStock = parseInt(row.total_stock || '0', 10);
  return {
    id: row.product_id,
    name: row.product_name,
    description: row.description ?? undefined,
    brand: row.brand ?? undefined,
    category: row.category ?? undefined,
    unit: row.unit ?? undefined,
    packSize: row.pack_size ?? undefined,
    primaryBarcode: row.primary_barcode ?? undefined,
    hsnCode: row.hsn_code ?? undefined,
    defaultGstRate: row.default_gst_rate ? parseFloat(row.default_gst_rate) : undefined,
    isActive: row.is_active,
    imageUrl: row.image_url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    bestPrice: parseFloat(row.best_price),
    minMoq: row.min_moq,
    supplierCount: parseInt(row.supplier_count, 10),
    stockStatus: resolveStockStatus(totalStock),
    suppliers,
  };
}
