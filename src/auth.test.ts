import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateToken } from './auth.js';

describe('hashPassword', () => {
  it('should return a string with salt:hash format', () => {
    const result = hashPassword('test123');
    expect(result).toContain(':');
    const [salt, hash] = result.split(':');
    expect(salt).toHaveLength(32); // 16 bytes hex = 32 chars
    expect(hash).toHaveLength(128); // 64 bytes hex = 128 chars
  });

  it('should produce different hashes for the same password', () => {
    const a = hashPassword('same');
    const b = hashPassword('same');
    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('should return true for correct password', () => {
    const stored = hashPassword('mypassword');
    expect(verifyPassword('mypassword', stored)).toBe(true);
  });

  it('should return false for incorrect password', () => {
    const stored = hashPassword('mypassword');
    expect(verifyPassword('wrongpassword', stored)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(verifyPassword('anything', '')).toBe(false);
  });

  it('should handle malformed hash gracefully', () => {
    expect(verifyPassword('pw', 'no-colon-here')).toBe(false);
  });
});

describe('generateToken', () => {
  it('should return a 64-character hex string', () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('should produce unique tokens', () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generateToken())
    );
    expect(tokens.size).toBe(100);
  });
});
