// CA-1.4-001: Supplier Catalog Page
// Browse and add approved products from verified suppliers to your store catalog

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
import { logger } from '../lib/logger';

// REQ.AUDIT.W5.RETAILER.SUPPLIER-CATALOG-MEMORY-SPIKE.001: cap accumulated items to prevent memory growth
const MAX_ACCUMULATED_ITEMS = 500;

interface SupplierProduct {
  productId: string;
  productName: string;
  displayName: string;
  barcode: string | null;
  category: string | null;
  description: string | null;
  unit: string | null;
  supplierPriceMinor: number;
  marginMinor: number;
  retailerPriceMinor: number;
  mrpMinor: number;
  bnplEligible: boolean;
  bnplMaxDays: number;
  imageUrl: string | null;
  approvedAt: string;
  supplierId: string;
  supplierName: string;
  supplierTradeName: string | null;
  supplierCity: string | null;
  supplierPhone: string | null;
  inStoreCatalog: boolean;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export default function SupplierCatalogPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, limit: 50, offset: 0, hasMore: false });
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  // SUPPLIER-CATALOG-ADD-NO-ERROR-UI: track per-product add errors inline
  const [addError, setAddError] = useState<{ productId: string; message: string } | null>(null);

  // Fetch supplier catalog
  const fetchCatalog = useCallback(async (query?: string, offset = 0) => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      params.set('offset', String(offset));
      params.set('limit', '50');

      const url = `/api/v1/retailer-admin/supplier-catalog?${params.toString()}`;
      const response = await authFetch(url, accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch supplier catalog');
      const data = await safeJson(response);
      // GL-CRIT-0037: Append products when loading more (offset > 0), replace on new search (offset = 0)
      const items = data.data || [];
      if (offset > 0) {
        setProducts(prev => {
          const merged = [...prev, ...items];
          // Cap to prevent unbounded memory growth
          return merged.length > MAX_ACCUMULATED_ITEMS ? merged.slice(-MAX_ACCUMULATED_ITEMS) : merged;
        });
      } else {
        setProducts(items);
      }
      // RET-C2-009: Guard against infinite pagination — if API returns empty page, force hasMore=false
      const pag = data.pagination || { total: 0, limit: 50, offset: 0, hasMore: false };
      if (offset > 0 && items.length === 0) {
        pag.hasMore = false;
      }
      setPagination(pag);
    } catch (err) {
      logger.error('Error fetching catalog:', err);
      setError('Failed to load supplier catalog. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) {
      fetchCatalog();
    }
  }, [accessToken, fetchCatalog]);

  // Search handler with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (accessToken) {
        fetchCatalog(searchTerm || undefined);
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add product to store catalog
  const handleAddProduct = async (product: SupplierProduct) => {
    setAddingProductId(product.productId);
    setAddError(null);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(
        `/api/v1/retailer-admin/supplier-catalog/${product.productId}/add`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            sellPrice: product.retailerPriceMinor,
            initialStock: 0,
          }),
        }
      );
      if (response.status === 401) return;
      const data = await safeJson(response);
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to add product');
      }
      setSuccess(`Added "${product.displayName}" to your catalog!`);
      // Update local state to mark as in catalog
      setProducts(prev =>
        prev.map(p =>
          p.productId === product.productId ? { ...p, inStoreCatalog: true } : p
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add product';
      setAddError({ productId: product.productId, message: msg });
      setError(msg);
    } finally {
      setAddingProductId(null);
    }
  };

  // Format price from minor (paise) to display
  const formatPrice = (minor: number) => {
    return `Rs ${(minor / 100).toFixed(2)}`;
  };

  return (
    <>
      {/* T-112: Breadcrumb navigation */}
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Supplier Catalog' }]} />
      </div>
      <header className="page-header">
        <div className="flex-between">
          <div>
            <h1 className="page-title">Supplier Catalog</h1>
            <p className="scat-subtitle">
              Browse approved products from verified SuperMandi suppliers
            </p>
          </div>
        </div>
      </header>

      <div className="page-content">
        {/* Success/Error Messages */}
        {success && (
          <div className="alert-success">
            {success}
          </div>
        )}
        {error && (
          <div className="alert-error">
            {error}
          </div>
        )}

        {/* Search */}
        <div className="search-wrap">
          <input
            type="text"
            className="form-input"
            placeholder="Search by product name or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Results Count */}
        <div className="results-count">
          {pagination.total} products available
        </div>

        {/* Products Grid */}
        {isLoading ? (
          <div className="card text-center-muted">
            Loading supplier catalog...
          </div>
        ) : products.length === 0 ? (
          <div className="card text-center-muted">
            {searchTerm
              ? 'No products match your search.'
              : 'No approved supplier products available yet.'}
          </div>
        ) : (
          <div className="scat-grid">
            {products.map((product) => (
              <div
                key={product.productId}
                className={`card scat-card${product.inStoreCatalog ? ' scat-card--dimmed' : ''}`}
              >
                {/* Product Header */}
                <div className="scat-product-header">
                  <div className="flex-1">
                    <h3 className="scat-product-name">
                      {product.displayName}
                    </h3>
                    {product.barcode && (
                      <span className="scat-barcode">
                        {product.barcode}
                      </span>
                    )}
                  </div>
                  {product.bnplEligible && (
                    <span className="scat-bnpl-badge">
                      BNPL {product.bnplMaxDays}d
                    </span>
                  )}
                </div>

                {/* Supplier Info */}
                <div className="scat-supplier-info">
                  <strong>Supplier:</strong> {product.supplierName}
                  {product.supplierCity && ` (${product.supplierCity})`}
                </div>

                {/* Category */}
                {product.category && (
                  <div className="scat-category">
                    Category: {product.category}
                  </div>
                )}

                {/* Pricing */}
                <div className="scat-pricing">
                  <div>
                    <div className="scat-price-label">Cost</div>
                    <div className="scat-price-value">{formatPrice(product.supplierPriceMinor)}</div>
                  </div>
                  <div>
                    <div className="scat-price-label">Your Price</div>
                    <div className="scat-price-value--green">{formatPrice(product.retailerPriceMinor)}</div>
                  </div>
                  <div>
                    <div className="scat-price-label">MRP</div>
                    <div className="scat-price-value">{formatPrice(product.mrpMinor)}</div>
                  </div>
                </div>

                {/* Margin */}
                {product.marginMinor > 0 && (
                  <div className="scat-margin">
                    Margin: {formatPrice(product.marginMinor)} per unit
                  </div>
                )}

                {/* Action Button */}
                {product.inStoreCatalog ? (
                  <button
                    className="btn btn-secondary btn-full btn-disabled-dim"
                    disabled
                  >
                    Already in Catalog
                  </button>
                ) : (
                  <button
                    className="btn btn-primary btn-full"
                    onClick={() => handleAddProduct(product)}
                    disabled={addingProductId === product.productId}
                  >
                    {addingProductId === product.productId ? 'Adding...' : '+ Add to My Catalog'}
                  </button>
                )}
                {/* SUPPLIER-CATALOG-ADD-NO-ERROR-UI: inline error per product */}
                {addError && addError.productId === product.productId && (
                  <p className="inline-error">{addError.message}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.hasMore && (
          <div className="load-more-center">
            <button
              className="btn btn-secondary"
              onClick={() => fetchCatalog(searchTerm || undefined, pagination.offset + pagination.limit)}
              disabled={isLoading}
            >
              Load More
            </button>
          </div>
        )}

        {/* Info Box */}
        <div className="scat-info-box">
          <strong>About Supplier Catalog:</strong>
          <ul className="scat-info-list">
            <li>Products shown are approved by SuperMandi and available for ordering</li>
            <li>Pricing includes SuperMandi margin - your cost is shown as "Cost"</li>
            <li>BNPL eligible products can be ordered with deferred payment</li>
            <li>Click "Add to My Catalog" to make a product available in your store</li>
          </ul>
        </div>
      </div>
    </>
  );
}
