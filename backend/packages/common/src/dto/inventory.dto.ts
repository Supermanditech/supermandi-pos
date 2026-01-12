// Inventory DTOs with Zod validation - V3.0.9 compliant

import { z } from 'zod';

// Transaction type enum
const TransactionTypeSchema = z.enum(['sale', 'sale_return', 'purchase_received', 'adjustment']);

// Transaction item
const TransactionItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unitCost: z.number().nonnegative().optional(),
});

// Create inventory transaction request
// V3.0.9: Quantity is ALWAYS POSITIVE - server applies sign based on type
export const CreateTransactionRequestSchema = z.object({
  type: TransactionTypeSchema,
  referenceId: z.string(),
  referenceSubId: z.string().optional(), // V3.0.5: receiveId for partial GRN
  items: z.array(TransactionItemSchema).min(1, 'At least one item required'),
  notes: z.string().optional(),
});

export type CreateTransactionRequest = z.infer<typeof CreateTransactionRequestSchema>;

// Transaction response
export const TransactionResponseSchema = z.object({
  transactionId: z.string().uuid(),
  ledgerEntries: z.array(z.object({
    id: z.string().uuid(),
    productId: z.string().uuid(),
    deltaQty: z.number().int(),
    stockBefore: z.number().int(),
    stockAfter: z.number().int(),
  })),
  stockAfter: z.record(z.string().uuid(), z.number().int()),
});

export type TransactionResponse = z.infer<typeof TransactionResponseSchema>;

// Stock adjustment request (admin only)
export const AdjustStockRequestSchema = z.object({
  productId: z.string().uuid(),
  adjustmentQty: z.number().int(), // Can be negative for decrease
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
  notes: z.string().optional(),
});

export type AdjustStockRequest = z.infer<typeof AdjustStockRequestSchema>;

// Get stock levels request (query params)
export const GetStockRequestSchema = z.object({
  productIds: z.array(z.string().uuid()).optional(),
  belowMin: z.boolean().optional(), // Filter to low stock only
});

export type GetStockRequest = z.infer<typeof GetStockRequestSchema>;

// Stock level response
export const StockLevelResponseSchema = z.object({
  storeId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  currentStock: z.number().int(),
  lastUpdated: z.string().datetime(),
});

export type StockLevelResponse = z.infer<typeof StockLevelResponseSchema>;
