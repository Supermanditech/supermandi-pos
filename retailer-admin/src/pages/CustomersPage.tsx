// T-218: Customer CRM page for retailer-admin
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
import { formatDateTime } from '../lib/formatters';
import Breadcrumb from '../components/Breadcrumb';
import EmptyState from '../components/EmptyState';
import { Users, RefreshCw, Search, ChevronLeft } from 'lucide-react';

const WhatsAppIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

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

function formatCurrency(minor: number): string {
  return '\u20B9' + (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

export default function CustomersPage() {
  const { accessToken } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
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
      if (q) params.set('q', q);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setSelectedCustomer(null)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={16} /> Back
          </button>
          <h2 style={{ margin: 0 }}>{selectedCustomer.name}</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Phone</div>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {selectedCustomer.phone}
              {selectedCustomer.phone && (
                <button
                  onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${selectedCustomer.phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(`Hi ${selectedCustomer.name}, this is from your store.`)}`); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                  title="Message on WhatsApp"
                >
                  <WhatsAppIcon size={18} />
                </button>
              )}
            </div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Total Purchases</div>
            <div style={{ fontWeight: 600 }}>{formatCurrency(selectedCustomer.totalPurchasesMinor || 0)}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Visits</div>
            <div style={{ fontWeight: 600 }}>{selectedCustomer.visitCount || 0}</div>
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Last Visit</div>
            <div style={{ fontWeight: 600 }}>{selectedCustomer.lastVisitAt ? formatDateTime(selectedCustomer.lastVisitAt) : 'Never'}</div>
          </div>
          {selectedCustomer.email && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Email</div>
              <div style={{ fontWeight: 600 }}>{selectedCustomer.email}</div>
            </div>
          )}
          {selectedCustomer.address && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Address</div>
              <div style={{ fontWeight: 600 }}>{selectedCustomer.address}</div>
            </div>
          )}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>Credit Limit</div>
            <div style={{ fontWeight: 600 }}>{formatCurrency(selectedCustomer.creditLimitMinor || 0)}</div>
          </div>
        </div>

        <h3>Recent Purchases</h3>
        {detailError && <div className="error-banner">{detailError}</div>}
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Loading purchases...</div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Customers ({total})</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
            <input
              type="text"
              placeholder="Search name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 28, width: 220 }}
            />
          </div>
          <button onClick={() => fetchCustomers(search || undefined)} disabled={loading} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

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
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {c.phone}
                    {c.phone && (
                      <button
                        onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${c.phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(`Hi ${c.name}, this is from your store.`)}`); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                        title="Message on WhatsApp"
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

      {loading && <div style={{ textAlign: 'center', padding: 24, color: '#888' }}>Loading...</div>}
    </div>
  );
}
