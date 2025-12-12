// tests/crypto.test.ts
import { 
  hashPassword, 
  verifyPassword, 
  generateJWT, 
  verifyJWT 
} from '../src/utils/crypto';

describe('Crypto utilities', () => {
  test('hashPassword and verifyPassword work correctly', async () => {
    const password = 'mySecurePassword123!';
    const hash = await hashPassword(password);
    const isValid = await verifyPassword(password, hash);
    
    expect(isValid).toBe(true);
  });
});