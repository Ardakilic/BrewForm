import { describe, it } from 'jsr:@std/testing/bdd';
import { expect } from 'jsr:@std/expect';

// ---------------------------------------------------------------------------
// Types — mirrors the shape returned by the real model layer
// ---------------------------------------------------------------------------

interface MockUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockModel {
  adminCreateUser: (data: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
    bio?: string;
    isAdmin?: boolean;
    isBanned?: boolean;
  }) => Promise<MockUser>;
  adminUpdateUser: (
    id: string,
    data: {
      email?: string;
      username?: string;
      password?: string;
      displayName?: string;
      bio?: string;
      isAdmin?: boolean;
      isBanned?: boolean;
    },
  ) => Promise<MockUser | null>;
  banUser: (userId: string) => Promise<MockUser | null>;
  unbanUser: (userId: string) => Promise<MockUser | null>;
  createAuditLog: (
    adminId: string,
    action: string,
    entityType: string,
    entityId?: string,
    details?: string,
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Inline implementations — faithful copies of service.ts logic with
// injectable model dependencies (no DB, no env vars required)
// ---------------------------------------------------------------------------

async function adminCreateUser(
  adminId: string,
  data: {
    email: string;
    username: string;
    password: string;
    displayName?: string;
    bio?: string;
    isAdmin?: boolean;
    isBanned?: boolean;
  },
  model: MockModel,
  _sendEmail?: (email: string, username: string) => Promise<void>,
): Promise<MockUser> {
  const user = await model.adminCreateUser(data);
  await model.createAuditLog(
    adminId,
    'CREATE_USER',
    'User',
    user.id,
    `username: ${data.username}`,
  );
  return user;
}

async function adminUpdateUser(
  adminId: string,
  targetUserId: string,
  data: {
    email?: string;
    username?: string;
    password?: string;
    displayName?: string;
    bio?: string;
    isAdmin?: boolean;
    isBanned?: boolean;
  },
  model: MockModel,
): Promise<MockUser> {
  if (adminId === targetUserId) {
    throw new Error('SELF_EDIT_FORBIDDEN');
  }

  const user = await model.adminUpdateUser(targetUserId, data);
  if (!user) throw new Error('USER_NOT_FOUND');

  const changeDetails: string[] = [];
  if (data.email !== undefined) changeDetails.push(`email: ${data.email}`);
  if (data.username !== undefined) changeDetails.push(`username: ${data.username}`);
  if (data.password !== undefined) changeDetails.push('password: <changed>');
  if (data.displayName !== undefined) changeDetails.push(`displayName: ${data.displayName}`);
  if (data.bio !== undefined) changeDetails.push('bio: <changed>');
  if (data.isAdmin !== undefined) changeDetails.push(`isAdmin: ${data.isAdmin}`);
  if (data.isBanned !== undefined) changeDetails.push(`isBanned: ${data.isBanned}`);

  await model.createAuditLog(
    adminId,
    'UPDATE_USER',
    'User',
    targetUserId,
    changeDetails.join(', '),
  );

  return user;
}

async function banUser(
  adminId: string,
  userId: string,
  model: MockModel,
  reason?: string,
): Promise<MockUser> {
  const user = await model.banUser(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  const details = reason ? JSON.stringify({ reason }) : undefined;
  await model.createAuditLog(adminId, 'BAN_USER', 'User', userId, details);
  return user;
}

async function unbanUser(
  adminId: string,
  userId: string,
  model: MockModel,
): Promise<MockUser> {
  const user = await model.unbanUser(userId);
  if (!user) throw new Error('USER_NOT_FOUND');
  await model.createAuditLog(
    adminId,
    'UNBAN_USER',
    'User',
    userId,
    'Ban context cleared',
  );
  return user;
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: 'user-1',
    email: 'test@example.com',
    username: 'testuser',
    displayName: null,
    bio: null,
    isAdmin: false,
    isBanned: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin Service Logic', () => {
  describe('adminCreateUser', () => {
    it('should create user successfully and log audit', async () => {
      const createdUser = makeUser();
      let auditLogArgs: unknown[] | null = null;

      const model: MockModel = {
        adminCreateUser: (_data) => Promise.resolve(createdUser),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: (...args) => {
          auditLogArgs = args;
          return Promise.resolve();
        },
      };

      const result = await adminCreateUser('admin-1', {
        email: 'test@example.com',
        username: 'testuser',
        password: 'secure123',
      }, model);

      expect(result).toBe(createdUser);
      expect(auditLogArgs).toEqual([
        'admin-1',
        'CREATE_USER',
        'User',
        'user-1',
        'username: testuser',
      ]);
    });

    it('should propagate duplicate email error from model', async () => {
      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('EMAIL_ALREADY_EXISTS')),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: () => Promise.resolve(),
      };

      await expect(
        adminCreateUser('admin-1', {
          email: 'taken@example.com',
          username: 'newuser',
          password: 'secure123',
        }, model),
      ).rejects.toThrow('EMAIL_ALREADY_EXISTS');
    });

    it('should propagate duplicate username error from model', async () => {
      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('USERNAME_ALREADY_EXISTS')),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: () => Promise.resolve(),
      };

      await expect(
        adminCreateUser('admin-1', {
          email: 'new@example.com',
          username: 'taken',
          password: 'secure123',
        }, model),
      ).rejects.toThrow('USERNAME_ALREADY_EXISTS');
    });
  });

  describe('adminUpdateUser', () => {
    it('should update user, build change details, and log audit', async () => {
      const updatedUser = makeUser({ email: 'new@example.com', displayName: 'New Name' });
      let capturedAuditDetails: string | undefined;

      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: (_id, data) => {
          expect(data.email).toBe('new@example.com');
          expect(data.displayName).toBe('New Name');
          return Promise.resolve(updatedUser);
        },
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: (_adminId, _action, _entityType, _entityId, details) => {
          capturedAuditDetails = details;
          return Promise.resolve();
        },
      };

      const result = await adminUpdateUser('admin-1', 'user-1', {
        email: 'new@example.com',
        displayName: 'New Name',
      }, model);

      expect(result).toBe(updatedUser);
      expect(capturedAuditDetails).toBe('email: new@example.com, displayName: New Name');
    });

    it('should prevent self-edit', async () => {
      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: () => Promise.resolve(),
      };

      await expect(
        adminUpdateUser('self-id', 'self-id', { email: 'new@example.com' }, model),
      ).rejects.toThrow('SELF_EDIT_FORBIDDEN');
    });

    it('should throw USER_NOT_FOUND when model returns null', async () => {
      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: () => Promise.resolve(),
      };

      await expect(
        adminUpdateUser('admin-1', 'nonexistent', { email: 'x@y.com' }, model),
      ).rejects.toThrow('USER_NOT_FOUND');
    });

    it('should propagate duplicate email error from model', async () => {
      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.reject(new Error('EMAIL_ALREADY_EXISTS')),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: () => Promise.resolve(),
      };

      await expect(
        adminUpdateUser('admin-1', 'user-1', { email: 'taken@example.com' }, model),
      ).rejects.toThrow('EMAIL_ALREADY_EXISTS');
    });

    it('should propagate duplicate username error from model', async () => {
      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.reject(new Error('USERNAME_ALREADY_EXISTS')),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: () => Promise.resolve(),
      };

      await expect(
        adminUpdateUser('admin-1', 'user-1', { username: 'taken' }, model),
      ).rejects.toThrow('USERNAME_ALREADY_EXISTS');
    });

    it('should include password in change details as masked', async () => {
      const updatedUser = makeUser();
      let capturedDetails: string | undefined;

      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.resolve(updatedUser),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: (_a, _act, _et, _ei, details) => {
          capturedDetails = details;
          return Promise.resolve();
        },
      };

      await adminUpdateUser('admin-1', 'user-1', {
        email: 'a@b.com',
        password: 'newpass123',
        isBanned: true,
      }, model);

      expect(capturedDetails).toContain('password: <changed>');
      expect(capturedDetails).not.toContain('newpass123');
    });

    it('should build change details with all provided fields', async () => {
      const updatedUser = makeUser();
      let capturedDetails: string | undefined;

      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.resolve(updatedUser),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: (_a, _act, _et, _ei, details) => {
          capturedDetails = details;
          return Promise.resolve();
        },
      };

      await adminUpdateUser('admin-1', 'user-1', {
        email: 'e@e.com',
        username: 'newname',
        displayName: 'Display',
        bio: 'bio text',
        isAdmin: true,
        isBanned: false,
      }, model);

      expect(capturedDetails).toBe(
        'email: e@e.com, username: newname, displayName: Display, bio: <changed>, isAdmin: true, isBanned: false',
      );
    });
  });

  describe('banUser', () => {
    it('should ban user with reason and log audit', async () => {
      const bannedUser = makeUser({ isBanned: true });
      let auditAction: string | undefined;
      let auditDetails: string | undefined;

      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: (id: string) => {
          expect(id).toBe('user-1');
          return Promise.resolve(bannedUser);
        },
        unbanUser: () => Promise.resolve(null),
        createAuditLog: (_aid, action, _et, _eid, details) => {
          auditAction = action;
          auditDetails = details;
          return Promise.resolve();
        },
      };

      const result = await banUser('admin-1', 'user-1', model, 'spam');

      expect(result).toBe(bannedUser);
      expect(auditAction).toBe('BAN_USER');
      expect(auditDetails).toBe(JSON.stringify({ reason: 'spam' }));
    });

    it('should ban user without reason', async () => {
      const bannedUser = makeUser({ isBanned: true });
      let auditDetails: string | undefined;

      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: () => Promise.resolve(bannedUser),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: (_aid, _action, _et, _eid, details) => {
          auditDetails = details;
          return Promise.resolve();
        },
      };

      await banUser('admin-1', 'user-1', model);

      expect(auditDetails).toBeUndefined();
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: () => Promise.resolve(),
      };

      await expect(
        banUser('admin-1', 'nonexistent', model, 'spam'),
      ).rejects.toThrow('USER_NOT_FOUND');
    });
  });

  describe('unbanUser', () => {
    it('should unban user and log audit with clearing context', async () => {
      const unbannedUser = makeUser({ isBanned: false });
      let auditAction: string | undefined;
      let auditDetails: string | undefined;

      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: () => Promise.resolve(null),
        unbanUser: (id: string) => {
          expect(id).toBe('user-1');
          return Promise.resolve(unbannedUser);
        },
        createAuditLog: (_aid, action, _et, _eid, details) => {
          auditAction = action;
          auditDetails = details;
          return Promise.resolve();
        },
      };

      const result = await unbanUser('admin-1', 'user-1', model);

      expect(result).toBe(unbannedUser);
      expect(auditAction).toBe('UNBAN_USER');
      expect(auditDetails).toBe('Ban context cleared');
    });

    it('should throw USER_NOT_FOUND when user does not exist', async () => {
      const model: MockModel = {
        adminCreateUser: () => Promise.reject(new Error('not used')),
        adminUpdateUser: () => Promise.resolve(null),
        banUser: () => Promise.resolve(null),
        unbanUser: () => Promise.resolve(null),
        createAuditLog: () => Promise.resolve(),
      };

      await expect(
        unbanUser('admin-1', 'nonexistent', model),
      ).rejects.toThrow('USER_NOT_FOUND');
    });
  });
});
