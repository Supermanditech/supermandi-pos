import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch } from '../lib/api';

type VerificationStatus = 'verified' | 'pending' | 'rejected' | 'unverified';

interface Supplier {
  id: string;
  // Section A: Identity & Compliance
  businessName?: string;
  name: string;  // Legacy, same as businessName
  tradeName?: string;
  supplierType?: string;
  gstin: string | null;
  pan?: string;
  fssai?: string;
  // Section B: Contact & Address
  primaryPhone?: string;
  phone: string | null;  // Legacy, same as primaryPhone
  whatsappEnabled?: boolean;
  secondaryPhone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  area?: string;
  city?: string;
  state?: string;
  pincode?: string;
  address: string | null;  // Legacy, combined address
  // Section C: Commercial Terms (from store_links)
  paymentTerms?: string;
  creditDays?: number;
  minOrderValue?: number;
  deliveryCharges?: number;
  deliverySchedule?: string;
  returnsAllowed?: boolean;
  returnsWindow?: number;
  taxInvoiceProvided?: boolean;
  priceSource?: string;
  serviceArea?: string;
  deliveryAddress?: string;
  // Section D: Operational Metadata (from store_links)
  categoriesSupplied?: string[];
  brandsSupplied?: string;
  orderingChannel?: string;
  notes?: string;
  // Status & Metadata
  verificationStatus: VerificationStatus;
  isSupermandi: boolean;
  supplierCode?: string;
}

// Badge styles for verification status
// Using ASCII-friendly characters to avoid encoding issues
const STATUS_BADGES: Record<VerificationStatus, { bg: string; color: string; label: string; icon: string }> = {
  verified: { bg: '#dcfce7', color: '#166534', label: 'Verified', icon: '[OK]' },
  pending: { bg: '#fef3c7', color: '#92400e', label: 'Pending', icon: '[...]' },
  rejected: { bg: '#fee2e2', color: '#991b1b', label: 'Rejected', icon: '[X]' },
  unverified: { bg: '#f3f4f6', color: '#6b7280', label: 'Local', icon: '' },
};

// Supplier types for dropdown
const SUPPLIER_TYPES = [
  'Distributor',
  'Wholesaler',
  'Brand',
  'Local Vendor',
  'Farmer',
  'Manufacturer',
  'Other',
];

// Payment terms options
const PAYMENT_TERMS = ['Cash', 'UPI', 'Credit', 'Cash + Credit'];

// Price source options
const PRICE_SOURCES = ['Rate List', 'Phone Call', 'App', 'WhatsApp'];

// Ordering channel options
const ORDERING_CHANNELS = ['SuperMandi', 'WhatsApp', 'Phone', 'Supplier App', 'In Person'];

// Common categories for kirana stores
const SUPPLIER_CATEGORIES = [
  'Atta & Flour',
  'Rice',
  'Oil & Ghee',
  'Dairy',
  'FMCG',
  'Snacks',
  'Beverages',
  'Spices & Masala',
  'Pulses & Dals',
  'Personal Care',
  'Household',
  'Fruits & Vegetables',
  'Frozen Foods',
  'Baby Products',
  'Stationery',
  'Other',
];

// Form data interface with all fields
interface SupplierFormData {
  // Section A: Identity & Compliance
  supplierType: string;
  businessName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  fssai: string;
  // Section B: Contact & Address
  primaryPhone: string;
  whatsappEnabled: boolean;
  secondaryPhone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  serviceArea: string;
  deliveryAddress: string;
  // Section C: Commercial Terms
  paymentTerms: string;
  creditDays: string;
  minOrderValue: string;
  deliveryCharges: string;
  deliverySchedule: string;
  returnsAllowed: boolean;
  returnsWindow: string;
  taxInvoiceProvided: boolean;
  priceSource: string;
  // Section D: Operational Metadata
  categoriesSupplied: string[];
  brandsSupplied: string;
  orderingChannel: string;
  notes: string;
}

