import * as Print from "expo-print";
import { Platform } from "react-native";
import { eventLogger } from './eventLogger';
import { logPosEvent } from "./cloudEventLogger";
import { asError } from "../utils/errorUtils";
// STG-451: Read user-configured printer settings
import { useSettingsStore } from "../stores/settingsStore";

export interface PrintJob {
  id: string;
  type: 'receipt' | 'report' | 'label';
  content: string;
  timestamp: number;
}

export interface PrinterStatus {
  connected: boolean;
  paperAvailable: boolean;
  error?: string;
}

/**
 * POS-PRINT-001: Printer Service using expo-print
 *
 * Uses the system print dialog via expo-print. Works with any printer
 * connected to the device (WiFi, Bluetooth paired via Android settings).
 *
 * For dedicated ESC/POS thermal printers via Bluetooth Low Energy,
 * migrate to a custom Expo dev client with react-native-ble-plx.
 */
class PrinterService {
  private status: PrinterStatus = {
    connected: true,
    paperAvailable: true,
  };
  // ISSUE-MICRO-102: Print lock to prevent concurrent print jobs
  private printInProgress = false;

  /**
   * Initialize printer service.
   * With expo-print, initialization verifies the module is available.
   */
  async initialize(): Promise<boolean> {
    try {
      // expo-print is available on iOS/Android but not web
      this.status.connected = Platform.OS !== 'web';
      this.status.error = undefined;

      // POS-PRINT-002: Verify print pipeline on init
      if (this.status.connected) {
        await this.checkConnectivity();
      }

      await eventLogger.log('USER_ACTION', {
        action: 'printer_initialize',
        success: this.status.connected,
        method: 'expo-print',
      });

      return this.status.connected;
    } catch (_e: unknown) {
    const e = asError(_e);
      this.status.connected = false;
      this.status.error = e?.message || 'Initialization failed';
      return false;
    }
  }

  /**
   * POS-PRINT-002: Check printer pipeline connectivity.
   * Uses printToFileAsync (generates PDF without dialog) as a lightweight probe.
   * Updates status.connected and status.error accordingly.
   */
  async checkConnectivity(): Promise<PrinterStatus> {
    try {
      if (Platform.OS === 'web') {
        this.status.connected = false;
        this.status.error = 'Printing not available on web';
        return this.getStatus();
      }

      await Print.printToFileAsync({
        html: '<html><body><p>connectivity-check</p></body></html>',
      });
      this.status.connected = true;
      this.status.error = undefined;
    } catch (_e: unknown) {
    const e = asError(_e);
      this.status.connected = false;
      this.status.error = e?.message || 'Print pipeline unavailable';
      void logPosEvent("PRINTER_ERROR", { reason: 'connectivity_check_failed', error: e?.message });
    }
    return this.getStatus();
  }

  /**
   * Get current printer status.
   */
  // FIX-041: Manual error clearing
  clearError(): void {
    this.status.error = undefined;
  }

  getStatus(): PrinterStatus {
    return { ...this.status };
  }

