import { getOrCreateDeviceId } from "../deviceId";
import { getDeviceIdFromSession } from "../deviceSession";
import { storeScopedStorage } from "../storeScope";

const SEQ_PREFIX = "supermandi.offline.seq";

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function nextOfflineBillRef(): Promise<string> {
  const deviceId = (await getDeviceIdFromSession()) ?? (await getOrCreateDeviceId());
  const dateKey = formatDateKey(new Date());
  const storageKey = `${SEQ_PREFIX}.${dateKey}`;

  const raw = await storeScopedStorage.getItem(storageKey);
  const current = Number(raw ?? 0);
  const next = Number.isFinite(current) ? current + 1 : 1;
  await storeScopedStorage.setItem(storageKey, String(next));

  const deviceShort = deviceId.replace(/[^a-zA-Z0-9]/g, "").slice(-6) || "device";
  const seq = String(next).padStart(4, "0");
  return `OFF-${deviceShort}-${dateKey}-${seq}`;
}
