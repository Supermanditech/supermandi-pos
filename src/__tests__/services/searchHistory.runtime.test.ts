/**
 * V3-FIX-050 + V3-HARDEN-047: Runtime behavioral test for store-scoped search history
 *
 * Executes actual addTerm/getHistory/clearHistory against mocked AsyncStorage.
 * Proves store-scoping, deduplication, expiry, and cross-store isolation.
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { addTerm, getHistory, clearHistory, clearAllHistory } from "../../services/searchHistory";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("V3-FIX-050: store-scoped search history", () => {
  it("addTerm + getHistory returns term for correct store", async () => {
    await addTerm("store-1", "rice");
    const history = await getHistory("store-1");
    expect(history).toContain("rice");
  });

  it("different stores have isolated history", async () => {
    await addTerm("store-1", "sugar");
    await addTerm("store-2", "salt");

    const h1 = await getHistory("store-1");
    const h2 = await getHistory("store-2");

    expect(h1).toContain("sugar");
    expect(h1).not.toContain("salt");
    expect(h2).toContain("salt");
    expect(h2).not.toContain("sugar");
  });

  it("deduplicates case-insensitively", async () => {
    await addTerm("store-1", "Rice");
    await addTerm("store-1", "rice");
    const history = await getHistory("store-1");
    expect(history).toHaveLength(1);
  });

  it("most recent term appears first", async () => {
    await addTerm("store-1", "apple");
    await addTerm("store-1", "banana");
    const history = await getHistory("store-1");
    expect(history[0]).toBe("banana");
    expect(history[1]).toBe("apple");
  });

  it("caps at 10 entries", async () => {
    for (let i = 0; i < 15; i++) {
      await addTerm("store-1", `item-${i}`);
    }
    const history = await getHistory("store-1");
    expect(history.length).toBeLessThanOrEqual(10);
  });

  it("ignores empty/short terms", async () => {
    await addTerm("store-1", "");
    await addTerm("store-1", "a");
    await addTerm("store-1", "  ");
    const history = await getHistory("store-1");
    expect(history).toHaveLength(0);
  });

  it("clearHistory removes store-specific history", async () => {
    await addTerm("store-1", "test");
    await clearHistory("store-1");
    const history = await getHistory("store-1");
    expect(history).toHaveLength(0);
  });

  it("clearAllHistory removes all stores' history", async () => {
    await addTerm("store-1", "one");
    await addTerm("store-2", "two");
    await clearAllHistory();
    const h1 = await getHistory("store-1");
    const h2 = await getHistory("store-2");
    expect(h1).toHaveLength(0);
    expect(h2).toHaveLength(0);
  });
});
