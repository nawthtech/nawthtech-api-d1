import { Hono } from 'hono';
import type { Env } from '../index';
import { authMiddleware, apiKeyMiddleware } from '../utils/auth';
import { getDatabaseService } from '../database/d1';

const apiRouter = new Hono<{ Bindings: Env }>();

// Public routes
apiRouter.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

apiRouter.post('/auth/register', async (c) => {
  const { email, password, name } = await c.req.json();
  const db = getDatabaseService(c.env);
  
  // Check if user exists
  const existingUser = await db.getUserByEmail(email);
  if (existingUser) {
    return c.json({ success: false, error: 'User already exists' }, 400);
  }
  
  // Hash password (in production, use bcrypt)
  const password_hash = await hashPassword(password);
  
  // Create user
  const user = await db.createUser({
    email,
    name,
    password_hash,
    role: 'user',
    status: 'active',
    email_verified: false,
  });
  
  return c.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      created_at: user.created_at,
    },
  });
});

apiRouter.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json();
  const db = getDatabaseService(c.env);
  
  const user = await db.getUserByEmail(email);
  if (!user) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }
  
  // Verify password
  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }
  
  // Update last login
  await db.updateUser(user.id, { last_login_at: new Date().toISOString() });
  
  // Create JWT token
  const token = await createJWT({
    id: user.id,
    email: user.email,
    role: user.role,
  }, c.env.JWT_SECRET);
  
  return c.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
  });
});

// Protected routes
apiRouter.use('/users/*', authMiddleware);
apiRouter.use('/services/*', authMiddleware);
apiRouter.use('/api-keys/*', authMiddleware);

apiRouter.get('/users/me', async (c) => {
  const user = c.get('user');
  const db = getDatabaseService(c.env);
  
  const userData = await db.getUserById(user.id);
  if (!userData) {
    return c.json({ success: false, error: 'User not found' }, 404);
  }
  
  return c.json({
    success: true,
    data: {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      status: userData.status,
      created_at: userData.created_at,
    },
  });
});

apiRouter.get('/services', async (c) => {
  const user = c.get('user');
  const db = getDatabaseService(c.env);
  
  const services = await db.getUserServices(user.id);
  
  return c.json({
    success: true,
    data: services,
  });
});

apiRouter.post('/services', async (c) => {
  const user = c.get('user');
  const { name, description, type, quota_limit, settings } = await c.req.json();
  const db = getDatabaseService(c.env);
  
  const service = await db.createService({
    user_id: user.id,
    name,
    description,
    type,
    quota_limit: quota_limit || 1000,
    settings: settings || {},
  });
  
  return c.json({
    success: true,
    data: service,
  });
});

// API Key routes
apiRouter.post('/api-keys', async (c) => {
  const user = c.get('user');
  const { name, permissions } = await c.req.json();
  const db = getDatabaseService(c.env);
  
  // Generate API key
  const apiKey = generateApiKey();
  const keyHash = await hashApiKey(apiKey);
  const prefix = apiKey.substring(0, 8);
  
  const apiKeyRecord = await db.createApiKey({
    user_id: user.id,
    name,
    key_hash: keyHash,
    prefix,
    permissions: permissions || ['read'],
  });
  
  return c.json({
    success: true,
    data: {
      id: apiKeyRecord.id,
      name: apiKeyRecord.name,
      key: apiKey, // Only returned once!
      prefix: apiKeyRecord.prefix,
      created_at: apiKeyRecord.created_at,
    },
  });
});

// AI Services (with API key or JWT auth)
apiRouter.use('/ai/*', apiKeyMiddleware);

apiRouter.post('/ai/generate-text', async (c) => {
  const user = c.get('user');
  const { prompt, model, options } = await c.req.json();
  const db = getDatabaseService(c.env);
  
  // Check quota
  const services = await db.getUserServices(user.id);
  const textService = services.find(s => s.type === 'ai_text');
  
  if (!textService || textService.quota_used >= textService.quota_limit) {
    return c.json({ success: false, error: 'Quota exceeded' }, 402);
  }
  
  // Call AI provider (Gemini, OpenAI, etc.)
  const result = await generateText(prompt, model, options);
  
  // Update quota
  await db.updateServiceQuota(textService.id, 1);
  
  // Log request
  await db.logRequest(user.id, '/ai/generate-text', 'POST', 200);
  
  return c.json({
    success: true,
    data: result,
    quota: {
      used: textService.quota_used + 1,
      limit: textService.quota_limit,
    },
  });
});

// Email routes
apiRouter.post('/email/setup', authMiddleware, async (c) => {
  const { forward_to, allowed_list } = await c.req.json();
  
  // Store in KV
  await c.env.KV_SESSIONS.put('email_config', JSON.stringify({
    forward_to,
    allowed_list,
    updated_at: new Date().toISOString(),
  }));
  
  return c.json({
    success: true,
    message: 'Email configuration updated',
  });
});

// Admin routes
apiRouter.use('/admin/*', authMiddleware);
apiRouter.use('/admin/*', async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return c.json({ success: false, error: 'Unauthorized' }, 403);
  }
  await next();
});

apiRouter.get('/admin/stats', async (c) => {
  const db = getDatabaseService(c.env);
  
  const stats = await c.env.DB.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM users) as total_users,
      (SELECT COUNT(*) FROM services) as total_services,
      (SELECT COUNT(*) FROM request_logs WHERE created_at > datetime('now', '-1 day')) as daily_requests,
      (SELECT COUNT(*) FROM users WHERE created_at > datetime('now', '-7 days')) as weekly_signups
  `).first();
  
  return c.json({
    success: true,
    data: stats,
  });
});

export { apiRouter };

// Helper functions
async function hashPassword(password: string): Promise<string> {
  // In production, use bcrypt or similar
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const newHash = await hashPassword(password);
  return newHash === hash;
}

async function createJWT(payload: any, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    ),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').substring(0, 32);
}

async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function generateText(prompt: string, model: string, options: any): Promise<any> {
  // Implement AI text generation
  // This would call Gemini, OpenAI, etc.
  return { text: `Generated response for: ${prompt}` };
}