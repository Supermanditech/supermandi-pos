/**
 * TEST-015: order-service — state machine unit tests
 * Tests purchase order status transitions, terminal states, and error messages.
 */

import {
  isValidTransition,
  getAllowedTransitions,
  canCancel,
  canSubmit,
  isTerminalStatus,
  canReceive,
  getTransitionErrorMessage,
  validateTransition,
  parseStatus,
} from '../services/order-service/src/utils/stateMachine';

describe('Order State Machine', () => {
  // =========================================================================
  // VALID TRANSITIONS
  // =========================================================================
  describe('isValidTransition', () => {
    const validCases: Array<[string, string]> = [
      ['draft', 'submitted'],
      ['draft', 'cancelled'],
      ['submitted', 'confirmed'],
      ['submitted', 'cancelled'],
      ['confirmed', 'shipped'],
      ['confirmed', 'cancelled'],
      ['shipped', 'delivered'],
      ['shipped', 'partial_received'],
      ['partial_received', 'delivered'],
      ['partial_received', 'partial_received'],
    ];

    test.each(validCases)('%s → %s is valid', (from, to) => {
      expect(isValidTransition(from as any, to as any)).toBe(true);
    });

    const invalidCases: Array<[string, string]> = [
      ['draft', 'delivered'],
      ['draft', 'shipped'],
      ['submitted', 'shipped'],
      ['submitted', 'delivered'],
      ['confirmed', 'draft'],
      ['shipped', 'confirmed'],
      ['shipped', 'cancelled'],
      ['delivered', 'cancelled'],
      ['delivered', 'draft'],
      ['cancelled', 'draft'],
      ['cancelled', 'submitted'],
    ];

    test.each(invalidCases)('%s → %s is invalid', (from, to) => {
      expect(isValidTransition(from as any, to as any)).toBe(false);
    });
  });

  // =========================================================================
  // ALLOWED TRANSITIONS
  // =========================================================================
  describe('getAllowedTransitions', () => {
    it('draft allows submitted and cancelled', () => {
      expect(getAllowedTransitions('draft')).toEqual(['submitted', 'cancelled']);
    });

    it('delivered has no transitions', () => {
      expect(getAllowedTransitions('delivered')).toEqual([]);
    });

    it('cancelled has no transitions', () => {
      expect(getAllowedTransitions('cancelled')).toEqual([]);
    });
  });

  // =========================================================================
  // CANCEL RULES
  // =========================================================================
  describe('canCancel', () => {
    it('can cancel from draft', () => {
      expect(canCancel('draft')).toBe(true);
    });

    it('can cancel from submitted', () => {
      expect(canCancel('submitted')).toBe(true);
    });

    it('can cancel from confirmed', () => {
      expect(canCancel('confirmed')).toBe(true);
    });

    it('cannot cancel from shipped', () => {
      expect(canCancel('shipped')).toBe(false);
    });

    it('cannot cancel from delivered', () => {
      expect(canCancel('delivered')).toBe(false);
    });
  });

  // =========================================================================
  // SUBMIT RULES
  // =========================================================================
  describe('canSubmit', () => {
    it('can submit from draft only', () => {
      expect(canSubmit('draft')).toBe(true);
      expect(canSubmit('submitted')).toBe(false);
      expect(canSubmit('confirmed')).toBe(false);
    });
  });

  // =========================================================================
  // TERMINAL STATUS
  // =========================================================================
  describe('isTerminalStatus', () => {
    it('delivered is terminal', () => {
      expect(isTerminalStatus('delivered')).toBe(true);
    });

    it('cancelled is terminal', () => {
      expect(isTerminalStatus('cancelled')).toBe(true);
    });

    it('draft is not terminal', () => {
      expect(isTerminalStatus('draft')).toBe(false);
    });

    it('shipped is not terminal', () => {
      expect(isTerminalStatus('shipped')).toBe(false);
    });
  });

  // =========================================================================
  // GRN RECEIVE RULES
  // =========================================================================
  describe('canReceive', () => {
    it('can receive when shipped', () => {
      expect(canReceive('shipped')).toBe(true);
    });

    it('can receive when partial_received', () => {
      expect(canReceive('partial_received')).toBe(true);
    });

    it('cannot receive from other statuses', () => {
      expect(canReceive('draft')).toBe(false);
      expect(canReceive('submitted')).toBe(false);
      expect(canReceive('confirmed')).toBe(false);
      expect(canReceive('delivered')).toBe(false);
      expect(canReceive('cancelled')).toBe(false);
    });
  });

  // =========================================================================
  // ERROR MESSAGES
  // =========================================================================
  describe('getTransitionErrorMessage', () => {
    it('mentions terminal state for delivered', () => {
      const msg = getTransitionErrorMessage('delivered', 'draft');
      expect(msg).toContain('terminal');
    });

    it('lists allowed transitions', () => {
      const msg = getTransitionErrorMessage('draft', 'shipped');
      expect(msg).toContain('submitted');
      expect(msg).toContain('cancelled');
    });
  });

  // =========================================================================
  // VALIDATE TRANSITION (throws)
  // =========================================================================
  describe('validateTransition', () => {
    it('does not throw for valid transition', () => {
      expect(() => validateTransition('draft', 'submitted')).not.toThrow();
    });

    it('throws for invalid transition', () => {
      expect(() => validateTransition('delivered', 'draft')).toThrow();
    });
  });

  // =========================================================================
  // PARSE STATUS
  // =========================================================================
  describe('parseStatus', () => {
    it('parses valid status strings', () => {
      expect(parseStatus('draft')).toBe('draft');
      expect(parseStatus('SUBMITTED')).toBe('submitted');
      expect(parseStatus('Confirmed')).toBe('confirmed');
      expect(parseStatus('partial_received')).toBe('partial_received');
    });

    it('returns null for invalid status', () => {
      expect(parseStatus('unknown')).toBeNull();
      expect(parseStatus('')).toBeNull();
      expect(parseStatus('processing')).toBeNull();
    });
  });
});
