/**
 * Email Utilities Tests
 *
 * Note: Email functions are mocked globally in test setup.
 * These tests verify the mocked interface is callable.
 */

import { describe, it } from '@std/testing';
import { expect } from '@std/expect';
import {
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
} from './index.ts';

describe('Email Utilities', () => {
  describe('sendVerificationEmail', () => {
    it('should be callable and return boolean', async () => {
      const result = await sendVerificationEmail(
        'test@example.com',
        'testuser',
        'token',
      );
      expect(typeof result).toBe('boolean');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should be callable and return boolean', async () => {
      const result = await sendPasswordResetEmail(
        'test@example.com',
        'testuser',
        'token',
      );
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
      const result = await sendPasswordChangedEmail(
        'test@example.com',
        'testuser',
      );
      expect(typeof result).toBe('boolean');
    });
  });
});
