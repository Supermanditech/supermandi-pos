import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceIdFromSession } from "./deviceSession";

import { SK_DEVICE_ID } from "../constants/storageKeys";
const DEVICE_ID_KEY = SK_DEVICE_ID;

function createId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const sessionDeviceId = await getDeviceIdFromSession();
  if (sessionDeviceId) return sessionDeviceId;

  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = `pos-${createId()}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
