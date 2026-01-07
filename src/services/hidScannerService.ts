type HidScanHandler = (value: string) => void;

const HID_MIN_LENGTH = 4;
const HID_MAX_INTERVAL_MS = 80;
const HID_MAX_DURATION_MS = 1200;
const HID_IDLE_TIMEOUT_MS = 120;
const HID_TERMINATORS = new Set(["Enter", "Tab", "Return", "NumpadEnter", "\n", "\t", "\r"]);

let lastHidScanAt = 0;
let lastHidCommitAt = 0;
let hidBuffer = "";
let hidStartAt = 0;
let hidLastInputAt = 0;
let hidLastValue = "";
let hidScanHandler: HidScanHandler | null = null;
let hidIdleTimer: ReturnType<typeof setTimeout> | null = null;

export function notifyHidScan(isHid = true): void {
  if (!isHid) return;
  lastHidScanAt = Date.now();
  const ping = (global as any).__POS_SCANNER_PING__;
  if (typeof ping === "function") {
    ping();
  }
}

export function wasHidScannerActive(withinMs = 60000): boolean {
  return Date.now() - lastHidScanAt < withinMs;
}

export function wasHidCommitRecent(withinMs = 150): boolean {
  return Date.now() - lastHidCommitAt < withinMs;
}

export function setHidScanHandler(handler: HidScanHandler | null): void {
  hidScanHandler = handler;
}

const clearIdleTimer = () => {
  if (hidIdleTimer) {
    clearTimeout(hidIdleTimer);
    hidIdleTimer = null;
  }
};

export function resetHidBuffer(): void {
  hidBuffer = "";
  hidStartAt = 0;
  hidLastInputAt = 0;
  clearIdleTimer();
}

export function resetHidTracking(): void {
  resetHidBuffer();
  hidLastValue = "";
}

const appendHidChars = (chars: string, now: number) => {
  if (!chars) return;
  if (!hidBuffer || (hidLastInputAt && now - hidLastInputAt > HID_MAX_INTERVAL_MS)) {
    hidBuffer = "";
    hidStartAt = now;
  }
  if (!hidBuffer) {
    hidStartAt = now;
  }
  hidBuffer += chars;
  hidLastInputAt = now;
  clearIdleTimer();
  hidIdleTimer = setTimeout(() => {
    commitHidBuffer(Date.now());
  }, HID_IDLE_TIMEOUT_MS);
};

const commitHidBuffer = (now: number): string | null => {
  clearIdleTimer();
  if (!hidBuffer) {
    resetHidBuffer();
    return null;
  }
  const value = hidBuffer;
  const duration = hidLastInputAt - hidStartAt;
  const averageInterval = value.length > 1 ? duration / (value.length - 1) : duration;
  resetHidBuffer();

  if (
    value.length >= HID_MIN_LENGTH &&
    duration <= HID_MAX_DURATION_MS &&
    averageInterval <= HID_MAX_INTERVAL_MS
  ) {
    lastHidCommitAt = now;
    notifyHidScan(true);
    hidScanHandler?.(value);
    return value;
  }

  return null;
};

export function feedHidKey(key: string): string | null {
  if (!key) return null;
  const now = Date.now();
  if (HID_TERMINATORS.has(key)) {
    return commitHidBuffer(now);
  }
  if (key.length === 1) {
    appendHidChars(key, now);
  }
  return null;
}

export function feedHidText(value: string): void {
  const now = Date.now();
  if (value === hidLastValue) return;
  if (value.length < hidLastValue.length) {
    resetHidBuffer();
    hidLastValue = value;
    if (value) {
      appendHidChars(value, now);
    }
    return;
  }
  const delta = value.slice(hidLastValue.length);
  if (delta) {
    let buffer = "";
    for (const char of delta) {
      if (HID_TERMINATORS.has(char)) {
        if (buffer) {
          appendHidChars(buffer, now);
          buffer = "";
        }
        commitHidBuffer(now);
        continue;
      }
      buffer += char;
    }
    if (buffer) {
      appendHidChars(buffer, now);
    }
  }
  hidLastValue = value;
}

export function submitHidBuffer(): string | null {
  return commitHidBuffer(Date.now());
}
