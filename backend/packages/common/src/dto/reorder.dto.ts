// Reorder DTOs with Zod validation - V3.0.9 compliant

import { z } from 'zod';

// Approve pending reorders request
export const ApproveReordersRequestSchema = z.object({
  reorderIds: z.array(z.string().uuid()).min(1, 'At least one reorder required'),
  modifications: z.array(z.object({
    reorderId: z.string().uuid(),
    quantity: z.number().int().positive().optional(),
    supplierId: z.string().uuid().optional(),
  })).optional(),
});

export type ApproveReordersRequest = z.infer<typeof ApproveReordersRequestSchema>;

// Dismiss reorder request
export const DismissReorderRequestSchema = z.object({
  reason: z.string().min(3, 'Reason must be at least 3 characters'),
});

export type DismissReorderRequest = z.infer<typeof DismissReorderRequestSchema>;

// Update reorder policy request
export const UpdatePolicyRequestSchema = z.object({
  productId: z.string().uuid(),
  minStock: z.number().int().nonnegative('Min stock cannot be negative'),
  targetStock: z.number().int().positive('Target stock must be positive'),
  preferredSupplierId: z.string().uuid().optional().nullable(),
  isEnabled: z.boolean().default(true),
}).refine(data => data.targetStock >= data.minStock, {
  message: 'Target stock must be >= min stock',
});

export type UpdatePolicyRequest = z.infer<typeof UpdatePolicyRequestSchema>;

// Bulk update policies request
export const BulkUpdatePoliciesRequestSchema = z.object({
  policies: z.array(UpdatePolicyRequestSchema).min(1, 'At least one policy required'),
});

export type BulkUpdatePoliciesRequest = z.infer<typeof BulkUpdatePoliciesRequestSchema>;

// Update store reorder settings request
export const UpdateSettingsRequestSchema = z.object({
  reorderEnabled: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  notifyOnLowStock: z.boolean().optional(),
});

export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

// List pending reorders request (query params)
export const ListPendingRequestSchema = z.object({
  status: z.enum(['pending', 'approved', 'dismissed', 'expired']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListPendingRequest = z.infer<typeof ListPendingRequestSchema>;

// Pending reorder response
export const PendingReorderResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  currentStock: z.number().int(),
  minThreshold: z.number().int(),
  targetStock: z.number().int(),
  suggestedQuantity: z.number().int(),
  suggestedSupplier: z.object({
    id: z.string().uuid(),
    name: z.string(),
    unitPrice: z.number(),
  }).optional(),
  estimatedTotal: z.number(),
  status: z.enum(['pending', 'approved', 'dismissed', 'expired']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type PendingReorderResponse = z.infer<typeof PendingReorderResponseSchema>;

// Approve response
export const ApproveResponseSchema = z.object({
  draftOrders: z.array(z.object({
    orderId: z.string().uuid(),
    orderNumber: z.string(),
    supplierName: z.string(),
    status: z.literal('draft'),
    itemCount: z.number().int(),
    totalAmount: z.number(),
  })),
});

export type ApproveResponse = z.infer<typeof ApproveResponseSchema>;
