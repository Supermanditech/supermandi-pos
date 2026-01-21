import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { fetchInventory, InventoryItem, fetchCategories, FmcgCategory } from '../api/store';

export default function DashboardPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { store, accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddProductMenu, setShowAddProductMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // FE-RETAILER-INVENTORY-001: Wire to real inventory endpoint
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  // FE-RETAILER-CAT-001: Categories from POS taxonomy
  const [categories, setCategories] = useState<FmcgCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;

    const loadInventory = async () => {
      setInventoryLoading(true);
      setInventoryError(null);
      try {
        const result = await fetchInventory(accessToken);
        setInventory(result.data || []);
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

    loadInventory();
    loadCategories();
  }, [accessToken]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAddProductMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // FE-RETAILER-CAT-001: Map FMCG category icons to emoji
  const getCategoryIcon = (iconKey: string): string => {
    const iconMap: Record<string, string> = {
      'barley': '🌾',          // Atta-Dal
      'rice': '🍚',            // Chawal
      'shaker': '🌶️',          // Masala
      'oil': '🫒',             // Tel-Ghee
      'peanut': '🥜',          // Namkeen
      'cookie': '🍪',          // Biscuit
      'coffee': '☕',          // Chai-Coffee
      'bottle-soda-classic': '🥤', // Cold Drink
      'cow': '🥛',             // Doodh
      'hand-wash': '🧴',       // Sabun
      'spray-bottle': '🧹',    // Safai
      'baby-face': '👶',       // Baby
      'leaf': '🌿',            // Paan-Supari
      'dots-horizontal': '📦', // Baaki (Others)
      'view-grid': '📋',       // Default
    };
    return iconMap[iconKey] || '📦';
  };

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

          {/* Search Bar - Prominent */}
          <div style={{ maxWidth: '560px' }}>
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
            {inventoryLoading ? '...' : inventory.length}
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
            {inventoryLoading ? '...' : inventory.reduce((sum, item) => sum + (item.totalStockQty || 0), 0).toLocaleString('en-IN')}
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
            {inventoryLoading ? '...' : `₹${(inventory.reduce((sum, item) => sum + (item.totalPurchaseValue || 0), 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
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
            {inventoryLoading ? '...' : `₹${(inventory.reduce((sum, item) => sum + (item.totalSellRevenue || 0), 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          </div>
        </div>
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

          {/* Export Button */}
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
          >
            <span style={{ fontSize: '1.1rem' }}>📊</span>
            Export
          </button>
        </div>
      </div>

      {/* FE-RETAILER-CAT-001: Categories Section */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{
          margin: '0 0 1rem',
          fontSize: '0.85rem',
          fontWeight: '600',
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          Product Categories
        </h2>
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
            categories.map((category) => (
              <div
                key={category.id}
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  border: '1px solid #e2e8f0',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
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
                    {category.productCount} products
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    ₹{(category.stockValue / 100).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

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
            {inventoryLoading ? 'Loading...' : `${inventory.length} products`}
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
                inventory.map((item) => (
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
                      {item.totalStockQty}
                    </td>
                    <td style={{
                      padding: '1rem 1.5rem',
                      textAlign: 'right',
                      color: '#475569',
                    }}>
                      ₹{((item.totalPurchaseValue ?? 0) / 100).toFixed(2)}
                    </td>
                    <td style={{
                      padding: '1rem 1.5rem',
                      textAlign: 'right',
                      color: '#059669',
                      fontWeight: '600',
                    }}>
                      ₹{((item.totalSellRevenue ?? 0) / 100).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
