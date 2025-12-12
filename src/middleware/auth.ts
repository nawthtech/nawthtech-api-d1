/**
 * Authentication middleware
 */

import type { IRequest } from 'itty-router';
import type { Env, User } from '../types/database';
import { verifyJWT } from '../utils/crypto';

export async function authenticate(
  request: IRequest,
  env: Env
): Promise<void> {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return;
  }

  const token = authHeader.slice(7);
  
  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    
    // Get user from database
    const user = await env.DB.prepare(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL'
    )
      .bind(payload.userId)
      .first<User>();

    if (user) {
      // Add user to request object
      (request as any).user = user;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    // Don't throw, just leave user undefined
  }
}

export function requireAuth(request: IRequest): User {
  const user = (request as any).user as User | undefined;
  
  if (!user) {
    throw {
      status: 401,
      message: 'Authentication required',
      code: 'UNAUTHORIZED',
    };
  }

  return user;
}

export function requireAdmin(request: IRequest): User {
  const user = requireAuth(request);
  
  if (user.role !== 'admin') {
    throw {
      status: 403,
      message: 'Admin access required',
      code: 'FORBIDDEN',
    };
  }

  return user;
}

export function requireEmailVerified(request: IRequest): User {
  const user = requireAuth(request);
  
  if (!user.email_verified) {
    throw {
      status: 403,
      message: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
    };
  }

  return user;
}