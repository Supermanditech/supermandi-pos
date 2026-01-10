import * as Crypto from 'expo-crypto';

export function uuidv4(): string {
  // Use cryptographically secure UUID generation instead of Math.random()
  return Crypto.randomUUID();
}
