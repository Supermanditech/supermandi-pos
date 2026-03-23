// GCP-STG-0535: Offline scan queue — queues unknown barcodes for retry when back online
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'offline_scan_queue';

export async function enqueueScan(barcode: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: string[] = raw ? JSON.parse(raw) : [];
    if (!queue.includes(barcode)) {
      queue.push(barcode);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-50)));
    }
  } catch {
    // Non-critical — silently ignore queue errors
  }
}

export async function dequeueScan(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const queue: string[] = raw ? JSON.parse(raw) : [];
    if (queue.length === 0) return null;
    const barcode = queue.shift()!;
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return barcode;
  } catch {
    return null;
  }
}

export async function getQueueLength(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw).length : 0;
  } catch {
    return 0;
  }
}
