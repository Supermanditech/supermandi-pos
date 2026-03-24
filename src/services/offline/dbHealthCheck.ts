// STG-392: SQLite corruption recovery and health check
// Validates SQLite integrity on app startup.
// If corrupt, attempts WAL recovery or offers to clear and re-sync.

import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceStoreId } from "../deviceSession";
import { normalizeStoreScope } from "../storeScope";

import { SK_DB_HEALTH } from "../../constants/storageKeys";
const DB_HEALTH_KEY = SK_DB_HEALTH;

export type DbHealthStatus = "healthy" | "recovered" | "corrupt" | "cleared" | "unchecked";

export interface DbHealthResult {
  status: DbHealthStatus;
  message: string;
  checkedAt: number;
}

/**
 * STG-392: Run SQLite integrity check on the offline database.
 * Returns health status and attempts recovery if issues found.
 */
export async function checkDbHealth(): Promise<DbHealthResult> {
  const now = Date.now();

  try {
    const storeId = await getDeviceStoreId();
    const scope = normalizeStoreScope(storeId);
    const dbName = `supermandi_offline_${scope}.db`;

    const db = SQLite.openDatabaseSync(dbName);

    // Step 1: Quick integrity check
    const integrityResult = await db.getAllAsync<{ integrity_check: string }>(
      "PRAGMA integrity_check"
    );

    const firstResult = integrityResult[0]?.integrity_check;

    if (firstResult === "ok") {
      // Database is healthy
      const result: DbHealthResult = {
        status: "healthy",
        message: "Database integrity verified",
        checkedAt: now,
      };
      await saveHealthResult(result);
      return result;
    }

    // Step 2: Integrity check failed - try WAL checkpoint recovery
    console.warn("[DbHealth] Integrity check failed:", firstResult);
    console.log("[DbHealth] Attempting WAL checkpoint recovery...");

    try {
      await db.runAsync("PRAGMA wal_checkpoint(TRUNCATE)");

      // Re-check after WAL checkpoint
      const recheckResult = await db.getAllAsync<{ integrity_check: string }>(
        "PRAGMA integrity_check"
      );

      if (recheckResult[0]?.integrity_check === "ok") {
        const result: DbHealthResult = {
          status: "recovered",
          message: "Database recovered via WAL checkpoint",
          checkedAt: now,
        };
        await saveHealthResult(result);
        return result;
      }
    } catch (walError) {
      console.error("[DbHealth] WAL recovery failed:", walError);
    }

    // Step 3: WAL recovery failed - database is corrupt
    const result: DbHealthResult = {
      status: "corrupt",
      message: `Database corruption detected: ${firstResult}. Clear and re-sync recommended.`,
      checkedAt: now,
    };
    await saveHealthResult(result);
    return result;
  } catch (error) {
    console.error("[DbHealth] Health check error:", error);
    const result: DbHealthResult = {
      status: "corrupt",
      message: `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt: now,
    };
    await saveHealthResult(result);
    return result;
  }
}

/**
 * STG-392: Clear the corrupt database and reset schema state.
 * After clearing, the database will be recreated on next access.
 */
export async function clearAndResetDb(): Promise<DbHealthResult> {
  const now = Date.now();

  try {
    const storeId = await getDeviceStoreId();
    const scope = normalizeStoreScope(storeId);
    const dbName = `supermandi_offline_${scope}.db`;

    const db = SQLite.openDatabaseSync(dbName);

    // Drop all tables to force recreation
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );

    for (const table of tables) {
      await db.runAsync(`DROP TABLE IF EXISTS ${table.name}`);
    }

    // Reset user_version to trigger migration re-run
    await db.runAsync("PRAGMA user_version = 0");

    console.log("[DbHealth] Database cleared successfully, will re-sync on next access");

    const result: DbHealthResult = {
      status: "cleared",
      message: "Database cleared. Will re-sync data on next use.",
      checkedAt: now,
    };
    await saveHealthResult(result);
    return result;
  } catch (error) {
    console.error("[DbHealth] Clear failed:", error);
    return {
      status: "corrupt",
      message: `Failed to clear database: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt: now,
    };
  }
}

/**
 * Get the last health check result from storage.
 */
export async function getLastHealthResult(): Promise<DbHealthResult | null> {
  try {
    const raw = await AsyncStorage.getItem(DB_HEALTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DbHealthResult;
  } catch {
    return null;
  }
}

async function saveHealthResult(result: DbHealthResult): Promise<void> {
  try {
    await AsyncStorage.setItem(DB_HEALTH_KEY, JSON.stringify(result));
  } catch (error) {
    console.warn("[DbHealth] Failed to save health result:", error);
  }
}
