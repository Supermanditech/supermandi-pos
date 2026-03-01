import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { authFetch, safeJson } from '../lib/api';
// T-112: Breadcrumb navigation
import Breadcrumb from '../components/Breadcrumb';
// T-120: URL state for search persistence
import { useUrlState } from '../hooks/useUrlState';
// GAP-2: EmptyState component for consistent empty states
import EmptyState from '../components/EmptyState';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { Truck } from 'lucide-react';
import { logger } from '../lib/logger';

// Debounce delay for server-side search (RCAT-SUP-API-001)
const SEARCH_DEBOUNCE_MS = 350;

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

// Section configuration for the 3 supplier groups
interface SectionConfig {
  key: 'verified' | 'pending' | 'local';
  title: string;
  icon: string;
  description: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  isEditable: boolean;
}

const SECTION_CONFIGS: SectionConfig[] = [
  {
    key: 'verified',
    title: 'Verified',
    icon: '🔒',
    description: 'Approved by SuperMandi - View Only',
    bgColor: 'var(--status-verified-bg)',
    borderColor: 'var(--status-verified-border)',
    textColor: 'var(--status-verified-text)',
    isEditable: false,
  },
  {
    key: 'pending',
    title: 'Pending Approval',
    icon: '⏳',
    description: 'Awaiting SuperAdmin verification - View Only',
    bgColor: 'var(--status-pending-bg)',
    borderColor: 'var(--status-pending-border)',
    textColor: 'var(--status-pending-text)',
    isEditable: false,
  },
  {
    key: 'local',
    title: 'Local Suppliers',
    icon: '✏️',
    description: 'Store-only suppliers - Editable',
    bgColor: 'var(--status-local-bg)',
    borderColor: 'var(--status-local-border)',
    textColor: 'var(--status-local-text)',
    isEditable: true,
  },
];

