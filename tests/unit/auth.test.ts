/**
 * Authentication unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hashPassword, verifyPassword, generateJWT, verifyJWT } from '../../src/utils/crypto';

describe('Authentication Utilities', () => {
  describe('hashPassword', () => {
    it('should hash password consistently', async () => {
      const password = 'Test@123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });
    
    it('should produce different hashes for different passwords', async () => {
      const hash1 = await hashPassword('password1');
      const hash2 = await hashPassword('password2');
      
      expect(hash1).not.toBe(hash2);
    });
  });
  
  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'Test@123';
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });
    
    it('should reject incorrect password', async () => {
      const hash = await hashPassword('correct-password');
      
      const isValid = await verifyPassword('wrong-password', hash);
      expect(isValid).toBe(false);
    });
  });
  
  describe('JWT', () => {
    const secret = 'test-secret-123456789012345678901234567890';
    
    it('should generate and verify valid JWT', async () => {
      const payload = { userId: '123', role: 'user' };
      const token = await generateJWT(payload, secret);
      
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
      
      const decoded = await verifyJWT(token, secret);
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });
    
    it('should reject invalid signature', async () => {
      const token = await generateJWT({ userId: '123' }, secret);
      const wrongSecret = 'wrong-secret-123456789012345678901234567890';
      
      await expect(verifyJWT(token, wrongSecret)).rejects.toThrow('Invalid JWT signature');
    });
    
    it('should reject expired token', async () => {
      const payload = { 
        userId: '123',
        iat: Math.floor(Date.now() / 1000) - 3600,
        exp: Math.floor(Date.now() / 1000) - 1800, // Expired 30 minutes ago
      };
      
      // Mock token generation with expired timestamp
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const encodedPayload = btoa(JSON.stringify(payload));
      const signature = btoa('mocked-signature');
      const token = `${header}.${encodedPayload}.${signature}`;
      
      await expect(verifyJWT(token, secret)).rejects.toThrow('JWT token expired');
    });
  });
});