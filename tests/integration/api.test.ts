/**
 * API integration tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unstable_dev } from 'wrangler';

describe('API Integration', () => {
  let worker: any;
  
  beforeAll(async () => {
    worker = await unstable_dev('src/index.ts', {
      vars: {
        ENVIRONMENT: 'test',
        JWT_SECRET: 'test-secret-123456789012345678901234567890',
        ALLOWED_ORIGINS: 'http://localhost:3000',
      },
      experimental: { disableExperimentalWarning: true },
    });
  });
  
  afterAll(async () => {
    await worker.stop();
  });
  
  describe('Health Check', () => {
    it('should return 200 for health endpoint', async () => {
      const resp = await worker.fetch('/health');
      expect(resp.status).toBe(200);
      
      const data = await resp.json();
      expect(data.status).toBe('healthy');
      expect(data.environment).toBe('test');
    });
  });
  
  describe('Authentication', () => {
    it('should register new user', async () => {
      const resp = await worker.fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          username: 'testuser',
          password: 'Test@123',
          full_name: 'Test User',
        }),
      });
      
      expect(resp.status).toBe(201);
      
      const data = await resp.json();
      expect(data.success).toBe(true);
      expect(data.data.user).toBeDefined();
      expect(data.data.token).toBeDefined();
      expect(data.data.user.email).toBe('test@example.com');
    });
    
    it('should reject duplicate email', async () => {
      const resp = await worker.fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com', // Same email
          username: 'anotheruser',
          password: 'Test@123',
        }),
      });
      
      expect(resp.status).toBe(409);
      
      const data = await resp.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Email already registered');
    });
    
    it('should login with valid credentials', async () => {
      const resp = await worker.fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'Test@123',
        }),
      });
      
      expect(resp.status).toBe(200);
      
      const data = await resp.json();
      expect(data.success).toBe(true);
      expect(data.data.user).toBeDefined();
      expect(data.data.token).toBeDefined();
    });
    
    it('should reject invalid credentials', async () => {
      const resp = await worker.fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'WrongPassword',
        }),
      });
      
      expect(resp.status).toBe(401);
      
      const data = await resp.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid credentials');
    });
  });
  
  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const resp = await worker.fetch('/health');
      
      expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
      expect(resp.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
    
    it('should handle preflight requests', async () => {
      const resp = await worker.fetch('/api/v1/auth/register', {
        method: 'OPTIONS',
      });
      
      expect(resp.status).toBe(204);
      expect(resp.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(resp.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });
  });
  
  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const resp = await worker.fetch('/unknown-route');
      
      expect(resp.status).toBe(404);
      
      const data = await resp.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Not Found');
    });
    
    it('should validate request body', async () => {
      const resp = await worker.fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          username: 'ab', // Too short
          password: 'weak',
        }),
      });
      
      expect(resp.status).toBe(400);
      
      const data = await resp.json();
      expect(data.success).toBe(false);
      expect(data.errors).toBeDefined();
      expect(data.errors.length).toBeGreaterThan(0);
    });
  });
});