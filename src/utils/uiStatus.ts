export type PosMode = "SELL" | "DIGITISE";

export type UiStatus = {
  storeActive: boolean | null;
  deviceActive: boolean | null;
  pendingOutboxCount: number;
  lastSyncAt?: string | null;
  lastSeenOnline?: string | null;
  printerOk?: boolean | null;
  scannerOk?: boolean | null;
  networkOnline: boolean;
  mode?: PosMode;
};

export type StatusTone = "success" | "warning" | "error" | "neutral";

export const POS_MESSAGES = {
  storeInactive: "POS is inactive. Add UPI ID in Superadmin to start billing.",
  deviceInactive: "This device is disabled. Contact Superadmin to enable it.",
  offline: "You're offline. Cash/Due will work. We'll sync when internet is back.",
  syncPending: (count: number) => `Sync pending: ${count} bills. Keep the app open for a minute.`,
  printerMissing: "Printer not connected. You can still bill; printing will be available once connected.",
  scannerMissing: "Scanner not ready. You can still type barcodes.",
  digitiseSaved: "Saved. You can scan the next product.",
  pricePrompt: "New item found. Enter the price to add it to cart.",
  newItemWarning: "⚠ New item detected — confirm stock later",
  digitiseReady: "Digitise mode on. Scan products to save.",
  sellReady: "Ready to bill. Scan the next product."
};

export function getPrimaryTone(status: UiStatus): StatusTone {
  if (status.deviceActive === false || status.storeActive === false) return "error";
  if (!status.networkOnline) return "warning";
  if (status.pendingOutboxCount > 0) return "warning";
  if (status.printerOk === false || status.scannerOk === false) return "warning";
  return "success";
}

export function composePosMessage(status: UiStatus): string {
  if (status.deviceActive === false) return POS_MESSAGES.deviceInactive;
  if (status.storeActive === false) return POS_MESSAGES.storeInactive;
  if (!status.networkOnline) return POS_MESSAGES.offline;
  if (status.pendingOutboxCount > 0) return POS_MESSAGES.syncPending(status.pendingOutboxCount);
  if (status.printerOk === false) return POS_MESSAGES.printerMissing;
  if (status.scannerOk === false) return POS_MESSAGES.scannerMissing;
  if (status.mode === "DIGITISE") return POS_MESSAGES.digitiseReady;
  return POS_MESSAGES.sellReady;
}
