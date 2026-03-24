import { storeScopedStorage } from "./storeScope";

export type PosMode = "SELL" | "PURCHASE";

import { SK_POS_MODE } from "../constants/storageKeys";
const STORAGE_KEY = SK_POS_MODE;

function normalizeMode(value: unknown): PosMode | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (trimmed === "SELL" || trimmed === "PURCHASE") return trimmed as PosMode;
  return null;
}

export async function getLastPosMode(): Promise<PosMode> {
  try {
    const raw = await storeScopedStorage.getItem(STORAGE_KEY);
    return normalizeMode(raw) ?? "SELL";
  } catch {
    return "SELL";
  }
}

export async function setLastPosMode(mode: PosMode): Promise<void> {
  await storeScopedStorage.setItem(STORAGE_KEY, mode);
}
