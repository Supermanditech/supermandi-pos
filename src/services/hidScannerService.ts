let lastHidScanAt = 0;

export function notifyHidScan(isHid = true): void {
  if (isHid) {
    lastHidScanAt = Date.now();
    const ping = (global as any).__POS_SCANNER_PING__;
    if (typeof ping === "function") {
      ping();
    }
  }
}

export function wasHidScannerActive(withinMs = 60000): boolean {
  return Date.now() - lastHidScanAt < withinMs;
}