export default function SuppliersPage() {
  const { storeCode } = useParams<{ storeCode: string }>();
  const { accessToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  // T-120: Sync search term with URL for back/forward persistence
  const [searchTerm, setSearchTerm] = useUrlState('search');
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [activeSection, setActiveSection] = useState<FormSection>('identity');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false); // Server-side search indicator
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Collapsible section state - all expanded by default
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    verified: false,
    pending: false,
    local: false,
  });
  // RCAT-SUP-UX-001: Locked supplier modal state
  const [lockedSupplierModal, setLockedSupplierModal] = useState<{ supplier: Supplier; status: 'verified' | 'pending' } | null>(null);

  // Debounce timer ref for server-side search
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Fetch suppliers from API with optional server-side search (RCAT-SUP-API-001)
  const fetchSuppliers = useCallback(async (query?: string, showSearchIndicator = false) => {
    if (showSearchIndicator) {
      setIsSearching(true);
    } else {
      setIsLoading(true);
    }
    setError('');
    try {
      // Build URL with query parameter for server-side filtering
      const url = query
        ? `/api/v1/retailer-admin/suppliers?query=${encodeURIComponent(query)}`
        : '/api/v1/retailer-admin/suppliers';
      const response = await authFetch(url, accessToken);
      if (response.status === 401) return;
      if (!response.ok) throw new Error('Failed to fetch suppliers');
      const data = await safeJson(response);
      setSuppliers(data.data || []);
    } catch (err) {
      logger.error('Error fetching suppliers:', err);
      setError('Failed to load suppliers. Please try again.');
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  }, [accessToken]);

  // Initial load
  useEffect(() => {
    if (accessToken) {
      fetchSuppliers();
    }
  }, [accessToken, fetchSuppliers]);

  // Debounced server-side search when searchTerm changes
  useEffect(() => {
    // Clear any existing debounce timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Don't trigger search on initial mount (empty string)
    if (searchTerm === '') {
      // If search was cleared, refetch all suppliers
      if (suppliers.length > 0 || error) {
        fetchSuppliers();
      }
      return;
    }

    // Debounce the search API call
    searchDebounceRef.current = setTimeout(() => {
      fetchSuppliers(searchTerm, true);
    }, SEARCH_DEBOUNCE_MS);

    // Cleanup on unmount or when searchTerm changes
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchTerm, fetchSuppliers]);

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

      // GL-CRIT-0036: Phone number validation
      // Accept Indian phone numbers: 10 digits, optionally with +91 or 0 prefix
      const validatePhone = (phone: string): boolean => {
        const cleaned = phone.replace(/[\s\-()]/g, ''); // Remove spaces, dashes, parentheses
        // Match: 10 digits, or +91 followed by 10 digits, or 0 followed by 10 digits
        return /^(\+91|0)?[6-9]\d{9}$/.test(cleaned);
      };

      if (!validatePhone(formData.primaryPhone)) {
        throw new Error('Primary phone must be a valid 10-digit Indian mobile number');
      }
      if (formData.secondaryPhone.trim() && !validatePhone(formData.secondaryPhone)) {
        throw new Error('Secondary phone must be a valid 10-digit Indian mobile number');
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
      const data = await safeJson(response);

      if (!response.ok) {
        if (data.error?.code === 'CANNOT_EDIT_SUPERMANDI') {
          throw new Error('Cannot edit SuperMandi-verified suppliers');
        }
        throw new Error(data.error?.message || `Failed to ${isEdit ? 'update' : 'create'} supplier`);
      }

      // RCAT-SUP-FORM-001: Check for warnings about fields that couldn't be saved
      if (data.warnings && data.warnings.length > 0) {
        const fieldNames = data.warnings.join(', ');
        setSuccess(`Supplier ${isEdit ? 'updated' : 'created'} (partial). Note: Some fields (${fieldNames}) could not be saved - database migration required.`);
      } else {
        setSuccess(`Supplier ${isEdit ? 'updated' : 'created'} successfully!`);
      }
      closeForm();
      await fetchSuppliers(searchTerm || undefined); // Preserve search context
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
      const data = await safeJson(response);

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to delete supplier');
      }

      setSuccess('Supplier removed successfully!');
      setDeleteConfirm(null);
      await fetchSuppliers(searchTerm || undefined); // Preserve search context
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete supplier. Please try again.');
      setDeleteConfirm(null);
    }
  };

  // Server-side filtering is now used (RCAT-SUP-API-001)
  // The suppliers array already contains filtered results from the API
  // No client-side filtering needed anymore

  // Group suppliers by verification status for sectioned view
  const groupedSuppliers = {
    verified: suppliers.filter(s => s.verificationStatus === 'verified'),
    pending: suppliers.filter(s => s.verificationStatus === 'pending'),
    local: suppliers.filter(s => s.verificationStatus === 'unverified' || !s.verificationStatus),
  };

  // Toggle section collapse
  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  // Form section tabs
  const FormSectionTabs = () => (
    <div className="sup-form-tabs" role="tablist" aria-label="Supplier form sections">
      {[
        { key: 'identity', label: 'A. Identity', icon: '🏢' },
        { key: 'contact', label: 'B. Contact', icon: '📞' },
        { key: 'terms', label: 'C. Terms', icon: '💰' },
        { key: 'metadata', label: 'D. Info', icon: '📋' },
      ].map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={activeSection === key}
          onClick={() => setActiveSection(key as FormSection)}
          className={`sup-form-tab${activeSection === key ? ' sup-form-tab--active' : ''}`}
        >
          <span aria-hidden="true">{icon}</span> {label}
        </button>
      ))}
    </div>
  );

  // Section A: Identity & Compliance
  const IdentitySection = () => (
    <div className="sup-section-grid">
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

      <div className="grid grid-2 sup-grid-gap">
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

      <div className="grid grid-3 sup-grid-gap">
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
            <span className="sup-gstin-hint">
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
    <div className="sup-section-grid">
      <div className="grid grid-2 sup-grid-gap">
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
          <label className="sup-wa-label">
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

      <div className="grid grid-2 sup-grid-gap">
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

      <div className="grid grid-4 sup-grid-gap">
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

      <div className="grid grid-2 sup-grid-gap">
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
    <div className="sup-section-grid">
      <div className="grid grid-2 sup-grid-gap">
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

      <div className="grid grid-2 sup-grid-gap">
        <div className="form-group">
          <label className="form-label">Min Order Value (₹)</label>
          {/* GL-CRIT-0105: Added step and explicit min/max to prevent invalid values */}
          <input
            type="number"
            name="minOrderValue"
            className="form-input"
            placeholder="e.g., 500, 1000"
            value={formData.minOrderValue}
            onChange={handleInputChange}
            min={0}
            max={1000000}
            step={1}
          />
          <small className="sup-small-hint">Minimum order amount in rupees (0 = no minimum)</small>
        </div>
        <div className="form-group">
          <label className="form-label">Delivery Charges (₹)</label>
          {/* GL-CRIT-0104: Changed to numeric input with "free above" option */}
          <input
            type="number"
            name="deliveryCharges"
            className="form-input"
            placeholder="0 for free delivery"
            value={formData.deliveryCharges}
            onChange={handleInputChange}
            min={0}
            max={10000}
            step={1}
          />
          <small className="sup-small-hint">Flat rate in rupees (0 = free delivery)</small>
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

      <div className="grid grid-2 sup-grid-gap">
        <div className="form-group">
          <label className="sup-checkbox-label">
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
              className="form-input sup-returns-input"
              placeholder="Return window (days)"
              value={formData.returnsWindow}
              onChange={handleInputChange}
              min={1}
            />
          )}
        </div>
        <div className="form-group">
          <label className="sup-checkbox-label">
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
    <div className="sup-section-grid">
      <div className="form-group">
        <label className="form-label">Categories Supplied</label>
        <div className="sup-cat-chips">
          {SUPPLIER_CATEGORIES.map(category => (
            <label
              key={category}
              className="sup-cat-chip"
              style={{
                background: formData.categoriesSupplied.includes(category) ? 'var(--primary)' : 'white',
                color: formData.categoriesSupplied.includes(category) ? 'white' : 'var(--text-primary)',
              }}
            >
              <input
                type="checkbox"
                checked={formData.categoriesSupplied.includes(category)}
                onChange={() => handleCategoryToggle(category)}
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
      {/* T-112: Breadcrumb navigation */}
      <div className="breadcrumb-wrap">
        <Breadcrumb items={[{ label: 'Home', path: `/s/${storeCode}` }, { label: 'Suppliers' }]} />
      </div>
      <header className="page-header">
        <div className="flex-between">
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
          <div className="alert-inline-success">
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="alert-inline-error">
            {error}
          </div>
        )}

        {/* Add/Edit Supplier Form - Full Version */}
        {showForm && (
          <div className="card sup-form-card-wrap">
            <h3 className="card-title">{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h3>
            <p className="sup-form-hint">
              Complete the supplier profile. Required fields are marked with *.
            </p>

            <form onSubmit={handleSubmit}>
              <FormSectionTabs />

              {activeSection === 'identity' && <IdentitySection />}
              {activeSection === 'contact' && <ContactSection />}
              {activeSection === 'terms' && <TermsSection />}
              {activeSection === 'metadata' && <MetadataSection />}

              <div className="sup-form-actions">
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
                    className="btn btn-secondary sup-next-btn"
                    onClick={() => {
                      const sections: FormSection[] = ['identity', 'contact', 'terms', 'metadata'];
                      const currentIndex = sections.indexOf(activeSection);
                      if (currentIndex < sections.length - 1) {
                        setActiveSection(sections[currentIndex + 1]);
                      }
                    }}
                  >
                    Next Section →
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Search with server-side filtering indicator */}
        <div className="sup-search-wrap">
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, phone, or GSTIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search suppliers by name, phone, or GSTIN"
            style={{ width: '100%', paddingRight: isSearching ? '90px' : undefined }}
          />
          {isSearching && (
            <span className="sup-search-indicator">
              Searching...
            </span>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div
            className="modal-overlay-custom"
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              className="card sup-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="remove-supplier-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="remove-supplier-title" className="card-title">Remove Supplier?</h3>
              <p className="sup-modal-body">
                Are you sure you want to remove this supplier from your store? This action can be undone by adding the supplier again.
              </p>
              <div className="sup-modal-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn sup-delete-btn"
                  onClick={() => handleDelete(deleteConfirm)}
                >
                  Remove Supplier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RCAT-SUP-UX-001: Locked Supplier Modal */}
        {lockedSupplierModal && (
          <div
            className="modal-overlay-custom"
            onClick={() => setLockedSupplierModal(null)}
          >
            <div
              className="card sup-modal-card--lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sup-locked-header">
                <span className="sup-locked-icon">
                  {lockedSupplierModal.status === 'verified' ? '🔒' : '⏳'}
                </span>
                <h3 className="card-title" style={{ margin: 0 }}>
                  {lockedSupplierModal.status === 'verified' ? 'Verified Supplier' : 'Pending Approval'}
                </h3>
              </div>

              <div className="sup-locked-info" style={{
                background: lockedSupplierModal.status === 'verified' ? 'var(--status-verified-bg)' : 'var(--status-pending-bg)',
              }}>
                <strong className="sup-locked-name">
                  {lockedSupplierModal.supplier.name}
                </strong>
                {lockedSupplierModal.supplier.tradeName && lockedSupplierModal.supplier.tradeName !== lockedSupplierModal.supplier.name && (
                  <span className="text-sm-muted">
                    {lockedSupplierModal.supplier.tradeName}
                  </span>
                )}
              </div>

              <p className="sup-locked-text">
                {lockedSupplierModal.status === 'verified' ? (
                  <>
                    This supplier is part of the <strong>SuperMandi verified directory</strong>.
                    Their details are managed centrally to ensure accuracy across all stores.
                    You cannot edit their information directly.
                  </>
                ) : (
                  <>
                    This supplier is <strong>awaiting SuperAdmin verification</strong>.
                    Once approved, they will appear in the Verified section.
                    You cannot edit their details while verification is in progress.
                  </>
                )}
              </p>

              <div className="sup-locked-list">
                <strong>What you can do:</strong>
                <ul>
                  <li>Create a new local supplier with different details</li>
                  {lockedSupplierModal.status === 'verified' && (
                    <li>Contact SuperMandi support to request changes</li>
                  )}
                </ul>
              </div>

              <div className="sup-locked-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setLockedSupplierModal(null)}
                >
                  Close
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setLockedSupplierModal(null);
                    setShowForm(true);
                    setEditingSupplier(null);
                    setFormData(initialFormData);
                    setActiveSection('identity');
                  }}
                >
                  + Create Local Supplier
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sectioned Suppliers View */}
        {isLoading ? (
          <div className="card sup-loading-card">
            Loading suppliers...
          </div>
        ) : suppliers.length === 0 && !searchTerm ? (
          <div className="card">
            <EmptyState
              icon={<Truck size={24} />}
              title="No suppliers yet"
              description="Add your first supplier to start managing your supply chain."
              action={
                <button className="btn btn-primary" onClick={() => { setShowForm(true); setEditingSupplier(null); setFormData(initialFormData); setActiveSection('identity'); }}>
                  + Add Supplier
                </button>
              }
            />
          </div>
        ) : (
          <div className="sup-sections">
            {SECTION_CONFIGS.map((config) => {
              const sectionSuppliers = groupedSuppliers[config.key];
              const isCollapsed = collapsedSections[config.key];
              const count = sectionSuppliers.length;

              return (
                <div
                  key={config.key}
                  className="sup-section-wrap"
                  style={{ borderColor: config.borderColor }}
                >
                  {/* Section Header - Collapsible */}
                  <button
                    onClick={() => toggleSection(config.key)}
                    className="sup-section-header"
                    style={{ background: config.bgColor }}
                  >
                    <div className="sup-section-header-left">
                      <span className="sup-section-icon">{config.icon}</span>
                      <span className="sup-section-title-text" style={{ color: config.textColor }}>
                        {config.title}
                      </span>
                      <span
                        className="sup-section-count"
                        style={{ background: config.textColor }}
                      >
                        {count}
                      </span>
                      <span className="sup-section-desc" style={{ color: config.textColor }}>
                        {config.description}
                      </span>
                    </div>
                    <span className="sup-section-arrow" style={{ color: config.textColor }}>
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                  </button>

                  {/* Section Content */}
                  {!isCollapsed && (
                    <div className="sup-section-bg-white">
                      {count === 0 ? (
                        <div className="sup-section-empty">
                          {searchTerm
                            ? `No ${config.title.toLowerCase()} suppliers match your search.`
                            : config.key === 'verified'
                              ? 'No verified suppliers linked to your store yet.'
                              : config.key === 'pending'
                                ? 'No suppliers pending verification.'
                                : 'No local suppliers added yet. Click "+ Add Supplier" to create one.'}
                        </div>
                      ) : (
                        <table className="table sup-table-m0">
                          <thead>
                            <tr>
                              <th>Supplier Name</th>
                              <th>Type</th>
                              <th>Phone</th>
                              <th>GSTIN</th>
                              <th className="sup-table-w120">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sectionSuppliers.map((supplier) => (
                              <tr key={supplier.id}>
                                <td className="sup-table-name">
                                  <div className="sup-name-row">
                                    {supplier.name}
                                    {supplier.isSupermandi && (
                                      <span className="sup-sm-badge">
                                        SuperMandi
                                      </span>
                                    )}
                                  </div>
                                  {supplier.tradeName && supplier.tradeName !== supplier.name && (
                                    <span className="sup-trade-sub">
                                      {supplier.tradeName}
                                    </span>
                                  )}
                                </td>
                                <td className="sup-type-cell">
                                  {supplier.supplierType || <span className="text-sm-muted">-</span>}
                                </td>
                                <td className="sup-phone-cell">
                                  <span className="sup-phone-row">
                                    {supplier.phone || <span className="text-sm-muted">-</span>}
                                    {supplier.phone && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${supplier.phone!.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(`Hi ${supplier.name}, this is regarding our order.`)}`, '_blank', 'noopener,noreferrer'); }}
                                        className="sup-wa-icon-btn"
                                        title="Message on WhatsApp"
                                        aria-label="Message on WhatsApp"
                                      >
                                        <WhatsAppIcon size={16} />
                                      </button>
                                    )}
                                  </span>
                                </td>
                                <td className="sup-gstin-cell">
                                  {supplier.gstin || <span className="text-sm-muted">-</span>}
                                </td>
                                <td>
                                  {config.isEditable ? (
                                    <div className="sup-action-btns">
                                      <button
                                        className="btn btn-secondary sup-edit-btn"
                                        onClick={() => openEditForm(supplier)}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        className="btn sup-remove-btn"
                                        onClick={() => setDeleteConfirm(supplier.id)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ) : (
                                    /* RCAT-SUP-UX-001: View button for locked suppliers */
                                    <button
                                      className="btn btn-secondary sup-view-btn"
                                      onClick={() => setLockedSupplierModal({
                                        supplier,
                                        status: config.key as 'verified' | 'pending',
                                      })}
                                    >
                                      {config.key === 'verified' ? '🔒' : '⏳'} View
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Tips */}
        <div className="sup-tips">
          <strong>Quick Tips:</strong>
          <ul>
            <li><strong>Verified</strong> suppliers are from the SuperMandi network and cannot be edited.</li>
            <li><strong>Pending</strong> suppliers are awaiting SuperAdmin approval.</li>
            <li><strong>Local</strong> suppliers are your store-only contacts and can be freely edited or removed.</li>
            <li>Click a section header to collapse/expand it.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
