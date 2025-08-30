import { describe, it, expect } from 'vitest';
import { deriveKeyFromPassword, encryptData, decryptData, calculatePasswordStrength } from '@/lib/crypto';

describe('Crypto utilities', () => {
  it('derives key and encrypts/decrypts data', async () => {
    const password = 'StrongPass!123';
    const { key, salt } = await deriveKeyFromPassword(password);
    expect(salt).toBeInstanceOf(Uint8Array);

    const encrypted = await encryptData('secret', key);
    expect(encrypted.data).toBeTruthy();

    const decrypted = await decryptData(encrypted, key);
    expect(decrypted).toBe('secret');
  });

  it('calculates password strength', () => {
    const strength = calculatePasswordStrength('StrongPass!123');
    expect(strength.score).toBeGreaterThanOrEqual(5);
  });
});
