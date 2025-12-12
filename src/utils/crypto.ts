/**
 * Cryptographic utilities for Cloudflare Workers
 */

// For Node.js compatibility
declare const btoa: (str: string) => string;
declare const atob: (str: string) => string;

// Password hashing (using bcrypt would be better in production)
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  
  // Using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const newHash = await hashPassword(password);
  return newHash === hash;
}

// Base64 URL-safe encoding/decoding
function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  // Add padding if needed
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  return atob(str);
}

// JWT tokens
export interface JwtPayload {
  [key: string]: any;
  iat?: number;
  exp?: number;
  sub?: string;
}

export async function generateJWT(payload: JwtPayload, secret: string): Promise<string> {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours
  }));
  
  const signature = await createHMAC(`${encodedHeader}.${encodedPayload}`, secret);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT token');
  }
  
  const [encodedHeader, encodedPayload, signature] = parts;
  
  // Verify signature
  const expectedSignature = await createHMAC(`${encodedHeader}.${encodedPayload}`, secret);
  if (signature !== expectedSignature) {
    throw new Error('Invalid JWT signature');
  }
  
  // Decode payload
  const payloadStr = base64UrlDecode(encodedPayload);
  const payload: JwtPayload = JSON.parse(payloadStr);
  
  // Check expiration
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('JWT token expired');
  }
  
  return payload;
}

// HMAC
export async function createHMAC(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  
  // Convert to base64 URL-safe
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  return signatureBase64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Random strings
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomValues[i] % chars.length);
  }
  return result;
}

export function generateApiKey(prefix: string = 'naw'): string {
  return `${prefix}_${generateRandomString(32)}`;
}

export function generateSecureToken(): string {
  return generateRandomString(64);
}

// Encryption (AES-GCM)
export async function encrypt(text: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Generate random IV (12 bytes for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Derive key from secret (use HKDF for better security in production)
  const secretKey = encoder.encode(secret);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(16), // Fixed salt (should be random in production)
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return base64UrlEncode(String.fromCharCode(...combined));
}

export async function decrypt(encryptedText: string, secret: string): Promise<string> {
  const combined = Uint8Array.from(
    base64UrlDecode(encryptedText),
    c => c.charCodeAt(0)
  );
  
  // Extract IV (first 12 bytes) and encrypted data
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const encoder = new TextEncoder();
  const secretKey = encoder.encode(secret);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(16),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return new TextDecoder().decode(decrypted);
}

// Hash functions
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(data)
  );
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha1(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest(
    'SHA-1',
    encoder.encode(data)
  );
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Password strength validation
export function validatePasswordStrength(password: string): {
  valid: boolean;
  score: number;
  suggestions: string[];
} {
  const suggestions: string[] = [];
  let score = 0;
  
  // Length check
  if (password.length >= 8) score += 1;
  else suggestions.push('Use at least 8 characters');
  
  // Contains lowercase
  if (/[a-z]/.test(password)) score += 1;
  else suggestions.push('Add lowercase letters');
  
  // Contains uppercase
  if (/[A-Z]/.test(password)) score += 1;
  else suggestions.push('Add uppercase letters');
  
  // Contains numbers
  if (/\d/.test(password)) score += 1;
  else suggestions.push('Add numbers');
  
  // Contains special characters
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else suggestions.push('Add special characters (!@#$%^&*)');
  
  // Common password check (simplified)
  const commonPasswords = [
    'password', '123456', 'qwerty', 'admin', 'welcome',
    'password123', '123456789', '12345678', '12345'
  ];
  
  if (commonPasswords.includes(password.toLowerCase())) {
    score = 0;
    suggestions.push('This password is too common');
  }
  
  return {
    valid: score >= 3,
    score,
    suggestions: score >= 3 ? [] : suggestions
  };
}

// Generate password reset token
export async function generatePasswordResetToken(userId: string, secret: string): Promise<string> {
  const payload = {
    sub: userId,
    type: 'password_reset',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
  };
  
  return generateJWT(payload, secret);
}

// Verify password reset token
export async function verifyPasswordResetToken(token: string, secret: string): Promise<string> {
  const payload = await verifyJWT(token, secret);
  
  if (payload.type !== 'password_reset') {
    throw new Error('Invalid token type');
  }
  
  return payload.sub;
}

// Generate email verification token
export async function generateEmailVerificationToken(email: string, secret: string): Promise<string> {
  const payload = {
    email,
    type: 'email_verification',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 24 * 3600 // 24 hours
  };
  
  return generateJWT(payload, secret);
}

// Simple XOR encryption (for non-sensitive data)
export function simpleEncrypt(text: string, key: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(result);
}

export function simpleDecrypt(encryptedText: string, key: string): string {
  const decoded = atob(encryptedText);
  let result = '';
  for (let i = 0; i < decoded.length; i++) {
    const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return result;
}

// Export all functions
export default {
  hashPassword,
  verifyPassword,
  generateJWT,
  verifyJWT,
  createHMAC,
  generateRandomString,
  generateApiKey,
  generateSecureToken,
  encrypt,
  decrypt,
  sha256,
  sha1,
  validatePasswordStrength,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  generateEmailVerificationToken,
  simpleEncrypt,
  simpleDecrypt
};