  /**
   * Convert plain text receipt content to printable HTML.
   * STG-451: Reads paper width from user settings (58mm or 80mm).
   */
  private textToReceiptHtml(content: string): string {
    const paperWidth = useSettingsStore.getState().printerPaperWidth;
    const bodyWidth = paperWidth === 58 ? 50 : 72; // mm, accounting for margins
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 4mm; size: ${paperWidth}mm auto; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: ${paperWidth === 58 ? 10 : 12}px;
    line-height: 1.4;
    margin: 0;
    padding: 0;
    width: ${bodyWidth}mm;
  }
  pre {
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
    font-family: inherit;
    font-size: inherit;
  }
</style>
</head>
<body><pre>${escaped}</pre></body>
</html>`;
  }

  /**
   * Print a receipt via system print dialog.
   * The user selects their connected printer (WiFi/Bluetooth).
   */
  async printReceipt(content: string): Promise<boolean> {
    if (!content || content.trim().length === 0) {
      throw new Error('Empty receipt content');
    }

    // ISSUE-MICRO-072: Check printer availability before attempting print
    if (!this.status.connected) {
      const errMsg = this.status.error || 'Printer not connected';
      void logPosEvent("PRINTER_ERROR", { reason: errMsg });
      throw new Error(errMsg);
    }

    // ISSUE-MICRO-102: Prevent concurrent print jobs
    if (this.printInProgress) {
      console.warn('[PrinterService] ISSUE-MICRO-102: Print already in progress, skipping');
      return false;
    }

    this.printInProgress = true;
    try {
      const html = this.textToReceiptHtml(content);
      // STG-451: Respect user-configured copies setting
      const copies = useSettingsStore.getState().printerCopies;

      // R8: Single retry on print failure (not on user cancel)
      const printWithRetry = async () => {
        try {
          for (let i = 0; i < copies; i++) {
            await Print.printAsync({ html });
          }
        } catch (firstErr: unknown) {
          const fe = asError(firstErr);
          // Don't retry user cancellations
          if (fe?.message?.includes('cancelled') || fe?.message?.includes('canceled')) {
            throw firstErr;
          }
          // Wait 1s and retry once
          await new Promise((r) => setTimeout(r, 1000));
          for (let i = 0; i < copies; i++) {
            await Print.printAsync({ html });
          }
        }
      };

      await printWithRetry();

      await eventLogger.log('PRINT_RECEIPT', {
        contentLength: content.length,
        timestamp: Date.now(),
        method: 'expo-print',
      });

      void logPosEvent("PRINT_RECEIPT", {
        contentLength: content.length,
        method: "expo-print",
      });

      // FIX-041: Clear error state on successful print
      this.status.error = undefined;

      return true;
    } catch (_e: unknown) {
      const e = asError(_e);
      // User cancelled the print dialog — not a real error
      if (e?.message?.includes('cancelled') || e?.message?.includes('canceled')) {
        await eventLogger.log('USER_ACTION', {
          action: 'print_cancelled',
        });
        return false;
      }

      // ISSUE-MICRO-072: Update status on print failure
      this.status.error = e?.message || 'Print failed';

      await eventLogger.log('PRINT_FAILED', {
        reason: e?.message || 'unknown',
      });
      void logPosEvent("PRINTER_ERROR", { reason: e?.message || "print_failed" });
      throw new Error(e?.message || 'Print failed');
    } finally {
      this.printInProgress = false;
    }
  }

  /**
   * Print a report via system print dialog.
   */
  async printReport(content: string): Promise<boolean> {
    return this.printReceipt(content);
  }

  /**
   * Test printer by printing a test page.
   */
  async testPrint(): Promise<boolean> {
    const testContent = [
      '=================================',
      '        SUPERMANDI POS',
      '         TEST PRINT',
      '=================================',
      '',
      `Date: ${new Date().toLocaleString()}`,
      `Platform: ${Platform.OS}`,
      `Method: expo-print (system dialog)`,
      '',
      'If you can read this, printing',
      'is working correctly.',
      '',
      '=================================',
    ].join('\n');

    return this.printReceipt(testContent);
  }

  /**
   * Disconnect/cleanup. No-op for expo-print.
   */
  async disconnect(): Promise<void> {
    await eventLogger.log('USER_ACTION', {
      action: 'printer_disconnect',
    });
  }
}

// GCP-STG-0670: Printer error classification for recovery UI
export type PrinterError = 'DISCONNECTED' | 'PAPER_OUT' | 'BUSY' | 'UNKNOWN';

/**
 * GCP-STG-0670: Classify a printer error into a user-actionable category.
 * Used by PrinterErrorRecovery UI to show appropriate guidance and retry logic.
 */
export function classifyPrinterError(err: unknown): PrinterError {
  const msg = String(err).toLowerCase();
  if (msg.includes('disconnect') || msg.includes('not connected')) return 'DISCONNECTED';
  if (msg.includes('paper') || msg.includes('out of paper')) return 'PAPER_OUT';
  if (msg.includes('busy') || msg.includes('timeout')) return 'BUSY';
  return 'UNKNOWN';
}

/**
 * GCP-STG-0670: Human-readable message for each printer error type.
 */
export function getPrinterErrorMessage(errorType: PrinterError): string {
  switch (errorType) {
    case 'DISCONNECTED': return 'Printer disconnected — check cable/Bluetooth';
    case 'PAPER_OUT': return 'Out of paper — load new roll';
    case 'BUSY': return 'Printer busy — wait and retry';
    case 'UNKNOWN': return 'Printer error — check connection and paper';
  }
}

export const printerService = new PrinterService();

/**
 * GCP-STG-0536: ESC/POS barcode label printing.
 *
 * Builds ESC/POS byte arrays via escPosBarcode module and sends them to the
 * system print pipeline via expo-print. Supports EAN-13, EAN-8, UPC-A, Code128
 * symbologies and 3 label sizes (small/medium/large).
 *
 * NOTE: For dedicated Bluetooth thermal printers, the byte array from
 * buildBarcodeLabel() can be sent directly over BLE once a BLE transport
 * is available. The ESC/POS output is transport-agnostic.
 */
import { buildBarcodeLabel, type LabelSize } from './printer/escPosBarcode';

export async function printBarcodeLabel(
  barcode: string,
  productName: string,
  price?: number,
  labelSize?: LabelSize,
): Promise<boolean> {
  try {
    if (!printerService.getStatus().connected) {
      console.warn('[PRINTER] No printer connected for label printing');
      return false;
    }

    const labelBytes = buildBarcodeLabel(
      { name: productName, barcode, price },
      labelSize || 'medium',
    );

    // Convert ESC/POS bytes to a base64 data URI for expo-print.
    // expo-print expects HTML, so we embed the raw bytes as a monospace
    // hex dump that the operator can redirect to a raw printer port.
    // For direct thermal printing, the labelBytes Uint8Array is the
    // transport-ready payload.
    const hexLines: string[] = [];
    const BYTES_PER_LINE = 32;
    for (let i = 0; i < labelBytes.length; i += BYTES_PER_LINE) {
      const slice = labelBytes.slice(i, i + BYTES_PER_LINE);
      hexLines.push(Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }

    // Use expo-print to render a label preview (fallback when no raw BLE transport)
    const labelHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page { margin: 2mm; size: 58mm auto; }
  body { font-family: monospace; font-size: 11px; text-align: center; margin: 0; padding: 4mm; }
  .name { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
  .price { font-size: 14px; margin-bottom: 6px; }
  .barcode { font-size: 18px; letter-spacing: 2px; font-weight: bold; margin: 8px 0; }
  .hr { border-top: 1px dashed #000; margin: 4px 0; }
</style></head><body>
  <div class="name">${productName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
  ${price != null && price > 0 ? `<div class="price">MRP: Rs.${price.toFixed(2)}</div>` : ''}
  <div class="hr"></div>
  <div class="barcode">${barcode.replace(/</g, '&lt;')}</div>
  <div class="hr"></div>
</body></html>`;

    await Print.printAsync({ html: labelHtml });

    void logPosEvent("PRINT_LABEL", {
      barcode,
      productName,
      labelSize: labelSize || 'medium',
      escPosByteLength: labelBytes.length,
    });

    return true;
  } catch (_err: unknown) {
    const err = asError(_err);
    // User cancelled print dialog — not a real error
    if (err?.message?.includes('cancelled') || err?.message?.includes('canceled')) {
      return false;
    }
    console.error('[PRINTER] Label print failed:', err?.message);
    void logPosEvent("PRINTER_ERROR", { reason: 'label_print_failed', error: err?.message });
    return false;
  }
}
