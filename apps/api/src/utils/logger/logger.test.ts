/**
 * Logger Utilities Tests
 * 
 * Since the logger is mocked globally in test setup, we test that
 * the mocked interface is properly set up and callable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getLogger,
  logAudit,
  logSecurity,
} from './index.js';

describe('Logger Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLogger', () => {
    it('should return logger instance', () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
    });

    it('should return same instance (singleton)', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();
      expect(logger1).toBe(logger2);
    });

    it('should have standard log methods', () => {
      const logger = getLogger();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });

  describe('logAudit', () => {
    it('should be callable without errors', () => {
      expect(() => logAudit('recipe_created', 'recipe', 'recipe_123', 'user_456')).not.toThrow();
    });
  });

  describe('logSecurity', () => {
    it('should be callable without errors', () => {
      expect(() => logSecurity('login_failed', { email: 'test@example.com' })).not.toThrow();
    });
  });
});
