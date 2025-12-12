// src/utils/tokens.ts
import { generateApiKey, generateSecureToken } from './crypto';

export async function createApiToken(userId: string) {
  return {
    token: generateApiKey(),
    secret: generateSecureToken(),
    userId,
    createdAt: new Date().toISOString()
  };
}