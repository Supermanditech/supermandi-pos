import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SuppliersPage from '../pages/SuppliersPage';

// =========================================================================
// Mocks
// =========================================================================

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

vi.mock('../components/Breadcrumb', () => ({
  default: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));

vi.mock('../components/EmptyState', () => ({
  default: ({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) => (
    <div data-testid="empty-state"><h3>{title}</h3><p>{description}</p>{action}</div>
  ),
}));

vi.mock('../hooks/useUrlState', () => ({
  useUrlState: (_key: string, defaultValue: string = '') => {
    const { useState } = require('react');
    return useState(defaultValue);
  },
}));

vi.mock('../components/WhatsAppIcon', () => ({
  WhatsAppIcon: ({ size }: { size?: number }) => <span data-testid="whatsapp-icon" data-size={size}>WA</span>,
}));

vi.mock('lucide-react', () => ({
  Truck: () => <span>TruckIcon</span>,
  Search: () => <span>SearchIcon</span>,
  RefreshCw: ({ className }: { className?: string }) => <span className={className}>RefreshIcon</span>,
  Plus: () => <span>PlusIcon</span>,
  ExternalLink: () => <span>ExternalLinkIcon</span>,
  MapPin: () => <span>MapPinIcon</span>,
  Phone: () => <span>PhoneIcon</span>,
  Mail: () => <span>MailIcon</span>,
  ChevronDown: () => <span>ChevronDownIcon</span>,
  ChevronUp: () => <span>ChevronUpIcon</span>,
  X: () => <span>XIcon</span>,
  Star: () => <span>StarIcon</span>,
  Package: () => <span>PackageIcon</span>,
  FileText: () => <span>FileTextIcon</span>,
  Settings: () => <span>SettingsIcon</span>,
  Check: () => <span>CheckIcon</span>,
  AlertCircle: () => <span>AlertCircleIcon</span>,
  Building: () => <span>BuildingIcon</span>,
  CreditCard: () => <span>CreditCardIcon</span>,
}));

vi.mock('../lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockAuthFetch = vi.fn();
vi.mock('../lib/api', () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
  safeJson: (res: { json: () => Promise<unknown> }) => res.json(),
}));

// =========================================================================
// Helpers
// =========================================================================

function makeSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sup-1',
    name: 'Test Supplier',
    tradeName: null,
    phone: '9876543210',
    gstin: null,
    supplierType: 'Distributor',
    verificationStatus: 'unverified',
    isSupermandi: false,
    whatsappEnabled: true,
    email: null,
    paymentTerms: 'Cash',
    creditDays: null,
    categoriesSupplied: [],
    addressLine1: null,
    city: null,
    state: null,
    pincode: null,
    pan: null,
    fssai: null,
    notes: null,
    ...overrides,
  };
}

function makeResponse(suppliers: ReturnType<typeof makeSupplier>[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: suppliers, total: suppliers.length }),
  };
}

function makeErrorResponse(message = 'Server error', code = 'ERROR', status = 400) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: { code, message } }),
  };
}

/** Click the header "+ Add Supplier" / "Cancel" button (the first one, in the page header) */
function clickHeaderAddButton() {
  const header = document.querySelector('.page-header')!;
  const btn = within(header as HTMLElement).getByRole('button');
  fireEvent.click(btn);
}

/** Click the View button for a non-editable supplier (verified/pending) */
function clickViewButton() {
  const btn = document.querySelector('.sup-view-btn') as HTMLElement;
  fireEvent.click(btn);
}

/** Get the form card element for scoped queries */
function getFormCard() {
  return document.querySelector('.sup-form-card-wrap') as HTMLElement;
}

const renderPage = (initialEntry = '/s/TEST/suppliers') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/s/:storeCode/suppliers" element={<SuppliersPage />} />
      </Routes>
    </MemoryRouter>
  );

// =========================================================================
// Tests
// =========================================================================

