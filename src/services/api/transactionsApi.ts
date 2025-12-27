import { apiClient } from "./apiClient";

export type CreateTransactionInput = {
  paymentMethod: "CASH" | "CARD" | "OTHER";
  currency: string;
  items: Array<{ productId: string; quantity: number }>;
};

export async function createTransaction(input: CreateTransactionInput): Promise<unknown> {
  const res = await apiClient.post<{ transaction: unknown }>("/api/transactions", input);
  return res.transaction;
}

