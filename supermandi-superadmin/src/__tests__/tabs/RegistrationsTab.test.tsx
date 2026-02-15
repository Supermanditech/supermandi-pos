// SuperAdmin — Test RegistrationsTab component
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegistrationsTab } from '../../tabs/RegistrationsTab';
import type { RegistrationEvent } from '../../api/registrationEvents';

vi.mock('../../api/registrationEvents', () => ({
  sendEnrollmentCodeToStore: vi.fn(),
}));

vi.mock('../../components/ConfirmDialog', () => ({
  EnrollmentResultModal: ({ result, onClose }: any) => (
    <div data-testid="enrollment-modal">
      <span>{result.enrollmentCode}</span>
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

const makeRegEvent = (overrides: Partial<RegistrationEvent> = {}): RegistrationEvent => ({
  id: 'reg-1',
  storeId: 's1',
  storeName: 'Test Store',
  storeCode: 'TS01',
  userId: 'u1',
  source: 'PORTAL',
  outcome: 'SUCCESS',
  errorCode: null,
  ipAddress: '1.2.3.4',
  userAgent: null,
  deviceMeta: null,
  phone: '9876543210',
  businessName: 'Test Business',
  gstin: '12ABCDE1234Z5',
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

function createProps(overrides: Partial<Parameters<typeof RegistrationsTab>[0]> = {}) {
  return {
    regEvents: [],
    regEventsTotal: 0,
    regEventsLoading: false,
    regEventsError: '',
    regEventsPage: 0,
    regEventsSourceFilter: '',
    regEventsOutcomeFilter: '',
    sendingEnrollment: '',
    setRegEventsPage: vi.fn(),
    setRegEventsSourceFilter: vi.fn(),
    setRegEventsOutcomeFilter: vi.fn(),
    setSendingEnrollment: vi.fn(),
    refreshRegEvents: vi.fn(),
    ...overrides,
  };
}

describe('RegistrationsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders header', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.getByText('Registration Events')).toBeTruthy();
  });

  it('shows empty state', () => {
    render(<RegistrationsTab {...createProps()} />);
    expect(screen.getByText('No registration events found')).toBeTruthy();
  });

  it('shows error', () => {
    render(<RegistrationsTab {...createProps({ regEventsError: 'Failed' })} />);
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('renders registration event rows', () => {
    const events = [makeRegEvent()];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.getByText('Test Business')).toBeTruthy();
    expect(screen.getByText('9876543210')).toBeTruthy();
    expect(screen.getByText('PORTAL')).toBeTruthy();
    expect(screen.getByText('SUCCESS')).toBeTruthy();
  });

  it('shows Send Code button for successful registrations', () => {
    const events = [makeRegEvent()];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.getByText('Send Code')).toBeTruthy();
  });

  it('does not show Send Code for failed registrations', () => {
    const events = [makeRegEvent({ outcome: 'ERROR', storeId: null })];
    render(<RegistrationsTab {...createProps({ regEvents: events, regEventsTotal: 1 })} />);
    expect(screen.queryByText('Send Code')).toBeNull();
  });

  it('shows pagination controls', () => {
    render(<RegistrationsTab {...createProps({ regEventsTotal: 100 })} />);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();
  });

  it('calls refreshRegEvents on button click', () => {
    const refresh = vi.fn();
    render(<RegistrationsTab {...createProps({ refreshRegEvents: refresh })} />);
    fireEvent.click(screen.getByText('Refresh'));
    expect(refresh).toHaveBeenCalled();
  });

  it('shows total count', () => {
    render(<RegistrationsTab {...createProps({ regEventsTotal: 42 })} />);
    expect(screen.getByText(/42 total/)).toBeTruthy();
  });
});
