import * as Print from "expo-print";
import { Platform } from "react-native";
import { eventLogger } from './eventLogger';
import { logPosEvent } from "./cloudEventLogger";

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

  /**
   * Initialize printer service.
   * With expo-print, initialization verifies the module is available.
   */
  async initialize(): Promise<boolean> {
    try {
      // expo-print is available on iOS/Android but not web
      this.status.connected = Platform.OS !== 'web';
      this.status.error = undefined;

      await eventLogger.log('USER_ACTION', {
        action: 'printer_initialize',
        success: true,
        method: 'expo-print',
      });

      return true;
    } catch (e: any) {
      this.status.connected = false;
      this.status.error = e?.message || 'Initialization failed';
      return false;
    }
  }

  /**
   * Get current printer status.
   */
  getStatus(): PrinterStatus {
    return { ...this.status };
  }

  /**
   * Convert plain text receipt content to printable HTML.
   * Formats for 58mm/80mm thermal receipt width.
   */
  private textToReceiptHtml(content: string): string {
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 4mm; size: 80mm auto; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    line-height: 1.4;
    margin: 0;
    padding: 0;
    width: 72mm;
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

    try {
      const html = this.textToReceiptHtml(content);
      await Print.printAsync({ html });

      await eventLogger.log('PRINT_RECEIPT', {
        contentLength: content.length,
        timestamp: Date.now(),
        method: 'expo-print',
      });

      void logPosEvent("PRINT_RECEIPT", {
        contentLength: content.length,
        method: "expo-print",
      });

      return true;
    } catch (e: any) {
      // User cancelled the print dialog — not a real error
      if (e?.message?.includes('cancelled') || e?.message?.includes('canceled')) {
        await eventLogger.log('USER_ACTION', {
          action: 'print_cancelled',
        });
        return false;
      }

      await eventLogger.log('PRINT_FAILED', {
        reason: e?.message || 'unknown',
      });
      void logPosEvent("PRINTER_ERROR", { reason: e?.message || "print_failed" });
      throw new Error(e?.message || 'Print failed');
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

export const printerService = new PrinterService();
