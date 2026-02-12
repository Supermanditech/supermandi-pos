// CA-1.4-001: Supplier Catalog Page
// Browse and add approved products from verified suppliers to your store catalog

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';

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
  const { accessToken } = useAuth();
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, limit: 50, offset: 0, hasMore: false });
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

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
      if (offset > 0) {
        setProducts(prev => [...prev, ...(data.data || [])]);
      } else {
        setProducts(data.data || []);
      }
      setPagination(data.pagination || { total: 0, limit: 50, offset: 0, hasMore: false });
    } catch (err) {
      console.error('Error fetching catalog:', err);
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
      setError(err instanceof Error ? err.message : 'Failed to add product');
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
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="page-title">Supplier Catalog</h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Browse approved products from verified SuperMandi suppliers
            </p>
          </div>
        </div>
      </header>

      <div className="page-content">
        {/* Success/Error Messages */}
        {success && (
          <div style={{
            background: '#dcfce7',
            color: '#166534',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {success}
          </div>
        )}
        {error && (
          <div style={{
            background: '#fee2e2',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: '1rem', maxWidth: '400px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by product name or barcode..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Results Count */}
        <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {pagination.total} products available
        </div>

        {/* Products Grid */}
        {isLoading ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading supplier catalog...
          </div>
        ) : products.length === 0 ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            {searchTerm
              ? 'No products match your search.'
              : 'No approved supplier products available yet.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {products.map((product) => (
              <div
                key={product.productId}
                className="card"
                style={{
                  padding: '1rem',
                  opacity: product.inStoreCatalog ? 0.7 : 1,
                }}
              >
                {/* Product Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                      {product.displayName}
                    </h3>
                    {product.barcode && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {product.barcode}
                      </span>
                    )}
                  </div>
                  {product.bnplEligible && (
                    <span style={{
                      background: '#dbeafe',
                      color: '#1e40af',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: '500',
                    }}>
                      BNPL {product.bnplMaxDays}d
                    </span>
                  )}
                </div>

                {/* Supplier Info */}
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  <strong>Supplier:</strong> {product.supplierName}
                  {product.supplierCity && ` (${product.supplierCity})`}
                </div>

                {/* Category */}
                {product.category && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    Category: {product.category}
                  </div>
                )}

                {/* Pricing */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: '#f8fafc',
                  borderRadius: '0.375rem',
                  fontSize: '0.8rem',
                }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Cost</div>
                    <div style={{ fontWeight: '600' }}>{formatPrice(product.supplierPriceMinor)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Your Price</div>
                    <div style={{ fontWeight: '600', color: '#059669' }}>{formatPrice(product.retailerPriceMinor)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>MRP</div>
                    <div style={{ fontWeight: '600' }}>{formatPrice(product.mrpMinor)}</div>
                  </div>
                </div>

                {/* Margin */}
                {product.marginMinor > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#059669', marginBottom: '0.75rem' }}>
                    Margin: {formatPrice(product.marginMinor)} per unit
                  </div>
                )}

                {/* Action Button */}
                {product.inStoreCatalog ? (
                  <button
                    className="btn btn-secondary"
                    disabled
                    style={{ width: '100%', opacity: 0.6 }}
                  >
                    Already in Catalog
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleAddProduct(product)}
                    disabled={addingProductId === product.productId}
                    style={{ width: '100%' }}
                  >
                    {addingProductId === product.productId ? 'Adding...' : '+ Add to My Catalog'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.hasMore && (
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
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
        <div style={{ marginTop: '2rem', padding: '1rem', background: '#f0f9ff', borderRadius: '0.5rem', fontSize: '0.8rem', color: '#0369a1' }}>
          <strong>About Supplier Catalog:</strong>
          <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
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
