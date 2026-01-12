// Catalog types - V3.0.9 compliant

import { UUID, BaseEntity } from './base';

// Barcode type
export type BarcodeType = 'ean13' | 'upc' | 'internal' | 'supplier';

// Barcode source
export type BarcodeSource = 'manual' | 'supplier_sync' | 'grn_scan';

// Product entity (catalog.products) - Unified master catalog
export interface Product extends BaseEntity {
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  unit?: string;
  packSize?: number;
  primaryBarcode?: string; // Cache only - canonical is product_barcodes
  hsnCode?: string;
  defaultGstRate?: number;
  isActive: boolean;
}

// Product barcode (catalog.product_barcodes) - V3.0.9 canonical source
export interface ProductBarcode extends BaseEntity {
  productId: UUID;
  barcode: string;
  barcodeType: BarcodeType;
  isPrimary: boolean;
  source: BarcodeSource;
}

// Store product (catalog.store_products) - store-specific pricing/stock
export interface StoreProduct extends BaseEntity {
  storeId: UUID;
  productId: UUID;
  sellPrice?: number; // Nullable for buy-first scenarios
  mrp?: number;
  displayName?: string;
  isActive: boolean;
  currentStock: number; // READ-MODEL: Updated via events
  stockLastEventAt?: Date;
}

// Stock status for display
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

// Supplier product (catalog.supplier_products)
export interface SupplierProduct extends BaseEntity {
  supplierId: UUID;
  supplierSku?: string;
  barcode?: string;
  name: string;
  category?: string;
  brand?: string;
  unit?: string;
  packSize?: number;
  mrp?: number;
  purchasePrice: number; // Price to buy from supplier
  stockQuantity: number;
  stockStatus: 'available' | 'low' | 'out_of_stock';
  moq: number; // Minimum order quantity
  maxQty?: number;
  isActive: boolean;
}

// Mapping type
export type MappingType = 'auto' | 'manual';

// Supplier product mapping (catalog.supplier_product_map) - BUYABILITY GATE
export interface SupplierProductMap extends BaseEntity {
  supplierProductId: UUID;
  productId: UUID;
  mappingType: MappingType;
  confidence?: number;
  mappedByUserId?: UUID;
  mappedAt: Date;
  isVerified: boolean;
}

// Catalog mapping log action
export type MappingAction = 'auto_map' | 'manual_map' | 'unmap';

// Catalog mapping log (catalog.catalog_mapping_log)
export interface CatalogMappingLog extends BaseEntity {
  storeId: UUID;
  supplierId: UUID;
  supplierProductId: UUID;
  productId: UUID;
  action: MappingAction;
  confidence?: number;
  actorUserId?: UUID;
}

// Unified catalog item (for BUY tab API response)
export interface CatalogItem {
  product: Product;
  supplierProduct: SupplierProduct;
  supplier: {
    id: UUID;
    name: string;
    minOrderValue: number;
    expectedDeliveryDays: number;
  };
  currentStock: number;
  stockStatus: StockStatus;
  mapping: {
    isVerified: boolean;
    mappingType: MappingType;
  };
}
