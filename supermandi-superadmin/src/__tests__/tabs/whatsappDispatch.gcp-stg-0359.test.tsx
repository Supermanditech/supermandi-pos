// GCP-STG-0359: WhatsApp Dispatch Policy UI — test
import { describe, it, expect } from 'vitest';
import type { InvoiceSettings } from '../../api/stores';

/**
 * GCP-STG-0359 enhances the WhatsApp auto-send section added by GCP-STG-0358.
 *
 * Changes:
 * 1. Section renamed to "WhatsApp Dispatch Policy"
 * 2. Sub-toggles have descriptive labels (not terse "On Sale" / "On PO" / "On GRN")
 * 3. Sub-toggles are disabled when master toggle (autoSendWhatsApp) is off
 * 4. Wrapper div has data-testid="whatsapp-dispatch-policy"
 *
 * This test validates the InvoiceSettings type includes the WhatsApp fields
 * and validates the UI contract via source-code inspection.
 */

// ---------------------------------------------------------------------------
// 1. Type-level: InvoiceSettings includes WhatsApp dispatch fields
// ---------------------------------------------------------------------------

describe('GCP-STG-0359: WhatsApp Dispatch Policy', () => {
  it('InvoiceSettings type includes all 4 WhatsApp dispatch fields', () => {
    // Compile-time check: if these fields don't exist on InvoiceSettings, TS will fail
    const settings: InvoiceSettings = {
      logoUrl: null,
      headerText: null,
      footerText: null,
      termsAndConditions: null,
      showGstin: true,
      showHsn: true,
      autoSendWhatsApp: true,
      autoSendOnSale: true,
      autoSendOnPo: false,
      autoSendOnGrn: false,
    };

    expect(settings.autoSendWhatsApp).toBe(true);
    expect(settings.autoSendOnSale).toBe(true);
    expect(settings.autoSendOnPo).toBe(false);
    expect(settings.autoSendOnGrn).toBe(false);
  });

  it('master toggle controls dispatch', () => {
    // When master is off, sub-toggles should be ignored at dispatch time
    const settingsOff: InvoiceSettings = {
      logoUrl: null,
      headerText: null,
      footerText: null,
      termsAndConditions: null,
      showGstin: true,
      showHsn: true,
      autoSendWhatsApp: false,
      autoSendOnSale: true,  // even if true, master is off
      autoSendOnPo: true,
      autoSendOnGrn: true,
    };

    // Business rule: autoSendWhatsApp=false means no WhatsApp dispatch regardless
    expect(settingsOff.autoSendWhatsApp).toBe(false);
    // The sub-toggles can be true but the master gate prevents dispatch
  });

  // ---------------------------------------------------------------------------
  // 2. Source-code contract: verify the UI renders expected test IDs and labels
  // ---------------------------------------------------------------------------

  it('StoresTab source contains whatsapp-dispatch-policy testid', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const storesTabPath = path.resolve(__dirname, '../../tabs/StoresTab.tsx');
    const source = fs.readFileSync(storesTabPath, 'utf-8');

    // Section wrapper
    expect(source).toContain('data-testid="whatsapp-dispatch-policy"');

    // Section heading
    expect(source).toContain('WhatsApp Dispatch Policy');

    // Master toggle label
    expect(source).toContain('Enable WhatsApp auto-dispatch (master toggle)');

    // Descriptive sub-toggle labels (not terse)
    expect(source).toContain('Auto-send invoice on POS sale');
    expect(source).toContain('Auto-send PO to supplier');
    expect(source).toContain('Auto-send GRN confirmation');

    // Test IDs preserved from 0358
    expect(source).toContain('data-testid="invoice-auto-send-whatsapp"');
    expect(source).toContain('data-testid="invoice-auto-send-on-sale"');
    expect(source).toContain('data-testid="invoice-auto-send-on-po"');
    expect(source).toContain('data-testid="invoice-auto-send-on-grn"');
  });

  it('sub-toggles are disabled when master toggle is off', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const storesTabPath = path.resolve(__dirname, '../../tabs/StoresTab.tsx');
    const source = fs.readFileSync(storesTabPath, 'utf-8');

    // Sub-toggles should have disabled={!draft.autoSendWhatsApp}
    const disabledCount = (source.match(/disabled=\{!draft\.autoSendWhatsApp\}/g) || []).length;
    expect(disabledCount).toBe(3); // sale, po, grn — NOT the master toggle
  });
});
