// T-218: Customer CRM page for retailer-admin
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import { formatDateTime, formatCurrency } from '../lib/formatters';
import Breadcrumb from '../components/Breadcrumb';
import EmptyState from '../components/EmptyState';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { Users, RefreshCw, Search, ChevronLeft } from 'lucide-react';

interface Customer {
  id: string;
  storeId: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  creditLimitMinor: number;
  totalPurchasesMinor: number;
  visitCount: number;
  lastVisitAt: string | null;
  createdAt: string;
}

interface Purchase {
  saleId: string;
  billRef: string;
  totalMinor: number;
  paymentMode: string;
  status: string;
  createdAt: string;
}


export default function CustomersPage() {
  const { accessToken } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Detail view state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const fetchCustomers = useCallback(async (q?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      // REQ.AUDIT.W5.RETAILER.CUSTOMERS-SEARCH-NO-INPUT-SANITIZE.001: trim whitespace
      if (q && q.trim()) params.set('q', q.trim());
      const response = await authFetch(`/api/v1/retailer-admin/customers?${params}`, accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch customers');
      const data = await safeJson<{ customers: Customer[]; total: number }>(response);
      if (!data) throw new Error('Invalid response');
      setCustomers(data.customers || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e?.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const fetchDetail = useCallback(async (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailLoading(true);
    setDetailError('');
    setPurchases([]);
    try {
      const response = await authFetch(`/api/v1/retailer-admin/customers/${customer.id}`, accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch customer details');
      const data = await safeJson<{ customer: Customer; purchases: Purchase[] }>(response);
      if (!data) throw new Error('Invalid response');
      setPurchases(data.purchases || []);
    } catch (e: any) {
      setDetailError(e?.message || 'Failed to load details');
    } finally {
      setDetailLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchCustomers(search || undefined);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, fetchCustomers]);

  // Detail view
  if (selectedCustomer) {
    return (
      <div>
        <Breadcrumb items={[{ label: 'Customers', onClick: () => setSelectedCustomer(null) }, { label: selectedCustomer.name }]} />
        <div className="cust-detail-header">
          <button onClick={() => setSelectedCustomer(null)} className="btn btn-secondary btn-icon">
            <ChevronLeft size={16} /> Back
          </button>
          <h2 className="page-title--compact">{selectedCustomer.name}</h2>
        </div>

        <div className="cust-detail-grid">
          <div className="card cust-detail-card">
            <div className="cust-detail-label">Phone</div>
            <div className="cust-detail-value--flex">
              {selectedCustomer.phone}
              {selectedCustomer.phone && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/91${selectedCustomer.phone.replace(/[^0-9]/g, '').replace(/^91/, '')}?text=${encodeURIComponent(`Hi ${selectedCustomer.name}, this is from your store.`)}`, '_blank', 'noopener,noreferrer'); }}
                  className="cust-wa-btn"
                  title="Message on WhatsApp"
                  aria-label="Message on WhatsApp"
                >
                  <WhatsAppIcon size={18} />
                </button>
              )}
            </div>
          </div>
          <div className="card cust-detail-card">
            <div className="cust-detail-label">Total Purchases</div>
            <div className="cust-detail-value">{formatCurrency(selectedCustomer.totalPurchasesMinor || 0)}</div>
          </div>
          <div className="card cust-detail-card">
            <div className="cust-detail-label">Visits</div>
            <div className="cust-detail-value">{selectedCustomer.visitCount || 0}</div>
          </div>
          <div className="card cust-detail-card">
            <div className="cust-detail-label">Last Visit</div>
            <div className="cust-detail-value">{selectedCustomer.lastVisitAt ? formatDateTime(selectedCustomer.lastVisitAt) : 'Never'}</div>
          </div>
          {selectedCustomer.email && (
            <div className="card cust-detail-card">
              <div className="cust-detail-label">Email</div>
              <div className="cust-detail-value">{selectedCustomer.email}</div>
            </div>
          )}
          {selectedCustomer.address && (
            <div className="card cust-detail-card">
              <div className="cust-detail-label">Address</div>
              <div className="cust-detail-value">{selectedCustomer.address}</div>
            </div>
          )}
          <div className="card cust-detail-card">
            <div className="cust-detail-label">Credit Limit</div>
            <div className="cust-detail-value">{formatCurrency(selectedCustomer.creditLimitMinor || 0)}</div>
          </div>
        </div>

        <h3>Recent Purchases</h3>
        {detailError && <div className="error-banner">{detailError}</div>}
        {detailLoading ? (
          <div className="reorder-loading">Loading purchases...</div>
        ) : purchases.length === 0 ? (
          <EmptyState icon={<Users size={32} />} title="No purchases yet" description="This customer has no recorded purchases." />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Bill Ref</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.saleId}>
                    <td><code>{p.billRef || p.saleId.slice(0, 8)}</code></td>
                    <td>{formatCurrency(p.totalMinor || 0)}</td>
                    <td><span className="badge">{p.paymentMode}</span></td>
                    <td><span className={`badge ${p.status === 'completed' ? 'badge-success' : 'badge-warning'}`}>{p.status}</span></td>
                    <td>{formatDateTime(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div>
      <Breadcrumb items={[{ label: 'Customers' }]} />
      <div className="cust-list-header">
        <h2 className="page-title--compact">Customers ({total})</h2>
        <div className="flex-row btn-icon">
          <div className="cust-search-wrap">
            <Search size={14} className="cust-search-icon" />
            <input
              type="text"
              placeholder="Search name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="cust-search-input"
              aria-label="Search customers by name or phone"
            />
          </div>
          <button onClick={() => fetchCustomers(search || undefined)} disabled={loading} className="btn btn-secondary btn-icon">
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-banner reorder-error-mb">{error}</div>}

      {!loading && customers.length === 0 ? (
        <EmptyState
          icon={<Users size={32} />}
          title="No customers found"
          description={search ? `No customers matching "${search}".` : "Customer profiles will appear here when customers are added via POS."}
        />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Total Purchases</th>
                <th>Visits</th>
                <th>Last Visit</th>
                <th>Credit Limit</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} onClick={() => fetchDetail(c)} style={{ cursor: 'pointer' }}>
                  <td className="cell-bold">{c.name}</td>
                  <td className="cust-phone-cell">
                    {c.phone}
                    {c.phone && (
                      <button
                        onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/91${c.phone.replace(/[^0-9]/g, '').replace(/^91/, '')}?text=${encodeURIComponent(`Hi ${c.name}, this is from your store.`)}`, '_blank', 'noopener,noreferrer'); }}
                        className="cust-wa-btn"
                        title="Message on WhatsApp"
                        aria-label="Message on WhatsApp"
                      >
                        <WhatsAppIcon size={16} />
                      </button>
                    )}
                  </td>
                  <td>{formatCurrency(c.totalPurchasesMinor || 0)}</td>
                  <td>{c.visitCount || 0}</td>
                  <td>{c.lastVisitAt ? formatDateTime(c.lastVisitAt) : '\u2014'}</td>
                  <td>{formatCurrency(c.creditLimitMinor || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && <div className="reorder-loading">Loading...</div>}
    </div>
  );
}
