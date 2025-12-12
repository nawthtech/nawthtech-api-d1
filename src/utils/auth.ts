import type { Context, Next } from 'hono';
import type { Env } from '../index';
import { getDatabaseService } from '../database/d1';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ success: false, error: 'Authorization header required' }, 401);
  }
  
  if (authHeader.startsWith('Bearer ')) {
    // JWT authentication
    const token = authHeader.substring(7);
    
    try {
      const user = await verifyJWT(token, c.env.JWT_SECRET);
      c.set('user', user);
    } catch (error) {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }
  } else if (authHeader.startsWith('ApiKey ')) {
    // API Key authentication
    const apiKey = authHeader.substring(7);
    const user = await verifyApiKey(apiKey, c.env);
    
    if (!user) {
      return c.json({ success: false, error: 'Invalid API key' }, 401);
    }
    
    c.set('user', user);
  } else {
    return c.json({ success: false, error: 'Invalid authorization format' }, 401);
  }
  
  await next();
}

export async function apiKeyMiddleware(c: Context<{ Bindings: Env; Variables: { user: AuthUser } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ success: false, error: 'Authorization header required' }, 401);
  }
  
  if (authHeader.startsWith('ApiKey ')) {
    const apiKey = authHeader.substring(7);
    const user = await verifyApiKey(apiKey, c.env);
    
    if (!user) {
      return c.json({ success: false, error: 'Invalid API key' }, 401);
    }
    
    c.set('user', user);
    await next();
  } else {
    // Fallback to JWT
    await authMiddleware(c, next);
  }
}

async function verifyJWT(token: string, secret: string): Promise<AuthUser> {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    const payload = JSON.parse(atob(payloadB64));
    
    // Verify signature
    const data = `${headerB64}.${payloadB64}`;
    const isValid = await crypto.subtle.verify(
      'HMAC',
      await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      ),
      Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0)),
      new TextEncoder().encode(data)
    );
    
    if (!isValid) {
      throw new Error('Invalid signature');
    }
    
    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };
  } catch (error) {
    throw new Error('Invalid JWT');
  }
}

async function verifyApiKey(apiKey: string, env: Env): Promise<AuthUser | null> {
  const db = getDatabaseService(env);
  const apiKeyHash = await hashApiKey(apiKey);
  
  const apiKeyRecord = await db.getApiKeyByHash(apiKeyHash);
  if (!apiKeyRecord) {
    return null;
  }
  
  // Check if expired
  if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
    return null;
  }
  
  // Update last used
  await db.updateApiKeyLastUsed(apiKeyRecord.id);
  
  const user = await db.getUserById(apiKeyRecord.user_id);
  if (!user) {
    return null;
  }
  
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}