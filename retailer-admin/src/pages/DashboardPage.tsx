import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch } from '../lib/api';
import { useEscapeKey } from '../lib/hooks';
import { fetchInventory, InventoryItem, fetchCategories, FmcgCategory, fetchSearch, SearchResult, fetchDailySummary, DailySummary } from '../api/store';
// GL-CRIT-0066: Use centralized category icons configuration
import { getCategoryIcon as getCategoryIconFromConfig } from '../config/categoryIcons';
// TZ-FORMAT-001 + CURRENCY-FORMAT-001: Use shared formatters
import { formatCurrencyWhole, formatCurrency, formatDateShort, formatRupees } from '../lib/formatters';

export default function DashboardPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { store, accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // GL-CRIT-0038: Track current search to ignore stale responses
  const currentSearchRef = useRef<string>('');
  const [showAddProductMenu, setShowAddProductMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // FE-RETAILER-INVENTORY-001: Wire to real inventory endpoint
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryTotals, setInventoryTotals] = useState<{ totalProducts: number; totalStockQty: number; totalPurchaseValue: number; totalSellRevenue: number }>({ totalProducts: 0, totalStockQty: 0, totalPurchaseValue: 0, totalSellRevenue: 0 });
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  // AUDIT-RET-011: Client-side pagination for inventory table
  const [invPage, setInvPage] = useState(0);
  const INV_PAGE_SIZE = 20;

  // FE-RETAILER-CAT-001: Categories from POS taxonomy
  const [categories, setCategories] = useState<FmcgCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // GL-RJ-009: Daily summary for dashboard
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(true);
  const [dailySummaryError, setDailySummaryError] = useState<string | null>(null);

  // RCAT-CAT-002: Category edit/delete state
  const [editingCategory, setEditingCategory] = useState<FmcgCategory | null>(null);
  const [catEditNameEn, setCatEditNameEn] = useState('');
  const [catEditNameHi, setCatEditNameHi] = useState('');
  const [catEditSaving, setCatEditSaving] = useState(false);
  const [showHiddenCategories, setShowHiddenCategories] = useState(false);
  // RET-AUD-040: Track category toggle errors for user feedback
  const [catToggleError, setCatToggleError] = useState<string | null>(null);

  // GL-CRIT-0078: Close modals with Escape key
  // ISSUE-MICRO-014: Disable escape close during in-flight save
  useEscapeKey(
    useCallback(() => {
      setEditingCategory(null);
      setCatEditError(null);
    }, []),
    !!editingCategory && !catEditSaving
  );

  // RCAT-CAT-002: Rename category (store override)
  // GL-CRIT-0039: Error handling with user feedback
  const [catEditError, setCatEditError] = useState<string | null>(null);
  const handleCategoryRename = async () => {
    if (!editingCategory || !accessToken) return;
    setCatEditSaving(true);
    setCatEditError(null);
    try {
      const response = await authFetch(`/api/v1/retailer-admin/categories/${editingCategory.id}`, accessToken, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayNameEn: catEditNameEn.trim() || undefined,
          displayNameHi: catEditNameHi.trim() || undefined,
        }),
      });
      if (response.ok) {
        // Update local state only on success
        setCategories(prev => prev.map(c =>
          c.id === editingCategory.id
            ? { ...c, labelEn: catEditNameEn.trim() || c.labelEn, labelHi: catEditNameHi.trim() || c.labelHi }
            : c
        ));
        setEditingCategory(null);
      } else {
        // GL-CRIT-0039: Show error to user on API failure
        const data = await response.json().catch(() => ({}));
        setCatEditError(data.error?.message || 'Failed to rename category. Please try again.');
      }
    } catch (err) {
      console.error('Failed to rename category:', err);
      // GL-CRIT-0039: Show network error to user
      setCatEditError('Network error. Please check your connection and try again.');
    } finally {
      setCatEditSaving(false);
    }
  };

  // RCAT-CAT-002: Hide/unhide category (store override)
  // RET-AUD-040: Updated to show errors to user instead of silent failure
  const handleCategoryToggleHidden = async (category: FmcgCategory) => {
    if (!accessToken) return;
    setCatToggleError(null); // Clear previous error
    try {
      const response = await authFetch(`/api/v1/retailer-admin/categories/${category.id}`, accessToken, {
        method: 'DELETE',
      });
      if (response.ok) {
        const data = await response.json();
        setCategories(prev => prev.map(c =>
          c.id === category.id ? { ...c, isHidden: data.isHidden } : c
        ));
      } else {
        // RET-AUD-040: Show API error to user
        const data = await response.json().catch(() => ({}));
        setCatToggleError(data.error?.message || `Failed to ${category.isHidden ? 'show' : 'hide'} category. Please try again.`);
      }
    } catch (err) {
      console.error('Failed to toggle category visibility:', err);
      // RET-AUD-040: Show network error to user
      setCatToggleError('Network error. Please check your connection and try again.');
    }
  };

  useEffect(() => {
    if (!accessToken) return;

    const loadInventory = async () => {
      setInventoryLoading(true);
      setInventoryError(null);
      try {
        const result = await fetchInventory(accessToken);
        setInventory(result.data || []);
        // RCAT-METRICS-001: Use server-provided totals (NaN-safe)
        if (result.totals) {
          setInventoryTotals(result.totals);
        }
      } catch (err) {
        console.error('Failed to load inventory:', err);
        setInventoryError('Failed to load inventory');
        setInventory([]);
      } finally {
        setInventoryLoading(false);
      }
    };

    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        const result = await fetchCategories(accessToken);
        // Filter out the "All" category (sortOrder 0) for display
        setCategories((result.data || []).filter(c => c.sortOrder > 0));
      } catch (err) {
        console.error('Failed to load categories:', err);
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    };

    // GL-RJ-009: Load daily summary for dashboard
    const loadDailySummary = async () => {
      setDailySummaryLoading(true);
      setDailySummaryError(null);
      try {
        const result = await fetchDailySummary(accessToken);
        setDailySummary(result.data || null);
      } catch (err) {
        console.error('Failed to load daily summary:', err);
        setDailySummaryError('Failed to load daily summary');
        setDailySummary(null);
      } finally {
        setDailySummaryLoading(false);
      }
    };

    loadInventory();
    loadCategories();
    loadDailySummary();
  }, [accessToken]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAddProductMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // RCAT-SEARCH-001: Debounced search
  // GL-CRIT-0038: Fixed to ignore stale responses from older searches
  const doSearch = useCallback(async (term: string) => {
    if (!accessToken || term.length < 2) {
      setSearchResults(null);
      setShowSearchResults(false);
      currentSearchRef.current = '';
      return;
    }
    // Track which search this is so we can ignore stale responses
    currentSearchRef.current = term;
    setSearchLoading(true);
    try {
      const result = await fetchSearch(accessToken, term, 10);
      // GL-CRIT-0038: Only update if this is still the current search
      // This prevents race conditions where older results overwrite newer ones
      if (currentSearchRef.current === term) {
        setSearchResults(result.data || null);
        setShowSearchResults(true);
      }
    } catch {
      if (currentSearchRef.current === term) {
        setSearchResults(null);
      }
    } finally {
      if (currentSearchRef.current === term) {
        setSearchLoading(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      setShowSearchResults(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => doSearch(searchQuery.trim()), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, doSearch]);

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // FE-RETAILER-CAT-001: Map FMCG category icons to emoji
  // GL-CRIT-0066: Use centralized configuration (can be overridden by backend)
  const getCategoryIcon = useCallback((iconKey: string): string => {
    return getCategoryIconFromConfig(iconKey);
  }, []);

  return (
    <div style={{
      minHeight: '100%',
      background: 'linear-gradient(180deg, #f0f9ff 0%, #f8fafc 100%)',
      padding: '2rem',
    }}>
      {/* Welcome Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 40%, #0891b2 100%)',
        borderRadius: '20px',
        padding: '2.5rem',
        color: 'white',
        marginBottom: '2rem',
        boxShadow: '0 8px 32px rgba(59, 130, 246, 0.25)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{
          position: 'absolute',
          top: '-50px',
          right: '-50px',
          width: '200px',
          height: '200px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '50%',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-30px',
          right: '100px',
          width: '100px',
          height: '100px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '50%',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Greeting & Store Info */}
          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{
              margin: '0 0 0.25rem',
              fontSize: '0.9rem',
              opacity: 0.9,
              fontWeight: '500',
            }}>
              {getGreeting()}
            </p>
            <h1 style={{
              margin: '0 0 0.5rem',
              fontSize: '2rem',
              fontWeight: '800',
              letterSpacing: '-0.5px',
            }}>
              {store?.name || 'Welcome to SuperMandi'}
            </h1>
            <span style={{
              display: 'inline-block',
              padding: '0.35rem 0.85rem',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: '500',
              backdropFilter: 'blur(10px)',
            }}>
              Store ID: {store?.code || storeCode}
            </span>
          </div>

          {/* RCAT-SEARCH-001: Search Bar with Results Dropdown */}
          <div ref={searchRef} style={{ maxWidth: '560px', position: 'relative' }}>
            <div style={{
              background: 'white',
              borderRadius: '14px',
              padding: '4px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            }}>
              <input
                type="text"
                placeholder="Search product / supplier / barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchResults) setShowSearchResults(true); }}
                style={{
                  width: '100%',
                  padding: '1rem 1.25rem',
                  fontSize: '1rem',
                  border: 'none',
                  borderRadius: '10px',
                  background: 'transparent',
                  color: '#1e293b',
                  outline: 'none',
                }}
              />
            </div>

            {/* Search Results Dropdown */}
            {showSearchResults && (searchLoading || searchResults) && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '0.5rem',
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 12px 48px rgba(0,0,0,0.2)',
                maxHeight: '400px',
                overflow: 'auto',
                zIndex: 200,
                border: '1px solid #e2e8f0',
              }}>
                {searchLoading && (
                  <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                    Searching...
                  </div>
                )}

                {!searchLoading && searchResults && (
                  <>
                    {/* Products Section */}
                    {searchResults.products.length > 0 && (
                      <div>
                        <div style={{ padding: '0.5rem 1rem', background: '#f8fafc', fontSize: '0.7rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Products ({searchResults.products.length})
                        </div>
                        {searchResults.products.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => { setShowSearchResults(false); navigate(`/s/${storeCode}/products?search=${encodeURIComponent(p.name)}`); }}
                            style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                          >
                            <div>
                              <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.9rem' }}>{p.name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {p.brand && <span>{p.brand} | </span>}
                                <span style={{ fontFamily: 'monospace' }}>{p.barcode || 'No barcode'}</span>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.85rem' }}>
                                {formatCurrency(p.sellPrice)}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: p.stock > 0 ? '#059669' : '#dc2626' }}>
                                Stock: {p.stock}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Suppliers Section */}
                    {searchResults.suppliers.length > 0 && (
                      <div>
                        <div style={{ padding: '0.5rem 1rem', background: '#f8fafc', fontSize: '0.7rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Suppliers ({searchResults.suppliers.length})
                        </div>
                        {searchResults.suppliers.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => { setShowSearchResults(false); navigate(`/s/${storeCode}/suppliers`); }}
                            style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                          >
                            <div>
                              <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.9rem' }}>{s.businessName}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {s.phone && <span>{s.phone} | </span>}
                                {s.gstin && <span style={{ fontFamily: 'monospace' }}>{s.gstin}</span>}
                              </div>
                            </div>
                            <span style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              fontWeight: '600',
                              background: s.isSupermandi ? '#dbeafe' : s.verificationStatus === 'verified' ? '#dcfce7' : '#f1f5f9',
                              color: s.isSupermandi ? '#1d4ed8' : s.verificationStatus === 'verified' ? '#166534' : '#64748b',
                            }}>
                              {s.isSupermandi ? 'SuperMandi' : s.verificationStatus}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Barcode Matches Section */}
                    {searchResults.barcodes.length > 0 && (
                      <div>
                        <div style={{ padding: '0.5rem 1rem', background: '#f8fafc', fontSize: '0.7rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Barcode Matches ({searchResults.barcodes.length})
                        </div>
                        {searchResults.barcodes.map((b) => (
                          <div
                            key={b.storeProductId}
                            onClick={() => { setShowSearchResults(false); navigate(`/s/${storeCode}/products?search=${encodeURIComponent(b.barcode)}`); }}
                            style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                          >
                            <div>
                              <div style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.9rem' }}>{b.productName}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>{b.barcode}</div>
                            </div>
                            <span style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              fontWeight: '600',
                              background: b.mode === 'PACKAGED' ? '#dbeafe' : '#fef3c7',
                              color: b.mode === 'PACKAGED' ? '#1d4ed8' : '#92400e',
                            }}>
                              {b.mode === 'PACKAGED' ? 'Packaged' : 'Loose'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No Results */}
                    {searchResults.products.length === 0 && searchResults.suppliers.length === 0 && searchResults.barcodes.length === 0 && (
                      <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                        No results found for "{searchQuery}"
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Metrics Section */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {/* Total Products */}
        <div style={{
          background: 'white',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{
              width: '40px',
              height: '40px',
              background: 'linear-gradient(135deg, #dbeafe, #e0f2fe)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
            }}>📦</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>Total Products</span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1e293b' }}>
            {inventoryLoading ? '...' : inventoryTotals.totalProducts}
          </div>
        </div>

        {/* Total Stock Qty */}
        <div style={{
          background: 'white',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{
              width: '40px',
              height: '40px',
              background: 'linear-gradient(135deg, #dcfce7, #d1fae5)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
            }}>📋</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>Total Stock Qty</span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1e293b' }}>
            {inventoryLoading ? '...' : inventoryTotals.totalStockQty.toLocaleString('en-IN')}
          </div>
        </div>

        {/* Total Purchase Value */}
        <div style={{
          background: 'white',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{
              width: '40px',
              height: '40px',
              background: 'linear-gradient(135deg, #fef3c7, #fef9c3)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
            }}>💰</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>Total Purchase Value</span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1e293b' }}>
            {inventoryLoading ? '...' : formatCurrencyWhole(inventoryTotals.totalPurchaseValue)}
          </div>
        </div>

        {/* Total Sell Revenue */}
        <div style={{
          background: 'white',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          border: '1px solid #e2e8f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{
              width: '40px',
              height: '40px',
              background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
            }}>📈</span>
            <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>Total Sell Revenue</span>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#059669' }}>
            {inventoryLoading ? '...' : formatCurrencyWhole(inventoryTotals.totalSellRevenue)}
          </div>
        </div>
      </div>

      {/* GL-RJ-009: Daily Sales Summary Section */}
      <div style={{
        background: 'white',
        borderRadius: '14px',
        padding: '1.5rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        border: '1px solid #e2e8f0',
        marginBottom: '2rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{
            margin: 0,
            fontSize: '1rem',
            fontWeight: '600',
            color: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <span style={{ fontSize: '1.2rem' }}>📊</span>
            Today's Sales Summary
          </h2>
          {dailySummary && (
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {formatDateShort(dailySummary.date)}
            </span>
          )}
        </div>

        {dailySummaryLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
            Loading daily summary...
          </div>
        ) : dailySummaryError ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#dc2626' }}>
            {dailySummaryError}
          </div>
        ) : dailySummary ? (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem',
            }}>
              {/* Total Sales */}
              <div style={{
                background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                borderRadius: '10px',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>
                  {formatRupees(dailySummary.totalSales)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Total Sales</div>
              </div>

              {/* Total Bills */}
              <div style={{
                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                borderRadius: '10px',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2563eb' }}>
                  {dailySummary.totalBills}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Bills</div>
              </div>

              {/* Average Bill */}
              <div style={{
                background: 'linear-gradient(135deg, #fef3c7, #fef9c3)',
                borderRadius: '10px',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#d97706' }}>
                  {formatRupees(dailySummary.averageBillValue)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Avg Bill</div>
              </div>

              {/* Items Sold */}
              <div style={{
                background: 'linear-gradient(135deg, #fce7f3, #fbcfe8)',
                borderRadius: '10px',
                padding: '1rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#db2777' }}>
                  {dailySummary.itemsSold}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Items Sold</div>
              </div>
            </div>

            {/* Payment Breakdown */}
            {(dailySummary.paymentBreakdown.cash > 0 || dailySummary.paymentBreakdown.upi > 0) && (
              <div style={{
                borderTop: '1px solid #e2e8f0',
                paddingTop: '1rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem',
                fontSize: '0.85rem',
              }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>Payment Modes:</span>
                {dailySummary.paymentBreakdown.cash > 0 && (
                  <span style={{ color: '#059669' }}>
                    💵 Cash: {formatRupees(dailySummary.paymentBreakdown.cash)}
                  </span>
                )}
                {dailySummary.paymentBreakdown.upi > 0 && (
                  <span style={{ color: '#2563eb' }}>
                    📱 UPI: {formatRupees(dailySummary.paymentBreakdown.upi)}
                  </span>
                )}
                {dailySummary.paymentBreakdown.card > 0 && (
                  <span style={{ color: '#7c3aed' }}>
                    💳 Card: {formatRupees(dailySummary.paymentBreakdown.card)}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
            No sales data for today
          </div>
        )}
      </div>

      {/* Quick Actions Section */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{
          margin: '0 0 1rem',
          fontSize: '0.85rem',
          fontWeight: '600',
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          Quick Actions
        </h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Add Products Card */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowAddProductMenu(!showAddProductMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1.25rem 1.75rem',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '14px',
                fontWeight: '600',
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.35)',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.4)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(16, 185, 129, 0.35)';
              }}
            >
              <span style={{ fontSize: '1.3rem' }}>📦</span>
              Add Products (Without Supplier)
              <span style={{ marginLeft: '0.25rem', opacity: 0.8 }}>▼</span>
            </button>

            {showAddProductMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '0.5rem',
                background: 'white',
                borderRadius: '14px',
                boxShadow: '0 12px 48px rgba(0,0,0,0.15)',
                minWidth: '200px',
                zIndex: 100,
                overflow: 'hidden',
                border: '1px solid #e2e8f0',
              }}>
                <button
                  onClick={() => {
                    setShowAddProductMenu(false);
                    navigate(`/s/${storeCode}/import`);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    width: '100%',
                    padding: '1rem 1.25rem',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid #f1f5f9',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    color: '#334155',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f0fdf4'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                >
                  <span style={{ fontSize: '1.2rem' }}>📄</span>
                  CSV Upload
                </button>
                <button
                  onClick={() => {
                    setShowAddProductMenu(false);
                    navigate(`/s/${storeCode}/products?action=create`);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    width: '100%',
                    padding: '1rem 1.25rem',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    color: '#334155',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f0fdf4'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                >
                  <span style={{ fontSize: '1.2rem' }}>✏️</span>
                  Web Form
                </button>
              </div>
            )}
          </div>

          {/* Add Supplier Card */}
          <button
            onClick={() => navigate(`/s/${storeCode}/suppliers?action=create`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1.25rem 1.75rem',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              fontWeight: '600',
              fontSize: '1rem',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(139, 92, 246, 0.35)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(139, 92, 246, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(139, 92, 246, 0.35)';
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>🏪</span>
            Add Supplier (Market Supplier)
          </button>

          {/* GL-WF-031: Export Button with CSV download handler */}
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '1.25rem 1.5rem',
              background: 'white',
              color: '#475569',
              border: '2px solid #e2e8f0',
              borderRadius: '14px',
              fontWeight: '500',
              fontSize: '0.95rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0';
              e.currentTarget.style.background = 'white';
            }}
            onClick={() => {
              // GL-WF-031: Export inventory to CSV
              if (!inventory || inventory.length === 0) {
                alert('No inventory data to export');
                return;
              }
              const headers = ['Product Name', 'Barcode', 'Stock Qty', 'Purchase Value (Rs)', 'Sell Revenue (Rs)'];
              const rows = inventory.map(item => [
                `"${(item.productName || '').replace(/"/g, '""')}"`,
                item.barcode || '',
                String(item.totalStockQty || 0),
                ((item.totalPurchaseValue || 0) / 100).toFixed(2),
                ((item.totalSellRevenue || 0) / 100).toFixed(2),
              ]);
              const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `inventory-export-${new Date().toISOString().split('T')[0]}.csv`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>📊</span>
            Export
          </button>
        </div>
      </div>

      {/* RET-AUD-040: Category toggle error banner */}
      {catToggleError && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '0.875rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{catToggleError}</span>
          <button
            onClick={() => setCatToggleError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#dc2626',
              cursor: 'pointer',
              fontSize: '1.25rem',
              lineHeight: 1,
              padding: '0 0.25rem',
            }}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* FE-RETAILER-CAT-001: Categories Section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{
            margin: 0,
            fontSize: '0.85rem',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Product Categories
          </h2>
          {/* RCAT-CAT-002: Toggle to show/hide hidden categories */}
          {categories.some(c => c.isHidden) && (
            <button
              onClick={() => setShowHiddenCategories(!showHiddenCategories)}
              style={{
                background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem',
                cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              {showHiddenCategories ? 'Hide hidden' : `Show hidden (${categories.filter(c => c.isHidden).length})`}
            </button>
          )}
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '1rem',
        }}>
          {categoriesLoading ? (
            <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              Loading categories...
            </div>
          ) : categories.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              No categories yet. Add products to see category breakdown.
            </div>
          ) : (
            categories
              .filter(c => showHiddenCategories || !c.isHidden)
              .map((category) => (
              <div
                key={category.id}
                style={{
                  background: category.isHidden ? '#f8fafc' : 'white',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  border: `1px solid ${category.isHidden ? '#cbd5e1' : '#e2e8f0'}`,
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  opacity: category.isHidden ? 0.6 : 1,
                  position: 'relative' as const,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                }}
              >
                {/* RCAT-CAT-002: Edit/Delete action buttons */}
                <div style={{
                  position: 'absolute', top: '6px', right: '6px',
                  display: 'flex', gap: '2px',
                }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCategory(category);
                      setCatEditNameEn(category.labelEn);
                      setCatEditNameHi(category.labelHi || '');
                    }}
                    title="Rename category"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px',
                      color: '#64748b',
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'none'; }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCategoryToggleHidden(category);
                    }}
                    title={category.isHidden ? 'Show category' : 'Hide category'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px',
                      color: category.isHidden ? '#166534' : '#dc2626',
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'none'; }}
                  >
                    {category.isHidden ? 'Show' : 'Hide'}
                  </button>
                </div>
                <div
                  onClick={() => navigate(`/s/${storeCode}/products?category=${category.id}`)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <span style={{
                      width: '36px',
                      height: '36px',
                      background: 'linear-gradient(135deg, #e0f2fe, #f0f9ff)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.2rem',
                    }}>
                      {getCategoryIcon(category.iconKey)}
                    </span>
                    <div>
                      <div style={{ fontWeight: '600', color: '#334155', fontSize: '0.95rem' }}>
                        {category.labelEn}
                      </div>
                      {category.labelHi && (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {category.labelHi}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      background: category.productCount > 0 ? '#dcfce7' : '#f1f5f9',
                      color: category.productCount > 0 ? '#166534' : '#64748b',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                    }}>
                      {Number(category.productCount) || 0} products
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {Number(category.stockValue || 0) > 0
                        ? formatCurrency(Number(category.stockValue))
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RCAT-CAT-002: Category Rename Modal */}
      {editingCategory && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => { if (!catEditSaving) { setEditingCategory(null); setCatEditError(null); } }}>
          <div style={{
            background: 'white', borderRadius: '12px', padding: '1.5rem',
            width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: '#334155' }}>
              Rename Category (Store Override)
            </h3>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>
                English Name
              </label>
              <input
                type="text"
                value={catEditNameEn}
                onChange={(e) => setCatEditNameEn(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
                  borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '4px' }}>
                Hindi Name
              </label>
              <input
                type="text"
                value={catEditNameHi}
                onChange={(e) => setCatEditNameHi(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0',
                  borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box',
                }}
              />
            </div>
            {/* GL-CRIT-0039: Display error message */}
            {catEditError && (
              <div style={{
                padding: '8px 12px', marginBottom: '0.75rem',
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: '6px', color: '#dc2626', fontSize: '0.85rem',
              }}>
                {catEditError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setEditingCategory(null); setCatEditError(null); }}
                style={{
                  padding: '8px 16px', border: '1px solid #e2e8f0', background: 'white',
                  borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCategoryRename}
                disabled={catEditSaving || (!catEditNameEn.trim() && !catEditNameHi.trim())}
                style={{
                  padding: '8px 16px', border: 'none',
                  background: catEditSaving ? '#94a3b8' : '#2563eb', color: 'white',
                  borderRadius: '6px', cursor: catEditSaving ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {catEditSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Section */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '0.85rem',
            fontWeight: '600',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Inventory Overview
          </h2>
          <span style={{
            padding: '0.35rem 0.85rem',
            background: '#e0f2fe',
            color: '#0369a1',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: '600',
          }}>
            {inventoryLoading ? 'Loading...' : `${inventoryTotals.totalProducts} products`}
          </span>
        </div>

        <div style={{
          background: 'white',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)',
          border: '1px solid #e2e8f0',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{
                  padding: '1rem 1.5rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  Product Name
                </th>
                <th style={{
                  padding: '1rem 1.5rem',
                  textAlign: 'right',
                  fontWeight: '600',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  Total Stock Qty
                </th>
                <th style={{
                  padding: '1rem 1.5rem',
                  textAlign: 'right',
                  fontWeight: '600',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  Total Purchase Value
                </th>
                <th style={{
                  padding: '1rem 1.5rem',
                  textAlign: 'right',
                  fontWeight: '600',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  borderBottom: '1px solid #e2e8f0',
                }}>
                  Total Sell Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {inventoryLoading ? (
                <tr>
                  <td colSpan={4} style={{ padding: '3rem 2rem', textAlign: 'center', color: '#64748b' }}>
                    Loading inventory...
                  </td>
                </tr>
              ) : inventoryError ? (
                <tr>
                  <td colSpan={4} style={{ padding: '3rem 2rem', textAlign: 'center', color: '#ef4444' }}>
                    {inventoryError}
                  </td>
                </tr>
              ) : inventory.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                    <div style={{
                      maxWidth: '320px',
                      margin: '0 auto',
                    }}>
                      <div style={{
                        width: '80px',
                        height: '80px',
                        margin: '0 auto 1.25rem',
                        background: 'linear-gradient(135deg, #e0f2fe, #f0f9ff)',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2.5rem',
                      }}>
                        📦
                      </div>
                      <h3 style={{
                        margin: '0 0 0.5rem',
                        color: '#334155',
                        fontWeight: '600',
                        fontSize: '1.1rem',
                      }}>
                        Your inventory is empty
                      </h3>
                      <p style={{
                        margin: 0,
                        color: '#94a3b8',
                        fontSize: '0.9rem',
                        lineHeight: '1.6',
                      }}>
                        Get started by adding your first products using CSV upload or the web form above.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                inventory.slice(invPage * INV_PAGE_SIZE, (invPage + 1) * INV_PAGE_SIZE).map((item) => (
                  <tr key={item.productId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{
                      padding: '1rem 1.5rem',
                      color: '#334155',
                      fontWeight: '500',
                    }}>
                      {item.productName || item.productId}
                    </td>
                    <td style={{
                      padding: '1rem 1.5rem',
                      textAlign: 'right',
                      color: '#475569',
                      fontWeight: '600',
                    }}>
                      {Number(item.totalStockQty) || 0}
                    </td>
                    <td style={{
                      padding: '1rem 1.5rem',
                      textAlign: 'right',
                      color: '#475569',
                    }}>
                      {formatCurrency(Number(item.totalPurchaseValue || 0))}
                    </td>
                    <td style={{
                      padding: '1rem 1.5rem',
                      textAlign: 'right',
                      color: '#059669',
                      fontWeight: '600',
                    }}>
                      {formatCurrency(Number(item.totalSellRevenue || 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {/* AUDIT-RET-011: Pagination controls */}
          {inventory.length > INV_PAGE_SIZE && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                Showing {invPage * INV_PAGE_SIZE + 1}–{Math.min((invPage + 1) * INV_PAGE_SIZE, inventory.length)} of {inventory.length}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setInvPage(p => Math.max(0, p - 1))} disabled={invPage === 0} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: invPage === 0 ? '#f1f5f9' : 'white', color: invPage === 0 ? '#94a3b8' : '#334155', cursor: invPage === 0 ? 'default' : 'pointer', fontSize: '0.85rem' }}>Previous</button>
                <button onClick={() => setInvPage(p => Math.min(Math.ceil(inventory.length / INV_PAGE_SIZE) - 1, p + 1))} disabled={(invPage + 1) * INV_PAGE_SIZE >= inventory.length} style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: (invPage + 1) * INV_PAGE_SIZE >= inventory.length ? '#f1f5f9' : 'white', color: (invPage + 1) * INV_PAGE_SIZE >= inventory.length ? '#94a3b8' : '#334155', cursor: (invPage + 1) * INV_PAGE_SIZE >= inventory.length ? 'default' : 'pointer', fontSize: '0.85rem' }}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
