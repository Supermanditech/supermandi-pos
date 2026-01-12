// Order DTOs with Zod validation - V3.0.9 compliant

import { z } from 'zod';

// Order item for creation
const OrderItemSchema = z.object({
  supplierProductId: z.string().uuid(),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

// Create purchase order request
export const CreatePORequestSchema = z.object({
  supplierId: z.string().uuid(),
  items: z.array(OrderItemSchema).min(1, 'At least one item required'),
  notes: z.string().optional(),
  status: z.enum(['draft', 'submitted']).default('draft'),
});

export type CreatePORequest = z.infer<typeof CreatePORequestSchema>;

// Create PO from reorders request
export const CreatePOFromReordersRequestSchema = z.object({
  reorderIds: z.array(z.string().uuid()).min(1, 'At least one reorder required'),
  modifications: z.array(z.object({
    reorderId: z.string().uuid(),
    quantity: z.number().int().positive().optional(),
    supplierId: z.string().uuid().optional(),
  })).optional(),
});

export type CreatePOFromReordersRequest = z.infer<typeof CreatePOFromReordersRequestSchema>;

// V3.0.9: List POs with multi-status filter
export const ListPORequestSchema = z.object({
  status: z.string().optional(), // Comma-separated: "submitted,confirmed,shipped"
  supplierId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListPORequest = z.infer<typeof ListPORequestSchema>;

// Submit PO request (V3.0.9: explicit submit step)
export const SubmitPORequestSchema = z.object({
  // Empty body - just triggers status change
}).strict();

export type SubmitPORequest = z.infer<typeof SubmitPORequestSchema>;

// Receive item for GRN
const ReceiveItemSchema = z.object({
  itemId: z.string().uuid(),
  receivedQuantity: z.number().int().nonnegative('Received quantity cannot be negative'),
  status: z.enum(['received', 'partial', 'rejected']).default('received'),
});

// Receive GRN request
export const ReceiveGRNRequestSchema = z.object({
  items: z.array(ReceiveItemSchema).min(1, 'At least one item required'),
});

export type ReceiveGRNRequest = z.infer<typeof ReceiveGRNRequestSchema>;

// Cancel PO request
export const CancelPORequestSchema = z.object({
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
});

export type CancelPORequest = z.infer<typeof CancelPORequestSchema>;

// PO response
export const POResponseSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  storeId: z.string().uuid(),
  supplierId: z.string().uuid(),
  supplierName: z.string(),
  status: z.enum(['draft', 'submitted', 'confirmed', 'shipped', 'partial_received', 'delivered', 'cancelled']),
  totalAmount: z.number(),
  itemCount: z.number().int(),
  createdAt: z.string().datetime(),
  expectedDeliveryDate: z.string().datetime().optional(),
});

export type POResponse = z.infer<typeof POResponseSchema>;
