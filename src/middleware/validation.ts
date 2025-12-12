/**
 * Request validation middleware
 */

import type { IRequest } from 'itty-router';
import { z } from 'zod';

// Validation schemas
const schemas = {
  register: z.object({
    email: z.string().email('Invalid email address'),
    username: z.string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    full_name: z.string().optional(),
  }),

  login: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),

  updateProfile: z.object({
    full_name: z.string().optional(),
    avatar_url: z.string().url('Invalid URL').optional(),
    bio: z.string().max(500, 'Bio cannot exceed 500 characters').optional(),
    settings: z.record(z.any()).optional(),
  }),

  updateUser: z.object({
    email: z.string().email('Invalid email address').optional(),
    username: z.string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
      .optional(),
    role: z.enum(['user', 'admin', 'moderator']).optional(),
    quota_text_tokens: z.number().int().positive().optional(),
    quota_images: z.number().int().positive().optional(),
    quota_videos: z.number().int().positive().optional(),
    quota_audio_minutes: z.number().int().positive().optional(),
  }),

  createService: z.object({
    name: z.string()
      .min(3, 'Service name must be at least 3 characters')
      .max(100, 'Service name cannot exceed 100 characters'),
    description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    config: z.record(z.any()).optional(),
  }),

  updateService: z.object({
    name: z.string()
      .min(3, 'Service name must be at least 3 characters')
      .max(100, 'Service name cannot exceed 100 characters')
      .optional(),
    description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    config: z.record(z.any()).optional(),
    status: z.enum(['pending', 'active', 'suspended', 'deleted']).optional(),
  }),

  generateAI: z.object({
    prompt: z.string()
      .min(1, 'Prompt is required')
      .max(5000, 'Prompt cannot exceed 5000 characters'),
    provider: z.enum(['gemini', 'openai', 'huggingface']).default('gemini'),
    model: z.string().optional(),
    type: z.enum(['text', 'image']).default('text'),
    options: z.record(z.any()).optional(),
  }),
};

type SchemaName = keyof typeof schemas;

export function validateRequest(schemaName: SchemaName) {
  return async (request: IRequest, env: Env) => {
    try {
      const body = await request.json();
      const schema = schemas[schemaName];
      
      const result = schema.safeParse(body);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        
        throw {
          status: 400,
          message: 'Validation failed',
          errors,
          code: 'VALIDATION_ERROR',
        };
      }
      
      // Store validated data
      (request as any).validatedData = result.data;
    } catch (error) {
      if (error.status) throw error;
      
      throw {
        status: 400,
        message: 'Invalid request body',
        code: 'INVALID_JSON',
      };
    }
  };
}