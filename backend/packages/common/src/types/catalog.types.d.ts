import { UUID, BaseEntity } from './base';
export type BarcodeType = 'ean13' | 'upc' | 'internal' | 'supplier';
export type BarcodeSource = 'manual' | 'supplier_sync' | 'grn_scan';
export interface Product extends BaseEntity {
    name: string;
    description?: string;
    brand?: string;
    category?: string;
    unit?: string;
    packSize?: number;
    primaryBarcode?: string;
    hsnCode?: string;
    defaultGstRate?: number;
    netContentValue?: number;
    netContentUnit?: string;
    manufacturerName?: string;
    countryOfOrigin?: string;
    shelfLifeDays?: number;
    isActive: boolean;
}
export interface ProductBarcode extends BaseEntity {
    productId: UUID;
    barcode: string;
    barcodeType: BarcodeType;
    isPrimary: boolean;
    source: BarcodeSource;
}
export interface StoreProduct extends BaseEntity {
    storeId: UUID;
    productId: UUID;
    sellPrice?: number;
    mrp?: number;
    displayName?: string;
    isActive: boolean;
    currentStock: number;
    stockLastEventAt?: Date;
}
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
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
    purchasePrice: number;
    stockQuantity: number;
    stockStatus: 'available' | 'low' | 'out_of_stock';
    moq: number;
    maxQty?: number;
    netContentValue?: number;
    netContentUnit?: string;
    isActive: boolean;
}
export type MappingType = 'auto' | 'manual';
export interface SupplierProductMap extends BaseEntity {
    supplierProductId: UUID;
    productId: UUID;
    mappingType: MappingType;
    confidence?: number;
    mappedByUserId?: UUID;
    mappedAt: Date;
    isVerified: boolean;
}
export type MappingAction = 'auto_map' | 'manual_map' | 'unmap';
export interface CatalogMappingLog extends BaseEntity {
    storeId: UUID;
    supplierId: UUID;
    supplierProductId: UUID;
    productId: UUID;
    action: MappingAction;
    confidence?: number;
    actorUserId?: UUID;
}
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
//# sourceMappingURL=catalog.types.d.ts.map