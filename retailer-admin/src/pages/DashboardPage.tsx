// STG-211: Replaced hardcoded hex colors with CSS variables for dark mode
import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import { useEscapeKey } from '../lib/hooks';
import { fetchInventory, InventoryItem, fetchCategories, FmcgCategory, fetchSearch, SearchResult, fetchDailySummary, DailySummary } from '../api/store';
// GL-CRIT-0066: Use centralized category icons configuration
import { getCategoryIcon as getCategoryIconFromConfig } from '../config/categoryIcons';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
// TZ-FORMAT-001 + CURRENCY-FORMAT-001: Use shared formatters
import { formatCurrencyWhole, formatCurrency, formatDateShort } from '../lib/formatters';
import { logger } from '../lib/logger';

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
  // STG-212: Track category fetch errors (was silently showing empty state)
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

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
        const data = await safeJson(response).catch(() => null);
        setCatEditError(data?.error?.message || 'Failed to rename category. Please try again.');
      }
    } catch (err) {
      logger.error('Failed to rename category:', err);
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
        const data = await safeJson(response);
        setCategories(prev => prev.map(c =>
          c.id === category.id ? { ...c, isHidden: data?.isHidden } : c
        ));
      } else {
        // RET-AUD-040: Show API error to user
        const data = await safeJson(response).catch(() => null);
        setCatToggleError(data?.error?.message || `Failed to ${category.isHidden ? 'show' : 'hide'} category. Please try again.`);
      }
    } catch (err) {
      logger.error('Failed to toggle category visibility:', err);
      // RET-AUD-040: Show network error to user
      setCatToggleError('Network error. Please check your connection and try again.');
    }
  };

  // STG-213: Cancelled flag prevents setState on unmounted component
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    const loadInventory = async () => {
      setInventoryLoading(true);
      setInventoryError(null);
      try {
        const result = await fetchInventory(accessToken);
        if (cancelled) return;
        setInventory(result.data || []);
        // RCAT-METRICS-001: Use server-provided totals (NaN-safe)
        if (result.totals) {
          setInventoryTotals(result.totals);
        }
      } catch (err) {
        if (cancelled) return;
        logger.error('Failed to load inventory:', err);
        setInventoryError('Failed to load inventory');
        setInventory([]);
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    };

    const loadCategories = async () => {
      setCategoriesLoading(true);
      setCategoriesError(null);
      try {
        const result = await fetchCategories(accessToken);
        if (cancelled) return;
        // Filter out the "All" category (sortOrder 0) for display
        setCategories((result.data || []).filter(c => c.sortOrder > 0));
      } catch (err) {
        if (cancelled) return;
        logger.error('Failed to load categories:', err);
        setCategoriesError('Failed to load categories');
        setCategories([]);
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    };

    // GL-RJ-009: Load daily summary for dashboard
    const loadDailySummary = async () => {
      setDailySummaryLoading(true);
      setDailySummaryError(null);
      try {
        const result = await fetchDailySummary(accessToken);
        if (cancelled) return;
        setDailySummary(result.data || null);
      } catch (err) {
        if (cancelled) return;
        logger.error('Failed to load daily summary:', err);
        setDailySummaryError('Failed to load daily summary');
        setDailySummary(null);
      } finally {
        if (!cancelled) setDailySummaryLoading(false);
      }
    };

    loadInventory();
    loadCategories();
    loadDailySummary();

    return () => { cancelled = true; };
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

  // STG-483: Auth loading guard
  if (!accessToken) return <div className="text-center-muted">Loading...</div>;

  return (
    <div className="dash-container">
      {/* T-112: Breadcrumb navigation */}
      <Breadcrumb items={[{ label: 'Home' }]} />
      {/* AUDIT-RET-008: Shimmer animation for loading skeletons */}
      <style>{`@keyframes shimmer { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }`}</style>
      {/* Welcome Hero Section */}
      <div className="dash-hero">
        {/* Decorative circles */}
        <div className="dash-hero-circle1" />
        <div className="dash-hero-circle2" />

        <div className="dash-hero-inner">
          {/* Greeting & Store Info */}
          <div className="dash-greeting-wrap">
            <p className="dash-greeting">
              {getGreeting()}
            </p>
            <h1 className="dash-store-name">
              {store?.name || 'Welcome to SuperMandi'}
            </h1>
            <span className="dash-store-badge">
              Store ID: {store?.code || storeCode}
            </span>
          </div>

          {/* RCAT-SEARCH-001: Search Bar with Results Dropdown */}
          <div ref={searchRef} className="dash-search-wrap">
            <div className="dash-search-box">
              <input
                type="text"
                placeholder="Search product / supplier / barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (searchResults) setShowSearchResults(true); }}
                onKeyDown={(e) => { if (e.key === 'Escape') setShowSearchResults(false); }}
                className="dash-search-input"
                role="combobox"
                aria-expanded={showSearchResults && !!(searchLoading || searchResults)}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-label="Search product, supplier, or barcode"
              />
            </div>

            {/* Search Results Dropdown */}
            {showSearchResults && (searchLoading || searchResults) && (
              <div className="dash-results-dropdown" role="listbox" aria-label="Search results">
                {searchLoading && (
                  <div className="dash-results-loading">
                    Searching...
                  </div>
                )}

                {!searchLoading && searchResults && (
                  <>
                    {/* Products Section */}
                    {searchResults.products.length > 0 && (
                      <div>
                        <div className="dash-results-section-label">
                          Products ({searchResults.products.length})
                        </div>
                        {searchResults.products.map((p) => (
                          <div
                            key={p.id}
                            role="option"
                            tabIndex={0}
                            onClick={() => { setShowSearchResults(false); navigate(`/s/${storeCode}/products?search=${encodeURIComponent(p.name)}`); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowSearchResults(false); navigate(`/s/${storeCode}/products?search=${encodeURIComponent(p.name)}`); } }}
                            className="dash-result-row"
                          >
                            <div>
                              <div className="dash-result-name">{p.name}</div>
                              <div className="dash-result-meta">
                                {p.brand && <span>{p.brand} | </span>}
                                <span className="dash-result-mono">{p.barcode || 'No barcode'}</span>
                              </div>
                            </div>
                            <div className="dash-result-right">
                              <div className="dash-result-price">
                                {formatCurrency(p.sellPrice)}
                              </div>
                              <div className={p.stock > 0 ? 'dash-result-stock-ok' : 'dash-result-stock-low'}>
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
                        <div className="dash-results-section-label">
                          Suppliers ({searchResults.suppliers.length})
                        </div>
                        {searchResults.suppliers.map((s) => (
                          <div
                            key={s.id}
                            role="option"
                            tabIndex={0}
                            onClick={() => { setShowSearchResults(false); navigate(`/s/${storeCode}/suppliers`); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowSearchResults(false); navigate(`/s/${storeCode}/suppliers`); } }}
                            className="dash-result-row"
                          >
                            <div>
                              <div className="dash-result-name">{s.businessName}</div>
                              <div className="dash-result-meta">
                                {s.phone && <span>{s.phone} | </span>}
                                {s.gstin && <span className="dash-result-mono">{s.gstin}</span>}
                              </div>
                            </div>
                            <span className={`dash-result-badge ${s.isSupermandi ? 'badge-blue' : s.verificationStatus === 'verified' ? 'badge-green' : 'badge-muted'}`}>
                              {s.isSupermandi ? 'SuperMandi' : s.verificationStatus}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Barcode Matches Section */}
                    {searchResults.barcodes.length > 0 && (
                      <div>
                        <div className="dash-results-section-label">
                          Barcode Matches ({searchResults.barcodes.length})
                        </div>
                        {searchResults.barcodes.map((b) => (
                          <div
                            key={b.storeProductId}
                            role="option"
                            tabIndex={0}
                            onClick={() => { setShowSearchResults(false); navigate(`/s/${storeCode}/products?search=${encodeURIComponent(b.barcode)}`); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowSearchResults(false); navigate(`/s/${storeCode}/products?search=${encodeURIComponent(b.barcode)}`); } }}
                            className="dash-result-row"
                          >
                            <div>
                              <div className="dash-result-name">{b.productName}</div>
                              <div className="dash-result-meta dash-result-mono">{b.barcode}</div>
                            </div>
                            <span className={`dash-result-badge ${b.mode === 'PACKAGED' ? 'badge-blue' : 'badge-amber'}`}>
                              {b.mode === 'PACKAGED' ? 'Packaged' : 'Loose'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* No Results */}
                    {searchResults.products.length === 0 && searchResults.suppliers.length === 0 && searchResults.barcodes.length === 0 && (
                      <div className="dash-no-results">
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
      <div className="dash-metrics-grid">
        {/* Total Products */}
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-icon dash-metric-icon--products" aria-hidden="true">📦</span>
            <span className="dash-metric-label">Total Products</span>
          </div>
          <div className="dash-metric-value">
            {inventoryLoading ? <span className="dash-shimmer dash-shimmer--sm" /> : inventoryTotals.totalProducts}
          </div>
        </div>

        {/* Total Stock Qty */}
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-icon dash-metric-icon--stock" aria-hidden="true">📋</span>
            <span className="dash-metric-label">Total Stock Qty</span>
          </div>
          <div className="dash-metric-value">
            {inventoryLoading ? <span className="dash-shimmer dash-shimmer--sm" /> : (inventoryTotals.totalStockQty ?? 0).toLocaleString('en-IN')}
          </div>
        </div>

        {/* Total Purchase Value */}
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-icon dash-metric-icon--purchase" aria-hidden="true">💰</span>
            <span className="dash-metric-label">Total Purchase Value</span>
          </div>
          <div className="dash-metric-value">
            {inventoryLoading ? <span className="dash-shimmer dash-shimmer--md" /> : formatCurrencyWhole(inventoryTotals.totalPurchaseValue)}
          </div>
        </div>

        {/* Total Sell Revenue */}
        <div className="dash-metric-card">
          <div className="dash-metric-header">
            <span className="dash-metric-icon dash-metric-icon--revenue" aria-hidden="true">📈</span>
            <span className="dash-metric-label">Total Sell Revenue</span>
          </div>
          <div className="dash-metric-value dash-metric-value--green">
            {inventoryLoading ? <span className="dash-shimmer dash-shimmer--md" /> : formatCurrencyWhole(inventoryTotals.totalSellRevenue)}
          </div>
        </div>
      </div>

      {/* GL-RJ-009: Daily Sales Summary Section */}
      <div className="dash-daily-card">
        <div className="dash-daily-header">
          <h2 className="dash-daily-title">
            <span className="dash-daily-icon" aria-hidden="true">📊</span>
            Today's Sales Summary
          </h2>
          {dailySummary && (
            <span className="dash-daily-date">
              {formatDateShort(dailySummary.date)}
            </span>
          )}
        </div>

        {dailySummaryLoading ? (
          <div className="dash-daily-shimmer-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="dash-daily-shimmer-item">
                <div className="dash-daily-shimmer-val dash-shimmer" />
                <div className="dash-daily-shimmer-label dash-shimmer" />
              </div>
            ))}
          </div>
        ) : dailySummaryError ? (
          <div className="dash-daily-error">
            {dailySummaryError}
          </div>
        ) : dailySummary ? (
          <>
            <div className="dash-daily-grid">
              {/* Total Sales */}
              <div className="dash-daily-stat dash-daily-stat--sales">
                <div className="dash-daily-val dash-daily-val--green">
                  {formatCurrency(dailySummary.totalSales)}
                </div>
                <div className="dash-daily-label">Total Sales</div>
              </div>

              {/* Total Bills */}
              <div className="dash-daily-stat dash-daily-stat--bills">
                <div className="dash-daily-val dash-daily-val--blue">
                  {dailySummary.totalBills}
                </div>
                <div className="dash-daily-label">Bills</div>
              </div>

              {/* Average Bill */}
              <div className="dash-daily-stat dash-daily-stat--avg">
                <div className="dash-daily-val dash-daily-val--amber">
                  {formatCurrency(dailySummary.averageBillValue)}
                </div>
                <div className="dash-daily-label">Avg Bill</div>
              </div>

              {/* Items Sold */}
              <div className="dash-daily-stat dash-daily-stat--items">
                <div className="dash-daily-val dash-daily-val--pink">
                  {dailySummary.itemsSold}
                </div>
                <div className="dash-daily-label">Items Sold</div>
              </div>
            </div>

            {/* Payment Breakdown */}
            {(dailySummary.paymentBreakdown.cash > 0 || dailySummary.paymentBreakdown.upi > 0) && (
              <div className="dash-pay-break">
                <span className="dash-pay-label">Payment Modes:</span>
                {dailySummary.paymentBreakdown.cash > 0 && (
                  <span className="dash-pay-cash">
                    💵 Cash: {formatCurrency(dailySummary.paymentBreakdown.cash)}
                  </span>
                )}
                {dailySummary.paymentBreakdown.upi > 0 && (
                  <span className="dash-pay-upi">
                    📱 UPI: {formatCurrency(dailySummary.paymentBreakdown.upi)}
                  </span>
                )}
                {dailySummary.paymentBreakdown.card > 0 && (
                  <span className="dash-pay-card">
                    💳 Card: {formatCurrency(dailySummary.paymentBreakdown.card)}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="dash-daily-empty">
            No sales data for today
          </div>
        )}
      </div>

      {/* Quick Actions Section */}
      <div className="dash-section-mb">
        <h2 className="dash-section-title">
          Quick Actions
        </h2>
        <div className="dash-actions-row">
          {/* Add Products Card */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowAddProductMenu(!showAddProductMenu)}
              className="dash-action-btn dash-action-btn--add"
            >
              <span className="dash-action-icon" aria-hidden="true">📦</span>
              Add Products (Without Supplier)
              <span className="dash-action-arrow" aria-hidden="true">▼</span>
            </button>

            {showAddProductMenu && (
              <div className="dash-dropdown-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setShowAddProductMenu(false);
                    navigate(`/s/${storeCode}/import`);
                  }}
                  className="dash-dropdown-item"
                >
                  <span className="dash-dropdown-icon" aria-hidden="true">📄</span>
                  CSV Upload
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setShowAddProductMenu(false);
                    navigate(`/s/${storeCode}/products?action=create`);
                  }}
                  className="dash-dropdown-item"
                >
                  <span className="dash-dropdown-icon" aria-hidden="true">✏️</span>
                  Web Form
                </button>
              </div>
            )}
          </div>

          {/* Add Supplier Card */}
          <button
            onClick={() => navigate(`/s/${storeCode}/suppliers?action=create`)}
            className="dash-action-btn dash-action-btn--supplier"
          >
            <span className="dash-action-icon" aria-hidden="true">🏪</span>
            Add Supplier (Market Supplier)
          </button>

          {/* GL-WF-031: Export Button with CSV download handler */}
          <button
            className="dash-action-btn dash-action-btn--export"
            onClick={() => {
              // GL-WF-031: Export inventory to CSV
              if (!inventory || inventory.length === 0) {
                toast.error('No inventory data to export');
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
            <span className="dash-action-icon" aria-hidden="true">📊</span>
            Export
          </button>
        </div>
      </div>

      {/* RET-AUD-040: Category toggle error banner */}
      {catToggleError && (
        <div className="dash-cat-error-banner">
          <span>{catToggleError}</span>
          <button
            onClick={() => setCatToggleError(null)}
            className="dash-cat-dismiss"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* FE-RETAILER-CAT-001: Categories Section */}
      <div className="dash-section-mb">
        <div className="dash-cat-header">
          <h2 className="dash-section-title" style={{ margin: 0 }}>
            Product Categories
          </h2>
          {/* RCAT-CAT-002: Toggle to show/hide hidden categories */}
          {categories.some(c => c.isHidden) && (
            <button
              onClick={() => setShowHiddenCategories(!showHiddenCategories)}
              className="dash-cat-toggle"
            >
              {showHiddenCategories ? 'Hide hidden' : `Show hidden (${categories.filter(c => c.isHidden).length})`}
            </button>
          )}
        </div>
        <div className="dash-cat-grid">
          {categoriesLoading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="dash-cat-shimmer-card">
                  <div className="dash-cat-shimmer-row">
                    <span className="dash-shimmer" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
                    <span className="dash-shimmer" style={{ width: '60%', height: '0.95rem', borderRadius: '4px' }} />
                  </div>
                  <span className="dash-shimmer" style={{ width: '40%', height: '0.75rem', borderRadius: '4px', display: 'inline-block' }} />
                </div>
              ))}
            </>
          ) : categoriesError ? (
            <div className="dash-cat-error-banner" style={{ gridColumn: '1 / -1' }}>
              {categoriesError}
            </div>
          ) : categories.length === 0 ? (
            <div className="dash-cat-empty">
              No categories yet. Add products to see category breakdown.
            </div>
          ) : (
            categories
              .filter(c => showHiddenCategories || !c.isHidden)
              .map((category) => (
              <div
                key={category.id}
                className={`dash-cat-card${category.isHidden ? ' dash-cat-card--hidden' : ''}`}
              >
                {/* RCAT-CAT-002: Edit/Delete action buttons */}
                <div className="dash-cat-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingCategory(category);
                      setCatEditNameEn(category.labelEn);
                      setCatEditNameHi(category.labelHi || '');
                    }}
                    title="Rename category"
                    className="dash-cat-action-btn"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCategoryToggleHidden(category);
                    }}
                    title={category.isHidden ? 'Show category' : 'Hide category'}
                    className={`dash-cat-action-btn ${category.isHidden ? 'dash-cat-action-btn--show' : 'dash-cat-action-btn--hide'}`}
                  >
                    {category.isHidden ? 'Show' : 'Hide'}
                  </button>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/s/${storeCode}/products?category=${category.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/s/${storeCode}/products?category=${category.id}`); } }}
                >
                  <div className="dash-cat-row">
                    <span className="dash-cat-icon">
                      {getCategoryIcon(category.iconKey)}
                    </span>
                    <div>
                      <div className="dash-cat-name">
                        {category.labelEn}
                      </div>
                      {category.labelHi && (
                        <div className="dash-cat-name-hi">
                          {category.labelHi}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="dash-cat-footer">
                    <span className={`dash-cat-count ${category.productCount > 0 ? 'dash-cat-count--active' : 'dash-cat-count--empty'}`}>
                      {Number(category.productCount) || 0} products
                    </span>
                    <span className="dash-cat-value">
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
        <div className="dash-modal-overlay" onClick={() => { if (!catEditSaving) { setEditingCategory(null); setCatEditError(null); } }}>
          <div className="dash-modal-card" role="dialog" aria-modal="true" aria-labelledby="cat-rename-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="cat-rename-title" className="dash-modal-title">
              Rename Category (Store Override)
            </h3>
            <div className="dash-modal-field">
              <label className="dash-modal-label" htmlFor="cat-rename-en">
                English Name
              </label>
              <input
                id="cat-rename-en"
                type="text"
                value={catEditNameEn}
                onChange={(e) => setCatEditNameEn(e.target.value)}
                className="dash-modal-input"
              />
            </div>
            <div className="dash-modal-field" style={{ marginBottom: '1rem' }}>
              <label className="dash-modal-label" htmlFor="cat-rename-hi">
                Hindi Name
              </label>
              <input
                id="cat-rename-hi"
                type="text"
                value={catEditNameHi}
                onChange={(e) => setCatEditNameHi(e.target.value)}
                className="dash-modal-input"
              />
            </div>
            {/* GL-CRIT-0039: Display error message */}
            {catEditError && (
              <div className="dash-modal-error">
                {catEditError}
              </div>
            )}
            <div className="dash-modal-actions">
              <button
                onClick={() => { setEditingCategory(null); setCatEditError(null); }}
                className="dash-modal-cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleCategoryRename}
                disabled={catEditSaving || (!catEditNameEn.trim() && !catEditNameHi.trim())}
                className={`dash-modal-save ${catEditSaving ? 'dash-modal-save--disabled' : 'dash-modal-save--active'}`}
              >
                {catEditSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Section */}
      <div>
        <div className="dash-inv-header">
          <h2 className="dash-section-title" style={{ margin: 0 }}>
            Inventory Overview
          </h2>
          <span className="dash-inv-count-badge">
            {inventoryLoading ? <span className="dash-shimmer dash-shimmer--label" /> : `${inventoryTotals.totalProducts} products`}
          </span>
        </div>

        <div className="dash-inv-table-wrap">
          <table className="dash-inv-table">
            <thead className="dash-inv-thead">
              <tr>
                <th className="dash-inv-th dash-inv-th--left">
                  Product Name
                </th>
                <th className="dash-inv-th dash-inv-th--right">
                  Total Stock Qty
                </th>
                <th className="dash-inv-th dash-inv-th--right">
                  Total Purchase Value
                </th>
                <th className="dash-inv-th dash-inv-th--right">
                  Total Sell Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {inventoryLoading ? (
                <>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="dash-inv-row">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="dash-inv-td">
                          <span className="dash-shimmer" style={{ width: j === 0 ? '70%' : '50%', height: '1rem', borderRadius: '4px' }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ) : inventoryError ? (
                <tr>
                  <td colSpan={4} className="dash-inv-error">
                    {inventoryError}
                  </td>
                </tr>
              ) : inventory.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                    <div className="dash-inv-empty-wrap">
                      <div className="dash-inv-empty-icon">
                        📦
                      </div>
                      <h3 className="dash-inv-empty-title">
                        Your inventory is empty
                      </h3>
                      <p className="dash-inv-empty-text">
                        Get started by adding your first products using CSV upload or the web form above.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                inventory.slice(invPage * INV_PAGE_SIZE, (invPage + 1) * INV_PAGE_SIZE).map((item) => (
                  <tr key={item.productId} className="dash-inv-row">
                    <td className="dash-inv-td dash-inv-td--name">
                      {item.productName || item.productId}
                    </td>
                    <td className="dash-inv-td dash-inv-td--qty">
                      {Number(item.totalStockQty) || 0}
                    </td>
                    <td className="dash-inv-td dash-inv-td--purchase">
                      {formatCurrency(Number(item.totalPurchaseValue || 0))}
                    </td>
                    <td className="dash-inv-td dash-inv-td--revenue">
                      {formatCurrency(Number(item.totalSellRevenue || 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {/* AUDIT-RET-011: Pagination controls */}
          {inventory.length > INV_PAGE_SIZE && (
            <div className="dash-inv-pagination">
              <span className="dash-inv-page-info">
                Showing {invPage * INV_PAGE_SIZE + 1}–{Math.min((invPage + 1) * INV_PAGE_SIZE, inventory.length)} of {inventory.length}
              </span>
              <div className="dash-inv-page-btns">
                <button onClick={() => setInvPage(p => Math.max(0, p - 1))} disabled={invPage === 0} className="dash-inv-page-btn">Previous</button>
                <button onClick={() => setInvPage(p => Math.min(Math.ceil(inventory.length / INV_PAGE_SIZE) - 1, p + 1))} disabled={(invPage + 1) * INV_PAGE_SIZE >= inventory.length} className="dash-inv-page-btn">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
