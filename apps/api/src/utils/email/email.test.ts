/**
 * Email Utilities Tests
 * 
 * Note: Email functions are mocked globally in test setup.
 * These tests verify the mocked interface is callable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
} from './index.js';

describe('Email Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('should be callable and return boolean', async () => {
      const result = await sendVerificationEmail('test@example.com', 'testuser', 'token');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should be callable and return boolean', async () => {
      const result = await sendPasswordResetEmail('test@example.com', 'testuser', 'token');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should be callable and return boolean', async () => {
      const result = await sendWelcomeEmail('test@example.com', 'testuser');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('sendPasswordChangedEmail', () => {
    it('should be callable and return boolean', async () => {
      const result = await sendPasswordChangedEmail('test@example.com', 'testuser');
      expect(typeof result).toBe('boolean');
    });
  });
});
