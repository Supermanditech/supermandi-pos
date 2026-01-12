// Auth DTOs with Zod validation - V3.0.9 compliant

import { z } from 'zod';

// Phone number validation (Indian format)
const phoneSchema = z.string().regex(/^\+91[0-9]{10}$/, 'Invalid phone number format');

// Login request
export const LoginRequestSchema = z.object({
  phone: phoneSchema.optional(),
  email: z.string().email().optional(),
  password: z.string().min(4, 'Password must be at least 4 characters'),
}).refine(data => data.phone || data.email, {
  message: 'Either phone or email is required',
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// Login response
export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    actorType: z.enum(['platform', 'store', 'supplier']),
    actorId: z.string().uuid().optional(),
    role: z.string(),
    permissions: z.array(z.string()),
  }),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Refresh token request
export const RefreshRequestSchema = z.object({
  refreshToken: z.string(),
});

export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

// Refresh token response
export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

// Register user request (admin only)
export const RegisterUserRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: phoneSchema.optional(),
  email: z.string().email().optional(),
  password: z.string().min(4, 'Password must be at least 4 characters'),
  actorType: z.enum(['platform', 'store', 'supplier']),
  actorId: z.string().uuid().optional(),
  role: z.string(),
}).refine(data => data.phone || data.email, {
  message: 'Either phone or email is required',
}).refine(data => {
  if (data.actorType === 'platform') return !data.actorId;
  return !!data.actorId;
}, {
  message: 'actorId required for store/supplier, forbidden for platform',
});

export type RegisterUserRequest = z.infer<typeof RegisterUserRequestSchema>;

// Change password request
export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(4, 'Password must be at least 4 characters'),
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
