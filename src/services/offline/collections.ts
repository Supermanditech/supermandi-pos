import { offlineDb } from "./localDb";
import { enqueueEvent } from "./outbox";
import { uuidv4 } from "../../utils/uuid";

export async function createOfflineCollection(input: {
  amountMinor: number;
  mode: "CASH" | "DUE";
  reference?: string | null;
}): Promise<{ collectionId: string }> {
  const collectionId = uuidv4();
  const createdAt = new Date().toISOString();
  const status = input.mode === "CASH" ? "PAID" : "DUE";

  await offlineDb.run(
    `
    INSERT INTO offline_collections (id, amount_minor, mode, reference, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [collectionId, input.amountMinor, input.mode, input.reference ?? null, status, createdAt, createdAt]
  );

  await enqueueEvent("COLLECTION_CREATED", {
    collectionId,
    amountMinor: input.amountMinor,
    mode: input.mode,
    reference: input.reference ?? null,
    status,
    createdAt
  });

  return { collectionId };
}
