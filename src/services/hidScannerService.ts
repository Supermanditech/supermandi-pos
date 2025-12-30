export function notifyHidScan(): void {
  const ping = (global as any).__POS_SCANNER_PING__;
  if (typeof ping === "function") {
    ping();
  }
}
