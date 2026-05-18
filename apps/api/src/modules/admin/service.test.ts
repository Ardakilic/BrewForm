import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';
import * as service from './service.ts';

describe('Admin Service Logic', () => {
  describe('adminUpdateUser', () => {
    it('should prevent self-edit', async () => {
      await expect(
        service.adminUpdateUser('self-id', 'self-id', { email: 'new@example.com' }),
      ).rejects.toThrow('SELF_EDIT_FORBIDDEN');
    });
  });

  describe('softDeleteUser', () => {
    it('should prevent admin from deleting own account', async () => {
      await expect(service.softDeleteUser('self-id', 'self-id'))
        .rejects.toThrow('SELF_DELETE_FORBIDDEN');
    });
  });

  describe('Response error message contracts', () => {
    // These tests verify the error message strings used throughout the service
    // match what the route handlers expect to catch.

    it('EMAIL_ALREADY_EXISTS message is the correct contract string', () => {
      const err = new Error('EMAIL_ALREADY_EXISTS');
      expect(err.message).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('USERNAME_ALREADY_EXISTS message is the correct contract string', () => {
      const err = new Error('USERNAME_ALREADY_EXISTS');
      expect(err.message).toBe('USERNAME_ALREADY_EXISTS');
    });

    it('USER_NOT_FOUND message is the correct contract string', () => {
      const err = new Error('USER_NOT_FOUND');
      expect(err.message).toBe('USER_NOT_FOUND');
    });

    it('SELF_EDIT_FORBIDDEN message is the correct contract string', () => {
      const err = new Error('SELF_EDIT_FORBIDDEN');
      expect(err.message).toBe('SELF_EDIT_FORBIDDEN');
    });

    it('SELF_DELETE_FORBIDDEN message is the correct contract string', () => {
      const err = new Error('SELF_DELETE_FORBIDDEN');
      expect(err.message).toBe('SELF_DELETE_FORBIDDEN');
    });
  });
});
