import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import Constants from "expo-constants";
import { handleIncomingScan } from "./handleScan";

type ScanIntentConfig = {
  action?: string;
  extraKey?: string;
};

type ScanIntentPayload = {
  text?: string;
  format?: string | null;
};

const MODULE_NAME = "ScanIntentModule";

let started = false;
let emitter: NativeEventEmitter | null = null;

function getConfigFromExtras(): ScanIntentConfig {
  const extra = (Constants.expoConfig as any)?.extra ?? (Constants.manifest as any)?.extra ?? {};
  const action = typeof extra.SCAN_INTENT_ACTION === "string" ? extra.SCAN_INTENT_ACTION : undefined;
  const extraKey =
    typeof extra.SCAN_INTENT_EXTRA_KEY === "string" ? extra.SCAN_INTENT_EXTRA_KEY : undefined;
  return { action, extraKey };
}

function resolvePayload(payload: ScanIntentPayload | null | undefined): ScanIntentPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) return null;
  const format = typeof payload.format === "string" ? payload.format : undefined;
  return { text, format };
}

export function startScanIntentListener(config?: ScanIntentConfig): void {
  if (Platform.OS !== "android") return;
  const nativeModule = (NativeModules as any)[MODULE_NAME];
  if (!nativeModule) return;
  if (started) return;
  started = true;

  const defaults = getConfigFromExtras();
  const action = config?.action ?? defaults.action ?? null;
  const extraKey = config?.extraKey ?? defaults.extraKey ?? null;
  nativeModule.setConfig(action, extraKey);

  emitter = new NativeEventEmitter(nativeModule);
  emitter.addListener("ScanIntent", (payload: ScanIntentPayload) => {
    const resolved = resolvePayload(payload);
    if (!resolved) return;
    void handleIncomingScan(resolved.text ?? "", resolved.format ?? undefined);
  });
  nativeModule.markReady?.();

  Promise.resolve(nativeModule.getPendingScans?.())
    .then((pending: ScanIntentPayload[] | null | undefined) => {
      if (!Array.isArray(pending)) return;
      for (const item of pending) {
        const resolved = resolvePayload(item);
        if (!resolved) continue;
        void handleIncomingScan(resolved.text ?? "", resolved.format ?? undefined);
      }
    })
    .catch(() => undefined);
}
