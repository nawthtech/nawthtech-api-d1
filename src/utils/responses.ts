/**
 * Response utilities
 */

import type { APIResponse } from '../types/database';

export function successResponse<T>(data: T, message?: string): APIResponse<T> {
  return {
    success: true,
    data,
    message,
  };
}

export function errorResponse(error: string, details?: any): APIResponse {
  return {
    success: false,
    error,
    ...(details && { details }),
  };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): APIResponse<T[]> {
  return {
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

// HTTP status codes
export const StatusCodes = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;