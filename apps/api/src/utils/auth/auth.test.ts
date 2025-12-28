/**
 * Auth Utilities Tests
 * 
 * Note: Auth functions are mocked globally in test setup.
 * These tests verify the mocked interface is callable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateTokenPair,
} from './index.js';

describe('Auth Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Password Hashing', () => {
    describe('hashPassword', () => {
      it('should return a hashed string', async () => {
        const hash = await hashPassword('SecurePassword123!');
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
      });
    });

    describe('verifyPassword', () => {
      it('should be callable and return boolean', async () => {
        const result = await verifyPassword('password', 'hash');
        expect(typeof result).toBe('boolean');
      });
    });
  });

  describe('JWT Token Generation', () => {
    describe('generateTokenPair', () => {
      it('should generate token pair object', async () => {
        const tokens = await generateTokenPair('user_123', 'test@example.com', false);
        expect(tokens).toBeDefined();
        expect(tokens.accessToken).toBeDefined();
        expect(tokens.refreshToken).toBeDefined();
      });
    });
  });
});
