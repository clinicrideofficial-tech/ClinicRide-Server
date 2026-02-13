import { z } from 'zod';

/**
 * Validation schemas for Address operations
 */

export const CreateAddressSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100, 'Label too long'),
  addressLine: z.string().min(1, 'Address is required').max(500, 'Address too long'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  isDefault: z.boolean().optional().default(false),
});

export const UpdateAddressSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100, 'Label too long').optional(),
  addressLine: z.string().min(1, 'Address is required').max(500, 'Address too long').optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
});

export type CreateAddressInput = z.infer<typeof CreateAddressSchema>;
export type UpdateAddressInput = z.infer<typeof UpdateAddressSchema>;