const initialFormData: SupplierFormData = {
  supplierType: '',
  businessName: '',
  tradeName: '',
  gstin: '',
  pan: '',
  fssai: '',
  primaryPhone: '',
  whatsappEnabled: true,
  secondaryPhone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  area: '',
  city: '',
  state: '',
  pincode: '',
  serviceArea: '',
  deliveryAddress: '',
  paymentTerms: 'Cash',
  creditDays: '',
  minOrderValue: '',
  deliveryCharges: '',
  deliverySchedule: '',
  returnsAllowed: false,
  returnsWindow: '',
  taxInvoiceProvided: false,
  priceSource: '',
  categoriesSupplied: [],
  brandsSupplied: '',
  orderingChannel: '',
  notes: '',
};

type FormSection = 'identity' | 'contact' | 'terms' | 'metadata';

export default function SuppliersPage() {
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [activeSection, setActiveSection] = useState<FormSection>('identity');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle ?action=create query param from dashboard navigation
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create') {
      setShowForm(true);
      setEditingSupplier(null);
      setFormData(initialFormData);
      setActiveSection('identity');
      // Clear the query param after handling
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch suppliers from API
  const fetchSuppliers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/v1/retailer-admin/suppliers', accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch suppliers');
      const data = await response.json();
      setSuppliers(data.data || []);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      setError('Failed to load suppliers. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      fetchSuppliers();
    }
  }, [accessToken]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCategoryToggle = (category: string) => {
    setFormData(prev => ({
      ...prev,
      categoriesSupplied: prev.categoriesSupplied.includes(category)
        ? prev.categoriesSupplied.filter(c => c !== category)
        : [...prev.categoriesSupplied, category],
    }));
  };

  const openEditForm = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      supplierType: supplier.supplierType || '',
      businessName: supplier.name,
      tradeName: supplier.tradeName || '',
      gstin: supplier.gstin || '',
      pan: supplier.pan || '',
      fssai: supplier.fssai || '',
      primaryPhone: supplier.phone || '',
      whatsappEnabled: supplier.whatsappEnabled ?? true,
      secondaryPhone: supplier.secondaryPhone || '',
      email: supplier.email || '',
      addressLine1: supplier.addressLine1 || '',
      addressLine2: supplier.addressLine2 || '',
      area: supplier.area || '',
      city: supplier.city || '',
      state: supplier.state || '',
      pincode: supplier.pincode || '',
      serviceArea: supplier.serviceArea || '',
      deliveryAddress: supplier.deliveryAddress || '',
      paymentTerms: supplier.paymentTerms || 'Cash',
      creditDays: supplier.creditDays?.toString() || '',
      minOrderValue: supplier.minOrderValue?.toString() || '',
      deliveryCharges: supplier.deliveryCharges?.toString() || '',
      deliverySchedule: supplier.deliverySchedule || '',
      returnsAllowed: supplier.returnsAllowed ?? false,
      returnsWindow: supplier.returnsWindow?.toString() || '',
      taxInvoiceProvided: supplier.taxInvoiceProvided ?? false,
      priceSource: supplier.priceSource || '',
      categoriesSupplied: supplier.categoriesSupplied || [],
      brandsSupplied: supplier.brandsSupplied || '',
      orderingChannel: supplier.orderingChannel || '',
      notes: supplier.notes || '',
    });
    setShowForm(true);
    setActiveSection('identity');
    setError('');
    setSuccess('');
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingSupplier(null);
    setFormData(initialFormData);
    setActiveSection('identity');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!formData.businessName.trim()) {
        throw new Error('Business name is required');
      }
      if (!formData.primaryPhone.trim()) {
        throw new Error('Primary phone is required');
      }

      const payload = {
        name: formData.businessName.trim(),
        supplierType: formData.supplierType || undefined,
        tradeName: formData.tradeName.trim() || undefined,
        gstin: formData.gstin.trim() || undefined,
        pan: formData.pan.trim() || undefined,
        fssai: formData.fssai.trim() || undefined,
        phone: formData.primaryPhone.trim(),
        whatsappEnabled: formData.whatsappEnabled,
        secondaryPhone: formData.secondaryPhone.trim() || undefined,
        email: formData.email.trim() || undefined,
        addressLine1: formData.addressLine1.trim() || undefined,
        addressLine2: formData.addressLine2.trim() || undefined,
        area: formData.area.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state.trim() || undefined,
        pincode: formData.pincode.trim() || undefined,
        serviceArea: formData.serviceArea.trim() || undefined,
        deliveryAddress: formData.deliveryAddress.trim() || undefined,
        paymentTerms: formData.paymentTerms || undefined,
        creditDays: formData.creditDays ? parseInt(formData.creditDays) : undefined,
        minOrderValue: formData.minOrderValue ? parseFloat(formData.minOrderValue) : undefined,
        deliveryCharges: formData.deliveryCharges ? parseInt(formData.deliveryCharges) : undefined,
        deliverySchedule: formData.deliverySchedule.trim() || undefined,
        returnsAllowed: formData.returnsAllowed,
        returnsWindow: formData.returnsWindow ? parseInt(formData.returnsWindow) : undefined,
        taxInvoiceProvided: formData.taxInvoiceProvided,
        priceSource: formData.priceSource || undefined,
        categoriesSupplied: formData.categoriesSupplied.length > 0 ? formData.categoriesSupplied : undefined,
        brandsSupplied: formData.brandsSupplied.trim() || undefined,
        orderingChannel: formData.orderingChannel || undefined,
        notes: formData.notes.trim() || undefined,
        // Combine address for legacy field
        address: [
          formData.addressLine1,
          formData.addressLine2,
          formData.area,
          formData.city,
          formData.state,
          formData.pincode,
        ].filter(Boolean).join(', ') || undefined,
      };

      const isEdit = !!editingSupplier;
      const url = isEdit
        ? `/api/v1/retailer-admin/suppliers/${editingSupplier.id}`
        : '/api/v1/retailer-admin/suppliers';
      const method = isEdit ? 'PATCH' : 'POST';

      const response = await authFetch(url, accessToken, {
        method,
        body: JSON.stringify(payload),
      });

      if (response.status === 401) return;
      const data = await response.json();

      if (!response.ok) {
        if (data.error?.code === 'CANNOT_EDIT_SUPERMANDI') {
          throw new Error('Cannot edit SuperMandi-verified suppliers');
        }
        throw new Error(data.error?.message || `Failed to ${isEdit ? 'update' : 'create'} supplier`);
      }

      setSuccess(`Supplier ${isEdit ? 'updated' : 'created'} successfully!`);
      closeForm();
      await fetchSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save supplier. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (supplierId: string) => {
    setError('');
    setSuccess('');

    try {
      const response = await authFetch(`/api/v1/retailer-admin/suppliers/${supplierId}`, accessToken, {
        method: 'DELETE',
      });

      if (response.status === 401) return;
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to delete supplier');
      }

      setSuccess('Supplier removed successfully!');
      setDeleteConfirm(null);
      await fetchSuppliers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete supplier. Please try again.');
      setDeleteConfirm(null);
    }
  };

  const filteredSuppliers = suppliers.filter(
    s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
         (s.phone && s.phone.includes(searchTerm)) ||
         (s.gstin && s.gstin.includes(searchTerm))
  );

  // Form section tabs
  const FormSectionTabs = () => (
    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
      {[
        { key: 'identity', label: 'A. Identity', icon: '🏢' },
        { key: 'contact', label: 'B. Contact', icon: '📞' },
        { key: 'terms', label: 'C. Terms', icon: '💰' },
        { key: 'metadata', label: 'D. Info', icon: '📋' },
      ].map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => setActiveSection(key as FormSection)}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: activeSection === key ? 'var(--primary)' : 'transparent',
            color: activeSection === key ? 'white' : 'var(--text-secondary)',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: activeSection === key ? '500' : '400',
          }}
        >
          {icon} {label}
        </button>
      ))}
    </div>
  );

  // Section A: Identity & Compliance
  const IdentitySection = () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="form-group">
        <label className="form-label">Supplier Type</label>
        <select
          name="supplierType"
          className="form-input"
          value={formData.supplierType}
          onChange={handleInputChange}
        >
          <option value="">Select type...</option>
          {SUPPLIER_TYPES.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Business Name (Legal) *</label>
          <input
            type="text"
            name="businessName"
            className="form-input"
            placeholder="Enter legal business name"
            value={formData.businessName}
            onChange={handleInputChange}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Trade Name / Shop Name</label>
          <input
            type="text"
            name="tradeName"
            className="form-input"
            placeholder="Enter trade/shop name"
            value={formData.tradeName}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="grid grid-3" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">GSTIN</label>
          <input
            type="text"
            name="gstin"
            className="form-input"
            placeholder="27AAACP1234A1ZC"
            value={formData.gstin}
            onChange={handleInputChange}
            maxLength={15}
            disabled={!!editingSupplier}
          />
          {editingSupplier && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              GSTIN cannot be modified
            </span>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">PAN</label>
          <input
            type="text"
            name="pan"
            className="form-input"
            placeholder="ABCDE1234F"
            value={formData.pan}
            onChange={handleInputChange}
            maxLength={10}
          />
        </div>
        <div className="form-group">
          <label className="form-label">FSSAI License</label>
          <input
            type="text"
            name="fssai"
            className="form-input"
            placeholder="14 digit FSSAI number"
            value={formData.fssai}
            onChange={handleInputChange}
            maxLength={14}
          />
        </div>
      </div>
    </div>
  );

  // Section B: Contact & Address
  const ContactSection = () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Primary Phone *</label>
          <input
            type="tel"
            name="primaryPhone"
            className="form-input"
            placeholder="+91 9876543210"
            value={formData.primaryPhone}
            onChange={handleInputChange}
            required
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              name="whatsappEnabled"
              checked={formData.whatsappEnabled}
              onChange={handleInputChange}
            />
            WhatsApp enabled
          </label>
        </div>
        <div className="form-group">
          <label className="form-label">Secondary Phone</label>
          <input
            type="tel"
            name="secondaryPhone"
            className="form-input"
            placeholder="+91 9876543210"
            value={formData.secondaryPhone}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Email</label>
        <input
          type="email"
          name="email"
          className="form-input"
          placeholder="supplier@example.com"
          value={formData.email}
          onChange={handleInputChange}
        />
      </div>

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Address Line 1</label>
          <input
            type="text"
            name="addressLine1"
            className="form-input"
            placeholder="Shop/Office number, Building"
            value={formData.addressLine1}
            onChange={handleInputChange}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Address Line 2</label>
          <input
            type="text"
            name="addressLine2"
            className="form-input"
            placeholder="Street, Landmark"
            value={formData.addressLine2}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="grid grid-4" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Area</label>
          <input
            type="text"
            name="area"
            className="form-input"
            placeholder="Area/Locality"
            value={formData.area}
            onChange={handleInputChange}
          />
        </div>
        <div className="form-group">
          <label className="form-label">City</label>
          <input
            type="text"
            name="city"
            className="form-input"
            placeholder="City"
            value={formData.city}
            onChange={handleInputChange}
          />
        </div>
        <div className="form-group">
          <label className="form-label">State</label>
          <input
            type="text"
            name="state"
            className="form-input"
            placeholder="State"
            value={formData.state}
            onChange={handleInputChange}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Pincode</label>
          <input
            type="text"
            name="pincode"
            className="form-input"
            placeholder="400001"
            value={formData.pincode}
            onChange={handleInputChange}
            maxLength={6}
          />
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Service Area</label>
          <input
            type="text"
            name="serviceArea"
            className="form-input"
            placeholder="e.g., Mumbai, Thane, Navi Mumbai"
            value={formData.serviceArea}
            onChange={handleInputChange}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Delivery/Dispatch Point</label>
          <input
            type="text"
            name="deliveryAddress"
            className="form-input"
            placeholder="Pickup point address"
            value={formData.deliveryAddress}
            onChange={handleInputChange}
          />
        </div>
      </div>
    </div>
  );

  // Section C: Commercial Terms
  const TermsSection = () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Payment Terms</label>
          <select
            name="paymentTerms"
            className="form-input"
            value={formData.paymentTerms}
            onChange={handleInputChange}
          >
            {PAYMENT_TERMS.map(term => (
              <option key={term} value={term}>{term}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Credit Days</label>
          <input
            type="number"
            name="creditDays"
            className="form-input"
            placeholder="e.g., 7, 15, 30"
            value={formData.creditDays}
            onChange={handleInputChange}
            min={0}
            disabled={formData.paymentTerms === 'Cash' || formData.paymentTerms === 'UPI'}
          />
        </div>
      </div>

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Min Order Value (₹)</label>
          <input
            type="number"
            name="minOrderValue"
            className="form-input"
            placeholder="e.g., 500, 1000"
            value={formData.minOrderValue}
            onChange={handleInputChange}
            min={0}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Delivery Charges</label>
          <input
            type="text"
            name="deliveryCharges"
            className="form-input"
            placeholder="e.g., Free, ₹50 flat, Free above ₹1000"
            value={formData.deliveryCharges}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Delivery Schedule</label>
        <input
          type="text"
          name="deliverySchedule"
          className="form-input"
          placeholder="e.g., Mon-Sat, Order by 6PM for next day delivery"
          value={formData.deliverySchedule}
          onChange={handleInputChange}
        />
      </div>

      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              name="returnsAllowed"
              checked={formData.returnsAllowed}
              onChange={handleInputChange}
            />
            Returns Allowed
          </label>
          {formData.returnsAllowed && (
            <input
              type="number"
              name="returnsWindow"
              className="form-input"
              placeholder="Return window (days)"
              value={formData.returnsWindow}
              onChange={handleInputChange}
              min={1}
              style={{ marginTop: '0.5rem' }}
            />
          )}
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              name="taxInvoiceProvided"
              checked={formData.taxInvoiceProvided}
              onChange={handleInputChange}
            />
            Tax Invoice Provided
          </label>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Price Source</label>
        <select
          name="priceSource"
          className="form-input"
          value={formData.priceSource}
          onChange={handleInputChange}
        >
          <option value="">Select...</option>
          {PRICE_SOURCES.map(source => (
            <option key={source} value={source}>{source}</option>
          ))}
        </select>
      </div>
    </div>
  );

  // Section D: Operational Metadata
  const MetadataSection = () => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div className="form-group">
        <label className="form-label">Categories Supplied</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
          {SUPPLIER_CATEGORIES.map(category => (
            <label
              key={category}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.75rem',
                border: '1px solid var(--border)',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                background: formData.categoriesSupplied.includes(category) ? 'var(--primary)' : 'white',
                color: formData.categoriesSupplied.includes(category) ? 'white' : 'var(--text-primary)',
              }}
            >
              <input
                type="checkbox"
                checked={formData.categoriesSupplied.includes(category)}
                onChange={() => handleCategoryToggle(category)}
                style={{ display: 'none' }}
              />
              {category}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Brands Supplied</label>
        <input
          type="text"
          name="brandsSupplied"
          className="form-input"
          placeholder="e.g., Amul, Tata, Fortune, Parle (comma separated)"
          value={formData.brandsSupplied}
          onChange={handleInputChange}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Preferred Ordering Channel</label>
        <select
          name="orderingChannel"
          className="form-input"
          value={formData.orderingChannel}
          onChange={handleInputChange}
        >
          <option value="">Select...</option>
          {ORDERING_CHANNELS.map(channel => (
            <option key={channel} value={channel}>{channel}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea
          name="notes"
          className="form-input"
          rows={3}
          placeholder="Any additional notes about this supplier..."
          value={formData.notes}
          onChange={handleInputChange}
        ></textarea>
      </div>
    </div>
  );

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="page-title">Suppliers</h1>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (showForm) {
                closeForm();
              } else {
                setShowForm(true);
                setEditingSupplier(null);
                setFormData(initialFormData);
                setActiveSection('identity');
                setError('');
                setSuccess('');
              }
            }}
          >
            {showForm ? 'Cancel' : '+ Add Supplier'}
          </button>
        </div>
      </header>

      <div className="page-content">
        {/* Success Message */}
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

        {/* Error Message */}
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

        {/* Add/Edit Supplier Form - Full Version */}
        {showForm && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 className="card-title">{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Complete the supplier profile. Required fields are marked with *.
            </p>

            <form onSubmit={handleSubmit}>
              <FormSectionTabs />

              {activeSection === 'identity' && <IdentitySection />}
              {activeSection === 'contact' && <ContactSection />}
              {activeSection === 'terms' && <TermsSection />}
              {activeSection === 'metadata' && <MetadataSection />}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : (editingSupplier ? 'Update Supplier' : 'Save Supplier')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeForm}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                {activeSection !== 'metadata' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const sections: FormSection[] = ['identity', 'contact', 'terms', 'metadata'];
                      const currentIndex = sections.indexOf(activeSection);
                      if (currentIndex < sections.length - 1) {
                        setActiveSection(sections[currentIndex + 1]);
                      }
                    }}
                    style={{ marginLeft: 'auto' }}
                  >
                    Next Section →
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, phone, or GSTIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ maxWidth: '400px' }}
          />
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              className="card"
              style={{ maxWidth: '400px', margin: '1rem' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="card-title">Remove Supplier?</h3>
              <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                Are you sure you want to remove this supplier from your store? This action can be undone by adding the supplier again.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn"
                  style={{ background: '#dc2626', color: 'white' }}
                  onClick={() => handleDelete(deleteConfirm)}
                >
                  Remove Supplier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Suppliers Table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading suppliers...
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              {searchTerm ? 'No suppliers match your search.' : 'No suppliers yet. Add your first supplier above!'}
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Supplier Name</th>
                  <th>Code</th>
                  <th>Phone</th>
                  <th>GSTIN</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => {
                  const status = supplier.verificationStatus || 'unverified';
                  const badge = STATUS_BADGES[status];
                  const isEditable = !supplier.isSupermandi && status !== 'verified';

                  return (
                    <tr key={supplier.id}>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            background: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.icon && <span>{badge.icon}</span>}
                          {badge.label}
                        </span>
                        {supplier.isSupermandi && (
                          <span
                            style={{
                              display: 'block',
                              fontSize: '0.65rem',
                              color: '#6366f1',
                              marginTop: '0.125rem',
                            }}
                          >
                            SuperMandi
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: '500' }}>
                        {supplier.name}
                        {supplier.tradeName && supplier.tradeName !== supplier.name && (
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {supplier.tradeName}
                          </span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {supplier.supplierCode || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                        {supplier.phone || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {supplier.gstin || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          {isEditable ? (
                            <>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                onClick={() => openEditForm(supplier)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#fee2e2', color: '#991b1b' }}
                                onClick={() => setDeleteConfirm(supplier.id)}
                              >
                                Remove
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '0.25rem 0.5rem' }}>
                              {supplier.isSupermandi ? 'View Only' : 'Verified'}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Verification Status Legend */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
          <h4 style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Supplier Status Guide</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#dcfce7', color: '#166534' }}>✓ Verified</span>
              <span style={{ color: 'var(--text-muted)' }}>Approved by SuperAdmin</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#fef3c7', color: '#92400e' }}>⏳ Pending</span>
              <span style={{ color: 'var(--text-muted)' }}>Awaiting verification</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ padding: '0.125rem 0.5rem', borderRadius: '9999px', background: '#f3f4f6', color: '#6b7280' }}>Local</span>
              <span style={{ color: 'var(--text-muted)' }}>Store-only (not in SuperMandi)</span>
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            <strong>Note:</strong> Verified and SuperMandi suppliers cannot be edited. To order from verified suppliers, their products will appear in POS.
          </p>
        </div>
      </div>
    </>
  );
}
