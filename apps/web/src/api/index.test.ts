import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    get: vi.fn(),
    getWithMeta: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
  },
}));

vi.mock('@/utils/logger.ts', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }),
}));

vi.mock('./client.ts', () => ({
  api: apiMock,
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, _details?: unknown, status = 500) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

import {
  adminApi,
  authApi,
  beanApi,
  coffeeVarietyApi,
  collectionApi,
  commentApi,
  equipmentApi,
  followApi,
  notificationApi,
  recipeApi,
  setupApi,
  tasteApi,
  userApi,
} from './index.ts';

describe('api client wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({});
    apiMock.getWithMeta.mockResolvedValue({});
    apiMock.post.mockResolvedValue({});
    apiMock.patch.mockResolvedValue({});
    apiMock.put.mockResolvedValue({});
    apiMock.delete.mockResolvedValue({});
    apiMock.upload.mockResolvedValue({});
  });

  describe('authApi', () => {
    it('forwards each auth endpoint to the correct verb', async () => {
      await authApi.register({ email: 'e', username: 'u', password: 'p' });
      expect(apiMock.post).toHaveBeenCalledWith('/auth/register', {
        email: 'e',
        username: 'u',
        password: 'p',
      });

      await authApi.login({ email: 'e', password: 'p' });
      expect(apiMock.post).toHaveBeenCalledWith('/auth/login', { email: 'e', password: 'p' });

      await authApi.logout();
      expect(apiMock.post).toHaveBeenCalledWith('/auth/logout', {});

      await authApi.forgotPassword({ email: 'e' });
      expect(apiMock.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'e' });

      await authApi.resetPassword({ token: 't', newPassword: 'n' });
      expect(apiMock.post).toHaveBeenCalledWith('/auth/reset-password', {
        token: 't',
        newPassword: 'n',
      });

      await authApi.registrationStatus();
      expect(apiMock.get).toHaveBeenCalledWith('/auth/registration-status');

      await authApi.sendVerification();
      expect(apiMock.post).toHaveBeenCalledWith('/auth/send-verification', {});

      await authApi.verifyEmail('tok');
      expect(apiMock.post).toHaveBeenCalledWith('/auth/verify-email', { token: 'tok' });
    });
  });

  describe('userApi', () => {
    it('forwards user endpoints', async () => {
      await userApi.me();
      expect(apiMock.get).toHaveBeenCalledWith('/users/me');

      await userApi.updateProfile({ displayName: 'd' });
      expect(apiMock.patch).toHaveBeenCalledWith('/users/me', { displayName: 'd' });

      await userApi.deleteAccount();
      expect(apiMock.delete).toHaveBeenCalledWith('/users/me');

      await userApi.getProfile('alice');
      expect(apiMock.get).toHaveBeenCalledWith('/users/alice');
    });
  });

  describe('recipeApi', () => {
    it('builds the list query string only when params are given', async () => {
      await recipeApi.list();
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/recipes');

      await recipeApi.list({ page: '2', q: 'latte' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/recipes?page=2&q=latte');

      await recipeApi.starred();
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/recipes/starred');

      await recipeApi.starred({ page: '1' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/recipes/starred?page=1');
    });

    it('forwards CRUD and social actions', async () => {
      await recipeApi.get('slug-1');
      expect(apiMock.get).toHaveBeenCalledWith('/recipes/slug-1');

      await recipeApi.create({ title: 't' } as never);
      expect(apiMock.post).toHaveBeenCalledWith('/recipes', { title: 't' });

      await recipeApi.update('id-1', { title: 't2' } as never);
      expect(apiMock.patch).toHaveBeenCalledWith('/recipes/id-1', { title: 't2' });

      await recipeApi.delete('id-1');
      expect(apiMock.delete).toHaveBeenCalledWith('/recipes/id-1');

      await recipeApi.fork('id-1', 'My Fork');
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/fork', { title: 'My Fork' });

      await recipeApi.like('id-1');
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/like', {});

      await recipeApi.favourite('id-1');
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/favourite', {});

      await recipeApi.feature('id-1');
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/feature', {});

      await recipeApi.rate('id-1', 9);
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/rate', { rating: 9 });

      await recipeApi.saveNotes('id-1', 'tasty');
      expect(apiMock.post).toHaveBeenCalledWith('/recipes/id-1/notes', { notes: 'tasty' });
    });
  });

  describe('tasteApi / setupApi / beanApi / equipmentApi / coffeeVarietyApi', () => {
    it('forwards taste-note endpoints', async () => {
      await tasteApi.hierarchy();
      expect(apiMock.get).toHaveBeenCalledWith('/taste-notes/hierarchy');

      await tasteApi.search('citrus & berry');
      expect(apiMock.get).toHaveBeenCalledWith('/taste-notes/search?q=citrus%20%26%20berry');

      await tasteApi.flat();
      expect(apiMock.get).toHaveBeenCalledWith('/taste-notes/flat');
    });

    it('forwards setup CRUD endpoints', async () => {
      await setupApi.list();
      expect(apiMock.get).toHaveBeenCalledWith('/setups');
      await setupApi.create({ name: 's' } as never);
      expect(apiMock.post).toHaveBeenCalledWith('/setups', { name: 's' });
      await setupApi.get('id');
      expect(apiMock.get).toHaveBeenCalledWith('/setups/id');
      await setupApi.update('id', { name: 's2' });
      expect(apiMock.patch).toHaveBeenCalledWith('/setups/id', { name: 's2' });
      await setupApi.delete('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/setups/id');
    });

    it('forwards bean CRUD endpoints', async () => {
      await beanApi.list();
      expect(apiMock.get).toHaveBeenCalledWith('/beans');
      await beanApi.get('id');
      expect(apiMock.get).toHaveBeenCalledWith('/beans/id');
      await beanApi.create({ name: 'b' });
      expect(apiMock.post).toHaveBeenCalledWith('/beans', { name: 'b' });
      await beanApi.update('id', { name: 'b2' });
      expect(apiMock.patch).toHaveBeenCalledWith('/beans/id', { name: 'b2' });
      await beanApi.delete('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/beans/id');
    });

    it('forwards equipment CRUD endpoints', async () => {
      await equipmentApi.list();
      expect(apiMock.get).toHaveBeenCalledWith('/equipment');
      await equipmentApi.create({ name: 'e' } as never);
      expect(apiMock.post).toHaveBeenCalledWith('/equipment', { name: 'e' });
      await equipmentApi.update('id', { name: 'e2' });
      expect(apiMock.patch).toHaveBeenCalledWith('/equipment/id', { name: 'e2' });
      await equipmentApi.delete('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/equipment/id');
    });

    it('encodes the coffee-variety search query', async () => {
      await coffeeVarietyApi.search('geisha');
      expect(apiMock.get).toHaveBeenCalledWith('/coffee-varieties/search?q=geisha');
    });
  });

  describe('adminApi', () => {
    it('forwards admin user-management endpoints', async () => {
      await adminApi.getUsers();
      expect(apiMock.get).toHaveBeenCalledWith('/admin/users');

      await adminApi.getUsers({ page: '1' });
      expect(apiMock.get).toHaveBeenCalledWith('/admin/users?page=1');

      await adminApi.getUserDetail('id');
      expect(apiMock.get).toHaveBeenCalledWith('/admin/users/id');

      await adminApi.createUser({ email: 'e', username: 'u', password: 'p' });
      expect(apiMock.post).toHaveBeenCalledWith('/admin/users', {
        email: 'e',
        username: 'u',
        password: 'p',
      });

      await adminApi.updateUser('id', { isAdmin: true });
      expect(apiMock.patch).toHaveBeenCalledWith('/admin/users/id', { isAdmin: true });

      await adminApi.banUser('id', 'spam');
      expect(apiMock.post).toHaveBeenCalledWith('/admin/users/id/ban', {
        userId: 'id',
        banned: true,
        reason: 'spam',
      });

      await adminApi.unbanUser('id');
      expect(apiMock.post).toHaveBeenCalledWith('/admin/users/id/ban', {
        userId: 'id',
        banned: false,
      });

      await adminApi.toggleAdmin('id', true);
      expect(apiMock.patch).toHaveBeenCalledWith('/admin/users/id/admin', { isAdmin: true });

      await adminApi.deleteUser('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/admin/users/id');
    });
  });

  describe('followApi / commentApi', () => {
    it('forwards follow endpoints', async () => {
      await followApi.follow('u');
      expect(apiMock.post).toHaveBeenCalledWith('/follow/u', {});
      await followApi.unfollow('u');
      expect(apiMock.delete).toHaveBeenCalledWith('/follow/u');
      await followApi.followers('u');
      expect(apiMock.get).toHaveBeenCalledWith('/follow/u/followers');
      await followApi.following('u');
      expect(apiMock.get).toHaveBeenCalledWith('/follow/u/following');
    });

    it('forwards comment endpoints', async () => {
      await commentApi.list('r', 2);
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/comments/recipe/r?page=2');
      await commentApi.create('r', { content: 'hi' });
      expect(apiMock.post).toHaveBeenCalledWith('/comments/recipe/r', { content: 'hi' });
      await commentApi.delete('c');
      expect(apiMock.delete).toHaveBeenCalledWith('/comments/c');
    });
  });

  describe('notificationApi', () => {
    it('builds the list query and unwraps the envelope', async () => {
      await notificationApi.list(3);
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/notifications?page=3');

      await notificationApi.list(1, true);
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/notifications?page=1&unreadOnly=true');
    });

    it('forwards unread count, mark-read, and mark-all-read', async () => {
      await notificationApi.unreadCount();
      expect(apiMock.get).toHaveBeenCalledWith('/notifications/unread-count');

      await notificationApi.markRead('n1');
      expect(apiMock.patch).toHaveBeenCalledWith('/notifications/n1/read', {});

      await notificationApi.markAllRead();
      expect(apiMock.patch).toHaveBeenCalledWith('/notifications/read-all', {});
    });

    it('rethrows after logging when an endpoint rejects', async () => {
      apiMock.get.mockRejectedValue(new Error('down'));
      await expect(notificationApi.unreadCount()).rejects.toThrow('down');

      apiMock.getWithMeta.mockRejectedValue(new Error('down'));
      await expect(notificationApi.list(1)).rejects.toThrow('down');

      apiMock.patch.mockRejectedValue(new Error('down'));
      await expect(notificationApi.markRead('n1')).rejects.toThrow('down');
      await expect(notificationApi.markAllRead()).rejects.toThrow('down');
    });
  });

  describe('collectionApi', () => {
    it('forwards collection CRUD and membership endpoints', async () => {
      await collectionApi.list();
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/collections');

      await collectionApi.list({ page: '2' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/collections?page=2');

      await collectionApi.get('id');
      expect(apiMock.get).toHaveBeenCalledWith('/collections/id');

      await collectionApi.create({ name: 'c' } as never);
      expect(apiMock.post).toHaveBeenCalledWith('/collections', { name: 'c' });

      await collectionApi.update('id', { name: 'c2' });
      expect(apiMock.patch).toHaveBeenCalledWith('/collections/id', { name: 'c2' });

      await collectionApi.delete('id');
      expect(apiMock.delete).toHaveBeenCalledWith('/collections/id');

      await collectionApi.addRecipe('id', 'r');
      expect(apiMock.post).toHaveBeenCalledWith('/collections/id/recipes', { recipeId: 'r' });

      await collectionApi.removeRecipe('id', 'r');
      expect(apiMock.delete).toHaveBeenCalledWith('/collections/id/recipes/r');

      await collectionApi.reorder('id', ['a', 'b']);
      expect(apiMock.patch).toHaveBeenCalledWith('/collections/id/reorder', {
        itemIds: ['a', 'b'],
      });
    });

    it('forwards the user-, public-, and recipe-scoped lists', async () => {
      await collectionApi.listByUser('u');
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/users/u/collections');

      await collectionApi.listByUser('u', { page: '1' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/users/u/collections?page=1');

      await collectionApi.listPublic();
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/collections/public');

      await collectionApi.listPublic({ q: 'x' });
      expect(apiMock.getWithMeta).toHaveBeenCalledWith('/collections/public?q=x');

      await collectionApi.listByRecipe('slug');
      expect(apiMock.get).toHaveBeenCalledWith('/recipes/slug/collections');
    });
  });
});