describe('SuppliersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // E01: Smoke / Rendering
  // =========================================================================
  describe('Smoke', () => {
    it('renders without crashing', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      const { container } = renderPage();
      expect(container).toBeTruthy();
    });

    it('renders breadcrumb', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    });

    it('renders page heading', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByRole('heading', { name: /Suppliers/i })).toBeInTheDocument();
    });

    it('renders Add Supplier button in header', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      const header = document.querySelector('.page-header')!;
      expect(within(header as HTMLElement).getByText(/Add Supplier/i)).toBeInTheDocument();
    });

    it('renders search input', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByPlaceholderText(/Search by name, phone, or GSTIN/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // E02: Loading / Empty / Error states
  // =========================================================================
  describe('UX 4-state', () => {
    it('shows loading state while fetching', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByText(/Loading suppliers/i)).toBeInTheDocument();
    });

    it('shows empty state when no suppliers and no search', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
        expect(screen.getByText(/No suppliers yet/i)).toBeInTheDocument();
      });
    });

    it('empty state has action button to add supplier', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([]));
      renderPage();
      await waitFor(() => {
        const emptyState = screen.getByTestId('empty-state');
        const btn = emptyState.querySelector('button');
        expect(btn).toBeTruthy();
        expect(btn!.textContent).toMatch(/Add Supplier/i);
      });
    });

    it('shows error state on fetch failure', async () => {
      mockAuthFetch.mockRejectedValue(new Error('Network error'));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/Failed to load suppliers/i)).toBeInTheDocument();
      });
    });

    it('shows supplier list on success', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // E03: Sectioned supplier view (Verified/Pending/Local)
  // =========================================================================
  describe('Sectioned view', () => {
    it('groups suppliers into three sections with correct suppliers', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', name: 'Verified Inc', verificationStatus: 'verified', isSupermandi: true }),
        makeSupplier({ id: 'p1', name: 'Pending LLC', verificationStatus: 'pending' }),
        makeSupplier({ id: 'l1', name: 'Local Shop', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Verified Inc')).toBeInTheDocument();
        expect(screen.getByText('Pending LLC')).toBeInTheDocument();
        expect(screen.getByText('Local Shop')).toBeInTheDocument();
      });
    });

    it('shows section counts', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', verificationStatus: 'verified' }),
        makeSupplier({ id: 'v2', verificationStatus: 'verified', name: 'V2' }),
        makeSupplier({ id: 'l1', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        // Section count badges
        const countBadges = document.querySelectorAll('.sup-section-count');
        expect(countBadges.length).toBe(3);
        expect(countBadges[0].textContent).toBe('2'); // verified
        expect(countBadges[1].textContent).toBe('0'); // pending
        expect(countBadges[2].textContent).toBe('1'); // local
      });
    });

    it('shows empty section messages when sections have no suppliers', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText(/No verified suppliers linked/i)).toBeInTheDocument();
        expect(screen.getByText(/No suppliers pending verification/i)).toBeInTheDocument();
      });
    });

    it('shows Edit and Remove buttons for local suppliers', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument();
        expect(screen.getByText('Remove')).toBeInTheDocument();
      });
    });

    it('shows View button for verified suppliers instead of Edit/Remove', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', verificationStatus: 'verified', isSupermandi: true }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      // Should have View button (sup-view-btn class), not Edit/Remove
      expect(document.querySelector('.sup-view-btn')).toBeTruthy();
      expect(screen.queryByText('Edit')).not.toBeInTheDocument();
      expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    });

    it('shows SuperMandi badge for isSupermandi suppliers', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', verificationStatus: 'verified', isSupermandi: true }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('SuperMandi')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // E04: Section collapse/expand
  // =========================================================================
  describe('Section collapse/expand', () => {
    it('collapses section when header clicked', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', name: 'Verified Corp', verificationStatus: 'verified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Verified Corp')).toBeInTheDocument();
      });
      // Click the first section header (verified)
      const sectionHeaders = document.querySelectorAll('.sup-section-header');
      fireEvent.click(sectionHeaders[0]);
      // Supplier name should be hidden now
      expect(screen.queryByText('Verified Corp')).not.toBeInTheDocument();
    });

    it('expands collapsed section when header clicked again', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', name: 'Verified Corp', verificationStatus: 'verified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Verified Corp')).toBeInTheDocument();
      });
      const sectionHeaders = document.querySelectorAll('.sup-section-header');
      // Collapse
      fireEvent.click(sectionHeaders[0]);
      expect(screen.queryByText('Verified Corp')).not.toBeInTheDocument();
      // Re-expand
      fireEvent.click(sectionHeaders[0]);
      expect(screen.getByText('Verified Corp')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // E05: Search (server-side with debounce)
  // =========================================================================
  describe('Search', () => {
    it('renders search input with correct placeholder', () => {
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(screen.getByPlaceholderText(/Search by name, phone, or GSTIN/i)).toBeInTheDocument();
    });

    it('triggers server-side search after debounce', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search by name/i);
      fireEvent.change(searchInput, { target: { value: 'rice' } });

      // Advance past debounce timer (350ms)
      act(() => { vi.advanceTimersByTime(400); });

      await waitFor(() => {
        const lastCall = mockAuthFetch.mock.calls[mockAuthFetch.mock.calls.length - 1];
        expect(lastCall[0]).toContain('query=rice');
      });
    });

    it('does not search before debounce completes', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });

      const callCountAfterLoad = mockAuthFetch.mock.calls.length;
      const searchInput = screen.getByPlaceholderText(/Search by name/i);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      // Advance only 100ms (< 350ms debounce)
      act(() => { vi.advanceTimersByTime(100); });

      // Should NOT have triggered additional search
      expect(mockAuthFetch.mock.calls.length).toBe(callCountAfterLoad);
    });
  });

  // =========================================================================
  // E06: Add Supplier form
  // =========================================================================
  describe('Add Supplier form', () => {
    it('opens form when header Add Supplier button clicked', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      expect(screen.getByText('Add New Supplier')).toBeInTheDocument();
    });

    it('toggles to Cancel when form is open', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      const header = document.querySelector('.page-header')!;
      expect(within(header as HTMLElement).getByText(/Cancel/i)).toBeInTheDocument();
    });

    it('closes form when header Cancel clicked', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      expect(screen.getByText('Add New Supplier')).toBeInTheDocument();
      // Click header button again (now shows "Cancel")
      clickHeaderAddButton();
      expect(screen.queryByText('Add New Supplier')).not.toBeInTheDocument();
    });

    it('shows 4-section tabs: Identity, Contact, Terms, Info', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      expect(screen.getByRole('tab', { name: /Identity/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Contact/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Terms/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Info/i })).toBeInTheDocument();
    });

    it('starts on Identity section with Business Name field', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      const identityTab = screen.getByRole('tab', { name: /Identity/i });
      expect(identityTab.getAttribute('aria-selected')).toBe('true');
      expect(screen.getByLabelText(/Business Name/i)).toBeInTheDocument();
    });

    it('navigates to Contact section via tab click', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      fireEvent.click(screen.getByRole('tab', { name: /Contact/i }));
      expect(screen.getByLabelText(/Primary Phone/i)).toBeInTheDocument();
    });

    it('navigates to next section via Next Section button', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      fireEvent.click(screen.getByText(/Next Section/i));
      const contactTab = screen.getByRole('tab', { name: /Contact/i });
      expect(contactTab.getAttribute('aria-selected')).toBe('true');
    });

    it('hides Next Section button on last section (metadata)', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      fireEvent.click(screen.getByRole('tab', { name: /Info/i }));
      expect(screen.queryByText(/Next Section/i)).not.toBeInTheDocument();
    });

    it('shows Save Supplier button for new supplier', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      expect(screen.getByText(/Save Supplier/i)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // E07: Form section content (Identity, Contact, Terms, Metadata)
  // =========================================================================
  describe('Form sections content', () => {
    async function openForm() {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
    }

    it('Identity section has Supplier Type, Business Name, Trade Name, GSTIN, PAN, FSSAI', async () => {
      await openForm();
      const card = getFormCard();
      expect(within(card).getByLabelText(/Supplier Type/i)).toBeInTheDocument();
      expect(within(card).getByLabelText(/Business Name/i)).toBeInTheDocument();
      expect(within(card).getByLabelText(/Trade Name/i)).toBeInTheDocument();
      expect(document.getElementById('sup-gstin')).toBeInTheDocument();
      expect(document.getElementById('sup-pan')).toBeInTheDocument();
      expect(document.getElementById('sup-fssai')).toBeInTheDocument();
    });

    it('Contact section has phone, email, address fields', async () => {
      await openForm();
      fireEvent.click(screen.getByRole('tab', { name: /Contact/i }));
      expect(screen.getByLabelText(/Primary Phone/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Secondary Phone/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Address Line 1/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/City/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pincode/i)).toBeInTheDocument();
    });

    it('Terms section has payment and delivery fields', async () => {
      await openForm();
      fireEvent.click(screen.getByRole('tab', { name: /Terms/i }));
      expect(screen.getByLabelText(/Payment Terms/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Credit Days/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Min Order Value/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Delivery Charges/i)).toBeInTheDocument();
    });

    it('Metadata section has categories, brands, channel, notes', async () => {
      await openForm();
      fireEvent.click(screen.getByRole('tab', { name: /Info/i }));
      const card = getFormCard();
      // Categories uses label for a div (non-labellable), check by text
      expect(within(card).getByText(/Categories Supplied/i)).toBeInTheDocument();
      expect(document.getElementById('sup-brands')).toBeInTheDocument();
      expect(document.getElementById('sup-ordering-channel')).toBeInTheDocument();
      expect(document.getElementById('sup-notes')).toBeInTheDocument();
    });

    it('Credit Days is disabled when paymentTerms is Cash', async () => {
      await openForm();
      fireEvent.click(screen.getByRole('tab', { name: /Terms/i }));
      expect(screen.getByLabelText(/Credit Days/i)).toBeDisabled();
    });

    it('Credit Days is enabled when paymentTerms is Credit', async () => {
      await openForm();
      fireEvent.click(screen.getByRole('tab', { name: /Terms/i }));
      fireEvent.change(screen.getByLabelText(/Payment Terms/i), { target: { value: 'Credit' } });
      expect(screen.getByLabelText(/Credit Days/i)).not.toBeDisabled();
    });

    it('Credit Days is disabled when paymentTerms is UPI', async () => {
      await openForm();
      fireEvent.click(screen.getByRole('tab', { name: /Terms/i }));
      fireEvent.change(screen.getByLabelText(/Payment Terms/i), { target: { value: 'UPI' } });
      expect(screen.getByLabelText(/Credit Days/i)).toBeDisabled();
    });

    it('Returns window input appears when Returns Allowed is checked', async () => {
      await openForm();
      fireEvent.click(screen.getByRole('tab', { name: /Terms/i }));
      expect(screen.queryByPlaceholderText(/Return window/i)).not.toBeInTheDocument();
      fireEvent.click(screen.getByLabelText(/Returns Allowed/i));
      expect(screen.getByPlaceholderText(/Return window/i)).toBeInTheDocument();
    });

    it('WhatsApp checkbox is present in Contact section', async () => {
      await openForm();
      fireEvent.click(screen.getByRole('tab', { name: /Contact/i }));
      expect(screen.getByLabelText(/WhatsApp enabled/i)).toBeInTheDocument();
    });

    it('category chips can be toggled', async () => {
      await openForm();
      fireEvent.click(screen.getByRole('tab', { name: /Info/i }));
      const dairyLabel = screen.getByText('Dairy');
      const checkbox = dairyLabel.closest('label')?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox).toBeTruthy();
      expect(checkbox.checked).toBe(false);
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(true);
    });
  });

  // =========================================================================
  // E08: Create flow (submit)
  // =========================================================================
  describe('Create flow', () => {
    async function openFormAndFill() {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
      // Fill required fields on Identity
      fireEvent.change(screen.getByLabelText(/Business Name/i), { target: { value: 'New Corp' } });
      // Switch to Contact and fill phone
      fireEvent.click(screen.getByRole('tab', { name: /Contact/i }));
      fireEvent.change(screen.getByLabelText(/Primary Phone/i), { target: { value: '9876543210' } });
    }

    it('submits form via POST and shows success', async () => {
      await openFormAndFill();
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ data: makeSupplier({ name: 'New Corp' }) }),
      }).mockResolvedValueOnce(makeResponse([makeSupplier({ name: 'New Corp' })]));

      fireEvent.click(screen.getByText(/Save Supplier/i));

      await waitFor(() => {
        expect(screen.getByText(/Supplier created successfully/i)).toBeInTheDocument();
      });

      const postCall = mockAuthFetch.mock.calls.find(
        (c: unknown[]) => (c[2] as { method?: string })?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      expect(postCall![0]).toBe('/api/v1/retailer-admin/suppliers');
    });

    it('shows Saving... while submitting', async () => {
      await openFormAndFill();
      mockAuthFetch.mockReturnValue(new Promise(() => {}));
      fireEvent.click(screen.getByText(/Save Supplier/i));
      expect(screen.getByText(/Saving.../i)).toBeInTheDocument();
    });

    it('shows error on API failure', async () => {
      await openFormAndFill();
      mockAuthFetch.mockResolvedValueOnce(makeErrorResponse('Duplicate supplier'));
      fireEvent.click(screen.getByText(/Save Supplier/i));
      await waitFor(() => {
        expect(screen.getByText(/Duplicate supplier/i)).toBeInTheDocument();
      });
    });

    it('shows CANNOT_EDIT_SUPERMANDI error', async () => {
      await openFormAndFill();
      mockAuthFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { code: 'CANNOT_EDIT_SUPERMANDI', message: 'Not allowed' } }),
      });
      fireEvent.click(screen.getByText(/Save Supplier/i));
      await waitFor(() => {
        expect(screen.getByText(/Cannot edit SuperMandi-verified suppliers/i)).toBeInTheDocument();
      });
    });

    it('shows partial save warning when warnings present', async () => {
      await openFormAndFill();
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          data: makeSupplier({ name: 'New Corp' }),
          warnings: ['serviceArea', 'deliveryAddress'],
        }),
      }).mockResolvedValueOnce(makeResponse([]));
      fireEvent.click(screen.getByText(/Save Supplier/i));
      await waitFor(() => {
        expect(screen.getByText(/partial/i)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // E09: Validation errors
  // =========================================================================
  describe('Validation', () => {
    async function openForm() {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickHeaderAddButton();
    }

    it('rejects empty business name', async () => {
      await openForm();
      // Fill phone but not business name
      fireEvent.click(screen.getByRole('tab', { name: /Contact/i }));
      fireEvent.change(screen.getByLabelText(/Primary Phone/i), { target: { value: '9876543210' } });
      fireEvent.click(screen.getByText(/Save Supplier/i));
      await waitFor(() => {
        expect(screen.getByText(/Business name is required/i)).toBeInTheDocument();
      });
    });

    it('rejects empty primary phone', async () => {
      await openForm();
      fireEvent.change(screen.getByLabelText(/Business Name/i), { target: { value: 'Corp' } });
      fireEvent.click(screen.getByText(/Save Supplier/i));
      await waitFor(() => {
        expect(screen.getByText(/Primary phone is required/i)).toBeInTheDocument();
      });
    });

    it('rejects invalid phone number (too short)', async () => {
      await openForm();
      fireEvent.change(screen.getByLabelText(/Business Name/i), { target: { value: 'Corp' } });
      fireEvent.click(screen.getByRole('tab', { name: /Contact/i }));
      fireEvent.change(screen.getByLabelText(/Primary Phone/i), { target: { value: '12345' } });
      fireEvent.click(screen.getByText(/Save Supplier/i));
      await waitFor(() => {
        expect(screen.getByText(/valid 10-digit Indian mobile number/i)).toBeInTheDocument();
      });
    });

    it('rejects phone not starting with 6-9', async () => {
      await openForm();
      fireEvent.change(screen.getByLabelText(/Business Name/i), { target: { value: 'Corp' } });
      fireEvent.click(screen.getByRole('tab', { name: /Contact/i }));
      fireEvent.change(screen.getByLabelText(/Primary Phone/i), { target: { value: '5234567890' } });
      fireEvent.click(screen.getByText(/Save Supplier/i));
      await waitFor(() => {
        expect(screen.getByText(/valid 10-digit Indian mobile number/i)).toBeInTheDocument();
      });
    });

    it('accepts valid phone with +91 prefix', async () => {
      await openForm();
      fireEvent.change(screen.getByLabelText(/Business Name/i), { target: { value: 'Corp' } });
      fireEvent.click(screen.getByRole('tab', { name: /Contact/i }));
      fireEvent.change(screen.getByLabelText(/Primary Phone/i), { target: { value: '+919876543210' } });
      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ data: makeSupplier() }),
      }).mockResolvedValueOnce(makeResponse([]));
      fireEvent.click(screen.getByText(/Save Supplier/i));
      await waitFor(() => {
        expect(screen.getByText(/Supplier created successfully/i)).toBeInTheDocument();
      });
    });

    it('rejects invalid secondary phone', async () => {
      await openForm();
      fireEvent.change(screen.getByLabelText(/Business Name/i), { target: { value: 'Corp' } });
      fireEvent.click(screen.getByRole('tab', { name: /Contact/i }));
      fireEvent.change(screen.getByLabelText(/Primary Phone/i), { target: { value: '9876543210' } });
      fireEvent.change(screen.getByLabelText(/Secondary Phone/i), { target: { value: '123' } });
      fireEvent.click(screen.getByText(/Save Supplier/i));
      await waitFor(() => {
        expect(screen.getByText(/Secondary phone must be a valid/i)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // E10: Edit flow
  // =========================================================================
  describe('Edit flow', () => {
    it('opens edit form with pre-filled data when Edit clicked', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', name: 'Local Trader', verificationStatus: 'unverified', phone: '9876543210' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Local Trader')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      expect(screen.getByText('Edit Supplier')).toBeInTheDocument();
      expect((screen.getByLabelText(/Business Name/i) as HTMLInputElement).value).toBe('Local Trader');
    });

    it('shows Update Supplier button for edit', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      expect(screen.getByText(/Update Supplier/i)).toBeInTheDocument();
    });

    it('GSTIN field is disabled in edit mode with hint', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified', gstin: '27AAACP1234A1ZC' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      const gstinInput = document.getElementById('sup-gstin') as HTMLInputElement;
      expect(gstinInput).toBeDisabled();
      expect(screen.getByText(/GSTIN cannot be modified/i)).toBeInTheDocument();
    });

    it('submits edit via PATCH and shows success', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', name: 'Old Name', verificationStatus: 'unverified', phone: '9876543210' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Old Name')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.change(screen.getByLabelText(/Business Name/i), { target: { value: 'New Name' } });

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: makeSupplier({ name: 'New Name' }) }),
      }).mockResolvedValueOnce(makeResponse([makeSupplier({ name: 'New Name' })]));

      fireEvent.click(screen.getByText(/Update Supplier/i));

      await waitFor(() => {
        expect(screen.getByText(/Supplier updated successfully/i)).toBeInTheDocument();
      });

      const patchCall = mockAuthFetch.mock.calls.find(
        (c: unknown[]) => (c[2] as { method?: string })?.method === 'PATCH'
      );
      expect(patchCall).toBeTruthy();
      expect(patchCall![0]).toContain('/api/v1/retailer-admin/suppliers/l1');
    });
  });

  // =========================================================================
  // E11: Delete flow
  // =========================================================================
  describe('Delete flow', () => {
    it('shows delete confirmation modal when Remove clicked', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Remove'));
      expect(screen.getByText(/Remove Supplier\?/i)).toBeInTheDocument();
      expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
    });

    it('cancels delete when Cancel clicked in modal', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Remove'));
      expect(screen.getByText(/Remove Supplier\?/i)).toBeInTheDocument();
      // Find the modal and click Cancel in it
      const modal = document.querySelector('[role="dialog"]')!;
      fireEvent.click(within(modal as HTMLElement).getByText('Cancel'));
      expect(screen.queryByText(/Remove Supplier\?/i)).not.toBeInTheDocument();
    });

    it('sends DELETE request on confirm and shows success', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Remove'));

      mockAuthFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      }).mockResolvedValueOnce(makeResponse([]));

      // Click "Remove Supplier" in the modal
      const modal = document.querySelector('[role="dialog"]')!;
      fireEvent.click(within(modal as HTMLElement).getByText('Remove Supplier'));

      await waitFor(() => {
        expect(screen.getByText(/Supplier removed successfully/i)).toBeInTheDocument();
      });

      const deleteCall = mockAuthFetch.mock.calls.find(
        (c: unknown[]) => (c[2] as { method?: string })?.method === 'DELETE'
      );
      expect(deleteCall).toBeTruthy();
    });

    it('shows error when delete fails', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Remove'));

      mockAuthFetch.mockResolvedValueOnce(makeErrorResponse('Cannot delete'));

      const modal = document.querySelector('[role="dialog"]')!;
      fireEvent.click(within(modal as HTMLElement).getByText('Remove Supplier'));

      await waitFor(() => {
        expect(screen.getByText(/Cannot delete/i)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // E12: Locked supplier modal (verified/pending)
  // =========================================================================
  describe('Locked supplier modal', () => {
    it('opens locked modal when View clicked on verified supplier', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', name: 'Verified Corp', verificationStatus: 'verified', isSupermandi: true }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Verified Corp')).toBeInTheDocument();
      });
      clickViewButton();
      await waitFor(() => {
        expect(screen.getByText(/SuperMandi verified directory/i)).toBeInTheDocument();
      });
    });

    it('opens locked modal for pending supplier', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'p1', name: 'Pending Corp', verificationStatus: 'pending' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Pending Corp')).toBeInTheDocument();
      });
      // Pending section has View button
      clickViewButton();
      await waitFor(() => {
        const modal = document.querySelector('[role="dialog"]')!;
        expect(modal).toBeTruthy();
        expect(within(modal as HTMLElement).getByText(/awaiting SuperAdmin verification/i)).toBeInTheDocument();
      });
    });

    it('shows Create Local Supplier button in locked modal', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', verificationStatus: 'verified', isSupermandi: true }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickViewButton();
      await waitFor(() => {
        const modal = document.querySelector('[role="dialog"]')!;
        expect(within(modal as HTMLElement).getByText(/Create Local Supplier/i)).toBeInTheDocument();
      });
    });

    it('opens add form when Create Local Supplier clicked from locked modal', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', verificationStatus: 'verified', isSupermandi: true }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickViewButton();
      await waitFor(() => {
        expect(screen.getByText(/SuperMandi verified directory/i)).toBeInTheDocument();
      });
      const modal = document.querySelector('[role="dialog"]')!;
      fireEvent.click(within(modal as HTMLElement).getByText(/Create Local Supplier/i));
      // Modal should close and form should open
      expect(screen.queryByText(/SuperMandi verified directory/i)).not.toBeInTheDocument();
      expect(screen.getByText('Add New Supplier')).toBeInTheDocument();
    });

    it('closes locked modal when Close button clicked', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', verificationStatus: 'verified', isSupermandi: true }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickViewButton();
      await waitFor(() => {
        expect(screen.getByText(/SuperMandi verified directory/i)).toBeInTheDocument();
      });
      const modal = document.querySelector('[role="dialog"]')!;
      fireEvent.click(within(modal as HTMLElement).getByText('Close'));
      expect(screen.queryByText(/SuperMandi verified directory/i)).not.toBeInTheDocument();
    });

    it('verified locked modal offers contact support option', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'v1', verificationStatus: 'verified', isSupermandi: true }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      clickViewButton();
      await waitFor(() => {
        expect(screen.getByText(/Contact SuperMandi support/i)).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // E13: WhatsApp action
  // =========================================================================
  describe('WhatsApp action', () => {
    it('renders WhatsApp icon for suppliers with phone', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified', phone: '9876543210' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('whatsapp-icon')).toBeInTheDocument();
      });
    });

    it('opens WhatsApp link with correct number on click', async () => {
      const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', name: 'Rice Supplier', verificationStatus: 'unverified', phone: '9876543210' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByTestId('whatsapp-icon')).toBeInTheDocument();
      });
      const waBtn = screen.getByLabelText(/Message on WhatsApp/i);
      fireEvent.click(waBtn);
      expect(windowOpenSpy).toHaveBeenCalledWith(
        expect.stringContaining('wa.me/9876543210'),
        '_blank',
        'noopener,noreferrer'
      );
      windowOpenSpy.mockRestore();
    });

    it('does not render WhatsApp icon for suppliers without phone', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified', phone: null }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('whatsapp-icon')).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // E14: URL ?action=create
  // =========================================================================
  describe('URL action=create', () => {
    it('auto-opens form when URL has ?action=create', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([makeSupplier()]));
      renderPage('/s/TEST/suppliers?action=create');
      await waitFor(() => {
        expect(screen.getByText('Add New Supplier')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // E15: Table display
  // =========================================================================
  describe('Table display', () => {
    it('displays supplier type, phone, and GSTIN columns', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified', supplierType: 'Wholesaler', phone: '9876543210', gstin: '27AAACP1234A1ZC' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Wholesaler')).toBeInTheDocument();
        expect(screen.getByText('9876543210')).toBeInTheDocument();
        expect(screen.getByText('27AAACP1234A1ZC')).toBeInTheDocument();
      });
    });

    it('shows dash placeholder for missing fields', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', verificationStatus: 'unverified', supplierType: undefined, phone: null, gstin: null }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Test Supplier')).toBeInTheDocument();
        const dashes = screen.getAllByText('-');
        expect(dashes.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('shows trade name beneath business name when different', async () => {
      mockAuthFetch.mockResolvedValue(makeResponse([
        makeSupplier({ id: 'l1', name: 'Legal Corp Ltd', tradeName: 'QuickMart', verificationStatus: 'unverified' }),
      ]));
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Legal Corp Ltd')).toBeInTheDocument();
        expect(screen.getByText('QuickMart')).toBeInTheDocument();
      });
    });
  });

  // =========================================================================
  // E16: Auth guard
  // =========================================================================
  describe('Auth guard', () => {
    it('handles 401 silently (does not set error)', async () => {
      mockAuthFetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });
      renderPage();
      await act(async () => { vi.advanceTimersByTime(100); });
      expect(screen.queryByText(/Failed to load/i)).not.toBeInTheDocument();
    });
  });
});
